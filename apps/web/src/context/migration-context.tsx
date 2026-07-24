import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import type { ReactNode } from "react";
import { API_BASE, api, ApiError, type BackendMigrationJob } from "@/lib/api";
import {
  mapFileTransfer,
  mapJobStatus,
  mapLogEntry,
  toBackendDuplicateStrategy,
} from "@/lib/api-mappers";
import { getProviderDisplay } from "@/lib/providers-config";
import type {
  ActivityLogEntry,
  CloudProviderMeta,
  ConnectionState,
  DuplicateStrategy,
  FileTransferItem,
  MigrationStatus,
  ProviderId,
  ProviderRole,
  SelectedFolder,
} from "@/types";

const POLL_INTERVAL_MS = 1500;
const POLL_RETRY_MS = 3000;
const TERMINAL_STATUSES: MigrationStatus[] = [
  "completed",
  "completed_with_errors",
  "failed",
  "cancelled",
];

interface MigrationContextValue {
  providers: CloudProviderMeta[];
  providersLoading: boolean;
  providersError: string | null;
  reloadProviders: () => void;
  getProviderMeta: (id: ProviderId) => CloudProviderMeta | undefined;

  sourceProviderId: ProviderId;
  destProviderId: ProviderId;
  sourceConnection: ConnectionState;
  destConnection: ConnectionState;
  sourceFolder: SelectedFolder | null;
  destFolder: SelectedFolder | null;
  duplicateStrategy: DuplicateStrategy;
  status: MigrationStatus;
  files: FileTransferItem[];
  logs: ActivityLogEntry[];
  totalBytes: number;
  transferredBytes: number;
  startedAt: string | null;
  startError: string | null;

  setSourceProviderId: (id: ProviderId) => void;
  setDestProviderId: (id: ProviderId) => void;
  connect: (role: ProviderRole, credentials?: unknown) => Promise<void>;
  /** Opens the selected provider's real OAuth consent popup and resolves the connection once it reports back. */
  connectOAuth: (role: ProviderRole) => void;
  disconnect: (role: ProviderRole) => Promise<void>;
  setSourceFolder: (folder: SelectedFolder | null) => void;
  setDestFolder: (folder: SelectedFolder | null) => void;
  setDuplicateStrategy: (strategy: DuplicateStrategy) => void;
  canStart: boolean;
  /** Returns true once the job is created, so callers can decide whether to navigate. */
  startMigration: () => Promise<boolean>;
  resetMigration: () => void;
  resolveConflict: (fileId: string, action: "skip" | "replace" | "rename") => Promise<void>;
  cancelMigration: () => Promise<void>;
  retryMigration: () => Promise<void>;
}

const MigrationContext = createContext<MigrationContextValue | undefined>(undefined);

function idleConnection(): ConnectionState {
  return { id: null, status: "disconnected" };
}

