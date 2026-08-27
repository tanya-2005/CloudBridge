import type { Readable } from "node:stream";
import type { drive_v3 } from "@googleapis/drive";
import type { AppError } from "../../../common/errors/app-error.js";
import { ValidationError } from "../../../common/errors/app-error.js";
import type { RemoteNode } from "../../../types/models.js";
import type {
  DestinationProvider,
  RemoteFileHandle,
  SourceProvider,
  UploadFileParams,
  UploadOutcome,
} from "../provider.interface.js";
import { getDriveClient } from "./google-drive.client.js";
import { getDriveRootFolderId, isGoogleDriveConfigured } from "./google-drive.config.js";
import { runDriveCall, translateDriveError } from "./google-drive.errors.js";
import { getOAuthDriveClient, isOAuthCredentials } from "./google-drive.oauth.js";
import { isGoogleOAuthConfigured } from "./google-drive.oauth-config.js";
import { withProgress } from "./progress-stream.js";

const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";
/** Docs, Sheets, Slides, Forms, ... — Drive-native formats with no raw byte representation; they need `files.export`, not `alt=media`. Out of scope for a byte-for-byte migration. */
const GOOGLE_APPS_MIME_PREFIX = "application/vnd.google-apps.";

function toRemoteNode(file: drive_v3.Schema$File): RemoteNode {
  const isFolder = file.mimeType === FOLDER_MIME_TYPE;
  return {
    id: file.id ?? "",
    name: file.name ?? "(untitled)",
    type: isFolder ? "folder" : "file",
    ...(isFolder ? {} : { sizeBytes: file.size ? Number(file.size) : 0, modifiedTime: file.modifiedTime ?? undefined }),
  };
}

/** Escapes a filename for safe use inside a Drive API `q` string literal. */
function escapeQueryValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

/**
 * `drive.files.list` only ever returns one page (Drive's default/max page
 * size is 1000, capped at 200 below to keep individual responses light) —
 * without following `nextPageToken` until it's exhausted, any folder with
 * more items than one page silently drops the rest. Both listFolders and
 * listFiles feed the migration planner directly, so a truncated result
 * here means files that are never migrated with no error surfaced.
 */
