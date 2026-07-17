import type { Readable } from "node:stream";
import type { DuplicateStrategy, ProviderType } from "../../types/enums.js";
import type { RemoteNode } from "../../types/models.js";

export interface RemoteFileHandle {
  stream: Readable;
  filename: string;
  sizeBytes: number;
  mimeType?: string;
}

/**
 * Capability surface for a provider that can be browsed and read from.
 * Write capabilities (createFolder/writeStream/exists) are intentionally
 * left out until a destination provider (Google Drive, ...) is implemented
 * — see ARCHITECTURE.md §4 for the full CloudProvider interface this grows
 * into. Keeping the read-only slice separate means MEGA can be wired in
 * today without inventing methods it will never use.
 */
export interface SourceProvider {
  readonly type: ProviderType;

  /** Verifies credentials against the real provider and returns an identity label. */
  testConnection(credentials: unknown): Promise<{ account: string }>;

  /** Lists only the subfolders of `folderId` (root when omitted). */
  listFolders(credentials: unknown, folderId?: string): Promise<RemoteNode[]>;

  /** Lists only the files (not folders) of `folderId` (root when omitted). */
  listFiles(credentials: unknown, folderId?: string): Promise<RemoteNode[]>;

  /** Opens a readable stream for a single file, for downloading. */
  getReadStream(credentials: unknown, fileId: string): Promise<RemoteFileHandle>;
}

export interface UploadProgress {
  bytesUploaded: number;
  totalBytes: number;
}

export type UploadOutcome =
  | { status: "uploaded"; file: RemoteNode }
  | { status: "skipped"; existing: RemoteNode }
  | { status: "conflict"; existing: RemoteNode };

export interface UploadFileParams {
  parentId: string;
  filename: string;
  sizeBytes: number;
  stream: Readable;
  duplicateStrategy: DuplicateStrategy;
  onProgress?: (progress: UploadProgress) => void;
}

/**
 * Capability surface for a provider that can be written to. Unlike
 * SourceProvider, methods here take no per-call `credentials` — the only
 * destination implemented so far (Google Drive) authenticates once at
 * startup from a service account configured via environment variables
 * (no OAuth yet, per ARCHITECTURE.md §1). A future OAuth-based destination
 * would add a credentials parameter to its own methods without forcing a
 * change on this interface's other implementations or callers.
 */
export interface DestinationProvider {
  readonly type: ProviderType;

  /** Verifies the provider's configured credentials and returns an identity label. */
  testConnection(): Promise<{ account: string }>;

  /** Creates a folder under `parentId` and returns it. */
  createFolder(parentId: string, name: string): Promise<RemoteNode>;

  /** Looks up a same-named child of `parentId`, or null if there isn't one. */
  exists(parentId: string, filename: string): Promise<RemoteNode | null>;

  /**
   * Uploads `stream` under `parentId`, applying `duplicateStrategy` if a
   * same-named file already exists there (see ARCHITECTURE.md §9). Calls
   * `onProgress` as bytes are handed off to the provider, if given.
   */
  uploadFile(params: UploadFileParams): Promise<UploadOutcome>;
}
