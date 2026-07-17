import { useNavigate } from "react-router-dom";
import type { ReactNode } from "react";
import { CheckCircle2, PlayCircle } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CloudConnectionCard } from "@/components/dashboard/cloud-connection-card";
import { DuplicateOptions } from "@/components/dashboard/duplicate-options";
import { useMigration } from "@/context/migration-context";
import {
  DUPLICATE_OPTIONS,
  MOCK_SOURCE_TREE,
  findNodeByPath,
  getProvider,
  summarizeNode,
} from "@/lib/mock-data";
import { cn, formatBytes } from "@/lib/utils";

function StepSection({
  step,
  title,
  description,
  done,
  children,
}: {
  step: number;
  title: string;
  description: string;
  done?: boolean;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
              done ? "bg-success/15 text-success" : "bg-primary/10 text-primary"
            )}
          >
            {done ? <CheckCircle2 className="h-4 w-4" /> : step}
          </span>
          <div>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function TransferPage() {
  const navigate = useNavigate();
  const m = useMigration();

  const connectDone =
    m.sourceConnection.status === "connected" && m.destConnection.status === "connected";
  const foldersDone = !!m.sourceFolder && !!m.destFolder;

  const sourceNode = m.sourceFolder ? findNodeByPath(MOCK_SOURCE_TREE, m.sourceFolder) : null;
  const estimate = sourceNode ? summarizeNode(sourceNode) : null;
  const strategyLabel = DUPLICATE_OPTIONS.find((d) => d.id === m.duplicateStrategy)?.label;

  const handleStart = () => {
    m.startMigration();
    navigate("/progress");
  };

  return (
    <AppShell title="Transfer" subtitle="Set up a new migration step by step">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <StepSection
          step={1}
          title="Connect your accounts"
          description="Sign in to a source and destination cloud provider."
          done={connectDone}
        >
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
        </StepSection>

        <StepSection
          step={2}
          title="Duplicate handling"
          description="Choose what happens when a file already exists at the destination."
          done={m.status !== "idle"}
        >
          <DuplicateOptions value={m.duplicateStrategy} onChange={m.setDuplicateStrategy} />
        </StepSection>

        <StepSection
          step={3}
          title="Review & start"
          description="Double-check your setup before kicking off the migration."
        >
          <div className="flex flex-col gap-4">
            <dl className="grid grid-cols-1 gap-3 rounded-lg border border-border p-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted-foreground">Source</dt>
                <dd className="text-sm font-medium">
                  {getProvider(m.sourceProviderId).name}
                  {m.sourceFolder && (
                    <span className="block truncate text-xs font-normal text-muted-foreground">
                      {m.sourceFolder}
                    </span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Destination</dt>
                <dd className="text-sm font-medium">
                  {getProvider(m.destProviderId).name}
                  {m.destFolder && (
                    <span className="block truncate text-xs font-normal text-muted-foreground">
                      {m.destFolder}
                    </span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Duplicate strategy</dt>
                <dd className="text-sm font-medium">
                  <Badge variant="secondary">{strategyLabel}</Badge>
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Estimated scope</dt>
                <dd className="text-sm font-medium">
                  {estimate
                    ? `${estimate.fileCount} files · ${formatBytes(estimate.totalBytes)}`
                    : "Select a source folder to estimate"}
                </dd>
              </div>
            </dl>

            <Button size="lg" disabled={!m.canStart} onClick={handleStart} className="self-start">
              <PlayCircle className="h-4 w-4" />
              Start Migration
            </Button>
            {!connectDone && (
              <p className="text-xs text-muted-foreground">
                Connect both accounts to continue.
              </p>
            )}
            {connectDone && !foldersDone && (
              <p className="text-xs text-muted-foreground">
                Select a source and destination folder to continue.
              </p>
            )}
          </div>
        </StepSection>
      </div>
    </AppShell>
  );
}
