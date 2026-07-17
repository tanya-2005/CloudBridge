import type { DestinationProvider, SourceProvider } from "../../providers/provider.interface.js";

export interface PlannedFile {
  sourceFileId: string;
  name: string;
  sizeBytes: number;
  sourcePath: string;
  destParentId: string;
}

interface PlanContext {
  sourceProvider: SourceProvider;
  sourceCredentials: unknown;
  destProvider: DestinationProvider;
  destCredentials: unknown;
}

/**
 * Recursively walks the source folder tree and mirrors its folder structure
 * on the destination as it goes — reusing exactly the same
 * listFolders/listFiles/createFolder/exists building blocks from Phases 3
 * and 4, with no changes to any of them. Returns a flat list of files ready
 * to transfer, each already carrying the *real* destination folder id it
 * belongs under.
 */
export async function planMigrationTree(
  ctx: PlanContext,
  sourceFolderId: string | undefined,
  destParentId: string,
  pathPrefix = ""
): Promise<PlannedFile[]> {
  const [subfolders, files] = await Promise.all([
    ctx.sourceProvider.listFolders(ctx.sourceCredentials, sourceFolderId),
    ctx.sourceProvider.listFiles(ctx.sourceCredentials, sourceFolderId),
  ]);

  const planned: PlannedFile[] = files.map((f) => ({
    sourceFileId: f.id,
    name: f.name,
    sizeBytes: f.sizeBytes ?? 0,
    sourcePath: `${pathPrefix}/${f.name}`,
    destParentId,
  }));

  for (const folder of subfolders) {
    const destFolderId = await resolveDestFolder(
      ctx.destProvider,
      ctx.destCredentials,
      destParentId,
      folder.name
    );
    const nested = await planMigrationTree(
      ctx,
      folder.id,
      destFolderId,
      `${pathPrefix}/${folder.name}`
    );
    planned.push(...nested);
  }

  return planned;
}

/** Reuses an existing same-named destination folder instead of creating a duplicate on re-runs. */
async function resolveDestFolder(
  destProvider: DestinationProvider,
  destCredentials: unknown,
  parentId: string,
  name: string
): Promise<string> {
  const existing = await destProvider.exists(destCredentials, parentId, name);
  if (existing && existing.type === "folder") return existing.id;
  const created = await destProvider.createFolder(destCredentials, parentId, name);
  return created.id;
}
