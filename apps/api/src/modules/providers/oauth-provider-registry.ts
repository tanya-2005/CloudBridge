import type { OAuthProviderAdapter } from "./oauth-provider.interface.js";

/**
 * Maps a URL slug (e.g. "google") to its live OAuth adapter — mirrors
 * provider-registry.ts / destination-provider-registry.ts but keyed by
 * slug rather than ProviderType, since that's what the generic
 * /oauth/:provider/start and /oauth/:provider/callback routes have in
 * hand. A provider with no adapter registered here just isn't an OAuth
 * option yet; the routes treat that as "not implemented" (404-ish), same
 * convention as the other two registries.
 */
class OAuthProviderRegistry {
  private readonly bySlug = new Map<string, OAuthProviderAdapter>();

  register(adapter: OAuthProviderAdapter): void {
    this.bySlug.set(adapter.slug, adapter);
  }

  get(slug: string): OAuthProviderAdapter | undefined {
    return this.bySlug.get(slug);
  }
}

export const oauthProviderRegistry = new OAuthProviderRegistry();
