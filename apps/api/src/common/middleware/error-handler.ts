import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError } from "../errors/app-error.js";
import type { ErrorEnvelope } from "../http/respond.js";

/**
 * Centralized error translation. Express 5 forwards rejected promises from
 * async route handlers here automatically, so controllers never need to
 * catch-and-forward manually.
 */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    const body: ErrorEnvelope = {
      success: false,
      error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) },
    };
    res.status(err.statusCode).json(body);
    return;
  }

  if (err instanceof ZodError) {
    const body: ErrorEnvelope = {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "The request payload is invalid.",
        details: err.flatten(),
      },
    };
    res.status(400).json(body);
    return;
  }

  // body-parser throws a plain SyntaxError (with .status/.type set) for
  // malformed JSON bodies — treat it as a client validation error, not a 500.
  if (err instanceof SyntaxError && (err as { type?: string }).type === "entity.parse.failed") {
    const body: ErrorEnvelope = {
      success: false,
      error: { code: "VALIDATION_ERROR", message: "The request body is not valid JSON." },
    };
    res.status(400).json(body);
    return;
  }

  console.error("Unhandled error:", err);
  const body: ErrorEnvelope = {
    success: false,
    error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred." },
  };
  res.status(500).json(body);
}
