import type { File as MegaFile, Storage } from "megajs";
import { AppError, AuthError, NotFoundError, ValidationError } from "../../../common/errors/app-error.js";
import type { RemoteNode } from "../../../types/models.js";
import type { RemoteFileHandle, SourceProvider } from "../provider.interface.js";
import { getMegaSession, type MegaCredentials } from "./mega.session.js";
import { runMegaCall, translateMegaError } from "./mega.errors.js";

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
    ...(file.directory ? {} : { sizeBytes: file.size ?? 0 }),
  };
}

export class MegaProvider implements SourceProvider {
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

  private requireCredentials(credentials: unknown): MegaCredentials {
    if (!isMegaCredentials(credentials)) {
      throw new ValidationError("MEGA connections require { email, password } credentials.");
    }
    return credentials;
  }

  private async authenticate(credentials: unknown): Promise<Storage> {
    const creds = this.requireCredentials(credentials);
    try {
      return await getMegaSession(creds);
    } catch {
      throw new AuthError("MEGA login failed — check the email and password.");
    }
  }

  private resolveFolder(storage: Storage, folderId?: string): MegaFile {
    if (!folderId || folderId === "/" || folderId === "root") return storage.root;
    const node = storage.files[folderId];
    if (!node) throw new NotFoundError("MEGA folder", folderId);
    if (!node.directory) throw new ValidationError(`"${folderId}" is a file, not a folder.`);
    return node;
  }
}
