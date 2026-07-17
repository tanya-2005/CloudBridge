/**
 * Runs `worker` over `items` with at most `limit` in flight at once — a
 * fixed-size pool pulling from a shared cursor, rather than chunking into
 * batches, so a fast file doesn't sit around waiting for a slow one in the
 * same batch to finish.
 */
export async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<void>
): Promise<void> {
  let cursor = 0;

  async function runNext(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor++;
      await worker(items[index]!, index);
    }
  }

  const poolSize = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: poolSize }, runNext));
}
