import { AppError, PermanentFileError, TransientProviderError } from "../../../common/errors/app-error.js";

/** Node system error codes that indicate a network hiccup rather than a permanent problem. */
const TRANSIENT_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "EPIPE",
  "EAI_AGAIN",
  "ENOTFOUND",
  "UND_ERR_SOCKET",
]);

/**
 * Translates an error surfaced by megajs (session login, tree loading, or a
 * mid-download stream failure) into the app's error taxonomy. megajs mostly
 * throws plain `Error`/system errors rather than a typed error hierarchy, so
 * this is duck-typed the same way google-drive.errors.ts is — no library
 * class to depend on here at all.
 */
export function translateMegaError(err: unknown): AppError {
  if (err instanceof AppError) return err;

  const code = err && typeof err === "object" ? (err as { code?: unknown }).code : undefined;
  const message = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();

  if (typeof code === "string" && TRANSIENT_CODES.has(code)) {
    return new TransientProviderError("MEGA connection dropped — this is usually transient.");
  }
  if (message.includes("enoent") || message.includes("not found") || message.includes("not_found")) {
    return new PermanentFileError("The requested MEGA file could not be found — it may have been moved or deleted.");
  }

  return new TransientProviderError("MEGA request failed — this is usually transient.");
}

export async function runMegaCall<T>(op: () => Promise<T>): Promise<T> {
  try {
    return await op();
  } catch (err) {
    throw translateMegaError(err);
  }
}
