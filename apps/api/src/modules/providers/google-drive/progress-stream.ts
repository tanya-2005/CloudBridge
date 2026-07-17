import { pipeline } from "node:stream/promises";
import type { Readable } from "node:stream";
import { createProgressTransform } from "../../../common/streams/progress-transform.js";
import type { UploadProgress } from "../provider.interface.js";

/**
 * Wraps `source` so cumulative bytes are reported as they flow through —
 * measuring bytes handed to the HTTP layer, not bytes acknowledged by
 * Drive, which is close enough for progress UI given the upload request
 * applies normal stream backpressure. See progress-transform.ts for why
 * this goes through a real Transform/pipeline rather than a bare
 * `.on("data", ...)` listener.
 */
export function withProgress(
  source: Readable,
  totalBytes: number,
  onProgress?: (progress: UploadProgress) => void
): Readable {
  if (!onProgress) return source;

  const progress = createProgressTransform(totalBytes, ({ bytesTransferred }) =>
    onProgress({ bytesUploaded: bytesTransferred, totalBytes })
  );

  // Not awaited: googleapis consumes `progress` directly as the upload
  // body, so this just needs to keep `source -> progress` correctly wired
  // (backpressure + error propagation) in the background.
  pipeline(source, progress).catch(() => {
    // Errors surface to whatever is reading `progress` (the Drive upload
    // request) via its own destroy/error — nothing more to do here.
  });

  return progress;
}
