import { setTimeout as sleep } from "node:timers/promises";
import { TransientProviderError } from "../../../common/errors/app-error.js";

const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 1000;

/**
 * Retry policy from ARCHITECTURE.md §11: only TransientProviderError is
 * retried (network blip, rate limit, transient 5xx) — AuthError,
 * PermanentFileError, and ValidationError all mean retrying is pointless,
 * so they fail immediately on the first attempt. Exponential backoff
 * (1s, 2s, 4s) between attempts, up to MAX_ATTEMPTS total tries.
 *
 * `onAttempt` fires before every attempt (not just failed ones) so a
 * caller tracking "how many attempts has this taken" gets the true count
 * even when a retry eventually succeeds — recording only on failure would
 * under-count the attempt that succeeded.
 */
export async function withRetry<T>(
  op: (attempt: number) => Promise<T>,
  onAttempt?: (attempt: number) => void
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    onAttempt?.(attempt);
    try {
      return await op(attempt);
    } catch (err) {
      lastError = err;

      const retryable = err instanceof TransientProviderError;
      if (!retryable || attempt === MAX_ATTEMPTS) throw err;

      await sleep(BASE_DELAY_MS * 2 ** (attempt - 1));
    }
  }

  throw lastError;
}
