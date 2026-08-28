// ── DNS bootstrap ─────────────────────────────────────────────────
// Force IPv4-first DNS resolution *before* the module tree that
// imports megajs is evaluated.  megajs' `file.download()` calls
// `globalThis.fetch()` (Node.js undici) which resolves DNS with
// its own pool; on hosts where AAAA records exist but IPv6
// connectivity is broken, undici's default IPv6-first ordering
// causes intermittent ETIMEDOUT on download fetches.  Setting this
// here — before the dynamic import of the app — ensures every
// subsequent DNS lookup in the process prefers A over AAAA.
import dns from "node:dns";
dns.setDefaultResultOrder("ipv4first");

// Dynamic import: the app module tree (→ megajs) is evaluated
// only *after* the dns call above has taken effect.  Static
// imports are hoisted in ESM so they would run first; dynamic
// imports are not.
const { createApp } = await import("./app.js");
const { env } = await import("./config/env.js");

const app = createApp();

const server = app.listen(env.PORT, "0.0.0.0", () => {
  console.log(
    `API listening on http://localhost:${env.PORT} (${env.NODE_ENV}) pid=${process.pid} ` +
      `NODE_APP_INSTANCE=${process.env.NODE_APP_INSTANCE ?? "unset"}`
  );
});

function shutdown(signal: string) {
  console.log(`${signal} received, shutting down.`);
  server.close(() => process.exit(0));
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
