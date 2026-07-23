import type { ProviderType } from "../../types/enums.js";

export interface ProviderMetaBase {
  id: ProviderType;
  name: string;
  roles: Array<"source" | "destination">;
  capabilities: {
    resumableUpload: boolean;
    checksum: "sha1" | "md5" | "none";
  };
}

export interface ProviderMeta extends ProviderMetaBase {
  /** Whether a real adapter is currently registered for this provider — see providers.controller.ts. */
  available: boolean;
}

/**
 * Static registry of provider metadata (name, roles, capabilities). This
 * intentionally does NOT store `available` — whether a provider actually
 * works right now depends on whether its adapter is registered (MEGA,
 * unconditionally) or configured (Google Drive, via env vars), so the
 * controller computes it live from provider-registry.ts /
 * destination-provider-registry.ts instead of duplicating that state here.
 */
export const PROVIDERS: ProviderMetaBase[] = [
  {
    id: "MEGA",
    name: "MEGA",
    roles: ["source"],
    capabilities: { resumableUpload: false, checksum: "none" },
  },
  {
    id: "GOOGLE_DRIVE",
    name: "Google Drive",
    roles: ["source", "destination"],
    // The current adapter does a plain (non-resumable) media upload and
    // never fetches/verifies Drive's md5Checksum — advertise only what's
    // actually implemented, not what Drive's API is capable of in general.
    capabilities: { resumableUpload: false, checksum: "none" },
  },
  {
    id: "DROPBOX",
    name: "Dropbox",
    roles: ["source", "destination"],
    capabilities: { resumableUpload: true, checksum: "sha1" },
  },
  {
    id: "ONEDRIVE",
    name: "OneDrive",
    roles: ["source", "destination"],
    capabilities: { resumableUpload: true, checksum: "none" },
  },
  {
    id: "BOX",
    name: "Box",
    roles: ["source", "destination"],
    capabilities: { resumableUpload: true, checksum: "sha1" },
  },
  {
    id: "S3",
    name: "Amazon S3",
    roles: ["source", "destination"],
    capabilities: { resumableUpload: true, checksum: "md5" },
  },
];
