import type { AuthMethod, CredentialField, ProviderId } from "@/types";

/**
 * Purely cosmetic/UI-shape per-provider metadata — brand colors, short
 * labels, which auth UI to show, and (for "credentials"-auth providers)
 * exactly which fields that form collects, have no backend equivalent.
 * Name/roles/availability come from the real GET /providers endpoint at
 * runtime (see api.ts + migration-context). Adding a new provider here is
 * the *only* frontend change needed to give it a working connect UI —
 * CloudConnectionCard renders entirely off this config, never a
 * hardcoded per-provider form.
 */
interface ProviderDisplay {
  shortName: string;
  accentClass: string;
  authMethod: AuthMethod;
  /** Only for authMethod: "oauth" — the slug used in /oauth/:slug/start on the backend. */
  oauthSlug?: string;
  /** Only for authMethod: "credentials" — the fields CloudConnectionCard's inline form renders, in order. */
  credentialFields?: CredentialField[];
}

const DISPLAY: Record<ProviderId, ProviderDisplay> = {
  MEGA: {
    shortName: "MEGA",
    accentClass: "bg-red-500/10 text-red-600 dark:text-red-400",
    authMethod: "credentials",
    credentialFields: [
      { key: "email", label: "Email", type: "email", autoComplete: "username" },
      { key: "password", label: "Password", type: "password", autoComplete: "current-password" },
    ],
  },
  GOOGLE_DRIVE: {
    shortName: "Drive",
    accentClass: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
    authMethod: "oauth",
    oauthSlug: "google",
  },
  DROPBOX: {
    shortName: "Dropbox",
    accentClass: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    authMethod: "none",
  },
  ONEDRIVE: {
    shortName: "OneDrive",
    accentClass: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
    authMethod: "none",
  },
  BOX: {
    shortName: "Box",
    accentClass: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
    authMethod: "none",
  },
  S3: {
    shortName: "S3",
    accentClass: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
    authMethod: "none",
  },
};

export function getProviderDisplay(id: ProviderId): ProviderDisplay {
  return DISPLAY[id] ?? { shortName: id, accentClass: "bg-muted text-muted-foreground", authMethod: "none" };
}
