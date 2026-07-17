import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { formatTime } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { ActivityLogEntry, LogLevel } from "@/types";

const LEVEL_CONFIG: Record<LogLevel, { icon: typeof Info; className: string }> = {
  info: { icon: Info, className: "text-muted-foreground" },
  success: { icon: CheckCircle2, className: "text-success" },
  warning: { icon: AlertTriangle, className: "text-warning" },
  error: { icon: XCircle, className: "text-destructive" },
};

interface ActivityLogProps {
  entries: ActivityLogEntry[];
  emptyLabel?: string;
  className?: string;
}

export function ActivityLog({ entries, emptyLabel = "No activity yet.", className }: ActivityLogProps) {
  if (entries.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">{emptyLabel}</p>
    );
  }

  return (
    <ul className={cn("flex flex-col divide-y divide-border", className)}>
      {entries.map((entry) => {
        const { icon: Icon, className: iconClass } = LEVEL_CONFIG[entry.level];
        return (
          <li key={entry.id} className="flex items-start gap-3 py-2.5 text-sm">
            <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", iconClass)} />
            <span className="min-w-0 flex-1 leading-snug">{entry.message}</span>
            <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">
              {formatTime(entry.timestamp)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
