import { useLayoutEffect, useRef } from "react";
import { OAUTH_RESULT_STORAGE_KEY, type OAuthResult } from "@/lib/oauth-result";

/**
 * Lands here at the end of ANY provider's OAuth popup flow — see
 * apps/api/.../oauth.routes.ts for why the backend redirects the popup
 * all the way back to this one generic frontend route (not a
 * per-provider one) instead of finishing the job itself. Reports the
 * result to the window that opened the popup, then closes itself; the
 * user never really "sees" this page. Which provider it was for is never
 * relevant here — everything needed is already in the query params.
 *
 * Uses useLayoutEffect (not useEffect) + a useRef guard to ensure the
 * result is delivered exactly once even under React 19 Strict Mode's
 * double-mount cycle. Critically, no cleanup function is returned so
 * that the window.setTimeout from the first mount survives the
 * simulated unmount/remount and reliably closes the popup.
 */
export function OAuthCallbackPage() {
  const delivered = useRef(false);

  useLayoutEffect(() => {
    if (delivered.current) return;
    delivered.current = true;

    const searchParams = new URLSearchParams(window.location.search);

    const result: OAuthResult = {
      type: "oauth-result",
      success: searchParams.get("success") === "true",
      role: (searchParams.get("role") as OAuthResult["role"]) ?? undefined,
      message: searchParams.get("message") ?? undefined,
      connectionId: searchParams.get("connectionId") ?? undefined,
      account: searchParams.get("account") ?? undefined,
    };

    // Two delivery channels, both best-effort:
    //
    // 1. localStorage — the opener polls this on a 250 ms interval, so
    //    even if the storage event never fires (which is unreliable after
    //    cross-origin navigation chains) the poll will pick it up.
    // 2. postMessage — fast direct delivery when window.opener survives
    //    the popup's trip through Google's consent domain.
    try {
      localStorage.setItem(OAUTH_RESULT_STORAGE_KEY, JSON.stringify(result));
    } catch {
      // Storage unavailable — postMessage is still viable.
    }

    try {
      window.opener?.postMessage(result, window.location.origin);
    } catch {
      // Opener reference gone — localStorage poll will cover us.
    }

    // No cleanup returned! This is intentional: in React 19 Strict Mode
    // the first effect runs and sets the timer, then the simulated
    // unmount would call cleanup (cancelling the timer). By omitting
    // cleanup the first timer survives, and the useRef guard prevents
    // the second mount from duplicating the work.
    setTimeout(() => window.close(), 1000);

    // Safety fallback — force-close after 5s regardless.
    setTimeout(() => window.close(), 5000);
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6 text-center text-sm text-muted-foreground">
      Finishing sign-in — you can close this window.
    </div>
  );
}
