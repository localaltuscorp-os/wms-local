/**
 * EVENT CHECKLIST — the shared vocabulary.
 *
 * PURE, and no `server-only`: the grid, the server queries and the actions all
 * need these, and a status list that exists twice is a status list that will
 * disagree with itself.
 *
 * The date arithmetic lives next door in ./checklist-dates.ts.
 */

import { DOER_TASK_STATUSES, type TaskStatus } from "@/db/enums";
import { STATUS_LABELS_FALLBACK, STATUS_TONES_FALLBACK, statusBadgeStyle } from "@/lib/format";

/**
 * DOER STATUS — the WMS Tasks six (account holder, 2026-09-18), so a checklist
 * row and a task are graded in one vocabulary: Not Read · Not Started ·
 * Initiated · Follow Up · Need Info · Done.
 *
 * The checklist used to carry its own four (Pending / Done / Need Help / Not
 * Applicable). Migration 0237 converts stored rows; `readCheckStatus` still
 * reads the old words so a database that has not run it yet shows its rows
 * rather than resetting them. Not Applicable has no doer equivalent — work that
 * did not need doing is a RULING on the work, and 0237 moves those rows to the
 * Approver Status "Cancelled".
 */
export const CHECK_STATUSES = DOER_TASK_STATUSES;
export type CheckStatus = (typeof CHECK_STATUSES)[number];

export function isCheckStatus(v: string | null | undefined): v is CheckStatus {
  return (CHECK_STATUSES as readonly string[]).includes(v as string);
}

/** The default for an item nobody has touched yet — a new task's, too. */
export const DEFAULT_STATUS: CheckStatus = "not_started";

/** The pre-0237 words, as the WMS statuses they became. */
const LEGACY_STATUS: Record<string, CheckStatus> = {
  Pending: "not_started",
  Done: "done",
  "Need Help": "need_info",
  "Not Applicable": "not_started",
};

/** A stored value → the Doer Status it is. Unknown reads as the default. */
export function readCheckStatus(v: string | null | undefined): CheckStatus {
  if (isCheckStatus(v)) return v;
  return (v && LEGACY_STATUS[v]) || DEFAULT_STATUS;
}

/** The WMS label ("Not Read" for dont_know). */
export function checkStatusLabel(s: CheckStatus): string {
  return STATUS_LABELS_FALLBACK[s as TaskStatus] ?? s;
}

/** The WMS badge colours for a Doer Status. */
export function checkStatusStyle(s: CheckStatus) {
  return statusBadgeStyle(STATUS_TONES_FALLBACK[s as TaskStatus]);
}

/** Approver rulings that take a row out of the work altogether. */
const RULED_OUT: ReadonlySet<string> = new Set(["cancelled", "archived"]);

/** Did the approver rule this row out (Cancelled / Archived)? */
export function isRuledOut(approverStatus: string | null | undefined): boolean {
  return !!approverStatus && RULED_OUT.has(approverStatus);
}

/** A run's lifecycle. */
export const RUN_STATUSES = ["active", "completed", "cancelled"] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

export function isRunStatus(v: string | null | undefined): v is RunStatus {
  return RUN_STATUSES.includes(v as RunStatus);
}

/** A reusable master checklist. */
export interface ChecklistTemplateRow {
  id: string;
  name: string;
  isEvent: boolean;
  description: string | null;
  isActive: boolean;
  itemCount: number;
}

/** One checklist, for one event. */
export interface ChecklistRunRow {
  id: string;
  title: string;
  isEvent: boolean;
  eventId: string | null;
  eventDate: string | null;
  eventTitle: string | null;
  /** Set when the linked calendar event has since moved to a different date. */
  calendarDate: string | null;
  status: RunStatus;
  notes: string | null;
}

/** One row of the grid, with its tick already resolved. */
export interface ChecklistItemRow {
  id: string;
  code: string | null;
  title: string;
  category: string | null;
  offsetDays: number | null;
  /** Non-event runs only — the directly-entered date. */
  targetDate: string | null;
  doerId: string | null;
  doerName: string | null;
  backupId: string | null;
  backupName: string | null;
  instructions: string | null;
  fileLink: string | null;
  jdEntryId: string | null;
  sortOrder: number;
  isActive: boolean;
  /* ── WMS Tasks columns (0237) ── */
  client: string | null;
  initiatorId: string | null;
  /** Google Calendar's RRULE; null = does not repeat. */
  recurrenceRule: string | null;
  /* ── the tick ── */
  status: CheckStatus;
  /** Doer Notes. */
  notes: string | null;
  doneAt: string | null;
  /** Null = Pending, no ruling yet. */
  approverStatus: string | null;
  approverNotes: string | null;
}

/** An event the checklist can hang off — a Monthly Events Master record. */
export interface ChecklistEventRow {
  id: string;
  title: string;
  eventDate: string;
  categoryName: string | null;
}

/** A person who can be a doer or a backup. */
export interface ChecklistPersonRow {
  id: string;
  name: string;
}

/**
 * Progress over a set of rows.
 *
 * Rows the approver ruled out (Cancelled / Archived) are EXCLUDED FROM THE
 * DENOMINATOR, not counted as done — work that was called off was never work,
 * so counting it either way distorts the figure: as done it inflates, as
 * outstanding it never clears. A checklist of ten where four were cancelled is
 * six items of real work, and 3/6 is the honest read of it.
 */
export function checklistProgress(
  rows: readonly { status: CheckStatus; approverStatus?: string | null }[],
): { done: number; total: number; pct: number; ruledOut: number } {
  const live = rows.filter((r) => !isRuledOut(r.approverStatus));
  const done = live.filter((r) => r.status === "done").length;
  const total = live.length;
  return {
    done,
    total,
    ruledOut: rows.length - total,
    // A checklist with nothing left to do is complete, not 0% — there is
    // nothing outstanding. Guarding the divide and answering 100 says that;
    // answering 0 would light the card red for work nobody has to do.
    pct: total === 0 ? 100 : Math.round((done / total) * 100),
  };
}

/** One row of a MASTER checklist — the pattern: no tick, no date, only an offset. */
export interface ChecklistMasterItem {
  id: string;
  code: string | null;
  title: string;
  category: string | null;
  offsetDays: number | null;
  doerId: string | null;
  backupId: string | null;
  instructions: string | null;
  fileLink: string | null;
  sortOrder: number;
}
