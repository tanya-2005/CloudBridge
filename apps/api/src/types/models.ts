import type {
  ConnectionStatus,
  DuplicateStrategy,
  FileStatus,
  JobStatus,
  ProviderType,
} from "./enums.js";

export interface CloudConnection {
  id: string;
  provider: ProviderType;
  label: string;
  status: ConnectionStatus;
  /** Never sent to clients — dummy placeholder for where an encrypted blob will live. */
  account?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FileTransfer {
  id: string;
  migrationJobId: string;
  sourcePath: string;
  sourceFileId: string;
  filename: string;
  destParentId: string;
  sizeBytes: number;
  transferredBytes: number;
  checksum?: string;
  status: FileStatus;
  duplicateAction?: DuplicateStrategy;
  errorType?: string;
  errorMessage?: string;
  attempts: number;
  createdAt: string;
  updatedAt: string;
}

export interface MigrationJob {
  id: string;
  sourceId: string;
  destinationId: string;
  sourceRootPath: string;
  destRootFolderId: string;
  duplicateStrategy: DuplicateStrategy;
  status: JobStatus;
  totalFiles: number;
  totalBytes: number;
  transferredBytes: number;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface RemoteNode {
  id: string;
  name: string;
  type: "folder" | "file";
  sizeBytes?: number;
  children?: RemoteNode[];
}
