import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import {
  generateMockFiles,
  getProvider,
  SEED_LOGS,
} from "@/lib/mock-data";
import type {
  ActivityLogEntry,
  ConnectionState,
  DuplicateStrategy,
  FileTransferItem,
  LogLevel,
  MigrationStatus,
  ProviderId,
  ProviderRole,
} from "@/types";

const CONCURRENCY = 3;
const TICK_MS = 380;
const MAX_LOGS = 200;

interface MigrationContextValue {
  sourceProviderId: ProviderId;
  destProviderId: ProviderId;
  sourceConnection: ConnectionState;
  destConnection: ConnectionState;
  sourceFolder: string | null;
  destFolder: string | null;
  duplicateStrategy: DuplicateStrategy;
  status: MigrationStatus;
  files: FileTransferItem[];
  logs: ActivityLogEntry[];
  totalBytes: number;
  transferredBytes: number;
  startedAt: string | null;

  setSourceProviderId: (id: ProviderId) => void;
  setDestProviderId: (id: ProviderId) => void;
  connect: (role: ProviderRole) => void;
  disconnect: (role: ProviderRole) => void;
  setSourceFolder: (path: string) => void;
  setDestFolder: (path: string) => void;
  setDuplicateStrategy: (strategy: DuplicateStrategy) => void;
  canStart: boolean;
  startMigration: () => void;
  resetMigration: () => void;
  resolveConflict: (fileId: string, action: "skip" | "replace" | "rename") => void;
}

const MigrationContext = createContext<MigrationContextValue | undefined>(
  undefined
);

const MOCK_ACCOUNTS: Record<ProviderId, string> = {
  MEGA: "you@mega.nz",
  GOOGLE_DRIVE: "you@gmail.com",
  DROPBOX: "you@dropbox.com",
  ONEDRIVE: "you@outlook.com",
  BOX: "you@box.com",
  S3: "iam-user@aws",
};

