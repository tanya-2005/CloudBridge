export type ProviderId =
  | "MEGA"
  | "GOOGLE_DRIVE"
  | "DROPBOX"
  | "ONEDRIVE"
  | "BOX"
  | "S3";

export type ProviderRole = "source" | "destination";

export interface CloudProviderMeta {
  id: ProviderId;
  name: string;
  shortName: string;
  description: string;
  /** tailwind classes for the brand chip */
  accentClass: string;
  roles: ProviderRole[];
  available: boolean;
}

export type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

export interface ConnectionState {
  status: ConnectionStatus;
  account?: string;
}

export type DuplicateStrategy = "skip" | "replace" | "rename" | "ask";

export interface DuplicateOption {
  id: DuplicateStrategy;
  label: string;
  description: string;
}

export interface MockNode {
  id: string;
  name: string;
  type: "folder" | "file";
  sizeBytes?: number;
  children?: MockNode[];
}

export type FileStatus =
  | "pending"
  | "transferring"
  | "done"
  | "failed"
  | "skipped"
  | "conflict";

export interface FileTransferItem {
  id: string;
  name: string;
  path: string;
  sizeBytes: number;
  transferredBytes: number;
  status: FileStatus;
}

export type LogLevel = "info" | "success" | "warning" | "error";

export interface ActivityLogEntry {
  id: string;
  level: LogLevel;
  message: string;
  timestamp: string;
}

export type MigrationStatus = "idle" | "running" | "completed" | "failed";

export interface MigrationSnapshot {
  id: string;
  source: ProviderId;
  destination: ProviderId;
  status: MigrationStatus;
  duplicateStrategy: DuplicateStrategy;
  startedAt: string;
  completedAt?: string;
}

export interface DashboardStat {
  id: string;
  label: string;
  value: string;
  delta?: string;
  trend?: "up" | "down" | "flat";
}
