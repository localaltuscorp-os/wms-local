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
      return "var(--color-rose)";
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