export function MigrationProvider({ children }: { children: ReactNode }) {
  const [sourceProviderId, setSourceProviderId] = useState<ProviderId>("MEGA");
  const [destProviderId, setDestProviderId] = useState<ProviderId>("GOOGLE_DRIVE");
  const [sourceConnection, setSourceConnection] = useState<ConnectionState>({
    status: "disconnected",
  });
  const [destConnection, setDestConnection] = useState<ConnectionState>({
    status: "disconnected",
  });
  const [sourceFolder, setSourceFolder] = useState<string | null>(null);
  const [destFolder, setDestFolder] = useState<string | null>(null);
  const [duplicateStrategy, setDuplicateStrategy] =
    useState<DuplicateStrategy>("skip");
  const [status, setStatus] = useState<MigrationStatus>("idle");
  const [files, setFiles] = useState<FileTransferItem[]>([]);
  const [logs, setLogs] = useState<ActivityLogEntry[]>(SEED_LOGS);
  const [startedAt, setStartedAt] = useState<string | null>(null);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeIdsRef = useRef<Set<string>>(new Set());
  const askedRef = useRef(false);

  const pushLog = useCallback((level: LogLevel, message: string) => {
    setLogs((prev) =>
      [
        { id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, level, message, timestamp: new Date().toISOString() },
        ...prev,
      ].slice(0, MAX_LOGS)
    );
  }, []);

  const connect = useCallback(
    (role: ProviderRole) => {
      const providerId = role === "source" ? sourceProviderId : destProviderId;
      const setConn = role === "source" ? setSourceConnection : setDestConnection;
      const provider = getProvider(providerId);

      setConn({ status: "connecting" });
      window.setTimeout(() => {
        setConn({ status: "connected", account: MOCK_ACCOUNTS[providerId] });
        pushLog("success", `Connected to ${provider.name} as ${MOCK_ACCOUNTS[providerId]}.`);
      }, 900);
    },
    [sourceProviderId, destProviderId, pushLog]
  );

  const disconnect = useCallback(
    (role: ProviderRole) => {
      const providerId = role === "source" ? sourceProviderId : destProviderId;
      const provider = getProvider(providerId);
      const setConn = role === "source" ? setSourceConnection : setDestConnection;
      setConn({ status: "disconnected" });
      pushLog("info", `Disconnected from ${provider.name}.`);
    },
    [sourceProviderId, destProviderId, pushLog]
  );

  const clearTimer = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const finishIfDone = useCallback(
    (current: FileTransferItem[]) => {
      const unfinished = current.some(
        (f) => f.status === "pending" || f.status === "transferring" || f.status === "conflict"
      );
      if (unfinished) return;

      clearTimer();
      const anyDone = current.some((f) => f.status === "done");
      setStatus(anyDone ? "completed" : "failed");

      const done = current.filter((f) => f.status === "done").length;
      const failed = current.filter((f) => f.status === "failed").length;
      const skipped = current.filter((f) => f.status === "skipped").length;
      pushLog(
        anyDone ? "success" : "error",
        `Migration finished — ${done} transferred, ${skipped} skipped, ${failed} failed.`
      );
    },
    [clearTimer, pushLog]
  );

  const runTick = useCallback(() => {
    setFiles((prev) => {
      const next = [...prev];
      const active = activeIdsRef.current;

      // Top up active set from pending files.
      if (active.size < CONCURRENCY) {
        for (const f of next) {
          if (active.size >= CONCURRENCY) break;
          if (f.status !== "pending") continue;

          // Simulate one "ask" conflict on the very first eligible file.
          if (duplicateStrategy === "ask" && !askedRef.current) {
            askedRef.current = true;
            f.status = "conflict";
            pushLog("warning", `Duplicate found for "${f.name}" — waiting for your decision.`);
            continue;
          }

          f.status = "transferring";
          active.add(f.id);
        }
      }

      for (const f of next) {
        if (!active.has(f.id)) continue;
        const remaining = f.sizeBytes - f.transferredBytes;
        const chunk = Math.max(
          f.sizeBytes * 0.12,
          remaining * (0.18 + Math.random() * 0.22)
        );
        f.transferredBytes = Math.min(f.sizeBytes, f.transferredBytes + chunk);

        if (f.transferredBytes >= f.sizeBytes) {
          active.delete(f.id);
          const roll = Math.random();
          if (roll < 0.06) {
            f.status = "failed";
            pushLog("error", `Failed to transfer "${f.name}" — connection reset.`);
          } else {
            f.status = "done";
            pushLog("success", `Transferred "${f.name}".`);
          }
        }
      }

      finishIfDone(next);
      return next;
    });
  }, [duplicateStrategy, pushLog, finishIfDone]);

  const startMigration = useCallback(() => {
    clearTimer();
    activeIdsRef.current = new Set();
    askedRef.current = false;

    const seeded = generateMockFiles(8 + Math.floor(Math.random() * 6));
    setFiles(seeded);
    setStatus("running");
    setStartedAt(new Date().toISOString());
    pushLog(
      "info",
      `Migration started — ${seeded.length} files queued from ${getProvider(sourceProviderId).name} to ${getProvider(destProviderId).name}.`
    );

    intervalRef.current = setInterval(runTick, TICK_MS);
  }, [clearTimer, pushLog, runTick, sourceProviderId, destProviderId]);

  const resetMigration = useCallback(() => {
    clearTimer();
    activeIdsRef.current = new Set();
    askedRef.current = false;
    setFiles([]);
    setStatus("idle");
    setStartedAt(null);
  }, [clearTimer]);

  const resolveConflict = useCallback(
    (fileId: string, action: "skip" | "replace" | "rename") => {
      setFiles((prev) => {
        const next = prev.map((f) => {
          if (f.id !== fileId) return f;
          if (action === "skip") {
            pushLog("info", `Skipped "${f.name}" (duplicate).`);
            return { ...f, status: "skipped" as const };
          }
          pushLog(
            "info",
            action === "replace"
              ? `Replacing existing "${f.name}" at destination.`
              : `Renaming "${f.name}" to avoid conflict.`
          );
          return { ...f, status: "pending" as const };
        });
        finishIfDone(next);
        return next;
      });

      // Resume the tick loop in case it had stalled on this conflict.
      if (intervalRef.current === null && status === "running") {
        intervalRef.current = setInterval(runTick, TICK_MS);
      }
    },
    [pushLog, finishIfDone, runTick, status]
  );

  useEffect(() => clearTimer, [clearTimer]);

  const totalBytes = useMemo(
    () => files.reduce((sum, f) => sum + f.sizeBytes, 0),
    [files]
  );
  const transferredBytes = useMemo(
    () => files.reduce((sum, f) => sum + f.transferredBytes, 0),
    [files]
  );

  const canStart =
    sourceConnection.status === "connected" &&
    destConnection.status === "connected" &&
    !!sourceFolder &&
    !!destFolder &&
    status !== "running";

  const value: MigrationContextValue = {
    sourceProviderId,
    destProviderId,
    sourceConnection,
    destConnection,
    sourceFolder,
    destFolder,
    duplicateStrategy,
    status,
    files,
    logs,
    totalBytes,
    transferredBytes,
    startedAt,
    setSourceProviderId,
    setDestProviderId,
    connect,
    disconnect,
    setSourceFolder,
    setDestFolder,
    setDuplicateStrategy,
    canStart,
    startMigration,
    resetMigration,
    resolveConflict,
  };

  return (
    <MigrationContext.Provider value={value}>
      {children}
    </MigrationContext.Provider>
  );
}

export function useMigration() {
  const ctx = useContext(MigrationContext);
  if (!ctx) throw new Error("useMigration must be used within MigrationProvider");
  return ctx;
}
