import { AppError, AuthError, TransientProviderError } from "../../../common/errors/app-error.js";

/**
 * Every Drive API call (including token exchange, which fails the same way
 * bad Drive credentials do) goes through this. Without it, a raw error
 * from googleapis reaches the global error handler and comes out as an
 * opaque 500 — this maps it to the error taxonomy from ARCHITECTURE.md §11
 * so callers get a 401 for bad credentials and a 502 for everything else
 * provider-side, instead of losing that distinction.
 *
 * Deliberately duck-typed rather than `instanceof GaxiosError`: googleapis'
 * own dependency tree can end up with a different copy of `gaxios` than
 * whatever version this app depends on directly (npm doesn't always dedupe
 * across version ranges), which makes `instanceof` silently fail even
 * though the error is exactly the shape we expect.
 */
export async function runDriveCall<T>(op: () => Promise<T>): Promise<T> {
  try {
    return await op();
  } catch (err) {
    throw translateDriveError(err);
  }
}

function translateDriveError(err: unknown): AppError {
  if (err instanceof AppError) return err;

  const status = extractHttpStatus(err);
  const message = err instanceof Error ? err.message.toLowerCase() : "";

  if (
    status === 401 ||
    status === 403 ||
    message.includes("invalid_grant") ||
    message.includes("invalid_client") ||
    message.includes("unauthorized")
  ) {
    return new AuthError(
      "Google Drive authentication failed — check the configured service account credentials."
    );
  }

  return new TransientProviderError(
    `Google Drive request failed${status ? ` (HTTP ${status})` : ""} — this is usually transient.`
  );
}

/** Reads an HTTP status off common shapes (GaxiosError, fetch Response, etc.) without an instanceof check. */
function extractHttpStatus(err: unknown): number | undefined {
  if (!err || typeof err !== "object") return undefined;
  const candidate = err as { status?: unknown; code?: unknown; response?: { status?: unknown } };

  if (typeof candidate.status === "number") return candidate.status;
  if (typeof candidate.code === "number") return candidate.code;
  if (candidate.response && typeof candidate.response === "object") {
    const responseStatus = (candidate.response as { status?: unknown }).status;
    if (typeof responseStatus === "number") return responseStatus;
  }
  return undefined;
}
