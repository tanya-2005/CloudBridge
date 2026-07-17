import { Transform } from "node:stream";

export interface StreamProgress {
  bytesTransferred: number;
  totalBytes: number;
}

/**
 * A pipeline-safe progress reporter.
 *
 * The tempting alternative — `source.on("data", cb)` then separately
 * `.pipe()`/`pipeline()`-ing the same source — is broken: attaching a
 * "data" listener switches a Readable into flowing mode immediately, which
 * races whatever actually consumes it for control of the stream. In
 * testing this surfaced as an uncaught "error" event crashing the process,
 * because the side-channel listener put the stream in flowing mode before
 * `pipeline()` had attached its own error handling.
 *
 * A Transform has none of that problem: it only pulls data when something
 * downstream reads it, and composes correctly with `stream.pipeline()`
 * (or a library's own internal consumption, e.g. gaxios reading a request
 * body) for both backpressure and error propagation.
 */
export function createProgressTransform(
  totalBytes: number,
  onProgress?: (progress: StreamProgress) => void
): Transform {
  let bytesTransferred = 0;
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      bytesTransferred += chunk.length;
      onProgress?.({ bytesTransferred, totalBytes });
      callback(null, chunk);
    },
  });
}
