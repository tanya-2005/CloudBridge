import { useState } from "react";
import { Folder, FolderInput } from "lucide-react";
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
import { FolderTree } from "@/components/dashboard/folder-tree";
import { MOCK_DEST_TREE, MOCK_SOURCE_TREE } from "@/lib/mock-data";
import type { MockNode, ProviderRole } from "@/types";

function findPath(root: MockNode, targetId: string, trail: string[] = []): string[] | null {
  const nextTrail = [...trail, root.name];
  if (root.id === targetId) return nextTrail;
  for (const child of root.children ?? []) {
    const found = findPath(child, targetId, nextTrail);
    if (found) return found;
  }
  return null;
}

interface FolderPickerDialogProps {
  role: ProviderRole;
  disabled?: boolean;
  selectedPath: string | null;
  onSelect: (path: string) => void;
}

export function FolderPickerDialog({
  role,
  disabled,
  selectedPath,
  onSelect,
}: FolderPickerDialogProps) {
  const [open, setOpen] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const tree = role === "source" ? MOCK_SOURCE_TREE : MOCK_DEST_TREE;

  const pendingPath = pendingId ? findPath(tree, pendingId)?.join(" / ") : null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full justify-start" disabled={disabled}>
          <Folder className="h-4 w-4 text-muted-foreground" />
          <span className="truncate text-left">
            {selectedPath ?? `Select ${role === "source" ? "source" : "destination"} folder…`}
          </span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Choose {role === "source" ? "a source folder" : "a destination folder"}
          </DialogTitle>
          <DialogDescription>
            Mock folder tree — browsing is illustrative only in this build.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-80 overflow-y-auto rounded-lg border border-border p-2 scrollbar-thin">
          <FolderTree
            node={tree}
            selectedId={pendingId}
            onSelect={(node) => setPendingId(node.id)}
            defaultExpanded
          />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            disabled={!pendingPath}
            onClick={() => {
              if (pendingPath) onSelect(pendingPath);
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
