import { Badge } from "@/components/ui/badge";
import type { FileStatus } from "@/types";

const CONFIG: Record<FileStatus, { label: string; variant: "default" | "success" | "warning" | "destructive" | "muted" | "secondary" }> = {
  pending: { label: "Pending", variant: "muted" },
  transferring: { label: "Transferring", variant: "default" },
  done: { label: "Done", variant: "success" },
  failed: { label: "Failed", variant: "destructive" },
  skipped: { label: "Skipped", variant: "secondary" },
  conflict: { label: "Conflict", variant: "warning" },
};

export function FileStatusBadge({ status }: { status: FileStatus }) {
  const { label, variant } = CONFIG[status];
  return <Badge variant={variant}>{label}</Badge>;
}
