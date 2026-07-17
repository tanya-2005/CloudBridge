export type ProviderId =
  | "MEGA"
  | "GOOGLE_DRIVE"
  | "DROPBOX"
  | "ONEDRIVE"
  | "BOX"
  | "S3";

export type ProviderRole = "source" | "destination";

/**
 * How a "Connect" click for this provider actually authenticates:
 * "credentials" — an inline email/password form (MEGA); "oauth" — a real
 * Google-style consent popup; "none" — a single click, nothing to enter.
 */
export type AuthMethod = "credentials" | "oauth" | "none";

export interface CloudProviderMeta {
  id: ProviderId;
  name: string;
  shortName: string;
  /** tailwind classes for the brand chip */
  accentClass: string;
  roles: ProviderRole[];
  available: boolean;
  authMethod: AuthMethod;
}

export type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

export interface ConnectionState {
  /** Real backend CloudConnection id, once created. */
  id: string | null;
  status: ConnectionStatus;
  account?: string;
  error?: string;
}

export type DuplicateStrategy = "skip" | "replace" | "rename" | "ask";

export interface DuplicateOption {
  id: DuplicateStrategy;
  label: string;
  description: string;
}

/** A folder selected via the real folder browser: real id + a readable breadcrumb. */
export interface SelectedFolder {
  id: string;
  label: string;
}

/** A node returned by the backend's real folder browser (MEGA/Google Drive). */
export interface RemoteNode {
  id: string;
  name: string;
  type: "folder" | "file";
  sizeBytes?: number;
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
  errorMessage?: string;
}

export type LogLevel = "info" | "success" | "warning" | "error";

export interface ActivityLogEntry {
  id: string;
  level: LogLevel;
  message: string;
  timestamp: string;
}

export type MigrationStatus =
  | "idle"
  | "pending"
  | "planning"
  | "running"
  | "completed"
  | "completed_with_errors"
  | "failed"
  | "cancelled";

export interface DashboardStat {
  id: string;
  label: string;
  value: string;
  delta?: string;
  trend?: "up" | "down" | "flat";
}
