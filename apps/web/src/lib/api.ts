/**
 * Thin typed client for the CloudBridge REST API (apps/api). Every type
 * here mirrors apps/api/src/types/{enums,models}.ts exactly — this is the
 * one place the frontend's "backend truth" lives, so the rest of the app
 * never has to guess at response shapes.
 */

export const API_BASE = (import.meta.env.VITE_API_URL ?? "http://localhost:4000/api").replace(/\/$/, "");

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

interface Envelope<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers:
        init?.body && !(init.body instanceof ArrayBuffer)
          ? { "Content-Type": "application/json", ...init.headers }
          : init?.headers,
    });
  } catch {
    throw new ApiError(
      "Couldn't reach the CloudBridge API — make sure the backend is running locally.",
      "NETWORK_ERROR",
      0
    );
  }

  if (res.status === 204) return undefined as T;

  const body = (await res.json().catch(() => null)) as Envelope<T> | null;

  if (!res.ok || !body?.success) {
    throw new ApiError(
      body?.error?.message ?? `Request failed (${res.status})`,
      body?.error?.code ?? "UNKNOWN",
      res.status
    );
  }

  return body.data as T;
}

// ---- Backend-mirrored types --------------------------------------------

export type BackendProviderType = "MEGA" | "GOOGLE_DRIVE" | "DROPBOX" | "ONEDRIVE" | "BOX" | "S3";
export type BackendConnectionStatus = "UNVERIFIED" | "VALID" | "INVALID";
export type BackendDuplicateStrategy = "SKIP" | "OVERWRITE" | "RENAME" | "ASK";
export type BackendJobStatus =
  | "PENDING"
  | "PLANNING"
  | "RUNNING"
  | "PAUSED"
  | "COMPLETED"
  | "COMPLETED_WITH_ERRORS"
  | "FAILED"
  | "CANCELLED";
export type BackendFileStatus = "PENDING" | "TRANSFERRING" | "DONE" | "FAILED" | "SKIPPED" | "CONFLICT";
export type BackendLogLevel = "info" | "success" | "warning" | "error";

export interface BackendProviderMeta {
  id: BackendProviderType;
  name: string;
  roles: Array<"source" | "destination">;
  available: boolean;
  capabilities: { resumableUpload: boolean; checksum: "sha1" | "md5" | "none" };
}

export interface BackendConnection {
  id: string;
  provider: BackendProviderType;
  label: string;
  status: BackendConnectionStatus;
  account?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BackendRemoteNode {
  id: string;
  name: string;
  type: "folder" | "file";
  sizeBytes?: number;
}

export interface BackendMigrationJob {
  id: string;
  sourceId: string;
  destinationId: string;
  sourceRootPath: string;
  destRootFolderId: string;
  duplicateStrategy: BackendDuplicateStrategy;
  status: BackendJobStatus;
  totalFiles: number;
  totalBytes: number;
  transferredBytes: number;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface BackendFileTransfer {
  id: string;
  migrationJobId: string;
  sourcePath: string;
  sourceFileId: string;
  filename: string;
  destParentId: string;
  sizeBytes: number;
  transferredBytes: number;
  status: BackendFileStatus;
  duplicateAction?: BackendDuplicateStrategy;
  errorType?: string;
  errorMessage?: string;
  attempts: number;
  createdAt: string;
  updatedAt: string;
}

export interface BackendLogEntry {
  id: string;
  migrationJobId: string;
  level: BackendLogLevel;
  message: string;
  timestamp: string;
}

// ---- Requests -------------------------------------------------------------

export interface CreateConnectionInput {
  provider: BackendProviderType;
  label: string;
  credentials?: unknown;
}

export interface CreateMigrationInput {
  sourceId: string;
  destinationId: string;
  sourceRootPath: string;
  destRootFolderId: string;
  duplicateStrategy: BackendDuplicateStrategy;
}

export interface ResolveConflictInput {
  action: "SKIP" | "OVERWRITE" | "RENAME";
  newName?: string;
}

// ---- Client -----------------------------------------------------------

export const api = {
  listProviders: () => request<BackendProviderMeta[]>("/providers"),

  listConnections: () => request<BackendConnection[]>("/connections"),
  createConnection: (input: CreateConnectionInput) =>
    request<BackendConnection>("/connections", { method: "POST", body: JSON.stringify(input) }),
  testConnection: (id: string) =>
    request<BackendConnection>(`/connections/${id}/test`, { method: "POST" }),
  deleteConnection: (id: string) => request<void>(`/connections/${id}`, { method: "DELETE" }),
  browseConnection: (id: string, path: string) =>
    request<{ path: string; nodes: BackendRemoteNode[] }>(
      `/connections/${id}/browse?path=${encodeURIComponent(path)}`
    ),

  listMigrations: () => request<BackendMigrationJob[]>("/migrations"),
  createMigration: (input: CreateMigrationInput) =>
    request<BackendMigrationJob>("/migrations", { method: "POST", body: JSON.stringify(input) }),
  getMigration: (id: string) => request<BackendMigrationJob>(`/migrations/${id}`),
  listMigrationFiles: (id: string) => request<BackendFileTransfer[]>(`/migrations/${id}/files`),
  listMigrationLogs: (id: string) => request<BackendLogEntry[]>(`/migrations/${id}/logs`),
  cancelMigration: (id: string) =>
    request<BackendMigrationJob>(`/migrations/${id}/cancel`, { method: "POST" }),
  retryMigration: (id: string) =>
    request<BackendMigrationJob>(`/migrations/${id}/retry`, { method: "POST" }),
  resolveConflict: (id: string, fileId: string, input: ResolveConflictInput) =>
    request<BackendFileTransfer>(`/migrations/${id}/conflicts/${fileId}/resolve`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
};
