import { randomUUID } from "node:crypto";
import { Router } from "express";
import { env } from "../../config/env.js";
import { oauthProviderRegistry } from "../providers/oauth-provider-registry.js";
import { PROVIDERS } from "../providers/providers.data.js";
import { connectionsRepository } from "./connections.repository.js";
import { credentialsStore } from "./credentials.store.js";

const STATE_TTL_MS = 10 * 60_000;

interface PendingState {
  role: "source" | "destination";
  origin: string;
  slug: string;
  createdAt: number;
}

/** Short-lived CSRF state, keyed by a random token — a real user completes a consent screen in well under 10 minutes. */
const pendingStates = new Map<string, PendingState>();

function fallbackOrigin(): string {
  // First entry in the allowlist stands in for "the frontend" when no
  // Referer header is available to pick the actual calling origin from.
  return env.CORS_ORIGIN[0] ?? "http://localhost:5173";
}

function popValidState(state: string | undefined): PendingState | null {
  if (!state) return null;
  const pending = pendingStates.get(state);
  pendingStates.delete(state); // single-use regardless of outcome
  if (!pending) return null;
  if (Date.now() - pending.createdAt > STATE_TTL_MS) return null;
  return pending;
}

/**
 * Builds the URL to send the popup to once we're done — a single generic
 * page on the *frontend's own origin*, not this API, and not specific to
 * any one provider (the result is entirely carried in query params). The
 * popup started on the frontend's origin, then left it (this API, then
 * the provider's real consent domain, then back here); by the time it's
 * navigated through that external domain, Chromium's popup-isolation
 * rules have already severed `window.opener` for that cross-origin
 * history, regardless of this API's own COOP header. Sending it back to
 * the frontend's origin for one more hop means the *final* postMessage
 * happens same-origin-to-same-origin, which reliably keeps `window.opener`
 * intact — the standard workaround real OAuth popup flows use (Firebase
 * Auth does the same thing).
 */
function resultRedirectUrl(targetOrigin: string, params: Record<string, string | undefined>): string {
  const url = new URL("/oauth/callback", targetOrigin);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, value);
  }
  return url.toString();
}

export const oauthRouter = Router();

oauthRouter.get("/:provider/start", (req, res) => {
  const slug = req.params.provider as string;
  const adapter = oauthProviderRegistry.get(slug);

  if (!adapter) {
    console.warn(`OAuth start requested for unknown provider "${slug}".`);
    res.status(404).send(`No OAuth provider is registered for "${slug}".`);
    return;
  }
  if (!adapter.isConfigured()) {
    console.error(`OAuth start requested for "${slug}" but it isn't configured — see startup logs for details.`);
    res.status(503).send(`OAuth for "${slug}" is not configured on this server.`);
    return;
  }

  const role = req.query.role === "source" ? "source" : "destination";
  const referer = req.get("referer");
  let origin = fallbackOrigin();
  if (referer) {
    try {
      origin = new URL(referer).origin;
    } catch {
      // Keep the fallback if the Referer header is malformed.
    }
  }

  const state = randomUUID();
  pendingStates.set(state, { role, origin, slug, createdAt: Date.now() });

  res.redirect(adapter.buildConsentUrl(state));
});

oauthRouter.get("/:provider/callback", async (req, res) => {
  const slug = req.params.provider as string;
  const pending = popValidState(typeof req.query.state === "string" ? req.query.state : undefined);
  const targetOrigin = pending?.origin ?? fallbackOrigin();

  if (!pending) {
    console.warn(`OAuth callback for "${slug}" had no matching pending state — expired, reused, or forged.`);
    res.redirect(
      resultRedirectUrl(targetOrigin, {
        success: "false",
        message: "This sign-in link expired or was already used — please try connecting again.",
      })
    );
    return;
  }

  const adapter = oauthProviderRegistry.get(slug);
  if (!adapter) {
    console.error(`OAuth callback for unknown provider "${slug}".`);
    res.redirect(
      resultRedirectUrl(targetOrigin, {
        success: "false",
        role: pending.role,
        message: `No OAuth provider is registered for "${slug}".`,
      })
    );
    return;
  }

  if (req.query.error) {
    // Google surfaces errors like access_denied or redirect_uri_mismatch
    // via a query parameter — surface the actual error description to the
    // user so they can fix it (usually a misconfiguration in their Google
    // Cloud Console OAuth client settings).
    const errorDescription =
      typeof req.query.error_description === "string"
        ? req.query.error_description
        : `Google returned: ${String(req.query.error)}`;
    console.error(
      `Google OAuth callback rejected for "${slug}": ${req.query.error} — ${errorDescription}. ` +
        (req.query.error === "redirect_uri_mismatch"
          ? "This means GOOGLE_OAUTH_REDIRECT_URI doesn't exactly match an Authorized redirect URI on the OAuth client in Google Cloud Console."
          : "Check the OAuth client configuration in Google Cloud Console.")
    );
    res.redirect(
      resultRedirectUrl(targetOrigin, {
        success: "false",
        role: pending.role,
        message: errorDescription,
      })
    );
    return;
  }

  const code = typeof req.query.code === "string" ? req.query.code : undefined;
  if (!code) {
    console.error(`OAuth callback for "${slug}" had no authorization code and no error — unexpected redirect shape.`);
    res.redirect(
      resultRedirectUrl(targetOrigin, {
        success: "false",
        role: pending.role,
        message: "The provider did not return an authorization code.",
      })
    );
    return;
  }

  try {
    const { credentials, account } = await adapter.exchangeCode(code);
    const providerName = PROVIDERS.find((p) => p.id === adapter.type)?.name ?? adapter.type;
    const connection = connectionsRepository.create({
      provider: adapter.type,
      label: `${providerName} (${account})`,
      status: "VALID",
      account,
    });
    credentialsStore.save(connection.id, credentials);

    res.redirect(
      resultRedirectUrl(targetOrigin, {
        success: "true",
        role: pending.role,
        connectionId: connection.id,
        account,
      })
    );
  } catch (err) {
    console.error(`OAuth callback for "${slug}" failed:`, err);
    res.redirect(
      resultRedirectUrl(targetOrigin, {
        success: "false",
        role: pending.role,
        message: err instanceof Error ? err.message : "Sign-in failed unexpectedly.",
      })
    );
  }
});
