import type { ProviderType } from "../../types/enums.js";
import type { DestinationProvider } from "./provider.interface.js";

/**
 * Mirrors provider-registry.ts (the SourceProvider map) but for write
 * capability. Kept as a separate registry rather than a union so a
 * provider that's source-only (MEGA) or destination-only (Google Drive)
 * never has to stub methods it doesn't implement — a provider that's both
 * one day would simply register itself in both maps.
 */
class DestinationProviderRegistry {
  private readonly providers = new Map<ProviderType, DestinationProvider>();

  register(provider: DestinationProvider): void {
    this.providers.set(provider.type, provider);
  }

  get(type: ProviderType): DestinationProvider | undefined {
    return this.providers.get(type);
  }

  has(type: ProviderType): boolean {
    return this.providers.has(type);
  }
}

export const destinationProviderRegistry = new DestinationProviderRegistry();
