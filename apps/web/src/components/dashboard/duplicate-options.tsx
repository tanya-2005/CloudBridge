import { CopyX, HelpCircle, Replace, SkipForward } from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { DUPLICATE_OPTIONS } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import type { DuplicateStrategy } from "@/types";

const ICONS: Record<DuplicateStrategy, typeof SkipForward> = {
  skip: SkipForward,
  replace: Replace,
  rename: CopyX,
  ask: HelpCircle,
};

interface DuplicateOptionsProps {
  value: DuplicateStrategy;
  onChange: (value: DuplicateStrategy) => void;
}

export function DuplicateOptions({ value, onChange }: DuplicateOptionsProps) {
  return (
    <RadioGroup
      value={value}
      onValueChange={(v) => onChange(v as DuplicateStrategy)}
      className="grid grid-cols-1 gap-2 sm:grid-cols-2"
    >
      {DUPLICATE_OPTIONS.map((option) => {
        const Icon = ICONS[option.id];
        const isActive = value === option.id;
        return (
          <label
            key={option.id}
            htmlFor={`dup-${option.id}`}
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
              isActive
                ? "border-primary bg-primary/5"
                : "border-border hover:bg-accent/50"
            )}
          >
            <RadioGroupItem value={option.id} id={`dup-${option.id}`} className="mt-0.5" />
            <span className="flex flex-col gap-0.5">
              <span className="flex items-center gap-1.5 text-sm font-medium">
                <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                {option.label}
              </span>
              <span className="text-xs text-muted-foreground">{option.description}</span>
            </span>
          </label>
        );
      })}
    </RadioGroup>
  );
}
