# Cloud-to-Cloud File Migration Platform — Architecture (MVP)

Scope: local-only, no OAuth, no deployment concerns. Source = MEGA, Destination = Google Drive, designed for additional providers later.

---

## 1. Tech Stack

**Monorepo tooling**
- pnpm workspaces + Turborepo (single repo, independently buildable apps/packages)
- TypeScript everywhere (shared types between frontend/backend)

**Frontend**
- Next.js 15 (App Router) + TypeScript
- Tailwind CSS + shadcn/ui (component primitives)
- TanStack Query (server-state fetching/caching)
- Zustand (light local UI state, e.g. wizard step)
- Socket.IO client (live progress)

**Backend**
- NestJS (TypeScript) on the Fastify adapter (`@nestjs/platform-fastify`) — DI/module system maps cleanly onto "one module per cloud provider," which matters a lot for the extensibility requirement (#12)
- BullMQ + Redis — background job queue for migrations/file transfers
- Socket.IO (via `@nestjs/websockets`) — push job/file progress to the frontend
- Prisma ORM + PostgreSQL — persistence
- Zod — request validation, shared with frontend via `packages/shared`

**Provider SDKs**
- MEGA: `megajs` (pure JS MEGA client; auth is native email+password/session, no OAuth needed — MEGA doesn't offer OAuth anyway)
- Google Drive: `googleapis` — **auth via a Service Account JSON key**, not the OAuth consent flow (see note below)

**Dev/local infra**
- Docker Compose for Postgres + Redis (only local services — no deployment)
- `.env` per app, loaded with `dotenv` / Nest `ConfigModule`

> **Why Service Account for Google Drive instead of OAuth?**
> You asked to skip OAuth. Google Drive still needs *some* credential. A Service Account JSON key lets the backend call the Drive API directly with zero interactive consent screens — you generate a key in Google Cloud Console, then share the destination Drive folder with the service account's email address like you'd share it with a person. This is a real, working credential path (not a stub), and it's a drop-in replacement for OAuth later: same `GoogleDriveProvider` class, different `googleapis` auth client. Flag if you'd rather stub Google Drive entirely until OAuth exists — happy to do that instead.

---

## 2. Folder Structure

```
oracle/
├── apps/
│   ├── web/                        # Next.js frontend
│   │   ├── app/
│   │   │   ├── (dashboard)/
│   │   │   │   ├── connections/    # manage MEGA/Google Drive connections
│   │   │   │   ├── migrations/     # list + detail (progress) views
│   │   │   │   └── migrations/new/ # migration wizard
│   │   │   ├── api/                # (only if we need FE-only routes; primary API is apps/api)
│   │   │   └── layout.tsx
│   │   ├── components/
│   │   ├── hooks/                  # useMigrationProgress (socket.io), useConnections, ...
│   │   ├── lib/                    # api client, socket client
│   │   └── ...
│   │
│   └── api/                        # NestJS backend
│       ├── src/
│       │   ├── main.ts
│       │   ├── app.module.ts
│       │   ├── config/
│       │   ├── connections/        # CRUD for stored cloud credentials
│       │   ├── migrations/         # migration job orchestration + REST
│       │   ├── file-transfers/     # per-file transfer records + conflict resolution
│       │   ├── providers/          # provider registry + adapters
│       │   │   ├── provider.interface.ts
│       │   │   ├── provider-registry.service.ts
│       │   │   ├── mega/
│       │   │   └── google-drive/
│       │   ├── queue/              # BullMQ queue definitions + processors
│       │   ├── realtime/           # Socket.IO gateway
│       │   ├── prisma/             # PrismaService
│       │   └── common/             # filters, interceptors, error taxonomy
│       └── prisma/
│           └── schema.prisma
│
├── packages/
│   ├── shared/                     # DTOs, Zod schemas, enums shared FE/BE
│   └── config/                     # eslint/tsconfig base configs
│
├── docker-compose.yml              # postgres + redis, local only
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

---

## 3. Frontend Architecture

- **Connections page** — add/edit a MEGA connection (email + password) or Google Drive connection (paste/upload service-account JSON, pick a target folder). Credentials never round-trip back to the client in plaintext after creation.
- **New Migration wizard** (3 steps):
  1. Pick source connection (MEGA) → browse/select folders or files to migrate
  2. Pick destination connection (Google Drive) → pick target folder
  3. Choose duplicate-handling strategy (skip / overwrite / rename / ask-me) → review → start
- **Migration detail page** — live progress: overall bar (bytes-based), per-file table (status, %, speed), conflict-resolution inbox when strategy = "ask-me".
- **Data flow**: TanStack Query for all REST reads (connections list, migration list/detail snapshot on load); Socket.IO subscription (`join migration:<id>` room) layered on top for deltas — REST gives the initial state, WS gives live updates, so a page refresh never loses progress.
- **Component boundary**: presentation components are provider-agnostic — they render a generic `FileNode`/`TransferStatus` shape from `packages/shared`, never MEGA- or Drive-specific fields, so adding a provider never touches frontend components, only the connection-type enum + an icon/label map.

---

## 4. Backend Architecture (NestJS Modules)

| Module | Responsibility |
|---|---|
| `ConnectionsModule` | CRUD for stored provider credentials (encrypted at rest); validates credentials by making a lightweight "whoami" call to the provider at save time |
| `ProvidersModule` | `CloudProvider` interface + `ProviderRegistry` (factory keyed by provider enum) + one adapter subfolder per provider (`mega/`, `google-drive/`) |
| `MigrationsModule` | Create/list/get migration jobs; builds the transfer plan (tree diff) and enqueues it |
| `FileTransfersModule` | Per-file transfer records, conflict listing/resolution endpoints |
| `QueueModule` | BullMQ queue + worker registration (`migration-orchestration`, `file-transfer`) |
| `RealtimeModule` | Socket.IO gateway; subscribes to Redis pub/sub (BullMQ job events) and re-emits to the relevant `migration:<id>` room |
| `PrismaModule` | Global `PrismaService` |
| `CommonModule` | Global exception filter → maps internal error taxonomy to HTTP responses; logging interceptor |

**Provider interface** (the core extensibility seam — see #12):

```ts
interface CloudProvider {
  readonly type: ProviderType; // 'MEGA' | 'GOOGLE_DRIVE' | ...
  testConnection(credentials): Promise<void>;
  listFolder(credentials, path: string): Promise<RemoteNode[]>;
  getReadStream(credentials, fileId: string): Promise<Readable>;
  createFolder(credentials, parentId: string, name: string): Promise<string>;
  writeStream(credentials, parentId: string, filename: string, stream: Readable, opts): Promise<RemoteFile>;
  exists(credentials, parentId: string, filename: string): Promise<RemoteFile | null>;
  capabilities: { resumableUpload: boolean; checksum: 'sha1'|'md5'|'none'; rateLimitPerSec?: number };
}
```

---

## 5. API Routes (REST, v1)

```
POST   /connections                     create a connection (MEGA or Google Drive)
GET    /connections                     list connections (secrets omitted)
GET    /connections/:id                 get one
DELETE /connections/:id                 remove
POST   /connections/:id/test            re-validate credentials

GET    /connections/:id/browse?path=    browse remote folder tree (for source picker)

POST   /migrations                      create migration job (source, dest, selection, duplicate strategy) → enqueues plan build
GET    /migrations                      list jobs (status, summary counts)
GET    /migrations/:id                  job detail + aggregate progress
POST   /migrations/:id/cancel           cancel a running job
POST   /migrations/:id/retry            retry failed files only

GET    /migrations/:id/files            paginated per-file transfer list (filter by status)
GET    /migrations/:id/conflicts        files awaiting manual duplicate resolution
POST   /migrations/:id/conflicts/:fileId/resolve   { action: 'skip'|'overwrite'|'rename', newName? }

WS     /realtime  (Socket.IO)
  client → join { migrationId }
  server → migration:progress   { migrationId, transferredBytes, totalBytes, filesDone, filesTotal }
  server → file:progress        { migrationId, fileId, transferredBytes, totalBytes, status }
  server → file:conflict        { migrationId, fileId, existingFile }
  server → migration:completed  { migrationId, summary }
```

---

## 6. Database Schema (PostgreSQL via Prisma)

```prisma
model CloudConnection {
  id            String   @id @default(cuid())
  provider      ProviderType
  label         String
  // encrypted JSON blob; shape depends on provider (MEGA: email/password, GDrive: service-account key + root folder id)
  credentials   Bytes
  status        ConnectionStatus @default(UNVERIFIED)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  migrationsAsSource      MigrationJob[] @relation("SourceConnection")
  migrationsAsDestination MigrationJob[] @relation("DestinationConnection")
}

model MigrationJob {
  id                String   @id @default(cuid())
  sourceId          String
  source            CloudConnection @relation("SourceConnection", fields: [sourceId], references: [id])
  destinationId     String
  destination       CloudConnection @relation("DestinationConnection", fields: [destinationId], references: [id])

  sourceRootPath    String            // folder/file selected in MEGA
  destRootFolderId  String            // target folder in Google Drive

  duplicateStrategy DuplicateStrategy @default(SKIP)
  status            JobStatus         @default(PENDING)

  totalFiles        Int      @default(0)
  totalBytes        BigInt   @default(0)
  transferredBytes  BigInt   @default(0)

  createdAt         DateTime @default(now())
  startedAt         DateTime?
  completedAt       DateTime?

  files             FileTransfer[]
}

model FileTransfer {
  id                String   @id @default(cuid())
  migrationJobId    String
  migrationJob      MigrationJob @relation(fields: [migrationJobId], references: [id])

  sourcePath        String
  sourceFileId      String
  filename          String
  destParentId      String
  sizeBytes         BigInt
  transferredBytes  BigInt   @default(0)
  checksum          String?

  status            FileStatus @default(PENDING) // PENDING, TRANSFERRING, DONE, FAILED, SKIPPED, CONFLICT
  duplicateAction   DuplicateStrategy?            // resolved action actually taken
  errorType         String?
  errorMessage      String?
  attempts          Int      @default(0)

  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  @@index([migrationJobId, status])
}

enum ProviderType { MEGA GOOGLE_DRIVE }
enum ConnectionStatus { UNVERIFIED VALID INVALID }
enum DuplicateStrategy { SKIP OVERWRITE RENAME ASK }
enum JobStatus { PENDING PLANNING RUNNING PAUSED COMPLETED COMPLETED_WITH_ERRORS FAILED CANCELLED }
enum FileStatus { PENDING TRANSFERRING DONE FAILED SKIPPED CONFLICT }
```

No `User` table for the MVP (single local operator). The schema leaves room for one later without touching these tables — a `userId` FK can be added to `CloudConnection`/`MigrationJob` when auth arrives.

---

## 7. Background Job Architecture

Two BullMQ queues on Redis:

1. **`migration-orchestration`** (concurrency 1 per job) — one job per `MigrationJob`:
   - Walks the source tree (`CloudProvider.listFolder`, recursive)
   - Diffs against destination (checks existing names for duplicate detection)
   - Applies the job's `duplicateStrategy`; files needing `ASK` are marked `CONFLICT` and excluded from auto-enqueue until resolved
   - Writes `FileTransfer` rows, updates `totalFiles`/`totalBytes`, flips job to `RUNNING`
   - Enqueues one `file-transfer` job per eligible file

2. **`file-transfer`** (concurrency N, tunable per provider via `capabilities.rateLimitPerSec`) — one job per file:
   - Streams source → destination (see #8)
   - Emits `updateProgress()` periodically → picked up by `RealtimeModule` and pushed over Socket.IO
   - On completion, updates `FileTransfer.status` and increments the parent job's `transferredBytes`
   - On terminal failure after retries, marks `FAILED` with `errorType`/`errorMessage`, job continues (failures don't halt the batch)
   - A lightweight completion listener recomputes `MigrationJob.status` once all files reach a terminal state (`COMPLETED` / `COMPLETED_WITH_ERRORS` / `FAILED` if everything failed)

BullMQ retry policy: 3 attempts, exponential backoff (5s base), only for errors classified `transient` (see #11).

---

## 8. File Transfer Workflow

```
1. file-transfer job picked up for FileTransfer row
2. status → TRANSFERRING
3. sourceStream = MegaProvider.getReadStream(sourceCreds, sourceFileId)
4. destWrite     = GoogleDriveProvider.writeStream(destCreds, destParentId, filename, sourceStream, { resumable: true })
   - Drive upload uses googleapis resumable upload session; the readable stream from MEGA is piped
     directly into it (Node stream piping) — no full-file buffering to local disk for the common case
   - progress computed from bytes read off the source stream (both ends move together due to backpressure)
5. every ~500ms or 5% delta: FileTransfer.transferredBytes updated + job.updateProgress() emitted
6. on stream 'end': verify size matches expected (checksum compare if provider supports it) → status DONE
7. on stream error: classify error → transient (retry) or permanent (FAILED immediately)
```

Large files (where a provider can't stream-pipe cleanly, or for future providers without streaming APIs) fall back to a temp-disk buffer under `apps/api/tmp/`, cleaned up after upload — this is a per-provider capability flag, not a global behavior.

---

## 9. Duplicate File Handling Workflow

Detection happens during the **planning** phase (step in `migration-orchestration`), not per-file at transfer time, so the whole plan is known up front:

- For each source file, check `destination.exists(parentId, filename)`
- If no match → proceed normally
- If match found, apply `MigrationJob.duplicateStrategy`:
  - **SKIP** — mark `FileTransfer.status = SKIPPED`, never enqueued
  - **OVERWRITE** — enqueued normally; `GoogleDriveProvider.writeStream` uses the existing file's ID (update-in-place) instead of creating a new one
  - **RENAME** — auto-suffix (`file (1).ext`, incrementing until free), enqueued under the new name
  - **ASK** — `FileTransfer.status = CONFLICT`, surfaced via `GET /migrations/:id/conflicts` and the `file:conflict` WS event; excluded from the transfer queue until the user calls `POST /conflicts/:fileId/resolve`, at which point it's enqueued per the chosen per-file action
- A migration job with `ASK` conflicts pending sits in `RUNNING` (other non-conflicting files proceed in parallel) until all conflicts are resolved or the user cancels

---

## 10. Progress Tracking Architecture

- **Source of truth**: Postgres (`transferredBytes`/`status` on both `MigrationJob` and `FileTransfer`) — survives backend restarts, is what `GET /migrations/:id` returns for initial load/refresh.
- **Live layer**: BullMQ job progress events → `RealtimeModule` listener → Socket.IO room `migration:<id>`. The frontend always does REST-fetch-then-subscribe, so a mid-transfer page reload just re-syncs from Postgres and resumes listening — no state is only-in-memory.
- **Aggregation**: overall % = `transferredBytes / totalBytes` (byte-weighted, not file-count-weighted, so one huge file doesn't make the bar look stuck at 0% while N tiny files finish).
- **Throughput**: computed client-side from a rolling window of `transferredBytes` deltas (no separate "speed" field persisted).

---

## 11. Error Handling Strategy

**Error taxonomy** (`apps/api/src/common/errors/`):

| Class | Examples | Handling |
|---|---|---|
| `TransientProviderError` | network timeout, 429 rate limit, 5xx from provider | BullMQ retry w/ exponential backoff (max 3) |
| `AuthError` | expired/invalid credentials, revoked Drive share | fail file immediately, flag `CloudConnection.status = INVALID`, surface actionable message ("reconnect this account") |
| `PermanentFileError` | file deleted at source mid-migration, quota exceeded at dest, corrupt read | fail file immediately, no retry, job continues |
| `ValidationError` | bad request payload | 400 at the REST layer via a global Nest exception filter, never reaches the queue |

- Every `FileTransfer` failure stores `errorType` + `errorMessage` (truncated, no raw stack traces persisted) for the UI's error column.
- A migration job's final status distinguishes `COMPLETED` (all done) vs `COMPLETED_WITH_ERRORS` (partial) vs `FAILED` (nothing succeeded) — the UI never has to infer this from raw file counts.
- `POST /migrations/:id/retry` re-enqueues only files in `FAILED` state, without rebuilding the whole plan.
- Backend-wide: a global Nest exception filter + Pino structured logging (`apps/api` logs as JSON locally too, so log shape doesn't change later in a hosted environment).

---

## 12. Future Scalability for Additional Providers

Adding Dropbox/OneDrive/Box/S3 later is intended to be a **new folder + one registry line**, not a refactor:

1. Implement `CloudProvider` in `apps/api/src/providers/dropbox/dropbox.provider.ts`
2. Register it: `providerRegistry.register('DROPBOX', DropboxProvider)`
3. Add `DROPBOX` to `ProviderType` enum (Prisma migration: enum add is non-breaking)
4. Add a connection-form variant on the frontend (credential fields differ per provider) + an icon/label — no other frontend component changes, since they all consume the generic `RemoteNode`/`FileTransfer` shapes from `packages/shared`
5. If the new provider needs OAuth (Dropbox/OneDrive/Box do), it plugs into `ConnectionsModule` as an additional credential-acquisition strategy — the `CloudConnection.credentials` blob is already opaque/provider-shaped, so this doesn't touch the schema

Other scalability seams already in place:
- `capabilities` flags per provider (resumable upload, checksum type, rate limit) let the transfer engine adapt behavior without provider-specific branching in `file-transfer` processor code
- Queue concurrency is configurable per provider, so a slow/rate-limited provider doesn't starve others
- Multi-tenant/auth: schema and modules are structured so a `User` table + auth guard can be layered on without touching `ProvidersModule`, `QueueModule`, or the transfer workflow
