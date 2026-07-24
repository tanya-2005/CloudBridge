import { randomUUID } from "node:crypto";
import { Router } from "express";
import { sendSuccess } from "../../common/http/respond.js";
import { oauthProviderRegistry } from "../providers/oauth-provider-registry.js";
import { PROVIDERS } from "../providers/providers.data.js";
import { connectionsRepository } from "./connections.repository.js";
import { credentialsStore } from "./credentials.store.js";

const STATE_TTL_MS = 10 * 60_000;

interface PendingState {
  role: "source" | "destination";
  slug: string;
  createdAt: number;
}

interface OAuthOutcome {
  success: boolean;
  role: "source" | "destination";
  connectionId?: string;
  account?: string;
  message?: string;
  createdAt: number;
}

/** Short-lived CSRF state, keyed by a random token — a real user completes a consent screen in well under 10 minutes. */
const pendingStates = new Map<string, PendingState>();

/**
 * Completed (or failed) results, keyed by the same state token, polled by
 * the dashboard over plain HTTP instead of relying on the popup and its
 * opener sharing a browser-level channel (window.opener, localStorage,
 * BroadcastChannel — all of which require the two windows to end up
 * same-origin, which a redirect chain through Google's own consent domain
 * and back doesn't reliably guarantee). Single-use: removed as soon as the
 * dashboard successfully reads it.
 */
const completedResults = new Map<string, OAuthOutcome>();

function isExpired(createdAt: number): boolean {
  return Date.now() - createdAt > STATE_TTL_MS;
}

/** Opportunistic sweep of anything nobody ever came back to collect — called on every /start so these two maps don't grow unbounded across abandoned flows. */
function pruneExpired(): void {
  for (const [key, value] of pendingStates) {
    if (isExpired(value.createdAt)) pendingStates.delete(key);
  }
  for (const [key, value] of completedResults) {
    if (isExpired(value.createdAt)) completedResults.delete(key);
  }
}

function popValidState(state: string | undefined): PendingState | null {
  if (!state) return null;
  const pending = pendingStates.get(state);
  pendingStates.delete(state); // single-use regardless of outcome
  if (!pending) return null;
  if (isExpired(pending.createdAt)) return null;
  return pending;
}

/**
 * A tiny, fully self-contained HTML response — deliberately NOT a redirect
 * back to the frontend SPA. The popup's only remaining job is cosmetic
 * (tell the user it's done, then close itself); the actual result is
 * already stored server-side by the time this renders, and the dashboard
 * gets it via /result/:state. This removes the popup's completion signal
 * from depending on window.opener, localStorage, or even the frontend's
 * routing/rewrite config being correct for a given deployment.
 */
function renderClosePage(success: boolean): string {
  const message = success ? "Signed in — you can close this window." : "Sign-in failed — you can close this window.";
  return `<!doctype html>
<html>
<head><meta charset="utf-8"><title>CloudBridge</title></head>
<body style="font-family: system-ui, sans-serif; display: flex; min-height: 100vh; align-items: center; justify-content: center; text-align: center; padding: 24px;">
  <p>${message}</p>
  <script>setTimeout(function () { window.close(); }, 1200);</script>
</body>
</html>`;
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

  pruneExpired();

  const role = req.query.role === "source" ? "source" : "destination";
  // The dashboard generates this (crypto.randomUUID()) before opening the
  // popup so it has something to poll /result/:state with — falls back to
  // a server-generated one only so this endpoint still works if hit
  // directly (e.g. manual testing) without that query param.
  const state = typeof req.query.state === "string" && req.query.state.length > 0 ? req.query.state : randomUUID();
  pendingStates.set(state, { role, slug, createdAt: Date.now() });

  res.redirect(adapter.buildConsentUrl(state));
});

oauthRouter.get("/:provider/callback", async (req, res) => {
  const slug = req.params.provider as string;
  const state = typeof req.query.state === "string" ? req.query.state : undefined;
  const pending = popValidState(state);

  if (!pending) {
    console.warn(`OAuth callback for "${slug}" had no matching pending state — expired, reused, or forged.`);
    res.send(renderClosePage(false));
    return;
  }

  const recordOutcome = (outcome: Omit<OAuthOutcome, "createdAt">) => {
    if (state) completedResults.set(state, { ...outcome, createdAt: Date.now() });
  };

  const adapter = oauthProviderRegistry.get(slug);
  if (!adapter) {
    console.error(`OAuth callback for unknown provider "${slug}".`);
    recordOutcome({
      success: false,
      role: pending.role,
      message: `No OAuth provider is registered for "${slug}".`,
    });
    res.send(renderClosePage(false));
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
    recordOutcome({ success: false, role: pending.role, message: errorDescription });
    res.send(renderClosePage(false));
    return;
  }

  const code = typeof req.query.code === "string" ? req.query.code : undefined;
  if (!code) {
    console.error(`OAuth callback for "${slug}" had no authorization code and no error — unexpected redirect shape.`);
    recordOutcome({
      success: false,
      role: pending.role,
      message: "The provider did not return an authorization code.",
    });
    res.send(renderClosePage(false));
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

    recordOutcome({
      success: true,
      role: pending.role,
      connectionId: connection.id,
      account,
    });
    res.send(renderClosePage(true));
  } catch (err) {
    console.error(`OAuth callback for "${slug}" failed:`, err);
    recordOutcome({
      success: false,
      role: pending.role,
      message: err instanceof Error ? err.message : "Sign-in failed unexpectedly.",
    });
    res.send(renderClosePage(false));
  }
});

/**
 * Polled by the dashboard every ~1s while a popup is open. Single-use: the
 * first successful read removes the entry, same lifecycle as pendingStates.
 * Returns `{ pending: true }` for both "not finished yet" and "never
 * existed" — the dashboard can't tell those apart and doesn't need to; it
 * just keeps polling until it gets a definitive answer or gives up after
 * the popup closes.
 */
oauthRouter.get("/result/:state", (req, res) => {
  const { state } = req.params;
  const outcome = completedResults.get(state);

  if (!outcome || isExpired(outcome.createdAt)) {
    completedResults.delete(state);
    sendSuccess(res, { pending: true });
    return;
  }

  completedResults.delete(state);
  sendSuccess(res, {
    pending: false,
    success: outcome.success,
    role: outcome.role,
    connectionId: outcome.connectionId,
    account: outcome.account,
    message: outcome.message,
  });
});
