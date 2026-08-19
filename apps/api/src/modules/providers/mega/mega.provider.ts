import { pipeline } from "node:stream/promises";
import type { Readable } from "node:stream";
import type { File as MegaFile, MutableFile, Storage } from "megajs";
import { AppError, AuthError, NotFoundError, ValidationError } from "../../../common/errors/app-error.js";
import type { RemoteNode } from "../../../types/models.js";
import type {
  DestinationProvider,
  RemoteFileHandle,
  SourceProvider,
  UploadFileParams,
  UploadOutcome,
  UploadProgress,
} from "../provider.interface.js";
import { getMegaSession, type MegaCredentials } from "./mega.session.js";
import { runMegaCall, translateMegaError } from "./mega.errors.js";

/**
 * megajs' own .d.ts types `MutableFile.upload()`'s return as a plain
 * `Writable`, omitting the `.complete` promise and `"progress"` event that
 * the runtime implementation actually attaches (visible in its JS source,
 * not surfaced in the types) — this is the real shape, cast to at the one
 * call site that needs it, same pattern as mega.session.ts's EventEmitter cast.
 */
type MegaUploadStream = NodeJS.WritableStream & {
  complete: Promise<MegaFile>;
  on(event: "progress", listener: (progress: { bytesUploaded: number; bytesTotal: number }) => void): unknown;
};

/** Never logs a real password value, only its presence/length, so trace logs are safe to paste anywhere. */
function maskForTrace(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const clone: Record<string, unknown> = { ...(value as Record<string, unknown>) };
  if (typeof clone.password === "string") clone.password = `[REDACTED length=${clone.password.length}]`;
  return clone;
}

function isMegaCredentials(value: unknown): value is MegaCredentials {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as Record<string, unknown>).email === "string" &&
    typeof (value as Record<string, unknown>).password === "string"
  );
}

function toRemoteNode(file: MegaFile): RemoteNode {
  return {
    id: file.nodeId ?? file.downloadId,
    name: file.name ?? "(untitled)",
    type: file.directory ? "folder" : "file",
    ...(file.directory
      ? {}
      : {
          sizeBytes: file.size ?? 0,
          // megajs' `timestamp` is seconds since epoch (matches its own
          // `.createdAt` getter's `timestamp * 1000` conversion) — must be
          // converted to milliseconds before turning into an ISO string, or
          // Replace's duplicate-resolution hierarchy would compare this
          // against Drive's millisecond-based modifiedTime off by 1000x.
          modifiedTime:
            typeof file.timestamp === "number" ? new Date(file.timestamp * 1000).toISOString() : undefined,
        }),
  };
}

export class MegaProvider implements SourceProvider, DestinationProvider {
  readonly type = "MEGA" as const;

  async testConnection(credentials: unknown): Promise<{ account: string }> {
    const storage = await this.authenticate(credentials);
    return { account: storage.email ?? this.requireCredentials(credentials).email };
  }

  async listFolders(credentials: unknown, folderId?: string): Promise<RemoteNode[]> {
    return runMegaCall(async () => {
      const storage = await this.authenticate(credentials);
      const parent = this.resolveFolder(storage, folderId);
      return (parent.children ?? []).filter((f) => f.directory).map(toRemoteNode);
    });
  }

  async listFiles(credentials: unknown, folderId?: string): Promise<RemoteNode[]> {
    return runMegaCall(async () => {
      const storage = await this.authenticate(credentials);
      const parent = this.resolveFolder(storage, folderId);
      return (parent.children ?? []).filter((f) => !f.directory).map(toRemoteNode);
    });
  }

  async getReadStream(credentials: unknown, fileId: string): Promise<RemoteFileHandle> {
    const storage = await this.authenticate(credentials);
    const file = storage.files[fileId];
    if (!file) throw new NotFoundError("MEGA file", fileId);
    if (file.directory) throw new ValidationError(`"${fileId}" is a folder, not a file.`);

    return {
      stream: file.download({}),
      filename: file.name ?? fileId,
      sizeBytes: file.size ?? 0,
    };
  }

  translateError(err: unknown): AppError {
    return translateMegaError(err);
  }

