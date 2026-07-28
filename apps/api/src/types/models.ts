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
  /** ISO 8601 timestamp of the source file, when the source provider exposes one — used by Replace's duplicate resolution to compare against the destination's modified time. */
  sourceModifiedTime?: string;
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
  /** ISO 8601 timestamp, when the provider exposes one — needed for Replace's duplicate comparison. */
  modifiedTime?: string;
  children?: RemoteNode[];
}

export type LogLevel = "info" | "success" | "warning" | "error";

export interface MigrationLogEntry {
  id: string;
  migrationJobId: string;
  level: LogLevel;
  message: string;
  timestamp: string;
}