async function listAllFiles(
  drive: drive_v3.Drive,
  params: drive_v3.Params$Resource$Files$List
): Promise<drive_v3.Schema$File[]> {
  const files: drive_v3.Schema$File[] = [];
  let pageToken: string | undefined;

  do {
    const res = await drive.files.list({ ...params, pageToken });
    files.push(...(res.data.files ?? []));
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  return files;
}

/**
 * Resolves whichever Drive client this connection actually authenticates
 * with: real per-connection OAuth tokens when present, otherwise the
 * single shared service account configured via environment variables.
 * Every method below goes through this instead of picking a client
 * itself, so the two auth modes stay interchangeable everywhere.
 */
function resolveClient(credentials: unknown): drive_v3.Drive {
  if (isOAuthCredentials(credentials)) return getOAuthDriveClient(credentials);

  // No valid credentials supplied — surface the most likely cause instead of
  // falling through to the service-account path (which throws an opaque error
  // when neither GOOGLE_SERVICE_ACCOUNT_KEY_FILE nor GOOGLE_SERVICE_ACCOUNT_KEY
  // is set, i.e. the common production case).
  if (!isGoogleDriveConfigured() && !isGoogleOAuthConfigured()) {
    throw new Error(
      "Google Drive is not available — no authentication is configured. " +
        "Set either (a) GOOGLE_SERVICE_ACCOUNT_KEY_FILE or GOOGLE_SERVICE_ACCOUNT_KEY for a shared service account, " +
        "or (b) GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, and GOOGLE_OAUTH_REDIRECT_URI for per-connection OAuth."
    );
  }

  // OAuth is configured but this connection has no valid stored credentials
  // (e.g. the user hasn't completed the OAuth consent flow yet).
  if (isGoogleOAuthConfigured() && !isGoogleDriveConfigured()) {
    throw new Error(
      "Google Drive OAuth is configured on this server, but this connection has no stored credentials. " +
        "Reconnect the account via the Google Drive OAuth sign-in flow."
    );
  }

  // Only the service-account path remains.
  return getDriveClient();
}

export class GoogleDriveProvider implements SourceProvider, DestinationProvider {
  readonly type = "GOOGLE_DRIVE" as const;

  async testConnection(credentials?: unknown): Promise<{ account: string }> {
    return runDriveCall(async () => {
      const drive = resolveClient(credentials);
      const res = await drive.about.get({ fields: "user" });
      return { account: res.data.user?.emailAddress ?? "unknown" };
    });
  }

  async listFolders(credentials: unknown, folderId?: string): Promise<RemoteNode[]> {
    return runDriveCall(async () => {
      const drive = resolveClient(credentials);
      const parentId = folderId ?? getDriveRootFolderId();
      const files = await listAllFiles(drive, {
        q: `'${parentId}' in parents and mimeType = '${FOLDER_MIME_TYPE}' and trashed = false`,
        fields: "nextPageToken, files(id, name, mimeType)",
        pageSize: 200,
        orderBy: "name",
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });
      return files.map(toRemoteNode);
    });
  }

  /**
   * Lists real, byte-downloadable files (not folders, and not native
   * Google Docs/Sheets/Slides — see GOOGLE_APPS_MIME_PREFIX) directly
   * under `folderId`, for use as a *source*. Destination-only browsing
   * (picking an upload target) never calls this, only listFolders.
   */
  async listFiles(credentials: unknown, folderId?: string): Promise<RemoteNode[]> {
    return runDriveCall(async () => {
      const drive = resolveClient(credentials);
      const parentId = folderId ?? getDriveRootFolderId();
      const files = await listAllFiles(drive, {
        q: `'${parentId}' in parents and mimeType != '${FOLDER_MIME_TYPE}' and trashed = false`,
        fields: "nextPageToken, files(id, name, mimeType, size, modifiedTime)",
        pageSize: 200,
        orderBy: "name",
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });
      return files.filter((f) => !f.mimeType?.startsWith(GOOGLE_APPS_MIME_PREFIX)).map(toRemoteNode);
    });
  }

  async getReadStream(credentials: unknown, fileId: string): Promise<RemoteFileHandle> {
    return runDriveCall(async () => {
      const drive = resolveClient(credentials);
      // ── Diagnostic: metadata fetch ──
      console.error(`[GoogleDrive] files.get operation=metadata fileId=${fileId} role=source`);
      const meta = await drive.files.get({ fileId, fields: "name, size, mimeType", supportsAllDrives: true });

      if (meta.data.mimeType?.startsWith(GOOGLE_APPS_MIME_PREFIX)) {
        throw new ValidationError(
          `"${meta.data.name ?? fileId}" is a native Google Docs/Sheets/Slides file and can't be transferred as raw bytes — export it to a standard format (PDF, DOCX, ...) in Drive first.`
        );
      }

      // ── Diagnostic: media download ──
      console.error(`[GoogleDrive] files.get operation=media fileId=${fileId} role=source`);
      const res = await drive.files.get(
        { fileId, alt: "media", supportsAllDrives: true },
        { responseType: "stream" }
      );

      return {
        stream: res.data as unknown as Readable,
        filename: meta.data.name ?? fileId,
        sizeBytes: meta.data.size ? Number(meta.data.size) : 0,
        mimeType: meta.data.mimeType ?? undefined,
      };
    });
  }

  translateError(err: unknown): AppError {
    return translateDriveError(err);
  }

  /**
   * Verifies that `folderId` refers to an actual folder accessible by
   * the authenticated Google account. This catches the "selected a folder
   * from the wrong account / a Shared Drive without permission / a deleted
   * folder" case at planning time instead of letting every file upload
   * fail with a 404.
   */
  async validateDestinationFolder(credentials: unknown, folderId: string): Promise<void> {
    await runDriveCall(async () => {
      const drive = resolveClient(credentials);
      const res = await drive.files.get({
        fileId: folderId,
        fields: "id, name, mimeType",
        supportsAllDrives: true,
      });
      if (res.data.mimeType !== FOLDER_MIME_TYPE) {
        throw new ValidationError(
          `Destination "${res.data.name ?? folderId}" is not a folder (type: ${res.data.mimeType}). Select a folder, not a file.`
        );
      }
    });
  }

  async createFolder(credentials: unknown, parentId: string, name: string): Promise<RemoteNode> {
    return runDriveCall(async () => {
      const drive = resolveClient(credentials);
      const res = await drive.files.create({
        requestBody: { name, mimeType: FOLDER_MIME_TYPE, parents: [parentId] },
        fields: "id, name, mimeType",
        supportsAllDrives: true,
      });
      return toRemoteNode(res.data);
    });
  }

  async exists(credentials: unknown, parentId: string, filename: string): Promise<RemoteNode | null> {
    return runDriveCall(async () => {
      const drive = resolveClient(credentials);
      const res = await drive.files.list({
        q: `'${parentId}' in parents and name = '${escapeQueryValue(filename)}' and trashed = false`,
        fields: "files(id, name, mimeType, size, modifiedTime)",
        pageSize: 1,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });
      const file = res.data.files?.[0];
      return file ? toRemoteNode(file) : null;
    });
  }

  async uploadFile(params: UploadFileParams): Promise<UploadOutcome> {
    const { parentId, sizeBytes, sourceModifiedTime, stream, duplicateStrategy, credentials, onProgress } = params;
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

    // ── Diagnostic: log upload context (no secrets) ──
    console.error(
      `[GoogleDrive upload] operation=files.create parentId=${parentId} filename=${filename} isOAuth=${isOAuthCredentials(credentials)}`
    );
    // ── End diagnostic ──

    const file = await runDriveCall(async () => {
      const drive = resolveClient(credentials);
      const res = await drive.files.create({
        // Preserving the source's modified time (rather than letting Drive
        // stamp "now") is what lets a later re-run's timestamp comparison
        // recognize an unchanged file as identical instead of never
        // matching — see resolveReplaceDuplicate below.
        requestBody: { name: filename, parents: [parentId], ...(sourceModifiedTime ? { modifiedTime: sourceModifiedTime } : {}) },
        media: { body: withProgress(stream, sizeBytes, onProgress) },
        fields: "id, name, mimeType, size, modifiedTime",
        supportsAllDrives: true,
      });
      return toRemoteNode(res.data);
    });
    return { status: "uploaded", file };
  }

  // ===================================================================
  // Replace ("OVERWRITE") duplicate resolution hierarchy
  // ===================================================================
  // Runs whenever duplicateStrategy === "OVERWRITE" and a same-named file
  // already exists at the destination. Rather than blindly overwriting,
  // it applies this decision tree:
  //
  //   existing found
  //     │
  //     ├─ size AND modified time both match  → SKIP (already identical)
  //     │
  //     └─ otherwise (something differs):
  //           ├─ source is newer OR sizes differ  → try REPLACE
  //           │        └─ REPLACE throws           → fall back to RENAME
  //           └─ (same size, source not newer)     → RENAME directly
  //                    └─ RENAME throws             → fall back to ASK
  //                                                    (return a conflict —
  //                                                    the caller/UI surfaces
  //                                                    this exactly like the
  //                                                    existing ASK strategy)
  //
  // Missing timestamps on either side are treated as "can't prove identical"
  // (never skip) and "can't prove the source is newer" (falls through to
  // rename rather than blindly overwriting) — the safe default for both
  // ambiguous cases. SKIP, RENAME, and ASK selected directly by the user
  // are unaffected by any of this — see the switch above.
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

    // Step 1 + 2: identical by both measures → skip, nothing to transfer.
    if (sizesMatch && timestampsMatch) {
      return { status: "skipped", existing };
    }

    // Step 3: decide whether this looks like a genuine update worth replacing.
    const sourceIsNewer =
      sourceModifiedMs !== undefined && existingModifiedMs !== undefined && sourceModifiedMs > existingModifiedMs;
    const shouldReplace = sourceIsNewer || !sizesMatch;

    if (shouldReplace) {
      try {
        const file = await runDriveCall(async () => {
          const drive = resolveClient(credentials);
          const res = await drive.files.update({
            fileId: existing.id,
            // See uploadFile's create() call for why this matters.
            requestBody: sourceModifiedTime ? { modifiedTime: sourceModifiedTime } : {},
            media: { body: withProgress(stream, sizeBytes, onProgress) },
            fields: "id, name, mimeType, size, modifiedTime",
            supportsAllDrives: true,
          });
          return toRemoteNode(res.data);
        });
        return { status: "uploaded", file };
      } catch (err) {
        // Step 4: replace failed (provider limitation, permission issue,
        // etc.) — fall back to rename instead of failing the file outright.
        console.warn(
          `Replace duplicate resolution: replace failed for "${filename}", falling back to rename.`,
          err
        );
      }
    }

    // Reached either because replace failed above, or because the tree
    // routes here directly (same size, source not newer than destination).
    try {
      const renamedName = await this.resolveAvailableName(credentials, parentId, filename);
      const file = await runDriveCall(async () => {
        const drive = resolveClient(credentials);
        const res = await drive.files.create({
          requestBody: {
            name: renamedName,
            parents: [parentId],
            ...(sourceModifiedTime ? { modifiedTime: sourceModifiedTime } : {}),
          },
          media: { body: withProgress(stream, sizeBytes, onProgress) },
          fields: "id, name, mimeType, size, modifiedTime",
          supportsAllDrives: true,
        });
        return toRemoteNode(res.data);
      });
      return { status: "uploaded", file };
    } catch (err) {
      // Step 5: rename also failed — don't fail silently, defer to the user
      // exactly like the existing ASK strategy does.
      console.warn(
        `Replace duplicate resolution: rename failed for "${filename}", falling back to ask.`,
        err
      );
      return { status: "conflict", existing };
    }
  }

  private async resolveAvailableName(
    credentials: unknown,
    parentId: string,
    filename: string
  ): Promise<string> {
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
}
