/**
 * A single file transfer is really two phases (download, then upload), but
 * FileTransfer.transferredBytes is a single 0..sizeBytes value — the public
 * contract established in Phase 2 (and relied on by GET /migrations/:id/files
 * consumers) assumes one copy, not two. Rather than changing that contract,
 * each phase is allotted half of sizeBytes, so progress climbs smoothly
 * from 0% (download starts) to 50% (download done / upload starts) to 100%
 * (upload done) instead of resetting to 0 partway through.
 */
export function scaledProgress(
  phaseBytesDone: number,
  sizeBytes: number,
  phase: "download" | "upload"
): number {
  if (sizeBytes <= 0) return phase === "upload" ? sizeBytes : 0;

  const half = sizeBytes / 2;
  const phaseFraction = Math.min(1, phaseBytesDone / sizeBytes);
  const base = phase === "upload" ? half : 0;
  return Math.round(base + phaseFraction * half);
}
