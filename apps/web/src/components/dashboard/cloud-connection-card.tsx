import { Check, Loader2, LogIn, LogOut, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CLOUD_PROVIDERS } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import type { ConnectionState, ProviderId, ProviderRole } from "@/types";
import { FolderPickerDialog } from "@/components/dashboard/folder-picker-dialog";

interface CloudConnectionCardProps {
  role: ProviderRole;
  providerId: ProviderId;
  onProviderChange: (id: ProviderId) => void;
  connection: ConnectionState;
  onConnect: () => void;
  onDisconnect: () => void;
  folder: string | null;
  onFolderChange: (path: string) => void;
}

export function CloudConnectionCard({
  role,
  providerId,
  onProviderChange,
  connection,
  onConnect,
  onDisconnect,
  folder,
  onFolderChange,
}: CloudConnectionCardProps) {
  const options = CLOUD_PROVIDERS.filter((p) => p.roles.includes(role));

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {role === "source" ? "Source" : "Destination"}
        </span>
        <StatusBadge status={connection.status} />
      </div>

      <Select value={providerId} onValueChange={(v) => onProviderChange(v as ProviderId)}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((p) => (
            <SelectItem key={p.id} value={p.id} disabled={!p.available}>
              <span className="flex items-center gap-2">
                {p.name}
                {!p.available && (
                  <span className="text-[10px] uppercase text-muted-foreground">
                    soon
                  </span>
                )}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {connection.status === "connected" ? (
        <div className="flex items-center justify-between rounded-md bg-success/10 px-3 py-2 text-sm text-success">
          <span className="flex items-center gap-2 truncate">
            <Check className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{connection.account}</span>
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-success hover:text-success"
            onClick={onDisconnect}
          >
            <LogOut className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : (
        <Button
          variant="outline"
          className="w-full"
          onClick={onConnect}
          disabled={connection.status === "connecting"}
        >
          {connection.status === "connecting" ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Connecting…
            </>
          ) : (
            <>
              <LogIn className="h-4 w-4" />
              Connect {CLOUD_PROVIDERS.find((p) => p.id === providerId)?.shortName}
            </>
          )}
        </Button>
      )}

      <FolderPickerDialog
        role={role}
        disabled={connection.status !== "connected"}
        selectedPath={folder}
        onSelect={onFolderChange}
      />
    </div>
  );
}

function StatusBadge({ status }: { status: ConnectionState["status"] }) {
  if (status === "connected") {
    return (
      <Badge variant="success">
        <ShieldCheck className="h-3 w-3" /> Connected
      </Badge>
    );
  }
  if (status === "connecting") {
    return (
      <Badge variant="warning">
        <Loader2 className="h-3 w-3 animate-spin" /> Connecting
      </Badge>
    );
  }
  return (
    <Badge variant="muted" className={cn(status === "error" && "bg-destructive/10 text-destructive")}>
      {status === "error" ? "Error" : "Not connected"}
    </Badge>
  );
}
