import type { Request, Response } from "express";
import type { ErrorEnvelope } from "../http/respond.js";

export function notFoundHandler(req: Request, res: Response): void {
  const body: ErrorEnvelope = {
    success: false,
    error: { code: "NOT_FOUND", message: `No route matches ${req.method} ${req.originalUrl}.` },
  };
  res.status(404).json(body);
}
