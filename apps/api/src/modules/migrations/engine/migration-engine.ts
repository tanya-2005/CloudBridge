import { createReadStream, createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { AppError, TransientProviderError } from "../../../common/errors/app-error.js";
import { createProgressTransform } from "../../../common/streams/progress-transform.js";
import type { DuplicateStrategy, JobStatus } from "../../../types/enums.js";
import type { FileTransfer } from "../../../types/models.js";
import { connectionsRepository } from "../../connections/connections.repository.js";
import { credentialsStore } from "../../connections/credentials.store.js";
import { destinationProviderRegistry } from "../../providers/destination-provider-registry.js";
import { providerRegistry } from "../../providers/provider-registry.js";
import { translateMegaError } from "../../providers/mega/mega.errors.js";
import type { DestinationProvider, SourceProvider } from "../../providers/provider.interface.js";
import { migrationsRepository } from "../migrations.repository.js";
import { runWithConcurrency } from "./concurrency.js";
import { planMigrationTree } from "./planner.js";
import { scaledProgress } from "./progress.js";
import {
  createJobTempDir,
  jobTempDirPath,
  removeJobTempDir,
  removeTempFile,
  tempFilePath,
} from "./temp-storage.js";
import { withRetry } from "./retry.js";

const CONCURRENCY = 3;

interface JobProviders {
  sourceProvider: SourceProvider;
  sourceCredentials: unknown;
  destProvider: DestinationProvider;
}

/**
 * Resolves a job's source/destination connections down to their live
 * provider adapters, or null if either side isn't fully implemented yet
 * (e.g. a Dropbox connection with no registered adapter). This is the one
 * place that decides "is this a real, executable migration" — both the
 * engine and migrations.service consult it instead of duplicating the
 * registry lookups.
 */
export function resolveJobProviders(jobId: string): JobProviders | null {
  const job = migrationsRepository.findById(jobId);
  if (!job) return null;

  const source = connectionsRepository.findById(job.sourceId);
  const destination = connectionsRepository.findById(job.destinationId);
  if (!source || !destination) return null;

  const sourceProvider = providerRegistry.get(source.provider);
  const destProvider = destinationProviderRegistry.get(destination.provider);
  if (!sourceProvider || !destProvider) return null;

  return { sourceProvider, sourceCredentials: credentialsStore.get(source.id), destProvider };
}

class MigrationEngine {
  private readonly active = new Set<string>();
  private readonly cancelled = new Set<string>();

  isRealJob(jobId: string): boolean {
    return resolveJobProviders(jobId) !== null;
  }

  /** Marks a job so any in-flight or not-yet-started file transfers stop picking up new work. */
  cancelJob(jobId: string): void {
    this.cancelled.add(jobId);
  }

  /** Fire-and-forget: plans and runs the whole job. Called right after a migration is created. */
  runInBackground(jobId: string): void {
    this.guard(jobId, () => this.run(jobId));
  }

  /** Fire-and-forget: re-runs every currently-FAILED file. Called from POST /migrations/:id/retry. */
  retryFailedFiles(jobId: string): void {
    this.guard(jobId, async () => {
      const providers = resolveJobProviders(jobId);
      if (!providers) return;

      migrationsRepository.update(jobId, { status: "RUNNING", completedAt: undefined });
      const failed = migrationsRepository.listFiles(jobId).filter((f) => f.status === "FAILED");
      await this.processBatch(jobId, failed, providers);
      this.finalizeJob(jobId);
    });
  }

  /** Fire-and-forget: re-runs one resolved-conflict file. Called from the conflict-resolve endpoint. */
  retryFile(jobId: string, fileId: string): void {
    this.guard(`${jobId}:${fileId}`, async () => {
      const providers = resolveJobProviders(jobId);
      const file = migrationsRepository.findFile(jobId, fileId);
      if (!providers || !file) return;

      await this.processBatch(jobId, [file], providers);
      this.finalizeJob(jobId);
    });
  }

  /** Re-checks whether a job with no more in-flight work should be marked finished. */
  maybeFinalize(jobId: string): void {
    if (this.active.has(jobId)) return;
    this.finalizeJob(jobId);
  }

  private guard(key: string, task: () => Promise<void>): void {
    if (this.active.has(key)) return;
    this.active.add(key);
    task()
      .catch((err) => console.error(`Migration engine task "${key}" crashed:`, err))
      .finally(() => this.active.delete(key));
  }

  private async run(jobId: string): Promise<void> {
    const providers = resolveJobProviders(jobId);
    if (!providers) return; // Not a fully-implemented pipeline yet — leave the job as created (Phase 2 dummy behavior).

    const job = migrationsRepository.findById(jobId)!;
    migrationsRepository.update(jobId, { status: "PLANNING" });

    let planned;
    try {
      const rootFolderId =
        job.sourceRootPath === "/" || job.sourceRootPath === "" ? undefined : job.sourceRootPath;
      planned = await planMigrationTree(providers, rootFolderId, job.destRootFolderId);
    } catch (err) {
      console.error(`Migration ${jobId} planning failed:`, err);
      migrationsRepository.update(jobId, { status: "FAILED", completedAt: new Date().toISOString() });
      return;
    }

    const startedAt = new Date().toISOString();

    if (planned.length === 0) {
      migrationsRepository.update(jobId, {
        status: "COMPLETED",
        totalFiles: 0,
        totalBytes: 0,
        transferredBytes: 0,
        startedAt,
        completedAt: new Date().toISOString(),
      });
      return;
    }

    const files = planned.map((p) =>
      migrationsRepository.addFile(jobId, {
        sourcePath: p.sourcePath,
        sourceFileId: p.sourceFileId,
        filename: p.name,
        destParentId: p.destParentId,
        sizeBytes: p.sizeBytes,
      })
    );
    migrationsRepository.update(jobId, {
      status: "RUNNING",
      totalFiles: files.length,
      totalBytes: files.reduce((sum, f) => sum + f.sizeBytes, 0),
      transferredBytes: 0,
      startedAt,
    });

    await this.processBatch(jobId, files, providers);
    this.finalizeJob(jobId);
  }

  private async processBatch(
    jobId: string,
    files: FileTransfer[],
    providers: JobProviders
  ): Promise<void> {
    const job = migrationsRepository.findById(jobId);
    if (!job) return;
    // Deliberately not cleaned up here: processBatch can run concurrently
    // for the same job (e.g. the initial run plus a conflict resolution
    // that comes in before it's done), and every call shares this same
    // directory. Removing it per-call would delete files still being
    // downloaded/uploaded by a sibling batch. finalizeJob() sweeps it once
    // the job has no more in-flight work at all.
    const tempDir = await createJobTempDir(jobId);

    await runWithConcurrency(files, CONCURRENCY, (file) =>
      this.transferFile(jobId, file, tempDir, providers, job.duplicateStrategy)
    );
  }

  private async transferFile(
    jobId: string,
    file: FileTransfer,
    tempDir: string,
    providers: JobProviders,
    defaultStrategy: DuplicateStrategy
  ): Promise<void> {
    if (this.cancelled.has(jobId)) return;

    const { sourceProvider, sourceCredentials, destProvider } = providers;
    const strategy = file.duplicateAction ?? defaultStrategy;
    const tempPath = tempFilePath(tempDir, file.id, file.filename);

    migrationsRepository.updateFile(jobId, file.id, {
      status: "TRANSFERRING",
      errorType: undefined,
      errorMessage: undefined,
    });

    try {
      await withRetry(
        () => this.downloadToTemp(jobId, file, sourceProvider, sourceCredentials, tempPath),
        (attempt) => migrationsRepository.updateFile(jobId, file.id, { attempts: attempt })
      );

      const outcome = await withRetry(
        () => this.uploadFromTemp(jobId, file, destProvider, tempPath, strategy),
        (attempt) => migrationsRepository.updateFile(jobId, file.id, { attempts: attempt })
      );

      if (outcome.status === "skipped") {
        this.updateFileProgress(jobId, file.id, { status: "SKIPPED", duplicateAction: "SKIP" });
      } else if (outcome.status === "conflict") {
        this.updateFileProgress(jobId, file.id, { status: "CONFLICT" });
      } else {
        // outcome.file.name is the *actual* name Drive used, which can
        // differ from file.filename under RENAME — persist it so callers
        // (and the UI) see what really landed at the destination, not just
        // what was originally requested.
        this.updateFileProgress(jobId, file.id, {
          status: "DONE",
          transferredBytes: file.sizeBytes,
          filename: outcome.file.name,
        });
      }
    } catch (err) {
      const appError =
        err instanceof AppError ? err : new TransientProviderError("Unexpected transfer failure.");
      migrationsRepository.updateFile(jobId, file.id, {
        status: "FAILED",
        errorType: appError.code,
        errorMessage: appError.message,
      });
    } finally {
      await removeTempFile(tempPath);
    }
  }

  /** Stage 1: Download from MEGA → Temporary Storage. */
  private async downloadToTemp(
    jobId: string,
    file: FileTransfer,
    sourceProvider: SourceProvider,
    sourceCredentials: unknown,
    tempPath: string
  ): Promise<void> {
    const handle = await sourceProvider.getReadStream(sourceCredentials, file.sourceFileId);
    const totalBytes = handle.sizeBytes || file.sizeBytes;

    const progress = createProgressTransform(totalBytes, ({ bytesTransferred }) => {
      this.updateFileProgress(jobId, file.id, {
        transferredBytes: scaledProgress(bytesTransferred, totalBytes, "download"),
      });
    });

    try {
      await pipeline(handle.stream, progress, createWriteStream(tempPath));
    } catch (err) {
      throw translateMegaError(err);
    }
  }

  /** Stage 2: Upload to Google Drive (Stage 3, "Delete temporary file", happens in transferFile's `finally`). */
  private async uploadFromTemp(
    jobId: string,
    file: FileTransfer,
    destProvider: DestinationProvider,
    tempPath: string,
    duplicateStrategy: DuplicateStrategy
  ) {
    return destProvider.uploadFile({
      parentId: file.destParentId,
      filename: file.filename,
      sizeBytes: file.sizeBytes,
      stream: createReadStream(tempPath),
      duplicateStrategy,
      onProgress: ({ bytesUploaded }) => {
        this.updateFileProgress(jobId, file.id, {
          transferredBytes: scaledProgress(bytesUploaded, file.sizeBytes, "upload"),
        });
      },
    });
  }

  /** Updates one file and immediately re-aggregates the job's transferredBytes from all of its files. */
  private updateFileProgress(
    jobId: string,
    fileId: string,
    patch: Partial<Omit<FileTransfer, "id" | "migrationJobId" | "createdAt">>
  ): void {
    migrationsRepository.updateFile(jobId, fileId, patch);
    const total = migrationsRepository.listFiles(jobId).reduce((sum, f) => sum + f.transferredBytes, 0);
    migrationsRepository.update(jobId, { transferredBytes: total });
  }

  private finalizeJob(jobId: string): void {
    const job = migrationsRepository.findById(jobId);
    if (!job || job.status === "CANCELLED") return; // Cancellation wins — never resurrect a cancelled job's status.

    const files = migrationsRepository.listFiles(jobId);
    if (files.length === 0) return;

    const stillPending = files.some(
      (f) => f.status === "PENDING" || f.status === "TRANSFERRING" || f.status === "CONFLICT"
    );
    if (stillPending) return; // Conflicts awaiting user input keep the job RUNNING — see ARCHITECTURE.md §9.

    const anyDone = files.some((f) => f.status === "DONE");
    const anyFailed = files.some((f) => f.status === "FAILED");

    let status: JobStatus;
    if (anyFailed && anyDone) status = "COMPLETED_WITH_ERRORS";
    else if (anyFailed) status = "FAILED";
    else status = "COMPLETED";

    migrationsRepository.update(jobId, { status, completedAt: new Date().toISOString() });

    // Best-effort sweep of whatever's left in the job's temp dir (should
    // just be the empty directory itself — each file already removed its
    // own temp copy right after its own transfer finished).
    void removeJobTempDir(jobTempDirPath(jobId));
  }
}

export const migrationEngine = new MigrationEngine();