  async createFolder(credentials: unknown, parentId: string, name: string): Promise<RemoteNode> {
    return runMegaCall(async () => {
      const storage = await this.authenticate(credentials);
      const parent = this.resolveFolder(storage, parentId);
      const folder = await parent.mkdir(name);
      return toRemoteNode(folder);
    });
  }

  async exists(credentials: unknown, parentId: string, filename: string): Promise<RemoteNode | null> {
    return runMegaCall(async () => {
      const storage = await this.authenticate(credentials);
      const parent = this.resolveFolder(storage, parentId);
      const match = (parent.children ?? []).find((f) => f.name === filename);
      return match ? toRemoteNode(match) : null;
    });
  }

  async uploadFile(params: UploadFileParams): Promise<UploadOutcome> {
    const { parentId, sizeBytes, stream, duplicateStrategy, credentials, onProgress } = params;
    let filename = params.filename;

    const existing = await this.exists(credentials, parentId, filename);

    if (existing) {
      switch (duplicateStrategy) {
        case "SKIP":
          return { status: "skipped", existing };
        case "ASK":
          return { status: "conflict", existing };
        case "OVERWRITE":
          return this.resolveReplaceDuplicate(existing, params);
        case "RENAME":
          filename = await this.resolveAvailableName(credentials, parentId, filename);
          break;
      }
    }

    const file = await runMegaCall(async () => {
      const storage = await this.authenticate(credentials);
      const parent = this.resolveFolder(storage, parentId);
      return this.performUpload(parent, filename, sizeBytes, stream, onProgress);
    });
    return { status: "uploaded", file };
  }

  // ===================================================================
  // Replace ("OVERWRITE") duplicate resolution — mirrors the decision
  // tree in google-drive.provider.ts's resolveReplaceDuplicate exactly
  // (see that file for the full rationale). One MEGA-specific deviation:
  // MEGA has no atomic "replace this file's content" call like Drive's
  // files.update, so "replace" here is upload-new-then-delete-stale
  // rather than an in-place update — new content lands under the same
  // name *before* the stale duplicate is removed, so a failed cleanup
  // never loses data (worst case: a harmless leftover duplicate, logged
  // below). A second MEGA-specific caveat: MEGA doesn't expose a way to
  // set a file's modified time on upload, so `existing.modifiedTime`
  // reflects when the copy landed in MEGA, not the original source's
  // mtime — the size+timestamp "identical, skip" shortcut will rarely
  // fire for MEGA destinations, same as Drive's own documented handling
  // of missing timestamps ("can't prove identical" -> never skip).
  // ===================================================================
  private async resolveReplaceDuplicate(
    existing: RemoteNode,
    params: UploadFileParams
  ): Promise<UploadOutcome> {
    const { parentId, filename, sizeBytes, sourceModifiedTime, stream, credentials, onProgress } = params;

    const sizesMatch = existing.sizeBytes === sizeBytes;
    const existingModifiedMs = existing.modifiedTime ? new Date(existing.modifiedTime).getTime() : undefined;
    const sourceModifiedMs = sourceModifiedTime ? new Date(sourceModifiedTime).getTime() : undefined;
    const timestampsMatch =
      existingModifiedMs !== undefined && sourceModifiedMs !== undefined && existingModifiedMs === sourceModifiedMs;

    if (sizesMatch && timestampsMatch) {
      return { status: "skipped", existing };
    }

    const sourceIsNewer =
      sourceModifiedMs !== undefined && existingModifiedMs !== undefined && sourceModifiedMs > existingModifiedMs;
    const shouldReplace = sourceIsNewer || !sizesMatch;

    if (shouldReplace) {
      try {
        const file = await runMegaCall(async () => {
          const storage = await this.authenticate(credentials);
          const parent = this.resolveFolder(storage, parentId);
          return this.performUpload(parent, filename, sizeBytes, stream, onProgress);
        });
        await runMegaCall(async () => {
          const storage = await this.authenticate(credentials);
          await storage.files[existing.id]?.delete(true);
        }).catch((err) => {
          console.warn(`Replace duplicate resolution: could not remove stale duplicate for "${filename}".`, err);
        });
        return { status: "uploaded", file };
      } catch (err) {
        // Step 4: replace failed (before/during consuming `stream`) —
        // fall back to rename instead of failing the file outright.
        console.warn(
          `Replace duplicate resolution: replace failed for "${filename}", falling back to rename.`,
          err
        );
      }
    }

    try {
      const renamedName = await this.resolveAvailableName(credentials, parentId, filename);
      const file = await runMegaCall(async () => {
        const storage = await this.authenticate(credentials);
        const parent = this.resolveFolder(storage, parentId);
        return this.performUpload(parent, renamedName, sizeBytes, stream, onProgress);
      });
      return { status: "uploaded", file };
    } catch (err) {
      // Step 5: rename also failed — don't fail silently, defer to the
      // user exactly like the existing ASK strategy does.
      console.warn(`Replace duplicate resolution: rename failed for "${filename}", falling back to ask.`, err);
      return { status: "conflict", existing };
    }
  }

