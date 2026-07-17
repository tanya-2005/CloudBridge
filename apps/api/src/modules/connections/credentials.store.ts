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

export const credentialsStore = {
  save(connectionId: string, credentials: unknown): void {
    store.set(connectionId, credentials);
  },
  get(connectionId: string): unknown | undefined {
    return store.get(connectionId);
  },
  delete(connectionId: string): void {
    store.delete(connectionId);
  },
};
