import type { ProviderType } from "../../types/enums.js";
import type { SourceProvider } from "./provider.interface.js";

/**
 * Maps a ProviderType to its live adapter. Providers with no adapter
 * registered (Google Drive, Dropbox, ...) simply aren't in the map yet —
 * callers treat that as "not implemented" rather than an error, so the rest
 * of the app keeps working against dummy data until each one is built.
 */
class ProviderRegistry {
  private readonly providers = new Map<ProviderType, SourceProvider>();

  register(provider: SourceProvider): void {
    this.providers.set(provider.type, provider);
  }

  get(type: ProviderType): SourceProvider | undefined {
    return this.providers.get(type);
  }

  has(type: ProviderType): boolean {
    return this.providers.has(type);
  }
}

export const providerRegistry = new ProviderRegistry();
