/**
 * Production static server for the CloudBridge frontend (apps/web).
 *
 * Replaces what vercel.json used to do on Vercel (that file is kept in the
 * repo as a rollback path): serves the built SPA from dist/ and proxies
 * /api/* server-side to the backend, so the browser only ever talks to this
 * service's HTTPS origin — no mixed-content blocking even when the backend
 * is plain HTTP, and no CORS changes needed on the backend.
 *
 * Runtime env:
 *   PORT             — listen port (Railway injects it)
 *   BACKEND_API_URL  — backend origin to proxy /api/* to (defaults to the
 *                      backend deployed on Railway)
 */
import express from "express";
import http from "node:http";
import https from "node:https";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT) || 4173;
const BACKEND_API_URL = process.env.BACKEND_API_URL || "https://130-210-50-67.nip.io";
const DIST_DIR = path.join(__dirname, "dist");
const INDEX_FILE = path.join(DIST_DIR, "index.html");

const app = express();
app.disable("x-powered-by");

// ---------------------------------------------------------------------------
// /api/* — server-side proxy to the backend. Streams request and response
// bodies both ways (no buffering), so raw-body uploads
// (POST /connections/:id/upload) and streaming downloads
// (GET /connections/:id/files/:fileId/download) pass through untouched.
// ---------------------------------------------------------------------------
const backend = new URL(BACKEND_API_URL);
const transport = backend.protocol === "https:" ? https : http;

app.use("/api", (req, res) => {
  // The browser only ever talks to this service's own origin (VITE_API_URL=/api),
  // so from the backend's perspective the proxied request is server-to-server.
  // Forwarding the browser's Origin header makes the backend's CORS allowlist
  // reject it ("Origin ... is not allowed by CORS" -> 500 INTERNAL_ERROR), because
  // that allowlist still names the old frontend domains. A server-to-server
  // request has no meaningful Origin (curl/PM2 traffic carries none) — strip it,
  // exactly like the Vercel rewrite it replaces. OAuth is unaffected: /start and
  // /callback never read Origin (the callback hits the backend directly via its
  // registered redirect URI, not through this proxy).
  const headers = { ...req.headers, host: backend.host };
  delete headers.origin;

  const proxyReq = transport.request(
    {
      hostname: backend.hostname,
      port: backend.port || (backend.protocol === "https:" ? 443 : 80),
      path: req.originalUrl, // full "/api/..." path incl. query string
      method: req.method,
      headers,
    },
    (proxyRes) => {
      // Node manages transfer-encoding/connection itself; passing them
      // through can double-declare chunked responses.
      const passthroughHeaders = { ...proxyRes.headers };
      delete passthroughHeaders["transfer-encoding"];
      delete passthroughHeaders.connection;
      res.writeHead(proxyRes.statusCode ?? 502, passthroughHeaders);
      proxyRes.pipe(res);
    }
  );

  proxyReq.on("error", (err) => {
    console.error(`[server] API proxy error for ${req.method} ${req.originalUrl}: ${err.message}`);
    if (!res.headersSent) {
      res.status(502).json({
        success: false,
        error: { code: "BACKEND_UNREACHABLE", message: "The CloudBridge backend is unreachable." },
      });
    } else {
      res.end();
    }
  });

  req.pipe(proxyReq);
});

// ---------------------------------------------------------------------------
// Static assets. /assets/* filenames are content-hashed by Vite, so they can
// be cached aggressively; everything else (index.html) is served fresh.
// ---------------------------------------------------------------------------
app.use("/assets", express.static(path.join(DIST_DIR, "assets"), { maxAge: "1y", immutable: true }));
app.use(express.static(DIST_DIR, { index: false }));

// ---------------------------------------------------------------------------
// SPA fallback — client-side routing (BrowserRouter) means any non-asset,
// non-/api path must serve index.html so deep links work.
// ---------------------------------------------------------------------------
app.use((req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.status(404).end();
    return;
  }
  if (!existsSync(INDEX_FILE)) {
    res.status(503).send("Frontend not built — run `npm run build` first.");
    return;
  }
  res.sendFile(INDEX_FILE);
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`[server] CloudBridge frontend listening on http://0.0.0.0:${PORT}`);
  console.log(`[server] Proxying /api/* to ${BACKEND_API_URL}`);
});
