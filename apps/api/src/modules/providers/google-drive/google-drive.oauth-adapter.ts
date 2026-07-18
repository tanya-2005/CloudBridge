import type { OAuthExchangeResult, OAuthProviderAdapter } from "../oauth-provider.interface.js";
import { buildConsentUrl, exchangeCodeForTokens } from "./google-drive.oauth.js";
import { isGoogleOAuthConfigured } from "./google-drive.oauth-config.js";

/** Wraps google-drive.oauth.ts's Google-specific flow behind the generic OAuthProviderAdapter contract. */
export class GoogleOAuthAdapter implements OAuthProviderAdapter {
  readonly type = "GOOGLE_DRIVE" as const;
  readonly slug = "google";

  isConfigured(): boolean {
    return isGoogleOAuthConfigured();
  }

  buildConsentUrl(state: string): string {
    return buildConsentUrl(state);
  }

  async exchangeCode(code: string): Promise<OAuthExchangeResult> {
    return exchangeCodeForTokens(code);
  }
}
