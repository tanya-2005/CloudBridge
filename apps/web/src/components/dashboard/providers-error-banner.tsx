import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ProvidersErrorBannerProps {
  message: string;
  onRetry: () => void;
}

export function ProvidersErrorBanner({ message, onRetry }: ProvidersErrorBannerProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
      <span className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Couldn't load cloud providers from the backend — {message} Source/destination selection
          is unavailable until this is fixed.
        </span>
      </span>
      <Button variant="outline" size="sm" onClick={onRetry} className="shrink-0">
        <RotateCcw className="h-3.5 w-3.5" />
        Retry
      </Button>
    </div>
  );
}
