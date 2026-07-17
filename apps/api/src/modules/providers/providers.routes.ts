import { Router } from "express";
import { listProviders } from "./providers.controller.js";

export const providersRouter = Router();

providersRouter.get("/", listProviders);
