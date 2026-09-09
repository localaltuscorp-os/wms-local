/**
 * Client-safe formatting helpers for the Time Intelligence reports. Times reuse
 * `formatMinutesLabel` / `formatDuration` from lib/tasks/time/types (also
 * client-safe); this module adds the date + percentage + priority helpers the
 * report tables need. IST throughout (the org's reporting timezone).
 */
import { PRIORITY_LABELS, type TaskPriority } from "@/db/enums";
import { formatDate } from "@/lib/format";

const IST = "Asia/Kolkata";

/** Canonical "03 Aug 2026". */
export function fmtDate(iso: string | null | undefined): string {
  return iso ? formatDate(iso) : "—";
}

/** "03 Aug 2026, 4:12 PM" — canonical date + time, IST. */
export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const time = new Date(iso).toLocaleTimeString("en-IN", {
    timeZone: IST,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return `${formatDate(iso)}, ${time}`;
}

/** Canonical "03 Aug 2026" from a bare YYYY-MM-DD (parsed as a local day). */
export function fmtDayLabel(day: string): string {
  return formatDate(day);
}

/** A 0..1 ratio as a rounded whole-percent string. */
export function pct(ratio: number): string {
  return `${Math.round((Number.isFinite(ratio) ? ratio : 0) * 100)}%`;
}

export function priorityLabel(p: TaskPriority): string {
  return PRIORITY_LABELS[p] ?? p;
}
