import type {
  ActivityLogEntry,
  CloudProviderMeta,
  DashboardStat,
  DuplicateOption,
  FileTransferItem,
  MigrationSnapshot,
  MockNode,
} from "@/types";

export const CLOUD_PROVIDERS: CloudProviderMeta[] = [
  {
    id: "MEGA",
    name: "MEGA",
    shortName: "MEGA",
    description: "End-to-end encrypted cloud storage",
    accentClass: "bg-red-500/10 text-red-600 dark:text-red-400",
    roles: ["source"],
    available: true,
  },
  {
    id: "GOOGLE_DRIVE",
    name: "Google Drive",
    shortName: "Drive",
    description: "Google's file storage & sync",
    accentClass: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
    roles: ["destination"],
    available: true,
  },
  {
    id: "DROPBOX",
    name: "Dropbox",
    shortName: "Dropbox",
    description: "Coming soon",
    accentClass: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    roles: ["source", "destination"],
    available: false,
  },
  {
    id: "ONEDRIVE",
    name: "OneDrive",
    shortName: "OneDrive",
    description: "Coming soon",
    accentClass: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
    roles: ["source", "destination"],
    available: false,
  },
  {
    id: "BOX",
    name: "Box",
    shortName: "Box",
    description: "Coming soon",
    accentClass: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
    roles: ["source", "destination"],
    available: false,
  },
  {
    id: "S3",
    name: "Amazon S3",
    shortName: "S3",
    description: "Coming soon",
    accentClass: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
    roles: ["source", "destination"],
    available: false,
  },
];

export function getProvider(id: string): CloudProviderMeta {
  const found = CLOUD_PROVIDERS.find((p) => p.id === id);
  if (!found) throw new Error(`Unknown provider ${id}`);
  return found;
}

export const DUPLICATE_OPTIONS: DuplicateOption[] = [
  {
    id: "skip",
    label: "Skip",
    description: "Leave existing files untouched and don't transfer duplicates",
  },
  {
    id: "replace",
    label: "Replace",
    description: "Overwrite the file already in the destination",
  },
  {
    id: "rename",
    label: "Rename",
    description: "Keep both by appending a suffix, e.g. file (1).pdf",
  },
  {
    id: "ask",
    label: "Ask me",
    description: "Pause and let you decide for each conflicting file",
  },
];

export const MOCK_SOURCE_TREE: MockNode = {
  id: "root",
  name: "My MEGA Drive",
  type: "folder",
  children: [
    {
      id: "f-photos",
      name: "Photos",
      type: "folder",
      children: [
        { id: "f-photos-2024", name: "2024", type: "folder", children: [
          { id: "file-1", name: "summer-trip.zip", type: "file", sizeBytes: 482_000_000 },
          { id: "file-2", name: "family-reunion.mp4", type: "file", sizeBytes: 1_280_000_000 },
        ] },
        { id: "file-3", name: "profile.jpg", type: "file", sizeBytes: 2_400_000 },
      ],
    },
    {
      id: "f-docs",
      name: "Documents",
      type: "folder",
      children: [
        { id: "file-4", name: "taxes-2023.pdf", type: "file", sizeBytes: 1_100_000 },
        { id: "file-5", name: "resume.docx", type: "file", sizeBytes: 340_000 },
        { id: "file-6", name: "contract-signed.pdf", type: "file", sizeBytes: 890_000 },
      ],
    },
    {
      id: "f-projects",
      name: "Projects",
      type: "folder",
      children: [
        { id: "f-projects-website", name: "website-backup", type: "folder", children: [
          { id: "file-7", name: "site-export.tar.gz", type: "file", sizeBytes: 64_000_000 },
        ] },
        { id: "file-8", name: "notes.md", type: "file", sizeBytes: 12_000 },
      ],
    },
    { id: "file-9", name: "invoice-archive.zip", type: "file", sizeBytes: 210_000_000 },
  ],
};

export const MOCK_DEST_TREE: MockNode = {
  id: "root",
  name: "My Google Drive",
  type: "folder",
  children: [
    { id: "d-migrated", name: "Migrated Files", type: "folder", children: [] },
    { id: "d-shared", name: "Shared with me", type: "folder", children: [] },
    { id: "d-work", name: "Work", type: "folder", children: [
      { id: "d-work-reports", name: "Reports", type: "folder", children: [] },
    ] },
    { id: "d-backup", name: "Backups", type: "folder", children: [] },
  ],
};

