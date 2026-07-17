import { destinationProviderRegistry } from "./destination-provider-registry.js";
import { GoogleDriveProvider } from "./google-drive/google-drive.provider.js";
import { isGoogleDriveConfigured } from "./google-drive/google-drive.config.js";
import { isGoogleOAuthConfigured } from "./google-drive/google-drive.oauth-config.js";
import { MegaProvider } from "./mega/mega.provider.js";
import { providerRegistry } from "./provider-registry.js";

/**
 * Side-effecting bootstrap: import this once at app startup so every
 * implemented provider adapter is registered before any request can reach
 * a route that depends on the registries. Adding a new provider later
 * (Dropbox, OneDrive, ...) means writing its adapter and adding one line
 * here — nothing else in the app needs to change.
 */
providerRegistry.register(new MegaProvider());

// Google Drive is "available" as soon as either auth path works: a shared
// service account, real per-connection OAuth, or both at once — the
// adapter itself picks whichever a given connection's credentials match.
if (isGoogleDriveConfigured() || isGoogleOAuthConfigured()) {
  destinationProviderRegistry.register(new GoogleDriveProvider());
} else {
  console.warn(
    "Google Drive not configured — set GOOGLE_SERVICE_ACCOUNT_KEY_FILE/GOOGLE_SERVICE_ACCOUNT_KEY " +
      "(service account) or GOOGLE_OAUTH_CLIENT_ID/GOOGLE_OAUTH_CLIENT_SECRET (OAuth) to enable it."
  );
}
