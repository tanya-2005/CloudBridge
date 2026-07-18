import type { ProviderType } from "../../types/enums.js";

export interface OAuthExchangeResult {
  /** Opaque, provider-shaped — stored via credentials.store.ts exactly like any other connection's credentials. */
  credentials: unknown;
  /** Human-readable identity (email, username, ...) shown in the UI once connected. */
  account: string;
}

/**
 * Capability surface for a provider that authenticates via an OAuth2
 * consent-screen popup instead of an inline credentials form (see
 * SourceProvider/DestinationProvider's `credentials: unknown` for the
 * other auth style). Registered in oauth-provider-registry.ts and driven
 * by the generic oauth.routes.ts — a provider implementing this needs no
 * route or popup-plumbing changes anywhere else, only its own adapter.
 */
export interface OAuthProviderAdapter {
  readonly type: ProviderType;

  /**
   * URL-safe identifier used in `/oauth/:slug/start` and
   * `/oauth/:slug/callback` — kept independent of `type` so it can stay
   * short and stable (e.g. "google" for GOOGLE_DRIVE) and matches exactly
   * what's registered as the redirect URI on the provider's own developer
   * console, which can't be changed without re-registering there.
   */
  readonly slug: string;

  /** Whether this adapter has everything it needs (client id/secret, ...) configured to actually run. */
  isConfigured(): boolean;

  /** Builds the URL to send the user to for consent, embedding `state` for the CSRF round-trip. */
  buildConsentUrl(state: string): string;

  /** Exchanges a real authorization code for stored credentials + the signed-in account's identity. */
  exchangeCode(code: string): Promise<OAuthExchangeResult>;
}
