import { useEffect, useState } from "react";
import { AlertCircle, Check, Globe, Loader2, LogIn, LogOut, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getProviderDisplay } from "@/lib/providers-config";
import { cn } from "@/lib/utils";
import type { CloudProviderMeta, ConnectionState, ProviderId, ProviderRole, SelectedFolder } from "@/types";
import { FolderPickerDialog } from "@/components/dashboard/folder-picker-dialog";

interface CloudConnectionCardProps {
  role: ProviderRole;
  providerId: ProviderId;
  providers: CloudProviderMeta[];
  onProviderChange: (id: ProviderId) => void;
  connection: ConnectionState;
  onConnect: (credentials?: unknown) => void;
  onConnectOAuth: () => void;
  onDisconnect: () => void;
  folder: SelectedFolder | null;
  onFolderChange: (folder: SelectedFolder) => void;
}

export function CloudConnectionCard({
  role,
  providerId,
  providers,
  onProviderChange,
  connection,
  onConnect,
  onConnectOAuth,
  onDisconnect,
  folder,
  onFolderChange,
}: CloudConnectionCardProps) {
  const options = providers.filter((p) => p.roles.includes(role));
  const selected = providers.find((p) => p.id === providerId);
  // Falls back to display-only metadata (name/shortName/authMethod) while
  // the real provider list is still loading or failed to load, so buttons
  // read "Connect Drive" instead of the raw enum value "Connect GOOGLE_DRIVE".
  const display = getProviderDisplay(providerId);
  const displayShortName = selected?.shortName ?? display.shortName;
  const authMethod = selected?.authMethod ?? display.authMethod;
  const credentialFields = display.credentialFields ?? [];
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});

  // Different providers collect different fields (or none at all, for
  // OAuth) — clear whatever was typed for the previous selection instead
  // of silently carrying it over.
  useEffect(() => {
    setFieldValues({});
  }, [providerId]);

  const isIdle = connection.status !== "connected" && connection.status !== "connecting";
  const needsCredentialForm = authMethod === "credentials" && isIdle;
  const needsOAuthButton = authMethod === "oauth" && isIdle;

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
      ) : connection.status === "connecting" ? (
        <Button variant="outline" className="w-full" disabled>
          <Loader2 className="h-4 w-4 animate-spin" />
          {authMethod === "oauth" ? "Waiting for sign-in…" : "Connecting…"}
        </Button>
      ) : needsCredentialForm ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            onConnect(fieldValues);
          }}
        >
          {credentialFields.map((field) => (
            <Input
              key={field.key}
              type={field.type}
              placeholder={field.label}
              required
              value={fieldValues[field.key] ?? ""}
              onChange={(e) =>
                setFieldValues((values) => ({ ...values, [field.key]: e.target.value }))
              }
              autoComplete={field.autoComplete}
            />
          ))}
          <Button type="submit" variant="outline" className="w-full" disabled={!selected?.available}>
            <LogIn className="h-4 w-4" />
            Connect {displayShortName}
          </Button>
        </form>
      ) : needsOAuthButton ? (
        <Button
          variant="outline"
          className="w-full"
          onClick={onConnectOAuth}
          disabled={!selected?.available}
        >
          <Globe className="h-4 w-4" />
          Sign in with {displayShortName}
        </Button>
      ) : (
        <Button
          variant="outline"
          className="w-full"
          onClick={() => onConnect()}
          disabled={!selected?.available}
        >
          <LogIn className="h-4 w-4" />
          Connect {displayShortName}
        </Button>
      )}

      {connection.status === "error" && connection.error && (
        <p className="flex items-start gap-1.5 text-xs text-destructive">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {connection.error}
        </p>
      )}

      <FolderPickerDialog
        role={role}
        providerName={selected?.name ?? displayShortName}
        connectionId={connection.id}
        disabled={connection.status !== "connected"}
        selected={folder}
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
