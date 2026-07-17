import { Router } from "express";
import { validateRequest } from "../../common/middleware/validate-request.js";
import { MigrationsController } from "./migrations.controller.js";
import { migrationsRepository } from "./migrations.repository.js";
import {
  createMigrationSchema,
  listFilesQuerySchema,
  migrationFileParamsSchema,
  migrationIdParamsSchema,
  resolveConflictSchema,
} from "./migrations.schema.js";
import { MigrationsService } from "./migrations.service.js";

const service = new MigrationsService(migrationsRepository);
const controller = new MigrationsController(service);

export const migrationsRouter = Router();

migrationsRouter.get("/", controller.list);

migrationsRouter.post(
  "/",
  validateRequest({ body: createMigrationSchema }),
  controller.create
);

migrationsRouter.get(
  "/:id",
  validateRequest({ params: migrationIdParamsSchema }),
  controller.getById
);

migrationsRouter.post(
  "/:id/cancel",
  validateRequest({ params: migrationIdParamsSchema }),
  controller.cancel
);

migrationsRouter.post(
  "/:id/retry",
  validateRequest({ params: migrationIdParamsSchema }),
  controller.retry
);

migrationsRouter.get(
  "/:id/files",
  validateRequest({ params: migrationIdParamsSchema, query: listFilesQuerySchema }),
  controller.listFiles
);

migrationsRouter.get(
  "/:id/conflicts",
  validateRequest({ params: migrationIdParamsSchema }),
  controller.listConflicts
);

migrationsRouter.post(
  "/:id/conflicts/:fileId/resolve",
  validateRequest({ params: migrationFileParamsSchema, body: resolveConflictSchema }),
  controller.resolveConflict
);
