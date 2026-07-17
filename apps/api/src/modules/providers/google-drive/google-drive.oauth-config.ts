import { env } from "../../../config/env.js";

export interface GoogleOAuthClientConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/**
 * Real user-facing OAuth, distinct from the service-account path in
 * google-drive.config.ts. Requires an OAuth client registered in Google
 * Cloud Console (Client ID + Secret) with GOOGLE_OAUTH_REDIRECT_URI added
 * to its list of authorized redirect URIs — that registration has to
 * happen in the user's own Google Cloud project; there's no way to
 * provision it from here.
 */
export function getGoogleOAuthConfig(): GoogleOAuthClientConfig | null {
  if (!env.GOOGLE_OAUTH_CLIENT_ID || !env.GOOGLE_OAUTH_CLIENT_SECRET) return null;

  return {
    clientId: env.GOOGLE_OAUTH_CLIENT_ID,
    clientSecret: env.GOOGLE_OAUTH_CLIENT_SECRET,
    redirectUri:
      env.GOOGLE_OAUTH_REDIRECT_URI ??
      `http://localhost:${env.PORT}/api/connections/oauth/google/callback`,
  };
}

export function isGoogleOAuthConfigured(): boolean {
  return getGoogleOAuthConfig() !== null;
}
