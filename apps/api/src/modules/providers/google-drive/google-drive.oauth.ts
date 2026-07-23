import { auth as googleAuth, drive as createDriveClient, type drive_v3 } from "@googleapis/drive";
import { AuthError } from "../../../common/errors/app-error.js";
import { getGoogleOAuthConfig } from "./google-drive.oauth-config.js";

const SCOPES = ["https://www.googleapis.com/auth/drive"];

export interface OAuthCredentials {
  kind: "oauth";
  accessToken: string;
  refreshToken: string;
  /** Epoch ms; absent means "unknown, refresh proactively on first use". */
  expiryDate?: number;
}

export function isOAuthCredentials(value: unknown): value is OAuthCredentials {
  return (
    !!value &&
    typeof value === "object" &&
    (value as { kind?: unknown }).kind === "oauth" &&
    typeof (value as { accessToken?: unknown }).accessToken === "string" &&
    typeof (value as { refreshToken?: unknown }).refreshToken === "string"
  );
}

function requireConfig() {
  const config = getGoogleOAuthConfig();
  if (!config) {
    throw new Error(
      "Google OAuth is not configured — set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET."
    );
  }
  return config;
}

/** A fresh, unauthenticated OAuth2 client for building consent URLs / exchanging codes. */
export function createOAuthClient() {
  const { clientId, clientSecret, redirectUri } = requireConfig();
  return new googleAuth.OAuth2({ clientId, clientSecret, redirectUri });
}

export function buildConsentUrl(state: string): string {
  const client = createOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline", // required to receive a refresh_token
    prompt: "consent", // force a refresh_token even on repeat authorizations
    scope: SCOPES,
    state,
  });
}

/** Exchanges an authorization code for tokens and resolves the signed-in account's email. */
export async function exchangeCodeForTokens(
  code: string
): Promise<{ credentials: OAuthCredentials; account: string }> {
  const client = createOAuthClient();

  let tokens;
  try {
    ({ tokens } = await client.getToken(code));
  } catch {
    throw new AuthError("Google rejected the authorization code — the sign-in attempt failed.");
  }

  if (!tokens.access_token || !tokens.refresh_token) {
    // Google omits refresh_token if the user already granted consent before
    // without `prompt=consent` forcing a fresh one — buildConsentUrl always
    // sets it, so this should only happen for a malformed/replayed request.
    throw new AuthError(
      "Google did not return a refresh token. Revoke CloudBridge's access at " +
        "https://myaccount.google.com/permissions and try connecting again."
    );
  }

  client.setCredentials(tokens);
  const drive = createDriveClient({ version: "v3", auth: client });
  const about = await drive.about.get({ fields: "user" });

  return {
    credentials: {
      kind: "oauth",
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiryDate: tokens.expiry_date ?? undefined,
    },
    account: about.data.user?.emailAddress ?? "unknown",
  };
}

const driveClientCache = new Map<string, drive_v3.Drive>();

/**
 * Builds (and caches) an authenticated Drive client from stored OAuth
 * credentials, keyed by refresh token — the one part of an OAuth grant
 * that stays stable for the grant's lifetime. Deliberately only ever hands
 * the refresh token to the client, never the (short-lived) access token:
 * `google-auth-library` transparently exchanges it for a fresh access
 * token on first use and re-refreshes as needed, so there's nothing here
 * that ever goes stale or needs to be written back to storage.
 */
export function getOAuthDriveClient(credentials: OAuthCredentials): drive_v3.Drive {
  const cached = driveClientCache.get(credentials.refreshToken);
  if (cached) return cached;

  const client = createOAuthClient();
  client.setCredentials({ refresh_token: credentials.refreshToken });

  const drive = createDriveClient({ version: "v3", auth: client });
  driveClientCache.set(credentials.refreshToken, drive);
  return drive;
}
