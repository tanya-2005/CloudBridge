/**
 * Shape of the OAuth popup's result, and the two independent channels it's
 * delivered through: postMessage (fast, but relies on window.opener
 * surviving the popup's trip through a real third-party domain — Chromium
 * can sever that reference partway through, permanently, even before
 * landing back on our own origin) and a same-origin `storage` event
 * (slightly slower, but doesn't depend on window.opener at all — it's
 * delivered to every other same-origin window/tab regardless). The opener
 * listens for both and takes whichever arrives first.
 */
export interface OAuthResult {
  type: "google-oauth-result";
  success: boolean;
  role?: "source" | "destination";
  message?: string;
  connectionId?: string;
  account?: string;
}

export const OAUTH_RESULT_STORAGE_KEY = "cloudbridge-oauth-result";
