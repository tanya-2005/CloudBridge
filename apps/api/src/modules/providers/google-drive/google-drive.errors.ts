import { AppError, AuthError, PermanentFileError, TransientProviderError } from "../../../common/errors/app-error.js";

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

/**
 * Reasons Google's Drive API puts on a 403 (or occasionally 429) that mean
 * "back off and try again" rather than "the credentials are bad" — see
 * https://developers.google.com/drive/api/guides/handle-errors. Treating
 * every 403 as an auth failure (the previous behavior here) meant a normal
 * burst of API calls during a migration could trip Drive's per-user rate
 * limit and have the file fail immediately as "authentication failed"
 * instead of being retried.
 */
const RATE_LIMIT_REASONS = new Set([
  "rateLimitExceeded",
  "userRateLimitExceeded",
  "dailyLimitExceeded",
  "quotaExceeded",
  "backendError",
  "sharingRateLimitExceeded",
]);

/** Reasons/messages that genuinely mean "the stored credentials are no longer valid" — reconnecting is the only fix. */
const AUTH_REASONS = new Set(["authError", "invalid_grant", "invalid_client", "unauthorized_client"]);

/** 403 reasons that are about one specific file/permission, not the connection's credentials as a whole. */
const PERMISSION_REASONS = new Set([
  "insufficientPermissions",
  "insufficientFilePermissions",
  "appNotAuthorizedToFile",
  "forbidden",
]);

interface GoogleApiErrorDetail {
  reason?: string;
}

/** Pulls Drive's structured `error.errors[].reason` list out of a Gaxios-shaped error, if present. */
function extractGoogleErrorReasons(err: unknown): string[] {
  if (!err || typeof err !== "object") return [];
  const response = (err as { response?: { data?: { error?: { errors?: GoogleApiErrorDetail[] } } } }).response;
  const errors = response?.data?.error?.errors;
  if (!Array.isArray(errors)) return [];
  return errors.map((e) => e.reason).filter((r): r is string => typeof r === "string");
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

export function translateDriveError(err: unknown): AppError {
  if (err instanceof AppError) return err;

  const status = extractHttpStatus(err);
  const reasons = extractGoogleErrorReasons(err);
  const message = err instanceof Error ? err.message.toLowerCase() : "";

  const isRateLimited = status === 429 || reasons.some((r) => RATE_LIMIT_REASONS.has(r));
  if (isRateLimited) {
    console.warn(
      `Google Drive rate limit hit (HTTP ${status ?? "unknown"}${reasons.length ? `, reason: ${reasons.join(", ")}` : ""}) — retrying with backoff.`
    );
    return new TransientProviderError(
      `Google Drive rate limit exceeded${status ? ` (HTTP ${status})` : ""} — retrying automatically.`
    );
  }

  const isAuthFailure =
    status === 401 ||
    reasons.some((r) => AUTH_REASONS.has(r)) ||
    message.includes("invalid_grant") ||
    message.includes("invalid_client") ||
    message.includes("unauthorized");

  if (isAuthFailure) {
    const tokenRefreshFailed = message.includes("invalid_grant") || reasons.includes("invalid_grant");
    console.error(
      tokenRefreshFailed
        ? "Google Drive token refresh failed — the stored refresh token was rejected (likely revoked or expired). The connection needs to be reconnected."
        : `Google Drive authentication failed (HTTP ${status ?? "unknown"}${reasons.length ? `, reason: ${reasons.join(", ")}` : ""}).`
    );
    return new AuthError(
      "Google Drive authentication failed — reconnect the account; the stored credentials were rejected."
    );
  }

  const isPermissionDenied = status === 403 && reasons.some((r) => PERMISSION_REASONS.has(r));
  if (isPermissionDenied) {
    console.error(`Google Drive denied access to a specific file (reason: ${reasons.join(", ")}).`);
    return new PermanentFileError(
      "Google Drive denied access to this file — check that it's shared with the account being used, or skip it."
    );
  }

  console.error(
    `Google Drive request failed${status ? ` (HTTP ${status})` : ""}${reasons.length ? ` — reason: ${reasons.join(", ")}` : ""}.`
  );
  return new TransientProviderError(
    `Google Drive request failed${status ? ` (HTTP ${status})` : ""} — this is usually transient.`
  );
}
