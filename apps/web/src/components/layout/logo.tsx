import { Waypoints } from "lucide-react";
import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2 font-semibold tracking-tight", className)}>
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Waypoints className="h-[18px] w-[18px]" />
      </span>
      <span className="text-[15px]">CloudBridge</span>
    </div>
  );
}
