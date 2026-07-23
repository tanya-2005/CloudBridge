import { env } from "../../../config/env.js";

export interface GoogleOAuthClientConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

const LOOPBACK_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

let missingVarsWarned = false;
let redirectUriWarned = false;

/**
 * Warns (once) about a redirect URI Google's OAuth server is very likely to
 * reject: HTTPS is required for anything other than localhost/127.0.0.1.
 * Deliberately non-fatal — a misconfigured redirect URI should disable
 * Google OAuth, not take down the whole API.
 */
function warnIfRedirectUriUnsafe(redirectUri: string): void {
  if (redirectUriWarned) return;

  let url: URL;
  try {
    url = new URL(redirectUri);
  } catch {
    redirectUriWarned = true;
    console.error(
      `Google OAuth: GOOGLE_OAUTH_REDIRECT_URI ("${redirectUri}") is not a valid URL — Google sign-in will fail.`
    );
    return;
  }

  if (url.protocol === "http:" && !LOOPBACK_HOST.test(url.host)) {
    redirectUriWarned = true;
    console.error(
      `Google OAuth: GOOGLE_OAUTH_REDIRECT_URI ("${redirectUri}") uses plain HTTP on a non-localhost host. ` +
        "Google's OAuth server requires HTTPS for any redirect URI other than localhost/127.0.0.1 — this will " +
        "very likely fail with redirect_uri_mismatch, or be rejected outright when registering it in Google " +
        "Cloud Console. Put a TLS-terminating reverse proxy (e.g. nginx + Let's Encrypt) in front of this API " +
        "and point GOOGLE_OAUTH_REDIRECT_URI at the https:// URL instead."
    );
  }
}

/**
 * Real user-facing OAuth, distinct from the service-account path in
 * google-drive.config.ts. Requires an OAuth client registered in Google
 * Cloud Console (Client ID + Secret) with GOOGLE_OAUTH_REDIRECT_URI added
 * to its list of authorized redirect URIs — that registration has to
 * happen in the user's own Google Cloud project; there's no way to
 * provision it from here.
 *
 * Returns null — never throws — whenever OAuth isn't fully and correctly
 * configured, so the rest of the app can treat "Google OAuth isn't
 * available" as a normal, expected state. Every reason it returns null
 * (short of nothing being configured at all) is logged with the exact
 * missing/invalid variable, so this never fails silently.
 */
export function getGoogleOAuthConfig(): GoogleOAuthClientConfig | null {
  const { GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_REDIRECT_URI } = env;

  const noneConfigured = !GOOGLE_OAUTH_CLIENT_ID && !GOOGLE_OAUTH_CLIENT_SECRET && !GOOGLE_OAUTH_REDIRECT_URI;
  if (noneConfigured) return null; // Google OAuth simply isn't in use — expected, not an error.

  const missing: string[] = [];
  if (!GOOGLE_OAUTH_CLIENT_ID) missing.push("GOOGLE_OAUTH_CLIENT_ID");
  if (!GOOGLE_OAUTH_CLIENT_SECRET) missing.push("GOOGLE_OAUTH_CLIENT_SECRET");
  if (!GOOGLE_OAUTH_REDIRECT_URI) missing.push("GOOGLE_OAUTH_REDIRECT_URI");

  if (missing.length > 0) {
    if (!missingVarsWarned) {
      missingVarsWarned = true;
      console.error(
        `Google OAuth is partially configured and will not work: missing ${missing.join(", ")}. ` +
          "Set all three (GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_REDIRECT_URI) " +
          "or none at all — a partial config is never usable, and GOOGLE_OAUTH_REDIRECT_URI no longer falls " +
          "back to a localhost default, since that default would silently break sign-in for every visitor " +
          "except the machine the server runs on."
      );
    }
    return null;
  }

  // `missing` being empty proves all three are defined, but that fact isn't
  // visible to the checker across the intermediate array — asserted here.
  warnIfRedirectUriUnsafe(GOOGLE_OAUTH_REDIRECT_URI!);

  return {
    clientId: GOOGLE_OAUTH_CLIENT_ID!,
    clientSecret: GOOGLE_OAUTH_CLIENT_SECRET!,
    redirectUri: GOOGLE_OAUTH_REDIRECT_URI!,
  };
}

export function isGoogleOAuthConfigured(): boolean {
  return getGoogleOAuthConfig() !== null;
}
