import { LEAVE_STATUS_LABELS, type LeaveStatus } from "@/db/enums";
import { WORKER_TYPE_LABELS } from "@/lib/attendance/worker-type";
import type { WorkerType } from "@/db/enums";
import { formatDate } from "@/lib/format";

/**
 * Shared presentation atoms for the Leave surfaces — the employee page, the
 * review queue and the review panel all render status the SAME way, because a
 * status that looks different in two places reads as two different states.
 *
 * The house rule for this feature (spec §8): status is an INDICATOR, not a
 * banner. A 6px dot plus the word, in the status colour, on no background —
 * loud enough to scan a column of forty rows, quiet enough that a table of
 * approved leave doesn't turn into a wall of green pills.
 */

const STATUS_DOT: Record<LeaveStatus, string> = {
  pending: "#D97706",
  approved: "#15803D",
  rejected: "#B91C1C",
  cancelled: "var(--color-ink-subtle)",
};

export function LeaveStatusChip({ status }: { status: LeaveStatus }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap text-[13px] font-semibold"
      style={{ color: STATUS_DOT[status] }}
    >
      <span
        aria-hidden
        className="size-[6px] shrink-0 rounded-full"
        style={{ background: "currentColor" }}
      />
      {LEAVE_STATUS_LABELS[status]}
    </span>
  );
}

/** "05 Aug 2026" — canonical app date format, no timezone drift. */
export function prettyDate(iso: string): string {
  return formatDate(iso);
}

/** Human archetype label for the review panel's "Employee Type" line. */
export function workerTypeLabel(w: WorkerType): string {
  return WORKER_TYPE_LABELS[w];
}

/** `n day` / `n days`. Halves survive: 0.5 reads "0.5 days", not "1 day". */
export function dayCountLabel(days: number): string {
  return `${days} day${days === 1 ? "" : "s"}`;
}

/**
 * The date range, with each half-day boundary named on the date it belongs to.
 *
 * "24 Aug (2nd half) → 30 Aug (1st half)". The two flags mean OPPOSITE halves —
 * you leave at lunch on the first date and return after lunch on the last — so a
 * single shared "half day" marker could not say which, and the reader would have
 * to guess at the very thing the flags exist to pin down.
 */
export function leaveRangeLabel(row: {
  startDate: string;
  endDate: string;
  startHalfDay?: boolean;
  endHalfDay?: boolean;
}): string {
  if (row.startDate === row.endDate) {
    const half = row.startHalfDay || row.endHalfDay;
    return half ? `${prettyDate(row.startDate)} (half day)` : prettyDate(row.startDate);
  }
  const from = `${prettyDate(row.startDate)}${row.startHalfDay ? " (2nd half)" : ""}`;
  const to = `${prettyDate(row.endDate)}${row.endHalfDay ? " (1st half)" : ""}`;
  return `${from} → ${to}`;
}

/** The one shared field-input look, so the dialog and the panel match. */
export const LEAVE_INPUT_CLASS =
  "w-full rounded-lg bg-surface-card px-3 py-2 text-[14px] text-ink-strong outline-none transition-shadow focus-visible:shadow-[inset_0_0_0_2px_rgba(225,6,0,0.4)]";
export const LEAVE_INPUT_RING = {
  boxShadow: "inset 0 0 0 1px var(--color-hairline-strong, #CBD5E1)",
} as const;

export function LeaveField({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="mb-1.5 block text-[12px] font-semibold text-ink-soft"
      >
        {label}
        {hint && (
          <span className="ml-1.5 font-normal text-ink-subtle">{hint}</span>
        )}
      </label>
      {children}
    </div>
  );
}
