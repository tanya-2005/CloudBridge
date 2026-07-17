import { google, type drive_v3 } from "googleapis";
import { loadServiceAccountKey } from "./google-drive.config.js";

const SCOPES = ["https://www.googleapis.com/auth/drive"];

let cachedClient: drive_v3.Drive | null = null;

/**
 * Lazily builds a single authenticated Drive client for the process,
 * reused across every request. Throws if Drive isn't configured — callers
 * are expected to check `isGoogleDriveConfigured()` (via the provider
 * registry, in practice) before reaching here.
 */
export function getDriveClient(): drive_v3.Drive {
  if (cachedClient) return cachedClient;

  const key = loadServiceAccountKey();
  if (!key) {
    throw new Error(
      "Google Drive is not configured — set GOOGLE_SERVICE_ACCOUNT_KEY_FILE or GOOGLE_SERVICE_ACCOUNT_KEY."
    );
  }

  const auth = new google.auth.GoogleAuth({
    credentials: { client_email: key.client_email, private_key: key.private_key },
    scopes: SCOPES,
  });

  cachedClient = google.drive({ version: "v3", auth });
  return cachedClient;
}
