import { Router } from "express";
import { sendSuccess } from "../../common/http/respond.js";

export const healthRouter = Router();

healthRouter.get("/", (_req, res) => {
  sendSuccess(res, { status: "ok", uptimeSeconds: Math.round(process.uptime()) });
});
