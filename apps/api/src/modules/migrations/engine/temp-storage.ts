import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * Implements the "Temporary Storage" stage of the migration workflow
 * (Download from MEGA → Temporary Storage → Upload to Google Drive →
 * Delete temporary file). Files live under the OS temp directory rather
 * than inside the repo, namespaced per job so a crashed job's leftovers
 * are easy to spot and don't collide with a concurrent one.
 */
const ROOT = path.join(tmpdir(), "cloudbridge-migrations");

export function jobTempDirPath(jobId: string): string {
  return path.join(ROOT, jobId);
}

export async function createJobTempDir(jobId: string): Promise<string> {
  const dir = jobTempDirPath(jobId);
  await mkdir(dir, { recursive: true });
  return dir;
}

export function tempFilePath(jobDir: string, fileId: string, filename: string): string {
  const safeName = filename.replace(/[/\\?%*:|"<>]/g, "_");
  return path.join(jobDir, `${fileId}-${safeName}`);
}

export async function removeTempFile(filePath: string): Promise<void> {
  await rm(filePath, { force: true });
}

export async function removeJobTempDir(jobDir: string): Promise<void> {
  await rm(jobDir, { recursive: true, force: true });
}
