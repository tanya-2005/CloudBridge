import { useCallback, useEffect, useState } from "react";
import { ChevronRight, File, Folder, FolderInput, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { api, ApiError } from "@/lib/api";
import { mapRemoteNode } from "@/lib/api-mappers";
import { cn, formatBytes } from "@/lib/utils";
import type { ProviderRole, RemoteNode, SelectedFolder } from "@/types";

const ROOT_CRUMB = { id: "/", name: "Root" };

interface FolderPickerDialogProps {
  role: ProviderRole;
  /** The actually-selected provider's display name (e.g. "MEGA", "Google Drive") — not derived from `role`, since any provider can be picked for either role. */
  providerName: string;
  connectionId: string | null;
  disabled?: boolean;
  selected: SelectedFolder | null;
  onSelect: (folder: SelectedFolder) => void;
}

export function FolderPickerDialog({
  role,
  providerName,
  connectionId,
  disabled,
  selected,
  onSelect,
}: FolderPickerDialogProps) {
  const [open, setOpen] = useState(false);
  const [path, setPath] = useState<{ id: string; name: string }[]>([ROOT_CRUMB]);
  const [nodes, setNodes] = useState<RemoteNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentFolderId = path[path.length - 1]!.id;

  const load = useCallback(
    async (folderId: string) => {
      if (!connectionId) return;
      setLoading(true);
      setError(null);
      try {
        const res = await api.browseConnection(connectionId, folderId);
        setNodes(res.nodes.map(mapRemoteNode));
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Failed to load folders.");
        setNodes([]);
      } finally {
        setLoading(false);
      }
    },
    [connectionId]
  );

  useEffect(() => {
    if (!open) return;
    setPath([ROOT_CRUMB]);
    void load("/");
  }, [open, load]);

  const enterFolder = (node: RemoteNode) => {
    const next = [...path, { id: node.id, name: node.name }];
    setPath(next);
    void load(node.id);
  };

  const goToCrumb = (index: number) => {
    const next = path.slice(0, index + 1);
    setPath(next);
    void load(next[next.length - 1]!.id);
  };

  const currentLabel = path
    .slice(1)
    .map((c) => c.name)
    .join(" / ") || "Root";

  const folders = nodes.filter((n) => n.type === "folder");
  const files = nodes.filter((n) => n.type === "file");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full justify-start" disabled={disabled || !connectionId}>
          <Folder className="h-4 w-4 text-muted-foreground" />
          <span className="truncate text-left">
            {selected?.label ?? `Select ${role === "source" ? "source" : "destination"} folder…`}
          </span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Choose {role === "source" ? "a source folder" : "a destination folder"}
          </DialogTitle>
          <DialogDescription>
            Browsing your real {providerName} account.
          </DialogDescription>
        </DialogHeader>

        <nav className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
          {path.map((crumb, index) => (
            <span key={crumb.id} className="flex items-center gap-1">
              {index > 0 && <ChevronRight className="h-3 w-3" />}
              <button
                type="button"
                onClick={() => goToCrumb(index)}
                className={cn(
                  "rounded px-1 py-0.5 hover:bg-accent hover:text-accent-foreground",
                  index === path.length - 1 && "font-medium text-foreground"
                )}
              >
                {crumb.name}
              </button>
            </span>
          ))}
        </nav>

        <div className="flex h-80 flex-col overflow-y-auto rounded-lg border border-border p-1 scrollbar-thin">
          {loading ? (
            <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          ) : error ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center text-sm text-destructive">
              <p>{error}</p>
              <Button variant="outline" size="sm" onClick={() => load(currentFolderId)}>
                <RotateCcw className="h-3.5 w-3.5" />
                Retry
              </Button>
            </div>
          ) : folders.length === 0 && files.length === 0 ? (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              This folder is empty.
            </div>
          ) : (
            <div className="flex flex-col">
              {folders.map((node) => (
                <button
                  key={node.id}
                  type="button"
                  onClick={() => enterFolder(node)}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                >
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <Folder className="h-4 w-4 shrink-0 text-primary" />
                  <span className="truncate">{node.name}</span>
                </button>
              ))}
              {files.map((node) => (
                <div
                  key={node.id}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground"
                >
                  <span className="w-3.5 shrink-0" />
                  <File className="h-4 w-4 shrink-0" />
                  <span className="truncate">{node.name}</span>
                  {node.sizeBytes !== undefined && (
                    <span className="ml-auto shrink-0 pl-2 text-xs">{formatBytes(node.sizeBytes)}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              onSelect({ id: currentFolderId, label: currentLabel });
              setOpen(false);
            }}
          >
            <FolderInput className="h-4 w-4" />
            Use this folder
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
