import type { TaskEventType } from "@/lib/events";

export function dotColorFor(e: TaskEventType): string {
  switch (e) {
    case "created":
      return "var(--color-blue)";
    case "status_changed":
      return "var(--color-amber)";
    case "field_updated":
      return "var(--color-ink-subtle)";
    case "reassigned":
      return "var(--color-purple)";
    case "transferred_external":
      return "var(--color-purple-deep)";
    case "priority_changed":
    case "due_changed":
      return "var(--color-amber)";
    case "archived":
    case "restored":
      /* SLATE, not the pink `--color-rose` this used to return — and not red
         either. Archiving is a neutral lifecycle step and "restored" is the
         undo of it; neither is an error, so a red dot would misreport both.
         Slate is what Archived already reads as on the Kanban board and what
         `cancelled` carries in STATUS_TONES_FALLBACK, so the timeline now
         agrees with the rest of the app. */
      return "var(--color-slate)";
    case "commented":
      return "var(--color-green)";
  }
}

export function eventFilterBucket(
  e: TaskEventType,
): "comments" | "status" | "edits" {
  switch (e) {
    case "commented":
      return "comments";
    case "status_changed":
    case "reassigned":
    case "transferred_external":
    case "archived":
    case "restored":
      return "status";
    case "created":
    case "field_updated":
    case "priority_changed":
    case "due_changed":
      return "edits";
  }
}
