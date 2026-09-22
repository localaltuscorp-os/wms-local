/**
 * THE KEY CARDS OVER "YOUR QUESTIONS" — pure, and shared with their test.
 *
 * Six ticket statuses, but an employee looking at their own questions does not
 * have six questions. They have three: is HR still working on it, does it need
 * something from ME, or is it finished. `HR_TICKET_STATUS_EMPLOYEE_LABELS`
 * already makes that split in words ("With HR" / "Waiting on you" / "Resolved")
 * — this is the same split, counted, so the cards and the badges on the rows
 * below them can never tell different stories.
 */

import type { HrTicketStatus } from "@/db/enums";

/** Which card a ticket belongs to. `all` is the unfiltered view, not a bucket. */
export type QueryBucket = "withHr" | "waitingOnYou" | "resolved";
export type QueryFilter = QueryBucket | "all";

/**
 * NEW, IN PROGRESS AND REOPENED ARE ONE THING TO THE PERSON WAITING.
 *
 * The distinction between them is HR's workflow, not the asker's experience —
 * all three mean "someone else has it". Splitting them into three cards would
 * be reporting HR's internal state to someone who cannot act on it.
 */
export function bucketOf(status: HrTicketStatus): QueryBucket {
  switch (status) {
    case "waiting_on_employee":
      return "waitingOnYou";
    case "resolved":
    case "closed":
      return "resolved";
    default:
      return "withHr";
  }
}

export interface QuerySummary {
  total: number;
  withHr: number;
  waitingOnYou: number;
  resolved: number;
}

export function summarise(
  rows: readonly { status: HrTicketStatus }[],
): QuerySummary {
  const s: QuerySummary = { total: 0, withHr: 0, waitingOnYou: 0, resolved: 0 };
  for (const r of rows) {
    s.total += 1;
    s[bucketOf(r.status)] += 1;
  }
  return s;
}

/** The rows a card shows when it is the active filter. */
export function filterRows<T extends { status: HrTicketStatus }>(
  rows: readonly T[],
  filter: QueryFilter,
): T[] {
  return filter === "all" ? [...rows] : rows.filter((r) => bucketOf(r.status) === filter);
}
