import type { drive_v3 } from "googleapis";
import type { RemoteNode } from "../../../types/models.js";
import type {
  DestinationProvider,
  UploadFileParams,
  UploadOutcome,
} from "../provider.interface.js";
import { getDriveClient } from "./google-drive.client.js";
import { runDriveCall } from "./google-drive.errors.js";
import { withProgress } from "./progress-stream.js";

const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";

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

export class GoogleDriveProvider implements DestinationProvider {
  readonly type = "GOOGLE_DRIVE" as const;

  async testConnection(): Promise<{ account: string }> {
    return runDriveCall(async () => {
      const drive = getDriveClient();
      const res = await drive.about.get({ fields: "user" });
      return { account: res.data.user?.emailAddress ?? "unknown" };
    });
  }

  async createFolder(parentId: string, name: string): Promise<RemoteNode> {
    return runDriveCall(async () => {
      const drive = getDriveClient();
      const res = await drive.files.create({
        requestBody: { name, mimeType: FOLDER_MIME_TYPE, parents: [parentId] },
        fields: "id, name, mimeType",
      });
      return toRemoteNode(res.data);
    });
  }

  async exists(parentId: string, filename: string): Promise<RemoteNode | null> {
    return runDriveCall(async () => {
      const drive = getDriveClient();
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
    const { parentId, sizeBytes, stream, duplicateStrategy, onProgress } = params;
    let filename = params.filename;

    const existing = await this.exists(parentId, filename);

    if (existing) {
      switch (duplicateStrategy) {
        case "SKIP":
          return { status: "skipped", existing };
        case "ASK":
          return { status: "conflict", existing };
        case "OVERWRITE": {
          const file = await runDriveCall(async () => {
            const drive = getDriveClient();
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
          filename = await this.resolveAvailableName(parentId, filename);
          break;
      }
    }

    const file = await runDriveCall(async () => {
      const drive = getDriveClient();
      const res = await drive.files.create({
        requestBody: { name: filename, parents: [parentId] },
        media: { body: withProgress(stream, sizeBytes, onProgress) },
        fields: "id, name, mimeType, size",
      });
      return toRemoteNode(res.data);
    });
    return { status: "uploaded", file };
  }

  private async resolveAvailableName(parentId: string, filename: string): Promise<string> {
    const dotIndex = filename.lastIndexOf(".");
    const hasExtension = dotIndex > 0;
    const base = hasExtension ? filename.slice(0, dotIndex) : filename;
    const ext = hasExtension ? filename.slice(dotIndex) : "";

    let candidate = filename;
    for (let suffix = 1; await this.exists(parentId, candidate); suffix++) {
      candidate = `${base} (${suffix})${ext}`;
    }
    return candidate;
  }
}
