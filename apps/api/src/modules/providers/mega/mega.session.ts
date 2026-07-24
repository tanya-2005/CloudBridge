import type { EventEmitter } from "node:events";
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
  console.log(`[MEGA-Trace][getMegaSession] key=${key} cachedSessionExists=${sessions.has(key)}`);
  const cached = sessions.get(key);
  if (cached && cached.status === "ready") {
    console.log(`[MEGA-Trace][getMegaSession] using cached session, status=${cached.status}`);
    return cached;
  }

  console.log(
    `[MEGA-Trace][getMegaSession] creating new Storage instance. email=${credentials.email} ` +
      `passwordLength=${credentials.password.length}`
  );
  const storage = new Storage({ email: credentials.email, password: credentials.password });
  attachErrorGuard(storage, key);
  try {
    await storage.ready;
  } catch (err) {
    console.log("[MEGA-Trace][getMegaSession] storage.ready REJECTED (real megajs error):", err);
    throw err;
  }
  console.log(`[MEGA-Trace][getMegaSession] storage.ready resolved. status=${storage.status}`);
  sessions.set(key, storage);
  return storage;
}

/**
 * megajs' Storage — and its underlying `api` transport — are EventEmitters
 * that can emit "error" asynchronously (a mid-session network hiccup, DNS
 * failure, ...) completely outside of any promise this module awaits.
 * Node's default behavior for an unhandled "error" event is to throw and
 * crash the whole process, which took the entire API server down during a
 * real test even though the request that triggered it had nothing to do
 * with whatever else was in flight at the time. Every session needs this
 * regardless of what else is watching — in-flight requests still reject on
 * their own and get translated normally by runMegaCall/translateMegaError.
 */
function attachErrorGuard(storage: Storage, key: string): void {
  const onError = (err: unknown) => {
    console.error(`MEGA session error for ${key}:`, err);
    sessions.delete(key);
  };
  // megajs' own .d.ts has a narrower `on()` overload than its actual
  // runtime EventEmitter (Storage/API both genuinely extend it — see the
  // library's own internal `this.emit("error", ...)` calls), so this cast
  // is to the real runtime type, not a broad type-safety escape hatch.
  (storage as unknown as EventEmitter).on("error", onError);
  (storage.api as unknown as EventEmitter).on("error", onError);
}

export function dropMegaSession(email: string): void {
  const key = email.trim().toLowerCase();
  const session = sessions.get(key);
  sessions.delete(key);
  session?.close().catch(() => {
    // Best-effort cleanup — nothing to act on if closing an already-dead session fails.
  });
}
