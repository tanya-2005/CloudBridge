import { destinationProviderRegistry } from "./destination-provider-registry.js";
import { GoogleDriveProvider } from "./google-drive/google-drive.provider.js";
import { isGoogleDriveConfigured } from "./google-drive/google-drive.config.js";
import { GoogleOAuthAdapter } from "./google-drive/google-drive.oauth-adapter.js";
import { isGoogleOAuthConfigured } from "./google-drive/google-drive.oauth-config.js";
import { MegaProvider } from "./mega/mega.provider.js";
import { oauthProviderRegistry } from "./oauth-provider-registry.js";
import { providerRegistry } from "./provider-registry.js";

/**
 * Side-effecting bootstrap: import this once at app startup so every
 * implemented provider adapter is registered before any request can reach
 * a route that depends on the registries. Adding a new provider later
 * (Dropbox, OneDrive, ...) means writing its adapter and adding a few
 * lines here — nothing else in the app needs to change.
 */
providerRegistry.register(new MegaProvider());

// Google Drive implements both SourceProvider and DestinationProvider —
// the same instance is registered in both registries, so it's selectable
// as either a source or a destination. "Available" as soon as either auth
// path works: a shared service account, real per-connection OAuth, or
// both at once — the adapter itself picks whichever a given connection's
// credentials match.
const driveServiceAccountReady = isGoogleDriveConfigured();
const driveOAuthReady = isGoogleOAuthConfigured();

if (driveServiceAccountReady || driveOAuthReady) {
  const googleDrive = new GoogleDriveProvider();
  providerRegistry.register(googleDrive);
  destinationProviderRegistry.register(googleDrive);
  console.log(
    `Google Drive enabled (service account: ${driveServiceAccountReady ? "yes" : "no"}, ` +
      `OAuth: ${driveOAuthReady ? "yes" : "no"}).`
  );
} else {
  console.error(
    "Google Drive is not available — neither auth path is configured:\n" +
      "  - Service account: set GOOGLE_SERVICE_ACCOUNT_KEY_FILE or GOOGLE_SERVICE_ACCOUNT_KEY.\n" +
      "  - OAuth: set GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, and GOOGLE_OAUTH_REDIRECT_URI " +
      "(see above for details if one of these is partially set)."
  );
}

// Registered unconditionally — the generic /oauth/:provider/start route
// checks `adapter.isConfigured()` itself and returns a clear 503 rather
// than a 404 when the slug is known but not yet configured.
oauthProviderRegistry.register(new GoogleOAuthAdapter());
