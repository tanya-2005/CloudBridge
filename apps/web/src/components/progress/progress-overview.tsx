import { useEffect, useState } from "react";
import { Gauge, HardDriveUpload, ListChecks, RotateCcw, TimerReset, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { formatBytes } from "@/lib/utils";
import type { FileTransferItem, MigrationStatus } from "@/types";

const ACTIVE_STATUSES: MigrationStatus[] = ["pending", "planning", "running"];

interface ProgressOverviewProps {
  status: MigrationStatus;
  files: FileTransferItem[];
  totalBytes: number;
  transferredBytes: number;
  startedAt: string | null;
  onCancel?: () => void;
  onRetry?: () => void;
}

export function ProgressOverview({
  status,
  files,
  totalBytes,
  transferredBytes,
  startedAt,
  onCancel,
  onRetry,
}: ProgressOverviewProps) {
  // Re-render every second while active so speed/ETA stay live.
  const [, forceTick] = useState(0);
  const isActive = ACTIVE_STATUSES.includes(status);
  useEffect(() => {
    if (!isActive) return;
    const id = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [isActive]);

  const percent = totalBytes > 0 ? Math.round((transferredBytes / totalBytes) * 100) : 0;
  const done = files.filter((f) => f.status === "done").length;
  const failed = files.filter((f) => f.status === "failed").length;
  const skipped = files.filter((f) => f.status === "skipped").length;

  const elapsedSec = startedAt ? Math.max(1, (Date.now() - new Date(startedAt).getTime()) / 1000) : 0;
  const speedBps = elapsedSec > 0 ? transferredBytes / elapsedSec : 0;
  const remaining = Math.max(0, totalBytes - transferredBytes);
  const etaSec = speedBps > 0 ? remaining / speedBps : 0;

  const canRetry = status === "failed" || status === "completed_with_errors";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <StatusBadge status={status} />
          <span className="text-sm text-muted-foreground">
            {files.length} files &middot; {formatBytes(totalBytes)} total
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-2xl font-semibold tracking-tight">{percent}%</span>
          {isActive && onCancel && (
            <Button variant="outline" size="sm" onClick={onCancel}>
              <XCircle className="h-3.5 w-3.5" />
              Cancel
            </Button>
          )}
          {canRetry && onRetry && (
            <Button variant="outline" size="sm" onClick={onRetry}>
              <RotateCcw className="h-3.5 w-3.5" />
              Retry failed
            </Button>
          )}
        </div>
      </div>

      <Progress value={percent} className="h-2.5" />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat icon={ListChecks} label="Completed" value={`${done}/${files.length}`} />
        <Stat
          icon={HardDriveUpload}
          label="Transferred"
          value={`${formatBytes(transferredBytes)}`}
        />
        <Stat
          icon={Gauge}
          label="Speed"
          value={isActive ? `${formatBytes(speedBps)}/s` : "—"}
        />
        <Stat
          icon={TimerReset}
          label="ETA"
          value={isActive && etaSec > 0 ? formatEta(etaSec) : "—"}
        />
      </div>

      {(failed > 0 || skipped > 0) && (
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          {failed > 0 && <span>{failed} failed</span>}
          {skipped > 0 && <span>{skipped} skipped</span>}
        </div>
      )}
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Gauge;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <p className="mt-1 text-lg font-semibold tracking-tight">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: MigrationStatus }) {
  if (status === "pending") return <Badge variant="warning">Pending</Badge>;
  if (status === "planning") return <Badge variant="warning">Planning</Badge>;
  if (status === "running") return <Badge variant="warning">Running</Badge>;
  if (status === "completed") return <Badge variant="success">Completed</Badge>;
  if (status === "completed_with_errors") return <Badge variant="warning">Completed with errors</Badge>;
  if (status === "failed") return <Badge variant="destructive">Failed</Badge>;
  if (status === "cancelled") return <Badge variant="muted">Cancelled</Badge>;
  return <Badge variant="muted">Idle</Badge>;
}

function formatEta(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const min = Math.floor(seconds / 60);
  const sec = Math.round(seconds % 60);
  return `${min}m ${sec}s`;
}
