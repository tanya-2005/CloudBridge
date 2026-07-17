import { z } from "zod";
import { DUPLICATE_STRATEGIES, FILE_STATUSES } from "../../types/enums.js";

export const createMigrationSchema = z.object({
  sourceId: z.string().min(1),
  destinationId: z.string().min(1),
  sourceRootPath: z.string().min(1),
  destRootFolderId: z.string().min(1),
  duplicateStrategy: z.enum(DUPLICATE_STRATEGIES).default("SKIP"),
});
export type CreateMigrationInput = z.infer<typeof createMigrationSchema>;

export const migrationIdParamsSchema = z.object({
  id: z.string().min(1),
});

export const migrationFileParamsSchema = z.object({
  id: z.string().min(1),
  fileId: z.string().min(1),
});

export const listFilesQuerySchema = z.object({
  status: z.enum(FILE_STATUSES).optional(),
});

export const resolveConflictSchema = z.object({
  action: z.enum(["SKIP", "OVERWRITE", "RENAME"]),
  newName: z.string().min(1).optional(),
});
export type ResolveConflictInput = z.infer<typeof resolveConflictSchema>;
