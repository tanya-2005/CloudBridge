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
    console.log("[OAuth][Callback] Effect fired. delivered.current =", delivered.current);
    if (delivered.current) return;
    delivered.current = true;

    console.log("[OAuth][Callback] Callback page loaded.");
    console.log("[OAuth][Callback] Current URL:", window.location.href);
    console.log("[OAuth][Callback] window.location.origin:", window.location.origin);
    try {
      console.log("[OAuth][Callback] window.opener?.location?.origin:", window.opener?.location?.origin);
    } catch (err) {
      console.log("[OAuth][Callback] window.opener.location.origin threw (opener is cross-origin):", err);
    }

    const searchParams = new URLSearchParams(window.location.search);
    console.log("[OAuth][Callback] Current search params:", searchParams.toString());

    const result: OAuthResult = {
      type: "oauth-result",
      success: searchParams.get("success") === "true",
      role: (searchParams.get("role") as OAuthResult["role"]) ?? undefined,
      message: searchParams.get("message") ?? undefined,
      connectionId: searchParams.get("connectionId") ?? undefined,
      account: searchParams.get("account") ?? undefined,
    };
    console.log("[OAuth][Callback] OAuth result object:", result);

    // Two delivery channels, both best-effort:
    //
    // 1. localStorage — the opener polls this on a 250 ms interval, so
    //    even if the storage event never fires (which is unreliable after
    //    cross-origin navigation chains) the poll will pick it up.
    // 2. postMessage — fast direct delivery when window.opener survives
    //    the popup's trip through Google's consent domain.
    try {
      console.log("[OAuth][Callback] Writing localStorage, key:", OAUTH_RESULT_STORAGE_KEY, "value:", result);
      localStorage.setItem(OAUTH_RESULT_STORAGE_KEY, JSON.stringify(result));
      const readBack = localStorage.getItem(OAUTH_RESULT_STORAGE_KEY);
      console.log("[OAuth][Callback] Immediately read localStorage back:", readBack);
    } catch (err) {
      console.log("[OAuth][Callback] localStorage write failed:", err);
      // Storage unavailable — postMessage is still viable.
    }

    try {
      console.log("[OAuth][Callback] Sending postMessage to window.opener. opener present:", !!window.opener);
      window.opener?.postMessage(result, window.location.origin);
    } catch (err) {
      console.log("[OAuth][Callback] postMessage failed:", err);
      // Opener reference gone — localStorage poll will cover us.
    }

    // No cleanup returned! This is intentional: in React 19 Strict Mode
    // the first effect runs and sets the timer, then the simulated
    // unmount would call cleanup (cancelling the timer). By omitting
    // cleanup the first timer survives, and the useRef guard prevents
    // the second mount from duplicating the work.
    //
    // TEMPORARILY DISABLED FOR DEBUGGING — popup is left open intentionally
    // so its console/Application-storage can be inspected directly. Restore
    // both setTimeout calls below once the handoff issue is confirmed fixed.
    console.log("[OAuth][Callback] Auto-close is temporarily DISABLED for debugging — popup will stay open.");
    // setTimeout(() => {
    //   console.log("[OAuth][Callback] Closing window now (1000ms timer).");
    //   window.close();
    // }, 1000);

    // Safety fallback — force-close after 5s regardless.
    // setTimeout(() => {
    //   console.log("[OAuth][Callback] Closing window now (5000ms fallback timer).");
    //   window.close();
    // }, 5000);
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6 text-center text-sm text-muted-foreground">
      Finishing sign-in — you can close this window.
    </div>
  );
}
