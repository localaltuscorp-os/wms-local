import type { TaskStatus } from "@/db/enums";
import {
  STATUS_LABELS_FALLBACK,
  STATUS_TONES_FALLBACK,
} from "@/lib/format";

export type StatusDisplay = { label: string; color: string };
export type StatusDisplayMap = Record<TaskStatus, StatusDisplay>;

export type StatusRow = {
  status: TaskStatus;
  label: string;
  colorToken: string;
};

// Pure transform. Lives in its own module (no `server-only` import) so unit
// tests can exercise it directly. lib/queries/status-display.ts is the
// server-only consumer that pulls rows from the DB and calls this.
export function mergeStatusDisplay(rows: StatusRow[]): StatusDisplayMap {
  const merged = {} as StatusDisplayMap;
  for (const s of Object.keys(STATUS_LABELS_FALLBACK) as TaskStatus[]) {
    merged[s] = {
      label: STATUS_LABELS_FALLBACK[s],
      color: STATUS_TONES_FALLBACK[s],
    };
  }
  for (const r of rows) {
    merged[r.status] = { label: r.label, color: r.colorToken };
  }
  return merged;
}
