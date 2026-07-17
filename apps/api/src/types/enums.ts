export const PROVIDER_TYPES = [
  "MEGA",
  "GOOGLE_DRIVE",
  "DROPBOX",
  "ONEDRIVE",
  "BOX",
  "S3",
] as const;
export type ProviderType = (typeof PROVIDER_TYPES)[number];

export const CONNECTION_STATUSES = ["UNVERIFIED", "VALID", "INVALID"] as const;
export type ConnectionStatus = (typeof CONNECTION_STATUSES)[number];

export const DUPLICATE_STRATEGIES = ["SKIP", "OVERWRITE", "RENAME", "ASK"] as const;
export type DuplicateStrategy = (typeof DUPLICATE_STRATEGIES)[number];

export const JOB_STATUSES = [
  "PENDING",
  "PLANNING",
  "RUNNING",
  "PAUSED",
  "COMPLETED",
  "COMPLETED_WITH_ERRORS",
  "FAILED",
  "CANCELLED",
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const FILE_STATUSES = [
  "PENDING",
  "TRANSFERRING",
  "DONE",
  "FAILED",
  "SKIPPED",
  "CONFLICT",
] as const;
export type FileStatus = (typeof FILE_STATUSES)[number];
