import { destinationProviderRegistry } from "./destination-provider-registry.js";
import { GoogleDriveProvider } from "./google-drive/google-drive.provider.js";
import { isGoogleDriveConfigured } from "./google-drive/google-drive.config.js";
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

if (isGoogleDriveConfigured()) {
  destinationProviderRegistry.register(new GoogleDriveProvider());
} else {
  console.warn(
    "Google Drive not configured — set GOOGLE_SERVICE_ACCOUNT_KEY_FILE or GOOGLE_SERVICE_ACCOUNT_KEY to enable it."
  );
}