export function findNodeByPath(tree: MockNode, path: string): MockNode | null {
  const segments = path.split(" / ");
  if (segments[0] !== tree.name) return null;
  let current: MockNode = tree;
  for (const segment of segments.slice(1)) {
    const next = current.children?.find((c) => c.name === segment);
    if (!next) return null;
    current = next;
  }
  return current;
}

export function summarizeNode(node: MockNode): { fileCount: number; totalBytes: number } {
  let fileCount = 0;
  let totalBytes = 0;
  const walk = (n: MockNode) => {
    if (n.type === "file") {
      fileCount += 1;
      totalBytes += n.sizeBytes ?? 0;
    }
    n.children?.forEach(walk);
  };
  walk(node);
  return { fileCount, totalBytes };
}

const FILE_NAMES = [
  "summer-trip.zip",
  "family-reunion.mp4",
  "profile.jpg",
  "taxes-2023.pdf",
  "resume.docx",
  "contract-signed.pdf",
  "site-export.tar.gz",
  "notes.md",
  "invoice-archive.zip",
  "budget-2024.xlsx",
  "presentation-final.pptx",
  "podcast-episode-12.mp3",
];

export function generateMockFiles(count = 12): FileTransferItem[] {
  return Array.from({ length: count }).map((_, i) => {
    const base = FILE_NAMES[i % FILE_NAMES.length];
    const cycle = Math.floor(i / FILE_NAMES.length);
    const name =
      cycle === 0
        ? base
        : base.replace(/(\.[^.]+)$/, ` (${cycle})$1`);
    const sizeBytes = Math.round(500_000 + Math.random() * 900_000_000);
    return {
      id: `file-${i}-${name}`,
      name,
      path: `/Photos/${name}`,
      sizeBytes,
      transferredBytes: 0,
      status: "pending",
    };
  });
}

export const SEED_LOGS: ActivityLogEntry[] = [
  {
    id: "log-seed-1",
    level: "info",
    message: "Welcome to CloudBridge. Connect a source and destination to begin.",
    timestamp: new Date(Date.now() - 1000 * 60 * 42).toISOString(),
  },
  {
    id: "log-seed-2",
    level: "success",
    message: "Google Drive connection verified successfully.",
    timestamp: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
  },
  {
    id: "log-seed-3",
    level: "info",
    message: "MEGA account linked — 128.4 GB available across 3,204 files.",
    timestamp: new Date(Date.now() - 1000 * 60 * 28).toISOString(),
  },
];

export const DASHBOARD_STATS: DashboardStat[] = [
  { id: "migrations", label: "Total Migrations", value: "24", delta: "+3 this week", trend: "up" },
  { id: "files", label: "Files Transferred", value: "8,942", delta: "+512 this week", trend: "up" },
  { id: "data", label: "Data Moved", value: "1.2 TB", delta: "+64 GB this week", trend: "up" },
  { id: "success", label: "Success Rate", value: "98.6%", delta: "-0.2%", trend: "down" },
];

export const RECENT_MIGRATIONS: MigrationSnapshot[] = [
  {
    id: "mig-1021",
    source: "MEGA",
    destination: "GOOGLE_DRIVE",
    status: "completed",
    duplicateStrategy: "rename",
    startedAt: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
    completedAt: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString(),
  },
  {
    id: "mig-1020",
    source: "MEGA",
    destination: "GOOGLE_DRIVE",
    status: "completed",
    duplicateStrategy: "skip",
    startedAt: new Date(Date.now() - 1000 * 60 * 60 * 26).toISOString(),
    completedAt: new Date(Date.now() - 1000 * 60 * 60 * 25).toISOString(),
  },
  {
    id: "mig-1019",
    source: "MEGA",
    destination: "GOOGLE_DRIVE",
    status: "failed",
    duplicateStrategy: "replace",
    startedAt: new Date(Date.now() - 1000 * 60 * 60 * 50).toISOString(),
    completedAt: new Date(Date.now() - 1000 * 60 * 60 * 49).toISOString(),
  },
];
