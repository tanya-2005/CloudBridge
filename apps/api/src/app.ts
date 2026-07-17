import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./config/env.js";
import { errorHandler } from "./common/middleware/error-handler.js";
import { notFoundHandler } from "./common/middleware/not-found-handler.js";
import "./modules/providers/register-providers.js";
import { apiRouter } from "./routes/index.js";

// Vite happily picks a different port than 5173 if it's already taken
// (very easy to hit while iterating locally), which would otherwise mean
// every request from the frontend gets silently rejected by CORS while
// still looking fine to curl/Postman (which don't send an Origin header).
// In development, accept any localhost/127.0.0.1 origin regardless of
// port; CORS_ORIGIN stays the strict, single allowed origin in production.
const LOCALHOST_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

function isAllowedOrigin(origin: string): boolean {
  if (env.NODE_ENV === "development" && LOCALHOST_ORIGIN.test(origin)) return true;
  return origin === env.CORS_ORIGIN;
}

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin(origin, callback) {
        // No Origin header — same-origin request, curl, server-to-server, etc.
        if (!origin || isAllowedOrigin(origin)) {
          callback(null, true);
          return;
        }
        callback(new Error(`Origin "${origin}" is not allowed by CORS.`));
      },
    })
  );
  app.use(express.json());
  app.use(morgan(env.NODE_ENV === "development" ? "dev" : "combined"));

  app.use("/api", apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
