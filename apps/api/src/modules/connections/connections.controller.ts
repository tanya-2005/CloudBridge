import type { Request, Response } from "express";
import { ValidationError } from "../../common/errors/app-error.js";
import { sendSuccess } from "../../common/http/respond.js";
import type { ConnectionsService } from "./connections.service.js";
import type { UploadQuery } from "./connections.schema.js";

/** Progress callbacks fire per network chunk — log at most this often per upload. */
const PROGRESS_LOG_INTERVAL_MS = 500;

/** Never logs a real password value, only its presence/length, so trace logs are safe to paste anywhere. */
function maskForTrace(body: unknown): unknown {
  if (!body || typeof body !== "object") return body;
  const clone: Record<string, unknown> = { ...(body as Record<string, unknown>) };
  if (clone.credentials && typeof clone.credentials === "object") {
    const creds: Record<string, unknown> = { ...(clone.credentials as Record<string, unknown>) };
    if (typeof creds.password === "string") creds.password = `[REDACTED length=${creds.password.length}]`;
    clone.credentials = creds;
  }
  return clone;
}

export class ConnectionsController {
  constructor(private readonly service: ConnectionsService) {}

  list = (_req: Request, res: Response): void => {
    sendSuccess(res, this.service.list());
  };

  getById = (req: Request, res: Response): void => {
    sendSuccess(res, this.service.getById(req.params.id as string));
  };

  create = (req: Request, res: Response): void => {
    console.log("[MEGA-Trace][POST /connections] body:", maskForTrace(req.body));
    sendSuccess(res, this.service.create(req.body), 201);
  };

  remove = (req: Request, res: Response): void => {
    this.service.remove(req.params.id as string);
    res.status(204).send();
  };

  test = async (req: Request, res: Response): Promise<void> => {
    sendSuccess(res, await this.service.testConnection(req.params.id as string));
  };

  browse = async (req: Request, res: Response): Promise<void> => {
    const { path } = req.query as { path: string };
    sendSuccess(res, await this.service.browse(req.params.id as string, path));
  };

  download = async (req: Request, res: Response): Promise<void> => {
    const { stream, filename, sizeBytes, mimeType } = await this.service.downloadFile(
      req.params.id as string,
      req.params.fileId as string
    );

    res.setHeader("Content-Type", mimeType ?? "application/octet-stream");
    res.setHeader("Content-Length", String(sizeBytes));
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(filename)}"`);

    stream.on("error", (err) => {
      if (res.headersSent) {
        res.destroy(err);
      } else {
        res.status(502).json({
          success: false,
          error: { code: "TRANSIENT_PROVIDER_ERROR", message: "Failed to stream the file from the provider." },
        });
      }
    });

    stream.pipe(res);
  };

  createFolder = async (req: Request, res: Response): Promise<void> => {
    const { parentId, name } = req.body as { parentId: string; name: string };
    sendSuccess(res, await this.service.createFolder(req.params.id as string, parentId, name), 201);
  };

  upload = async (req: Request, res: Response): Promise<void> => {
    const contentLength = req.headers["content-length"];
    if (!contentLength) {
      throw new ValidationError("A Content-Length header is required to upload a file.");
    }
    const sizeBytes = Number(contentLength);

    const { parentId, filename, duplicateStrategy } = req.query as unknown as UploadQuery;

    let lastLoggedAt = 0;
    const outcome = await this.service.uploadFile(req.params.id as string, {
      parentId,
      filename,
      sizeBytes,
      stream: req,
      duplicateStrategy,
      onProgress: ({ bytesUploaded, totalBytes }) => {
        const now = Date.now();
        if (now - lastLoggedAt < PROGRESS_LOG_INTERVAL_MS) return;
        lastLoggedAt = now;
        const pct = totalBytes > 0 ? Math.round((bytesUploaded / totalBytes) * 100) : 0;
        console.log(`[upload] "${filename}" ${bytesUploaded}/${totalBytes} bytes (${pct}%)`);
      },
    });

    sendSuccess(res, outcome, outcome.status === "uploaded" ? 201 : 200);
  };
}
