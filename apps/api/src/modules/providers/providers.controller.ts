import type { Request, Response } from "express";
import { sendSuccess } from "../../common/http/respond.js";
import { destinationProviderRegistry } from "./destination-provider-registry.js";
import type { ProviderMeta } from "./providers.data.js";
import { PROVIDERS } from "./providers.data.js";
import { providerRegistry } from "./provider-registry.js";

export function listProviders(_req: Request, res: Response): void {
  const providers: ProviderMeta[] = PROVIDERS.map((base) => ({
    ...base,
    available: providerRegistry.has(base.id) || destinationProviderRegistry.has(base.id),
  }));
  sendSuccess(res, providers);
}
