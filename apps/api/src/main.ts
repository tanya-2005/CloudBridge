import { createApp } from "./app.js";
import { env } from "./config/env.js";

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
