import { randomUUID } from "node:crypto";
import { Router } from "express";
import { env } from "../../config/env.js";
import { buildConsentUrl, exchangeCodeForTokens } from "../providers/google-drive/google-drive.oauth.js";
import { isGoogleOAuthConfigured } from "../providers/google-drive/google-drive.oauth-config.js";
import { connectionsRepository } from "./connections.repository.js";
import { credentialsStore } from "./credentials.store.js";

const STATE_TTL_MS = 10 * 60_000;

interface PendingState {
  role: "source" | "destination";
  origin: string;
  createdAt: number;
}

/** Short-lived CSRF state, keyed by a random token — a real user completes the Google consent screen in well under 10 minutes. */
const pendingStates = new Map<string, PendingState>();

function fallbackOrigin(): string {
  return env.CORS_ORIGIN;
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
 * Builds the URL to send the popup to once we're done — a page on the
 * *frontend's own origin*, not this API. The popup started on the
 * frontend's origin, then left it (this API, then Google, then back here);
 * by the time it's navigated through Google's real domain, Chromium's
 * popup-isolation rules have already severed `window.opener` for that
 * cross-origin history, regardless of this API's own COOP header. Sending
 * it back to the frontend's origin for one more hop means the *final*
 * postMessage happens same-origin-to-same-origin, which reliably keeps
 * `window.opener` intact — the standard workaround real OAuth popup flows
 * use (Firebase Auth does the same thing).
 */
function resultRedirectUrl(targetOrigin: string, params: Record<string, string | undefined>): string {
  const url = new URL("/oauth/google/callback", targetOrigin);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, value);
  }
  return url.toString();
}

export const googleOAuthRouter = Router();

googleOAuthRouter.get("/google/start", (req, res) => {
  if (!isGoogleOAuthConfigured()) {
    res
      .status(503)
      .send(
        "Google OAuth is not configured on this server — set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET."
      );
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
  pendingStates.set(state, { role, origin, createdAt: Date.now() });

  res.redirect(buildConsentUrl(state));
});

googleOAuthRouter.get("/google/callback", async (req, res) => {
  const pending = popValidState(typeof req.query.state === "string" ? req.query.state : undefined);
  const targetOrigin = pending?.origin ?? fallbackOrigin();

  if (!pending) {
    res.redirect(
      resultRedirectUrl(targetOrigin, {
        success: "false",
        message: "This sign-in link expired or was already used — please try connecting again.",
      })
    );
    return;
  }

  if (req.query.error) {
    res.redirect(
      resultRedirectUrl(targetOrigin, {
        success: "false",
        role: pending.role,
        message: "Sign-in was cancelled.",
      })
    );
    return;
  }

  const code = typeof req.query.code === "string" ? req.query.code : undefined;
  if (!code) {
    res.redirect(
      resultRedirectUrl(targetOrigin, {
        success: "false",
        role: pending.role,
        message: "Google did not return an authorization code.",
      })
    );
    return;
  }

  try {
    const { credentials, account } = await exchangeCodeForTokens(code);
    const connection = connectionsRepository.create({
      provider: "GOOGLE_DRIVE",
      label: `Google Drive (${account})`,
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
    console.error("Google OAuth callback failed:", err);
    res.redirect(
      resultRedirectUrl(targetOrigin, {
        success: "false",
        role: pending.role,
        message: err instanceof Error ? err.message : "Google sign-in failed unexpectedly.",
      })
    );
  }
});
