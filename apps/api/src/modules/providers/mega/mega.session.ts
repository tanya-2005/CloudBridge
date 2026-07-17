import { Storage } from "megajs";

export interface MegaCredentials {
  email: string;
  password: string;
}

/**
 * MEGA logins are slow (key derivation + a full tree fetch), so sessions are
 * cached per account for the lifetime of the process. This is the only
 * stateful piece of the adapter — everything else in this module is a pure
 * translation over an already-authenticated Storage instance.
 */
const sessions = new Map<string, Storage>();

export async function getMegaSession(credentials: MegaCredentials): Promise<Storage> {
  const key = credentials.email.trim().toLowerCase();
  const cached = sessions.get(key);
  if (cached && cached.status === "ready") return cached;

  const storage = new Storage({ email: credentials.email, password: credentials.password });
  await storage.ready;
  sessions.set(key, storage);
  return storage;
}

export function dropMegaSession(email: string): void {
  const key = email.trim().toLowerCase();
  const session = sessions.get(key);
  sessions.delete(key);
  session?.close().catch(() => {
    // Best-effort cleanup — nothing to act on if closing an already-dead session fails.
  });
}
