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
import { getDriveRootFolderId } from "./google-drive.config.js";
import { runDriveCall, translateDriveError } from "./google-drive.errors.js";
import { getOAuthDriveClient, isOAuthCredentials } from "./google-drive.oauth.js";
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
    ...(isFolder ? {} : { sizeBytes: file.size ? Number(file.size) : 0 }),
  };
}

/** Escapes a filename for safe use inside a Drive API `q` string literal. */
function escapeQueryValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
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
      const res = await drive.files.list({
        q: `'${parentId}' in parents and mimeType = '${FOLDER_MIME_TYPE}' and trashed = false`,
        fields: "files(id, name, mimeType)",
        pageSize: 200,
        orderBy: "name",
      });
      return (res.data.files ?? []).map(toRemoteNode);
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
      const res = await drive.files.list({
        q: `'${parentId}' in parents and mimeType != '${FOLDER_MIME_TYPE}' and trashed = false`,
        fields: "files(id, name, mimeType, size)",
        pageSize: 200,
        orderBy: "name",
      });
      return (res.data.files ?? [])
        .filter((f) => !f.mimeType?.startsWith(GOOGLE_APPS_MIME_PREFIX))
        .map(toRemoteNode);
    });
  }

  async getReadStream(credentials: unknown, fileId: string): Promise<RemoteFileHandle> {
    return runDriveCall(async () => {
      const drive = resolveClient(credentials);
      const meta = await drive.files.get({ fileId, fields: "name, size, mimeType" });

      if (meta.data.mimeType?.startsWith(GOOGLE_APPS_MIME_PREFIX)) {
        throw new ValidationError(
          `"${meta.data.name ?? fileId}" is a native Google Docs/Sheets/Slides file and can't be transferred as raw bytes — export it to a standard format (PDF, DOCX, ...) in Drive first.`
        );
      }

      const res = await drive.files.get(
        { fileId, alt: "media" },
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

  async createFolder(credentials: unknown, parentId: string, name: string): Promise<RemoteNode> {
    return runDriveCall(async () => {
      const drive = resolveClient(credentials);
      const res = await drive.files.create({
        requestBody: { name, mimeType: FOLDER_MIME_TYPE, parents: [parentId] },
        fields: "id, name, mimeType",
      });
      return toRemoteNode(res.data);
    });
  }

  async exists(credentials: unknown, parentId: string, filename: string): Promise<RemoteNode | null> {
    return runDriveCall(async () => {
      const drive = resolveClient(credentials);
      const res = await drive.files.list({
        q: `'${parentId}' in parents and name = '${escapeQueryValue(filename)}' and trashed = false`,
        fields: "files(id, name, mimeType, size)",
        pageSize: 1,
      });
      const file = res.data.files?.[0];
      return file ? toRemoteNode(file) : null;
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
        case "OVERWRITE": {
          const file = await runDriveCall(async () => {
            const drive = resolveClient(credentials);
            const res = await drive.files.update({
              fileId: existing.id,
              media: { body: withProgress(stream, sizeBytes, onProgress) },
              fields: "id, name, mimeType, size",
            });
            return toRemoteNode(res.data);
          });
          return { status: "uploaded", file };
        }
        case "RENAME":
          filename = await this.resolveAvailableName(credentials, parentId, filename);
          break;
      }
    }

    const file = await runDriveCall(async () => {
      const drive = resolveClient(credentials);
      const res = await drive.files.create({
        requestBody: { name: filename, parents: [parentId] },
        media: { body: withProgress(stream, sizeBytes, onProgress) },
        fields: "id, name, mimeType, size",
      });
      return toRemoteNode(res.data);
    });
    return { status: "uploaded", file };
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
