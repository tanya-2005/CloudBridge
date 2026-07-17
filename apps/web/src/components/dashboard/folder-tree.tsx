import { useState } from "react";
import { ChevronRight, File, Folder, FolderOpen } from "lucide-react";
import { formatBytes, cn } from "@/lib/utils";
import type { MockNode } from "@/types";

interface FolderTreeProps {
  node: MockNode;
  depth?: number;
  selectedId: string | null;
  onSelect: (node: MockNode) => void;
  defaultExpanded?: boolean;
}

export function FolderTree({
  node,
  depth = 0,
  selectedId,
  onSelect,
  defaultExpanded = false,
}: FolderTreeProps) {
  const [expanded, setExpanded] = useState(defaultExpanded || depth === 0);
  const isFolder = node.type === "folder";
  const isSelected = selectedId === node.id;
  const hasChildren = !!node.children?.length;

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          if (isFolder) {
            onSelect(node);
            if (hasChildren) setExpanded((e) => !e);
          }
        }}
        disabled={!isFolder}
        className={cn(
          "flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
          isFolder
            ? "cursor-pointer hover:bg-accent hover:text-accent-foreground"
            : "cursor-default text-muted-foreground",
          isSelected && "bg-primary/10 text-primary hover:bg-primary/10 hover:text-primary"
        )}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        {isFolder ? (
          <ChevronRight
            className={cn(
              "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
              expanded && "rotate-90",
              !hasChildren && "opacity-0"
            )}
          />
        ) : (
          <span className="w-3.5 shrink-0" />
        )}
        {isFolder ? (
          expanded ? (
            <FolderOpen className="h-4 w-4 shrink-0 text-primary" />
          ) : (
            <Folder className="h-4 w-4 shrink-0 text-primary" />
          )
        ) : (
          <File className="h-4 w-4 shrink-0" />
        )}
        <span className="truncate">{node.name}</span>
        {node.sizeBytes !== undefined && (
          <span className="ml-auto shrink-0 pl-2 text-xs text-muted-foreground">
            {formatBytes(node.sizeBytes)}
          </span>
        )}
      </button>

      {isFolder && expanded && hasChildren && (
        <div>
          {node.children!.map((child) => (
            <FolderTree
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}
