import { z } from "zod";
import { DUPLICATE_STRATEGIES, PROVIDER_TYPES } from "../../types/enums.js";

const megaCredentialsSchema = z.object({
  email: z.string().email("A valid email is required for MEGA."),
  password: z.string().min(1, "Password is required for MEGA."),
});

export const createConnectionSchema = z
  .object({
    provider: z.enum(PROVIDER_TYPES),
    label: z.string().min(1, "Label is required.").max(80),
    // Shape depends on the provider — only MEGA is validated for now since
    // it's the only one with a real adapter behind it (see provider.interface.ts).
    credentials: z.unknown().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.provider === "MEGA") {
      const result = megaCredentialsSchema.safeParse(data.credentials);
      if (!result.success) {
        ctx.addIssue({
          code: "custom",
          path: ["credentials"],
          message: "MEGA connections require credentials: { email, password }.",
        });
      }
    }
  });
export type CreateConnectionInput = z.infer<typeof createConnectionSchema>;

export const connectionIdParamsSchema = z.object({
  id: z.string().min(1),
});

export const connectionFileParamsSchema = z.object({
  id: z.string().min(1),
  fileId: z.string().min(1),
});

export const browseQuerySchema = z.object({
  path: z.string().default("/"),
});

export const createFolderSchema = z.object({
  parentId: z.string().min(1, "parentId is required."),
  name: z.string().min(1, "name is required.").max(255),
});
export type CreateFolderInput = z.infer<typeof createFolderSchema>;

export const uploadQuerySchema = z.object({
  parentId: z.string().min(1, "parentId is required."),
  filename: z.string().min(1, "filename is required."),
  duplicateStrategy: z.enum(DUPLICATE_STRATEGIES).default("SKIP"),
});
export type UploadQuery = z.infer<typeof uploadQuerySchema>;
