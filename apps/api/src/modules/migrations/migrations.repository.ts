import { createId } from "../../common/utils/id.js";
import type { FileTransfer, LogLevel, MigrationJob, MigrationLogEntry } from "../../types/models.js";

const MAX_LOGS_PER_JOB = 500;

/**
 * In-memory stand-in for the Prisma-backed MigrationJob/FileTransfer tables
 * in ARCHITECTURE.md §6. Same shape as the eventual schema so the service
 * layer above it won't need to change when a real database is introduced.
 */
export class MigrationsRepository {
  private readonly jobs = new Map<string, MigrationJob>();
  private readonly files = new Map<string, FileTransfer[]>();
  private readonly logs = new Map<string, MigrationLogEntry[]>();

  seedJob(job: MigrationJob, files: FileTransfer[]): void {
    this.jobs.set(job.id, job);
    this.files.set(job.id, files);
  }

  findAll(): MigrationJob[] {
    return [...this.jobs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  findById(id: string): MigrationJob | undefined {
    return this.jobs.get(id);
  }

  create(job: MigrationJob, files: FileTransfer[] = []): MigrationJob {
    this.jobs.set(job.id, job);
    this.files.set(job.id, files);
    return job;
  }

  /** Appends a file discovered during planning to an already-created job. */
  addFile(
    jobId: string,
    file: Pick<
      FileTransfer,
      "sourcePath" | "sourceFileId" | "filename" | "destParentId" | "sizeBytes" | "sourceModifiedTime"
    >
  ): FileTransfer {
    const now = new Date().toISOString();
    const record: FileTransfer = {
      id: createId("file"),
      migrationJobId: jobId,
      status: "PENDING",
      transferredBytes: 0,
      attempts: 0,
      createdAt: now,
      updatedAt: now,
      ...file,
    };
    const files = this.files.get(jobId) ?? [];
    files.push(record);
    this.files.set(jobId, files);
    return record;
  }

  update(id: string, patch: Partial<Omit<MigrationJob, "id" | "createdAt">>): MigrationJob | undefined {
    const existing = this.jobs.get(id);
    if (!existing) return undefined;
    const updated: MigrationJob = { ...existing, ...patch };
    this.jobs.set(id, updated);
    return updated;
  }

  listFiles(jobId: string): FileTransfer[] {
    return this.files.get(jobId) ?? [];
  }

  findFile(jobId: string, fileId: string): FileTransfer | undefined {
    return this.listFiles(jobId).find((f) => f.id === fileId);
  }

  /** Appends a real-time activity log entry, newest first, capped per job. */
  addLog(jobId: string, level: LogLevel, message: string): MigrationLogEntry {
    const entry: MigrationLogEntry = {
      id: createId("log"),
      migrationJobId: jobId,
      level,
      message,
      timestamp: new Date().toISOString(),
    };
    const existing = this.logs.get(jobId) ?? [];
    existing.unshift(entry);
    if (existing.length > MAX_LOGS_PER_JOB) existing.length = MAX_LOGS_PER_JOB;
    this.logs.set(jobId, existing);
    return entry;
  }

  listLogs(jobId: string): MigrationLogEntry[] {
    return this.logs.get(jobId) ?? [];
  }

  updateFile(
    jobId: string,
    fileId: string,
    patch: Partial<Omit<FileTransfer, "id" | "migrationJobId" | "createdAt">>
  ): FileTransfer | undefined {
    const files = this.files.get(jobId);
    if (!files) return undefined;
    const index = files.findIndex((f) => f.id === fileId);
    if (index === -1) return undefined;
    const updated: FileTransfer = { ...files[index]!, ...patch, updatedAt: new Date().toISOString() };
    files[index] = updated;
    return updated;
  }
}

function makeFile(
  jobId: string,
  overrides: Partial<FileTransfer> & Pick<FileTransfer, "filename" | "sizeBytes" | "status">
): FileTransfer {
  const now = new Date().toISOString();
  return {
    id: createId("file"),
    migrationJobId: jobId,
    sourcePath: `/Photos/${overrides.filename}`,
    sourceFileId: createId("src"),
    destParentId: "dest-root",
    transferredBytes: overrides.status === "DONE" ? overrides.sizeBytes : 0,
    attempts: overrides.status === "FAILED" ? 3 : overrides.status === "DONE" ? 1 : 0,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

export const migrationsRepository = new MigrationsRepository();

const seedNow = new Date();
const seedJobId = createId("mig");
const seedStarted = new Date(seedNow.getTime() - 5 * 60_000).toISOString();

migrationsRepository.seedJob(
  {
    id: seedJobId,
    sourceId: "seed-source",
    destinationId: "seed-destination",
    sourceRootPath: "My MEGA Drive / Photos",
    destRootFolderId: "Migrated Files",
    duplicateStrategy: "RENAME",
    status: "RUNNING",
    totalFiles: 5,
    totalBytes: 482_000_000 + 1_280_000_000 + 2_400_000 + 890_000 + 64_000_000,
    transferredBytes: 482_000_000 + 2_400_000,
    createdAt: seedStarted,
    startedAt: seedStarted,
  },
  [
    makeFile(seedJobId, { filename: "summer-trip.zip", sizeBytes: 482_000_000, status: "DONE" }),
    makeFile(seedJobId, { filename: "family-reunion.mp4", sizeBytes: 1_280_000_000, status: "TRANSFERRING", transferredBytes: 640_000_000 }),
    makeFile(seedJobId, { filename: "profile.jpg", sizeBytes: 2_400_000, status: "DONE" }),
    makeFile(seedJobId, { filename: "contract-signed.pdf", sizeBytes: 890_000, status: "CONFLICT" }),
    makeFile(seedJobId, { filename: "site-export.tar.gz", sizeBytes: 64_000_000, status: "PENDING" }),
  ]
);

const seedJob2Id = createId("mig");
const seedJob2Started = new Date(seedNow.getTime() - 26 * 60 * 60_000).toISOString();
const seedJob2Completed = new Date(seedNow.getTime() - 25 * 60 * 60_000).toISOString();

migrationsRepository.seedJob(
  {
    id: seedJob2Id,
    sourceId: "seed-source",
    destinationId: "seed-destination",
    sourceRootPath: "My MEGA Drive / Documents",
    destRootFolderId: "Migrated Files",
    duplicateStrategy: "SKIP",
    status: "COMPLETED",
    totalFiles: 2,
    totalBytes: 1_100_000 + 340_000,
    transferredBytes: 1_100_000 + 340_000,
    createdAt: seedJob2Started,
    startedAt: seedJob2Started,
    completedAt: seedJob2Completed,
  },
  [
    makeFile(seedJob2Id, { filename: "taxes-2023.pdf", sizeBytes: 1_100_000, status: "DONE" }),
    makeFile(seedJob2Id, { filename: "resume.docx", sizeBytes: 340_000, status: "DONE" }),
  ]
);
