import type { Readable } from "node:stream";
import type { AppError } from "../../common/errors/app-error.js";
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

  /**
   * Maps a raw error from this provider's SDK/API into the app's error
   * taxonomy (AuthError, TransientProviderError, ...). Optional so a
   * provider can lean on the engine's generic fallback instead — but
   * implementing it is how a provider owns its own error handling instead
   * of the engine needing to import a provider-specific translator (see
   * migration-engine.ts's `translateError` helper).
   */
  translateError?(err: unknown): AppError;
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
  /** ISO 8601 timestamp of the source file, when known — used by Replace's duplicate resolution to decide "is the source newer". */
  sourceModifiedTime?: string;
  stream: Readable;
  duplicateStrategy: DuplicateStrategy;
  credentials?: unknown;
  onProgress?: (progress: UploadProgress) => void;
}

/**
 * Capability surface for a provider that can be written to. `credentials`
 * is optional and opaque, same as SourceProvider's — Google Drive accepts
 * either real per-connection OAuth tokens or, when omitted, falls back to
 * a shared service account configured via environment variables (see
 * ARCHITECTURE.md §1). A provider that only supports one auth mode is free
 * to ignore whichever shape it doesn't use.
 */
export interface DestinationProvider {
  readonly type: ProviderType;

  /** Verifies the given (or configured) credentials and returns an identity label. */
  testConnection(credentials?: unknown): Promise<{ account: string }>;

  /** Lists only the subfolders of `folderId` (root when omitted) — used to let a user pick an upload target. */
  listFolders(credentials: unknown, folderId?: string): Promise<RemoteNode[]>;

  /** Creates a folder under `parentId` and returns it. */
  createFolder(credentials: unknown, parentId: string, name: string): Promise<RemoteNode>;

  /** Looks up a same-named child of `parentId`, or null if there isn't one. */
  exists(credentials: unknown, parentId: string, filename: string): Promise<RemoteNode | null>;

  /**
   * Uploads `stream` under `parentId`, applying `duplicateStrategy` if a
   * same-named file already exists there (see ARCHITECTURE.md §9). Calls
   * `onProgress` as bytes are handed off to the provider, if given.
   */
  uploadFile(params: UploadFileParams): Promise<UploadOutcome>;

  /** Same purpose as SourceProvider.translateError — see there for why it's optional. */
  translateError?(err: unknown): AppError;
}