  private async resolveAvailableName(credentials: unknown, parentId: string, filename: string): Promise<string> {
    const dotIndex = filename.lastIndexOf(".");
    const hasExtension = dotIndex > 0;
    const base = hasExtension ? filename.slice(0, dotIndex) : filename;
    const ext = hasExtension ? filename.slice(dotIndex) : "";

    let candidate = filename;
    for (let suffix = 1; await this.exists(credentials, parentId, candidate); suffix++) {
      candidate = `${base} (${suffix})${ext}`;
    }
    return candidate;
  }

  /**
   * Streams `source` into a new MEGA file under `parent`, reporting bytes
   * via megajs' native `"progress"` event (no custom Transform needed, unlike
   * Drive — see MegaUploadStream above). Uses `pipeline()` rather than a bare
   * `.pipe()` so a source read error (e.g. a failed temp-file read) properly
   * fails this upload instead of leaving it hanging forever — see
   * progress-transform.ts for why the codebase already favors `pipeline()`
   * for this exact reason. Passing `size` upfront means megajs streams
   * straight through without buffering the whole file in memory.
   */
  private async performUpload(
    parent: MutableFile,
    filename: string,
    sizeBytes: number,
    source: Readable,
    onProgress?: (progress: UploadProgress) => void
  ): Promise<RemoteNode> {
    const uploadStream = parent.upload({ name: filename, size: sizeBytes }) as unknown as MegaUploadStream;
    if (onProgress) {
      uploadStream.on("progress", ({ bytesUploaded, bytesTotal }) =>
        onProgress({ bytesUploaded, totalBytes: bytesTotal })
      );
    }
    await pipeline(source, uploadStream);
    const file = await uploadStream.complete;
    return toRemoteNode(file);
  }

  private requireCredentials(credentials: unknown): MegaCredentials {
    console.log("[MEGA-Trace][MegaProvider.requireCredentials] raw credentials:", maskForTrace(credentials));
    if (!isMegaCredentials(credentials)) {
      console.log("[MEGA-Trace][MegaProvider.requireCredentials] FAILED isMegaCredentials() shape check.");
      throw new ValidationError("MEGA connections require { email, password } credentials.");
    }
    return credentials;
  }

  private async authenticate(credentials: unknown): Promise<Storage> {
    const creds = this.requireCredentials(credentials);
    console.log(
      "[MEGA-Trace][MegaProvider.authenticate] calling getMegaSession with email:",
      creds.email,
      "passwordLength:",
      creds.password.length
    );
    try {
      return await getMegaSession(creds);
    } catch (err) {
      console.log("[MEGA-Trace][MegaProvider.authenticate] getMegaSession THREW (real error, not yet masked):", err);
      throw new AuthError("MEGA login failed — check the email and password.");
    }
  }

  private resolveFolder(storage: Storage, folderId?: string): MutableFile {
    if (!folderId || folderId === "/" || folderId === "root") return storage.root;
    const node = storage.files[folderId];
    if (!node) throw new NotFoundError("MEGA folder", folderId);
    if (!node.directory) throw new ValidationError(`"${folderId}" is a file, not a folder.`);
    return node;
  }
}