export function MigrationProvider({ children }: { children: ReactNode }) {
  const [providers, setProviders] = useState<CloudProviderMeta[]>([]);
  const [sourceProviderId, setSourceProviderIdState] = useState<ProviderId>("MEGA");
  const [destProviderId, setDestProviderIdState] = useState<ProviderId>("GOOGLE_DRIVE");
  const [sourceConnection, setSourceConnection] = useState<ConnectionState>(idleConnection);
  const [destConnection, setDestConnection] = useState<ConnectionState>(idleConnection);
  const [sourceFolder, setSourceFolder] = useState<SelectedFolder | null>(null);
  const [destFolder, setDestFolder] = useState<SelectedFolder | null>(null);
  const [duplicateStrategy, setDuplicateStrategy] = useState<DuplicateStrategy>("skip");

  const [migrationId, setMigrationId] = useState<string | null>(null);
  const [job, setJob] = useState<BackendMigrationJob | null>(null);
  const [files, setFiles] = useState<FileTransferItem[]>([]);
  const [logs, setLogs] = useState<ActivityLogEntry[]>([]);
  const [startError, setStartError] = useState<string | null>(null);
  const [providersLoading, setProvidersLoading] = useState(true);
  const [providersError, setProvidersError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const reloadProviders = useCallback(() => setReloadToken((n) => n + 1), []);

  // Real provider catalog, loaded from the backend — availability, names,
  // and roles all come from here, not a hardcoded list. If this fails
  // (backend down, CORS misconfigured, ...) that's surfaced via
  // providersError instead of leaving the dropdowns silently empty.
  useEffect(() => {
    let cancelled = false;
    setProvidersLoading(true);
    setProvidersError(null);
    api
      .listProviders()
      .then((list) => {
        if (cancelled) return;
        setProviders(
          list.map((p) => {
            const display = getProviderDisplay(p.id);
            return {
              id: p.id,
              name: p.name,
              shortName: display.shortName,
              accentClass: display.accentClass,
              roles: p.roles,
              available: p.available,
              authMethod: display.authMethod,
            };
          })
        );
      })
      .catch((err) => {
        console.error("Failed to load providers:", err);
        if (cancelled) return;
        setProviders([]);
        setProvidersError(
          err instanceof ApiError ? err.message : "Failed to load cloud providers."
        );
      })
      .finally(() => {
        if (!cancelled) setProvidersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  const getProviderMeta = useCallback(
    (id: ProviderId) => providers.find((p) => p.id === id),
    [providers]
  );

  const setSourceProviderId = useCallback((id: ProviderId) => {
    setSourceProviderIdState(id);
    setSourceConnection(idleConnection());
    setSourceFolder(null);
  }, []);

  const setDestProviderId = useCallback((id: ProviderId) => {
    setDestProviderIdState(id);
    setDestConnection(idleConnection());
    setDestFolder(null);
  }, []);

  const connect = useCallback(
    async (role: ProviderRole, credentials?: unknown) => {
      const providerId = role === "source" ? sourceProviderId : destProviderId;
      const setConn = role === "source" ? setSourceConnection : setDestConnection;
      const meta = getProviderMeta(providerId);

      setConn({ id: null, status: "connecting" });
      try {
        const created = await api.createConnection({
          provider: providerId,
          label: `My ${meta?.name ?? providerId}`,
          credentials,
        });
        const tested = await api.testConnection(created.id);
        if (tested.status === "VALID") {
          setConn({ id: tested.id, status: "connected", account: tested.account });
        } else {
          setConn({
            id: tested.id,
            status: "error",
            error: "The connection could not be verified.",
          });
        }
      } catch (err) {
        setConn({
          id: null,
          status: "error",
          error: err instanceof ApiError ? err.message : "Failed to connect.",
        });
      }
    },
    [sourceProviderId, destProviderId, getProviderMeta]
  );

  const connectOAuth = useCallback((role: ProviderRole) => {
    const providerId = role === "source" ? sourceProviderId : destProviderId;
    const setConn = role === "source" ? setSourceConnection : setDestConnection;
    const oauthSlug = getProviderDisplay(providerId).oauthSlug;

    if (!oauthSlug) {
      setConn({
        id: null,
        status: "error",
        error: `${getProviderMeta(providerId)?.name ?? providerId} doesn't support sign-in yet.`,
      });
      return;
    }

    setConn({ id: null, status: "connecting" });

    // Generated here (not by the backend) so the dashboard has something
    // to poll /connections/oauth/result/:state with as soon as the popup
    // opens — the backend just uses whatever it's given as the OAuth
    // `state` value, and echoes results back keyed by it. This is the
    // completion channel: it's a plain HTTP poll against the backend we
    // already talk to for everything else, so it has no dependency on
    // window.opener or the popup ending up strictly same-origin with this
    // tab, unlike postMessage/localStorage (both of which broke in
    // practice once the popup went through a real cross-origin redirect
    // chain to the provider's consent screen and back).
    const state = crypto.randomUUID();

    const popup = window.open(
      `${API_BASE}/connections/oauth/${oauthSlug}/start?role=${role}&state=${state}`,
      `cloudbridge-oauth-${role}`,
      "width=520,height=650"
    );

    if (!popup) {
      setConn({
        id: null,
        status: "error",
        error: "The sign-in popup was blocked — allow popups for this site and try again.",
      });
      return;
    }

    let settled = false;

    const removeFocusListeners = () => {
      document.removeEventListener("visibilitychange", handleFocusRegained);
      window.removeEventListener("focus", handleFocusRegained);
    };

    // Shared teardown for both ways this ever ends: a definitive backend
    // result, or the overall timeout below. The popup closing is not one of
    // these — it's not a reliable signal that the flow is done, only the
    // backend's own recorded result (or giving up after OVERALL_TIMEOUT_MS)
    // is.
    const finish = () => {
      clearInterval(poll);
      clearTimeout(timeoutId);
      removeFocusListeners();
    };

    const applyResult = (data: {
      success: boolean;
      role?: "source" | "destination";
      connectionId?: string;
      account?: string;
      message?: string;
    }) => {
      if (data.role && data.role !== role) return;

      settled = true;
      finish();

      if (data.success && data.connectionId) {
        setConn({ id: data.connectionId, status: "connected", account: data.account });
      } else {
        setConn({ id: null, status: "error", error: data.message ?? "Sign-in failed." });
      }
    };

    // The dashboard tab is backgrounded for the whole time the user is on
    // the popup/Google's consent screen, and browsers throttle setInterval
    // heavily in backgrounded tabs — so the 1000ms poll below can end up
    // firing far less often than that while the tab isn't focused, which is
    // exactly the window in which the backend actually finishes the OAuth
    // callback. Polling once immediately as soon as the tab regains
    // focus/visibility (i.e. right as the user comes back from the popup)
    // catches the result promptly regardless of how throttled the interval
    // was in the meantime — this supplements the interval, it doesn't
    // replace it.
    const pollNow = (reason: string) => {
      if (settled) return;
      console.log(`[OAuth] Polling immediately — reason: ${reason}`);
      api
        .pollOAuthResult(state)
        .then((result) => {
          if (settled) return;
          if (!result.pending) applyResult(result);
        })
        .catch((err) => {
          console.error("Failed to poll OAuth result:", err);
        });
    };

    function handleFocusRegained() {
      if (document.visibilityState === "hidden") return;
      pollNow(`visibility/focus regained (visibilityState=${document.visibilityState})`);
    }

    document.addEventListener("visibilitychange", handleFocusRegained);
    window.addEventListener("focus", handleFocusRegained);

    // Polls the backend every second for this state token's result. The
    // popup closing is deliberately NOT a stop condition here — only a
    // definitive backend result, or the overall timeout below, ends this.
    const poll = window.setInterval(() => {
      pollNow("interval tick");
    }, 1000);

    // Backstop for a flow that never completes (user abandons it, closes
    // the popup without finishing, etc.) — without this, polling would run
    // forever if the backend never records a result for this state.
    const OVERALL_TIMEOUT_MS = 60_000;
    const timeoutId = window.setTimeout(() => {
      if (settled) return;
      finish();
      setConn({ id: null, status: "error", error: "Sign-in timed out — please try again." });
    }, OVERALL_TIMEOUT_MS);
  }, [sourceProviderId, destProviderId, getProviderMeta]);

  const disconnect = useCallback(async (role: ProviderRole) => {
    const conn = role === "source" ? sourceConnection : destConnection;
    const setConn = role === "source" ? setSourceConnection : setDestConnection;
    const setFolder = role === "source" ? setSourceFolder : setDestFolder;

    if (conn.id) {
      try {
        await api.deleteConnection(conn.id);
      } catch {
        // Best-effort — still reset local state even if the delete failed.
      }
    }
    setConn(idleConnection());
    setFolder(null);
  }, [sourceConnection, destConnection]);

  const startMigration = useCallback(async (): Promise<boolean> => {
    if (!sourceConnection.id || !destConnection.id || !sourceFolder || !destFolder) return false;
    setStartError(null);
    try {
      const created = await api.createMigration({
        sourceId: sourceConnection.id,
        destinationId: destConnection.id,
        sourceRootPath: sourceFolder.id,
        destRootFolderId: destFolder.id,
        duplicateStrategy: toBackendDuplicateStrategy(duplicateStrategy),
      });
      setFiles([]);
      setLogs([]);
      setJob(created);
      setMigrationId(created.id);
      return true;
    } catch (err) {
      setStartError(err instanceof ApiError ? err.message : "Failed to start the migration.");
      return false;
    }
  }, [sourceConnection.id, destConnection.id, sourceFolder, destFolder, duplicateStrategy]);

  const resetMigration = useCallback(() => {
    setMigrationId(null);
    setJob(null);
    setFiles([]);
    setLogs([]);
    setStartError(null);
  }, []);

  const resolveConflict = useCallback(
    async (fileId: string, action: "skip" | "replace" | "rename") => {
      if (!migrationId) return;
      const backendAction = action === "skip" ? "SKIP" : action === "replace" ? "OVERWRITE" : "RENAME";
      try {
        await api.resolveConflict(migrationId, fileId, { action: backendAction });
      } catch (err) {
        console.error("Failed to resolve conflict:", err);
      }
    },
    [migrationId]
  );

  const cancelMigration = useCallback(async () => {
    if (!migrationId) return;
    try {
      const updated = await api.cancelMigration(migrationId);
      setJob(updated);
    } catch (err) {
      console.error("Failed to cancel migration:", err);
    }
  }, [migrationId]);

  const retryMigration = useCallback(async () => {
    if (!migrationId) return;
    try {
      const updated = await api.retryMigration(migrationId);
      setJob(updated);
    } catch (err) {
      console.error("Failed to retry migration:", err);
    }
  }, [migrationId]);

  // Self-scheduling poll loop — real-time progress driven entirely by
  // backend state, not a client-side simulation. Stops once the job
  // reaches a terminal status; backs off a little on transient fetch
  // errors instead of hammering the API.
  useEffect(() => {
    if (!migrationId) return;
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      try {
        const [jobRes, filesRes, logsRes] = await Promise.all([
          api.getMigration(migrationId),
          api.listMigrationFiles(migrationId),
          api.listMigrationLogs(migrationId),
        ]);
        if (cancelled) return;
        setJob(jobRes);
        setFiles(filesRes.map(mapFileTransfer));
        setLogs(logsRes.map(mapLogEntry));

        if (!TERMINAL_STATUSES.includes(mapJobStatus(jobRes.status))) {
          timeoutId = setTimeout(tick, POLL_INTERVAL_MS);
        }
      } catch (err) {
        console.error("Failed to poll migration status:", err);
        if (!cancelled) timeoutId = setTimeout(tick, POLL_RETRY_MS);
      }
    };

    tick();
    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [migrationId]);

  const status: MigrationStatus = job ? mapJobStatus(job.status) : "idle";
  const totalBytes = job?.totalBytes ?? 0;
  const transferredBytes = job?.transferredBytes ?? 0;
  const startedAt = job?.startedAt ?? null;

  const canStart =
    sourceConnection.status === "connected" &&
    destConnection.status === "connected" &&
    !!sourceFolder &&
    !!destFolder &&
    (status === "idle" || TERMINAL_STATUSES.includes(status));

  const value: MigrationContextValue = {
    providers,
    providersLoading,
    providersError,
    reloadProviders,
    getProviderMeta,
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
    startError,
    setSourceProviderId,
    setDestProviderId,
    connect,
    connectOAuth,
    disconnect,
    setSourceFolder,
    setDestFolder,
    setDuplicateStrategy,
    canStart,
    startMigration,
    resetMigration,
    resolveConflict,
    cancelMigration,
    retryMigration,
  };

  return <MigrationContext.Provider value={value}>{children}</MigrationContext.Provider>;
}

export function useMigration() {
  const ctx = useContext(MigrationContext);
  if (!ctx) throw new Error("useMigration must be used within MigrationProvider");
  return ctx;
}
