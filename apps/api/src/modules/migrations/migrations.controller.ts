import type { Request, Response } from "express";
import { sendSuccess } from "../../common/http/respond.js";
import type { FileStatus } from "../../types/enums.js";
import type { MigrationsService } from "./migrations.service.js";

export class MigrationsController {
  constructor(private readonly service: MigrationsService) {}

  list = (_req: Request, res: Response): void => {
    sendSuccess(res, this.service.list());
  };

  getById = (req: Request, res: Response): void => {
    sendSuccess(res, this.service.getById(req.params.id as string));
  };

  create = (req: Request, res: Response): void => {
    sendSuccess(res, this.service.create(req.body), 201);
  };

  cancel = (req: Request, res: Response): void => {
    sendSuccess(res, this.service.cancel(req.params.id as string));
  };

  retry = (req: Request, res: Response): void => {
    sendSuccess(res, this.service.retry(req.params.id as string));
  };

  listFiles = (req: Request, res: Response): void => {
    const { status } = req.query as { status?: FileStatus };
    sendSuccess(res, this.service.listFiles(req.params.id as string, status));
  };

  listConflicts = (req: Request, res: Response): void => {
    sendSuccess(res, this.service.listConflicts(req.params.id as string));
  };

  listLogs = (req: Request, res: Response): void => {
    sendSuccess(res, this.service.listLogs(req.params.id as string));
  };

  resolveConflict = (req: Request, res: Response): void => {
    sendSuccess(
      res,
      this.service.resolveConflict(req.params.id as string, req.params.fileId as string, req.body)
    );
  };
}
