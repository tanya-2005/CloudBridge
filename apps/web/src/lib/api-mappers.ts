import type {
  BackendDuplicateStrategy,
  BackendFileStatus,
  BackendFileTransfer,
  BackendJobStatus,
  BackendLogEntry,
  BackendLogLevel,
  BackendRemoteNode,
} from "@/lib/api";
import type {
  ActivityLogEntry,
  DuplicateStrategy,
  FileStatus,
  FileTransferItem,
  LogLevel,
  MigrationStatus,
  RemoteNode,
} from "@/types";

const DUPLICATE_TO_BACKEND: Record<DuplicateStrategy, BackendDuplicateStrategy> = {
  skip: "SKIP",
  replace: "OVERWRITE",
  rename: "RENAME",
  ask: "ASK",
};

const DUPLICATE_FROM_BACKEND: Record<BackendDuplicateStrategy, DuplicateStrategy> = {
  SKIP: "skip",
  OVERWRITE: "replace",
  RENAME: "rename",
  ASK: "ask",
};

export function toBackendDuplicateStrategy(strategy: DuplicateStrategy): BackendDuplicateStrategy {
  return DUPLICATE_TO_BACKEND[strategy];
}

export function fromBackendDuplicateStrategy(strategy: BackendDuplicateStrategy): DuplicateStrategy {
  return DUPLICATE_FROM_BACKEND[strategy];
}

const FILE_STATUS_FROM_BACKEND: Record<BackendFileStatus, FileStatus> = {
  PENDING: "pending",
  TRANSFERRING: "transferring",
  DONE: "done",
  FAILED: "failed",
  SKIPPED: "skipped",
  CONFLICT: "conflict",
};

const JOB_STATUS_FROM_BACKEND: Record<BackendJobStatus, MigrationStatus> = {
  PENDING: "pending",
  PLANNING: "planning",
  RUNNING: "running",
  PAUSED: "running",
  COMPLETED: "completed",
  COMPLETED_WITH_ERRORS: "completed_with_errors",
  FAILED: "failed",
  CANCELLED: "cancelled",
};

const LOG_LEVEL_FROM_BACKEND: Record<BackendLogLevel, LogLevel> = {
  info: "info",
  success: "success",
  warning: "warning",
  error: "error",
};

export function mapJobStatus(status: BackendJobStatus): MigrationStatus {
  return JOB_STATUS_FROM_BACKEND[status];
}

export function mapFileTransfer(file: BackendFileTransfer): FileTransferItem {
  return {
    id: file.id,
    name: file.filename,
    path: file.sourcePath,
    sizeBytes: file.sizeBytes,
    transferredBytes: file.transferredBytes,
    status: FILE_STATUS_FROM_BACKEND[file.status],
    errorMessage: file.errorMessage,
  };
}

export function mapLogEntry(entry: BackendLogEntry): ActivityLogEntry {
  return {
    id: entry.id,
    level: LOG_LEVEL_FROM_BACKEND[entry.level],
    message: entry.message,
    timestamp: entry.timestamp,
  };
}

export function mapRemoteNode(node: BackendRemoteNode): RemoteNode {
  return { id: node.id, name: node.name, type: node.type, sizeBytes: node.sizeBytes };
}
