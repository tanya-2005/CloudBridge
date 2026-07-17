import { readFileSync } from "node:fs";
import { env } from "../../../config/env.js";

export interface GoogleServiceAccountKey {
  client_email: string;
  private_key: string;
  [key: string]: unknown;
}

let cachedKey: GoogleServiceAccountKey | null | undefined;

/**
 * Loads the service account key from either GOOGLE_SERVICE_ACCOUNT_KEY_FILE
 * (a path) or GOOGLE_SERVICE_ACCOUNT_KEY (inline JSON). Returns null — never
 * throws — when neither is set or the configured one is invalid, so the
 * rest of the app can treat "Google Drive isn't configured" as a normal,
 * expected state rather than a startup failure.
 */
export function loadServiceAccountKey(): GoogleServiceAccountKey | null {
  if (cachedKey !== undefined) return cachedKey;

  try {
    if (env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE) {
      const raw = readFileSync(env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE, "utf-8");
      cachedKey = JSON.parse(raw) as GoogleServiceAccountKey;
    } else if (env.GOOGLE_SERVICE_ACCOUNT_KEY) {
      cachedKey = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_KEY) as GoogleServiceAccountKey;
    } else {
      cachedKey = null;
    }
  } catch (err) {
    console.error(
      "Failed to load the Google service account key — Google Drive will be unavailable:",
      err instanceof Error ? err.message : err
    );
    cachedKey = null;
  }

  return cachedKey;
}

export function isGoogleDriveConfigured(): boolean {
  return loadServiceAccountKey() !== null;
}

export function getDriveRootFolderId(): string {
  return env.GOOGLE_DRIVE_ROOT_FOLDER_ID?.trim() || "root";
}
