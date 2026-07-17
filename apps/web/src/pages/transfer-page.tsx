import { useNavigate } from "react-router-dom";
import type { ReactNode } from "react";
import { AlertCircle, CheckCircle2, PlayCircle } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CloudConnectionCard } from "@/components/dashboard/cloud-connection-card";
import { DuplicateOptions } from "@/components/dashboard/duplicate-options";
import { ProvidersErrorBanner } from "@/components/dashboard/providers-error-banner";
import { useMigration } from "@/context/migration-context";
import { DUPLICATE_OPTIONS } from "@/lib/duplicate-options";
import { cn } from "@/lib/utils";

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
  const strategyLabel = DUPLICATE_OPTIONS.find((d) => d.id === m.duplicateStrategy)?.label;

  const handleStart = async () => {
    const started = await m.startMigration();
    if (started) navigate("/progress");
  };

  return (
    <AppShell title="Transfer" subtitle="Set up a new migration step by step">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        {m.providersError && (
          <ProvidersErrorBanner message={m.providersError} onRetry={m.reloadProviders} />
        )}

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
              providers={m.providers}
              onProviderChange={m.setSourceProviderId}
              connection={m.sourceConnection}
              onConnect={(credentials) => m.connect("source", credentials)}
              onConnectOAuth={() => m.connectOAuth("source")}
              onDisconnect={() => m.disconnect("source")}
              folder={m.sourceFolder}
              onFolderChange={m.setSourceFolder}
            />
            <CloudConnectionCard
              role="destination"
              providerId={m.destProviderId}
              providers={m.providers}
              onProviderChange={m.setDestProviderId}
              connection={m.destConnection}
              onConnect={(credentials) => m.connect("destination", credentials)}
              onConnectOAuth={() => m.connectOAuth("destination")}
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
                  {m.getProviderMeta(m.sourceProviderId)?.name ?? m.sourceProviderId}
                  {m.sourceFolder && (
                    <span className="block truncate text-xs font-normal text-muted-foreground">
                      {m.sourceFolder.label}
                    </span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Destination</dt>
                <dd className="text-sm font-medium">
                  {m.getProviderMeta(m.destProviderId)?.name ?? m.destProviderId}
                  {m.destFolder && (
                    <span className="block truncate text-xs font-normal text-muted-foreground">
                      {m.destFolder.label}
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
            </dl>

            <Button size="lg" disabled={!m.canStart} onClick={handleStart} className="self-start">
              <PlayCircle className="h-4 w-4" />
              Start Migration
            </Button>
            {m.startError && (
              <p className="flex items-start gap-1.5 text-xs text-destructive">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {m.startError}
              </p>
            )}
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
