import { Router } from "express";
import { connectionsRouter } from "../modules/connections/connections.routes.js";
import { healthRouter } from "../modules/health/health.routes.js";
import { migrationsRouter } from "../modules/migrations/migrations.routes.js";
import { providersRouter } from "../modules/providers/providers.routes.js";

export const apiRouter = Router();

apiRouter.use("/health", healthRouter);
apiRouter.use("/providers", providersRouter);
apiRouter.use("/connections", connectionsRouter);
apiRouter.use("/migrations", migrationsRouter);
