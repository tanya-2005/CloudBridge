import { Router } from "express";
import { validateRequest } from "../../common/middleware/validate-request.js";
import { ConnectionsController } from "./connections.controller.js";
import { connectionsRepository } from "./connections.repository.js";
import {
  browseQuerySchema,
  connectionFileParamsSchema,
  connectionIdParamsSchema,
  createConnectionSchema,
  createFolderSchema,
  uploadQuerySchema,
} from "./connections.schema.js";
import { ConnectionsService } from "./connections.service.js";

const service = new ConnectionsService(connectionsRepository);
const controller = new ConnectionsController(service);

export const connectionsRouter = Router();

connectionsRouter.get("/", controller.list);

connectionsRouter.post(
  "/",
  validateRequest({ body: createConnectionSchema }),
  controller.create
);

connectionsRouter.get(
  "/:id",
  validateRequest({ params: connectionIdParamsSchema }),
  controller.getById
);

connectionsRouter.delete(
  "/:id",
  validateRequest({ params: connectionIdParamsSchema }),
  controller.remove
);

connectionsRouter.post(
  "/:id/test",
  validateRequest({ params: connectionIdParamsSchema }),
  controller.test
);

connectionsRouter.get(
  "/:id/browse",
  validateRequest({ params: connectionIdParamsSchema, query: browseQuerySchema }),
  controller.browse
);

connectionsRouter.get(
  "/:id/files/:fileId/download",
  validateRequest({ params: connectionFileParamsSchema }),
  controller.download
);

connectionsRouter.post(
  "/:id/folders",
  validateRequest({ params: connectionIdParamsSchema, body: createFolderSchema }),
  controller.createFolder
);

// Body is the raw file bytes (not JSON), so only params/query go through
// validateRequest — req itself is left untouched as the readable stream
// the controller pipes into the destination provider.
connectionsRouter.post(
  "/:id/upload",
  validateRequest({ params: connectionIdParamsSchema, query: uploadQuerySchema }),
  controller.upload
);
