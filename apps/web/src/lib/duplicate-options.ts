import type { DuplicateOption } from "@/types";

export const DUPLICATE_OPTIONS: DuplicateOption[] = [
  {
    id: "skip",
    label: "Skip",
    description: "Leave existing files untouched and don't transfer duplicates",
  },
  {
    id: "replace",
    label: "Replace",
    description:
      "Compares size and modified date: skips identical files, replaces outdated ones, otherwise keeps both by renaming",
  },
  {
    id: "rename",
    label: "Rename",
    description: "Keep both by appending a suffix, e.g. file (1).pdf",
  },
  {
    id: "ask",
    label: "Ask me",
    description: "Pause and let you decide for each conflicting file",
  },
];
