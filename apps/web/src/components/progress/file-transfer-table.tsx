import { Replace, SkipForward, TextCursorInput } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { FileStatusBadge } from "@/components/progress/file-status-badge";
import { formatBytes } from "@/lib/utils";
import type { FileTransferItem } from "@/types";

interface FileTransferTableProps {
  files: FileTransferItem[];
  onResolveConflict: (fileId: string, action: "skip" | "replace" | "rename") => void;
}

export function FileTransferTable({ files, onResolveConflict }: FileTransferTableProps) {
  if (files.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        No files match this filter.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="py-2 pr-4 font-medium">File</th>
            <th className="py-2 pr-4 font-medium">Size</th>
            <th className="py-2 pr-4 font-medium">Progress</th>
            <th className="py-2 pr-4 font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {files.map((file) => {
            const percent = Math.round((file.transferredBytes / file.sizeBytes) * 100);
            return (
              <tr key={file.id}>
                <td className="max-w-[220px] py-2.5 pr-4">
                  <p className="truncate font-medium">{file.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{file.path}</p>
                </td>
                <td className="whitespace-nowrap py-2.5 pr-4 text-muted-foreground">
                  {formatBytes(file.sizeBytes)}
                </td>
                <td className="py-2.5 pr-4">
                  {file.status === "conflict" ? (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs"
                        onClick={() => onResolveConflict(file.id, "skip")}
                      >
                        <SkipForward className="h-3 w-3" /> Skip
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs"
                        onClick={() => onResolveConflict(file.id, "replace")}
                      >
                        <Replace className="h-3 w-3" /> Replace
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs"
                        onClick={() => onResolveConflict(file.id, "rename")}
                      >
                        <TextCursorInput className="h-3 w-3" /> Rename
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Progress value={percent} className="h-1.5 w-28" />
                      <span className="w-9 shrink-0 text-xs text-muted-foreground">
                        {percent}%
                      </span>
                    </div>
                  )}
                </td>
                <td className="whitespace-nowrap py-2.5 pr-4">
                  <FileStatusBadge status={file.status} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
