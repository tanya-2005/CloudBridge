import { NotFoundError, ValidationError } from "../../common/errors/app-error.js";
import { destinationProviderRegistry } from "../providers/destination-provider-registry.js";
import { providerRegistry } from "../providers/provider-registry.js";
import type {
  RemoteFileHandle,
  UploadFileParams,
  UploadOutcome,
} from "../providers/provider.interface.js";
import type { CloudConnection, RemoteNode } from "../../types/models.js";
import type { ConnectionsRepository } from "./connections.repository.js";
import { credentialsStore } from "./credentials.store.js";
import type { CreateConnectionInput } from "./connections.schema.js";

export class ConnectionsService {
  constructor(private readonly repository: ConnectionsRepository) {}

  list(): CloudConnection[] {
    return this.repository.findAll();
  }

  getById(id: string): CloudConnection {
    const connection = this.repository.findById(id);
    if (!connection) throw new NotFoundError("Connection", id);
    return connection;
  }

  create(input: CreateConnectionInput): CloudConnection {
    const connection = this.repository.create({ provider: input.provider, label: input.label });
    if (input.credentials !== undefined) {
      credentialsStore.save(connection.id, input.credentials);
    }
    return connection;
  }

  remove(id: string): void {
    const removed = this.repository.delete(id);
    if (!removed) throw new NotFoundError("Connection", id);
    credentialsStore.delete(id);
  }

  /**
   * Providers with a registered adapter perform a real login/verification —
   * MEGA via its source adapter (per-connection credentials), Google Drive
   * via its destination adapter (server-configured service account).
   * Everything else still uses the dummy always-succeeds behavior from
   * Phase 2 until its adapter exists — see ARCHITECTURE.md §1.
   */
  async testConnection(id: string): Promise<CloudConnection> {
    const connection = this.getById(id);
    const sourceProvider = providerRegistry.get(connection.provider);
    const destinationProvider = destinationProviderRegistry.get(connection.provider);

    if (!sourceProvider && !destinationProvider) {
      return this.repository.update(id, { status: "VALID" }) ?? connection;
    }

    try {
      const { account } = sourceProvider
        ? await sourceProvider.testConnection(credentialsStore.get(id))
        : await destinationProvider!.testConnection();
      return this.repository.update(id, { status: "VALID", account }) ?? connection;
    } catch (err) {
      this.repository.update(id, { status: "INVALID" });
      throw err;
    }
  }

  async browse(id: string, path: string): Promise<{ path: string; nodes: RemoteNode[] }> {
    const connection = this.getById(id);
    const provider = providerRegistry.get(connection.provider);

    if (!provider) {
      return { path, nodes: buildDummyTree(path) };
    }

    const folderId = path === "/" || path === "" ? undefined : path;
    const credentials = credentialsStore.get(id);
    const [folders, files] = await Promise.all([
      provider.listFolders(credentials, folderId),
      provider.listFiles(credentials, folderId),
    ]);
    return { path, nodes: [...folders, ...files] };
  }

  async downloadFile(id: string, fileId: string): Promise<RemoteFileHandle> {
    const connection = this.getById(id);
    const provider = providerRegistry.get(connection.provider);

    if (!provider) {
      throw new ValidationError(
        `Downloading files is not yet supported for ${connection.provider} connections.`
      );
    }

    return provider.getReadStream(credentialsStore.get(id), fileId);
  }

  async createFolder(id: string, parentId: string, name: string): Promise<RemoteNode> {
    const connection = this.getById(id);
    const provider = destinationProviderRegistry.get(connection.provider);

    if (!provider) {
      throw new ValidationError(
        `Creating folders is not yet supported for ${connection.provider} connections.`
      );
    }

    return provider.createFolder(parentId, name);
  }

  async uploadFile(id: string, params: UploadFileParams): Promise<UploadOutcome> {
    const connection = this.getById(id);
    const provider = destinationProviderRegistry.get(connection.provider);

    if (!provider) {
      throw new ValidationError(
        `Uploading files is not yet supported for ${connection.provider} connections.`
      );
    }

    return provider.uploadFile(params);
  }
}

function buildDummyTree(path: string): RemoteNode[] {
  if (path === "/" || path === "") {
    return [
      { id: "folder-photos", name: "Photos", type: "folder" },
      { id: "folder-documents", name: "Documents", type: "folder" },
      { id: "folder-projects", name: "Projects", type: "folder" },
      { id: "file-invoice", name: "invoice-archive.zip", type: "file", sizeBytes: 210_000_000 },
    ];
  }
  if (path.endsWith("Documents")) {
    return [
      { id: "file-taxes", name: "taxes-2023.pdf", type: "file", sizeBytes: 1_100_000 },
      { id: "file-resume", name: "resume.docx", type: "file", sizeBytes: 340_000 },
    ];
  }
  return [];
}
