/**
 * EVENT CHECKLIST — the shared vocabulary.
 *
 * PURE, and no `server-only`: the grid, the server queries and the actions all
 * need these, and a status list that exists twice is a status list that will
 * disagree with itself.
 *
 * The date arithmetic lives next door in ./checklist-dates.ts.
 */

/**
 * The four states a tick can be in — the SAME four the Accounts weekly
 * checklist uses (migration 0080), deliberately: two checklists in one app that
 * grade work differently make "Done" mean two things.
 *
 * The brief asked for a plain Done checkbox. The checkbox is what the grid
 * shows, and it toggles Pending ⇄ Done in one click — but the other two states
 * stay reachable from the cell menu, because dropping "Not Applicable" leaves
 * only two honest options for work that never needed doing: tick Done, which
 * inflates the completion rate, or leave it Pending, which reads as neglect.
 * Both corrupt the number the checklist exists to produce.
 */
export const CHECK_STATUSES = ["Pending", "Done", "Need Help", "Not Applicable"] as const;
export type CheckStatus = (typeof CHECK_STATUSES)[number];

export function isCheckStatus(v: string | null | undefined): v is CheckStatus {
  return CHECK_STATUSES.includes(v as CheckStatus);
}

/** The default for an item nobody has touched yet. */
export const DEFAULT_STATUS: CheckStatus = "Pending";

/** Tone per status, for the chips and the progress read-out. */
export const STATUS_TONE: Record<CheckStatus, { fg: string; bg: string }> = {
  Done: { fg: "#15803d", bg: "rgba(22,128,61,0.10)" },
  Pending: { fg: "#b45309", bg: "rgba(180,83,9,0.10)" },
  "Need Help": { fg: "#b91c1c", bg: "rgba(185,28,28,0.10)" },
  "Not Applicable": { fg: "#64748b", bg: "rgba(100,116,139,0.10)" },
};

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
  /* ── the tick ── */
  status: CheckStatus;
  notes: string | null;
  doneAt: string | null;
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
 * Progress over a set of ticks.
 *
 * "Not Applicable" is EXCLUDED FROM THE DENOMINATOR, not counted as done. An
 * item that did not apply was never work, so counting it either way distorts
 * the figure: as done it inflates, as outstanding it never clears. A checklist
 * of ten where four do not apply is six items of real work, and 3/6 is the
 * honest read of it.
 */
export function checklistProgress(
  statuses: readonly CheckStatus[],
): { done: number; total: number; pct: number; notApplicable: number } {
  const notApplicable = statuses.filter((s) => s === "Not Applicable").length;
  const total = statuses.length - notApplicable;
  const done = statuses.filter((s) => s === "Done").length;
  return {
    done,
    total,
    notApplicable,
    // A checklist with nothing applicable is complete, not 0% — there is
    // nothing outstanding. Guarding the divide and answering 100 says that;
    // answering 0 would light the card red for work nobody has to do.
    pct: total === 0 ? 100 : Math.round((done / total) * 100),
  };
}
