import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { OAUTH_RESULT_STORAGE_KEY, type OAuthResult } from "@/lib/oauth-result";

/**
 * Lands here at the end of the Google OAuth popup flow — see
 * apps/api/.../google-oauth.routes.ts for why the backend redirects the
 * popup all the way back to this frontend route instead of finishing the
 * job itself. Reports the result to the window that opened the popup, then
 * closes itself; the user never really "sees" this page.
 */
export function OAuthCallbackPage() {
  const [params] = useSearchParams();

  useEffect(() => {
    const result: OAuthResult = {
      type: "google-oauth-result",
      success: params.get("success") === "true",
      role: (params.get("role") as OAuthResult["role"]) ?? undefined,
      message: params.get("message") ?? undefined,
      connectionId: params.get("connectionId") ?? undefined,
      account: params.get("account") ?? undefined,
    };

    try {
      window.opener?.postMessage(result, window.location.origin);
    } catch {
      // Opener reference gone — the storage fallback below still covers it.
    }

    try {
      localStorage.setItem(OAUTH_RESULT_STORAGE_KEY, JSON.stringify({ ...result, ts: Date.now() }));
    } catch {
      // Storage disabled/unavailable — nothing more we can do from here.
    }

    const timer = window.setTimeout(() => window.close(), 300);
    return () => window.clearTimeout(timer);
  }, [params]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6 text-center text-sm text-muted-foreground">
      Finishing sign-in — you can close this window.
    </div>
  );
}
