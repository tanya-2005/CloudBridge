import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Inbox } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProgressOverview } from "@/components/progress/progress-overview";
import { FileTransferTable } from "@/components/progress/file-transfer-table";
import { ActivityLog } from "@/components/dashboard/activity-log";
import { useMigration } from "@/context/migration-context";
import type { FileStatus } from "@/types";

const FILTERS: { id: FileStatus | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "transferring", label: "Transferring" },
  { id: "done", label: "Done" },
  { id: "pending", label: "Pending" },
  { id: "conflict", label: "Conflicts" },
  { id: "failed", label: "Failed" },
  { id: "skipped", label: "Skipped" },
];

export function ProgressPage() {
  const m = useMigration();
  const [filter, setFilter] = useState<FileStatus | "all">("all");

  const filteredFiles = useMemo(
    () => (filter === "all" ? m.files : m.files.filter((f) => f.status === filter)),
    [m.files, filter]
  );

  const conflictCount = m.files.filter((f) => f.status === "conflict").length;

  if (m.status === "idle" && m.files.length === 0) {
    return (
      <AppShell title="Progress" subtitle="Live status of your migrations">
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Inbox className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="font-medium">No active migration</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Start a migration from the dashboard or the transfer wizard to see live progress here.
            </p>
            <div className="mt-2 flex gap-2">
              <Button asChild variant="outline">
                <Link to="/dashboard">Go to Dashboard</Link>
              </Button>
              <Button asChild>
                <Link to="/transfer">
                  New Transfer <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell title="Progress" subtitle="Live status of your migration">
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Overview</CardTitle>
          </CardHeader>
          <CardContent>
            <ProgressOverview
              status={m.status}
              files={m.files}
              totalBytes={m.totalBytes}
              transferredBytes={m.transferredBytes}
              startedAt={m.startedAt}
            />
          </CardContent>
        </Card>

        {conflictCount > 0 && (
          <div className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning">
            {conflictCount} file{conflictCount > 1 ? "s" : ""} waiting on your decision — resolve
            them in the table below to continue.
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Files</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs value={filter} onValueChange={(v) => setFilter(v as FileStatus | "all")}>
              <TabsList className="flex-wrap">
                {FILTERS.map((f) => (
                  <TabsTrigger key={f.id} value={f.id}>
                    {f.label}
                  </TabsTrigger>
                ))}
              </TabsList>
              <TabsContent value={filter}>
                <FileTransferTable files={filteredFiles} onResolveConflict={m.resolveConflict} />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Activity Logs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-h-96 overflow-y-auto scrollbar-thin">
              <ActivityLog entries={m.logs} />
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
