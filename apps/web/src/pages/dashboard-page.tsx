import { useNavigate } from "react-router-dom";
import { PlayCircle, RotateCcw } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { StatsRow } from "@/components/dashboard/stats-row";
import { CloudConnectionCard } from "@/components/dashboard/cloud-connection-card";
import { DuplicateOptions } from "@/components/dashboard/duplicate-options";
import { TransferProgressCard } from "@/components/dashboard/transfer-progress-card";
import { ActivityLog } from "@/components/dashboard/activity-log";
import { useMigration } from "@/context/migration-context";

export function DashboardPage() {
  const navigate = useNavigate();
  const m = useMigration();

  const handleStart = () => {
    m.startMigration();
    navigate("/progress");
  };

  return (
    <AppShell title="Dashboard" subtitle="Manage your cloud-to-cloud migrations">
      <div className="flex flex-col gap-6">
        <StatsRow />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="flex flex-col gap-6 lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>New Migration</CardTitle>
                <CardDescription>
                  Connect a source and destination, choose how to handle duplicates, then start.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-6">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <CloudConnectionCard
                    role="source"
                    providerId={m.sourceProviderId}
                    onProviderChange={m.setSourceProviderId}
                    connection={m.sourceConnection}
                    onConnect={() => m.connect("source")}
                    onDisconnect={() => m.disconnect("source")}
                    folder={m.sourceFolder}
                    onFolderChange={m.setSourceFolder}
                  />
                  <CloudConnectionCard
                    role="destination"
                    providerId={m.destProviderId}
                    onProviderChange={m.setDestProviderId}
                    connection={m.destConnection}
                    onConnect={() => m.connect("destination")}
                    onDisconnect={() => m.disconnect("destination")}
                    folder={m.destFolder}
                    onFolderChange={m.setDestFolder}
                  />
                </div>

                <div>
                  <p className="mb-2 text-sm font-medium">Duplicate handling</p>
                  <DuplicateOptions
                    value={m.duplicateStrategy}
                    onChange={m.setDuplicateStrategy}
                  />
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Button
                    size="lg"
                    className="w-full sm:w-auto"
                    disabled={!m.canStart}
                    onClick={handleStart}
                  >
                    <PlayCircle className="h-4 w-4" />
                    Start Migration
                  </Button>
                  {m.status !== "idle" && (
                    <Button variant="ghost" onClick={m.resetMigration} className="w-full sm:w-auto">
                      <RotateCcw className="h-4 w-4" />
                      Reset
                    </Button>
                  )}
                  {!m.canStart && m.status === "idle" && (
                    <p className="text-xs text-muted-foreground">
                      Connect both accounts and pick folders to enable this.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-col gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Transfer Progress</CardTitle>
              </CardHeader>
              <CardContent>
                <TransferProgressCard />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Activity Logs</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="max-h-80 overflow-y-auto scrollbar-thin">
                  <ActivityLog entries={m.logs.slice(0, 12)} />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
