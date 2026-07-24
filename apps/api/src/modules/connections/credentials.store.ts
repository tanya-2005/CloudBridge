/**
 * Opaque per-connection credential storage. The shape of the stored value
 * is entirely up to whichever provider adapter reads it back (MEGA wants
 * { email, password }, a future Google Drive adapter would want a service
 * account key, ...) — this module never inspects the contents, mirroring
 * the encrypted `Bytes` blob column in ARCHITECTURE.md §6.
 *
 * In-memory only: credentials do not survive a server restart. That's
 * consistent with the rest of the dummy repositories in this phase and
 * avoids inventing an encryption-at-rest story before there's a real
 * database to store it in.
 */
const store = new Map<string, unknown>();

/** Never logs a real password value, only its presence/length, so trace logs are safe to paste anywhere. */
function maskForTrace(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const clone: Record<string, unknown> = { ...(value as Record<string, unknown>) };
  if (typeof clone.password === "string") clone.password = `[REDACTED length=${clone.password.length}]`;
  return clone;
}

export const credentialsStore = {
  save(connectionId: string, credentials: unknown): void {
    console.log(
      `[MEGA-Trace][credentialsStore.save] connectionId=${connectionId} value=`,
      maskForTrace(credentials),
      `store.size(before)=${store.size}`
    );
    store.set(connectionId, credentials);
    console.log(
      `[MEGA-Trace][credentialsStore.save] store.size(after)=${store.size} keys=[${[...store.keys()].join(", ")}]`
    );
  },
  get(connectionId: string): unknown | undefined {
    const value = store.get(connectionId);
    console.log(
      `[MEGA-Trace][credentialsStore.get] connectionId=${connectionId} found=${value !== undefined} ` +
        `store.size=${store.size} keys=[${[...store.keys()].join(", ")}]`
    );
    return value;
  },
  delete(connectionId: string): void {
    store.delete(connectionId);
  },
};
