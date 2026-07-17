import { Link } from "react-router-dom";
import { ArrowUpRight, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useMigration } from "@/context/migration-context";
import { formatBytes } from "@/lib/utils";

export function TransferProgressCard() {
  const { status, files, totalBytes, transferredBytes } = useMigration();

  const percent = totalBytes > 0 ? Math.round((transferredBytes / totalBytes) * 100) : 0;
  const filesDone = files.filter((f) => f.status === "done").length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <StatusChip status={status} />
        {status !== "idle" && (
          <Button asChild variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs">
            <Link to="/progress">
              Details <ArrowUpRight className="h-3 w-3" />
            </Link>
          </Button>
        )}
      </div>

      {status === "idle" ? (
        <p className="text-sm text-muted-foreground">
          No migration running. Configure a source and destination, then start one below.
        </p>
      ) : (
        <>
          <div className="space-y-2">
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-medium">{percent}%</span>
              <span className="text-muted-foreground">
                {formatBytes(transferredBytes)} / {formatBytes(totalBytes)}
              </span>
            </div>
            <Progress value={percent} />
          </div>
          <p className="text-xs text-muted-foreground">
            {filesDone} of {files.length} files complete
          </p>
        </>
      )}
    </div>
  );
}

function StatusChip({ status }: { status: string }) {
  if (status === "running") {
    return (
      <Badge variant="warning">
        <Loader2 className="h-3 w-3 animate-spin" /> Running
      </Badge>
    );
  }
  if (status === "completed") return <Badge variant="success">Completed</Badge>;
  if (status === "failed") return <Badge variant="destructive">Failed</Badge>;
  return <Badge variant="muted">Idle</Badge>;
}
