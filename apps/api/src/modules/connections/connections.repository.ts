import { createId } from "../../common/utils/id.js";
import type { CloudConnection } from "../../types/models.js";

/**
 * In-memory stand-in for the eventual Prisma-backed repository described in
 * ARCHITECTURE.md. Same shape, same method signatures — swapping this for a
 * real database later shouldn't require touching the service layer above it.
 */
export class ConnectionsRepository {
  private readonly store = new Map<string, CloudConnection>();

  constructor(seed: CloudConnection[] = []) {
    for (const connection of seed) this.store.set(connection.id, connection);
  }

  findAll(): CloudConnection[] {
    return [...this.store.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  findById(id: string): CloudConnection | undefined {
    return this.store.get(id);
  }

  create(
    input: Pick<CloudConnection, "provider" | "label"> &
      Partial<Pick<CloudConnection, "status" | "account">>
  ): CloudConnection {
    const now = new Date().toISOString();
    const connection: CloudConnection = {
      id: createId("conn"),
      provider: input.provider,
      label: input.label,
      status: input.status ?? "UNVERIFIED",
      account: input.account,
      createdAt: now,
      updatedAt: now,
    };
    this.store.set(connection.id, connection);
    return connection;
  }

  update(id: string, patch: Partial<Omit<CloudConnection, "id" | "createdAt">>): CloudConnection | undefined {
    const existing = this.store.get(id);
    if (!existing) return undefined;
    const updated: CloudConnection = { ...existing, ...patch, updatedAt: new Date().toISOString() };
    this.store.set(id, updated);
    return updated;
  }

  delete(id: string): boolean {
    return this.store.delete(id);
  }
}

const now = new Date().toISOString();

export const connectionsRepository = new ConnectionsRepository([
  {
    id: createId("conn"),
    provider: "MEGA",
    label: "My MEGA Account",
    status: "VALID",
    account: "you@mega.nz",
    createdAt: now,
    updatedAt: now,
  },
  {
    id: createId("conn"),
    provider: "GOOGLE_DRIVE",
    label: "My Google Drive",
    status: "VALID",
    account: "you@gmail.com",
    createdAt: now,
    updatedAt: now,
  },
]);
