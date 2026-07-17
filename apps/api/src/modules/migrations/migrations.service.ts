import { ConflictError, NotFoundError } from "../../common/errors/app-error.js";
import { createId } from "../../common/utils/id.js";
import type { FileStatus } from "../../types/enums.js";
import type { FileTransfer, MigrationJob } from "../../types/models.js";
import { migrationEngine } from "./engine/migration-engine.js";
import type { MigrationsRepository } from "./migrations.repository.js";
import type { CreateMigrationInput, ResolveConflictInput } from "./migrations.schema.js";

export class MigrationsService {
  constructor(private readonly repository: MigrationsRepository) {}

  list(): MigrationJob[] {
    return this.repository.findAll();
  }

  getById(id: string): MigrationJob {
    const job = this.repository.findById(id);
    if (!job) throw new NotFoundError("Migration", id);
    return job;
  }

  /**
   * Creates the job record and, if both the source and destination
   * connections resolve to real provider adapters (MEGA + Google Drive as
   * of Phase 5), kicks off the migration engine in the background — the
   * request returns immediately with the job in PENDING/PLANNING state,
   * and progress is visible via GET /migrations/:id and .../files as the
   * engine works through it. Anything not fully implemented yet just sits
   * as a PENDING record, exactly like Phase 2.
   */
  create(input: CreateMigrationInput): MigrationJob {
    const now = new Date().toISOString();
    const job: MigrationJob = {
      id: createId("mig"),
      sourceId: input.sourceId,
      destinationId: input.destinationId,
      sourceRootPath: input.sourceRootPath,
      destRootFolderId: input.destRootFolderId,
      duplicateStrategy: input.duplicateStrategy,
      status: "PENDING",
      totalFiles: 0,
      totalBytes: 0,
      transferredBytes: 0,
      createdAt: now,
    };
    const created = this.repository.create(job, []);
    this.repository.addLog(created.id, "info", "Migration created.");
    migrationEngine.runInBackground(created.id);
    return created;
  }

  cancel(id: string): MigrationJob {
    const job = this.getById(id);
    if (job.status === "COMPLETED" || job.status === "FAILED" || job.status === "CANCELLED") {
      throw new ConflictError(`Migration "${id}" has already finished and cannot be cancelled.`);
    }
    migrationEngine.cancelJob(id);
    return this.repository.update(id, { status: "CANCELLED", completedAt: new Date().toISOString() })!;
  }

  listLogs(id: string) {
    this.getById(id);
    return this.repository.listLogs(id);
  }

  retry(id: string): MigrationJob {
    const job = this.getById(id);
    if (job.status !== "FAILED" && job.status !== "COMPLETED_WITH_ERRORS") {
      throw new ConflictError(`Migration "${id}" has no failed files to retry.`);
    }

    if (migrationEngine.isRealJob(id)) {
      // The engine re-discovers FAILED files itself and flips the job back
      // to RUNNING as it starts — nothing more to do here.
      migrationEngine.retryFailedFiles(id);
      return this.repository.findById(id)!;
    }

    for (const file of this.repository.listFiles(id)) {
      if (file.status === "FAILED") {
        this.repository.updateFile(id, file.id, { status: "PENDING", errorType: undefined, errorMessage: undefined });
      }
    }
    return this.repository.update(id, { status: "RUNNING", completedAt: undefined })!;
  }

  listFiles(id: string, status?: FileStatus): FileTransfer[] {
    this.getById(id);
    const files = this.repository.listFiles(id);
    return status ? files.filter((f) => f.status === status) : files;
  }

  listConflicts(id: string): FileTransfer[] {
    return this.listFiles(id, "CONFLICT");
  }

  resolveConflict(id: string, fileId: string, input: ResolveConflictInput): FileTransfer {
    this.getById(id);
    const file = this.repository.findFile(id, fileId);
    if (!file) throw new NotFoundError("File transfer", fileId);
    if (file.status !== "CONFLICT") {
      throw new ConflictError(`File "${fileId}" is not currently awaiting a duplicate resolution.`);
    }

    if (input.action === "SKIP") {
      const updated = this.repository.updateFile(id, fileId, { status: "SKIPPED", duplicateAction: "SKIP" })!;
      this.repository.addLog(id, "info", `Skipped "${file.filename}" (duplicate).`);
      migrationEngine.maybeFinalize(id);
      return updated;
    }

    const updated = this.repository.updateFile(id, fileId, {
      status: "PENDING",
      duplicateAction: input.action === "OVERWRITE" ? "OVERWRITE" : "RENAME",
      filename: input.action === "RENAME" && input.newName ? input.newName : file.filename,
    })!;
    this.repository.addLog(
      id,
      "info",
      input.action === "OVERWRITE"
        ? `Replacing existing "${file.filename}" at the destination.`
        : `Renaming "${file.filename}" to avoid the conflict.`
    );

    if (migrationEngine.isRealJob(id)) {
      migrationEngine.retryFile(id, fileId);
    }
    return updated;
  }
}
