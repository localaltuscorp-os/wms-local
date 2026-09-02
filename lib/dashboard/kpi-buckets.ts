import type { TaskStatus, ApprovalStatus } from "@/db/enums";

/**
 * THE single definition of the six Task Summary buckets.
 *
 * There used to be three copies of this classification and they disagreed:
 *
 *   • `computeKpiTotals` (lib/transforms/status-counts.ts) put a task in `done`
 *     when `approvalStatus === "approved"`, and counted `pending` as
 *     initiated + follow_up + follow_up_1/2/3 — so `dont_know`, `on_hold` and
 *     the retired `need_help` landed in NO bucket at all. TOTAL is
 *     `tasks.length`, so the five status cards summed SHORT of the Total card.
 *
 *   • The sparkline/delta predicates in lib/queries/dashboard.ts read `status`
 *     ONLY and defined pending as PENDING_STATUSES minus not_started/need_info
 *     — a different set again. A task with `status:"initiated"` +
 *     `approvalStatus:"approved"` therefore counted as DONE on the card and as
 *     PENDING in the trend line drawn directly underneath it.
 *
 *   • The operational summary counted "open" as PENDING_STATUSES, which drops
 *     sent-back work that is very much still open.
 *
 * Everything now routes through `kpiBucketOf`, so the cards, their trend
 * series, their deltas and the operational summary cannot drift again. The
 * buckets PARTITION the countable set: total === the sum of the other five, by
 * construction, because `pending` is the residual.
 */

/** A task, reduced to the fields the classification actually reads. */
export interface KpiBucketInput {
  status: TaskStatus;
  approvalStatus?: ApprovalStatus | null;
  archived?: boolean | null;
}

export const KPI_BUCKET_KEYS = [
  "total",
  "needHelp",
  "notApproved",
  "done",
  "pending",
  "notStarted",
] as const;

export type KpiBucketKey = (typeof KPI_BUCKET_KEYS)[number];
/** The five buckets that partition `total`. */
export type KpiStatusBucket = Exclude<KpiBucketKey, "total">;

/**
 * Rows the Task Summary does not count at all: archived work, and the two
 * legacy terminal verdicts (cancelled / transferred) which are neither open
 * nor delivered. Excluded from TOTAL as well as from the five status buckets —
 * counting them in Total while showing them in no card is exactly the
 * "columns sum short of the total" bug this module exists to prevent.
 */
export function isCountableTask(t: KpiBucketInput): boolean {
  if (t.archived) return false;
  if (t.status === "cancelled" || t.status === "transferred") return false;
  if (t.approvalStatus === "cancelled" || t.approvalStatus === "transferred") {
    return false;
  }
  return true;
}

/**
 * Which card a task belongs to, or null when it is not counted at all.
 *
 * THE APPROVAL VERDICT WINS. `approval_status` is the admin's ruling layered
 * on top of the doer's `status` (db/enums.ts), so a task the doer marked `done`
 * that an admin sent back is NOT APPROVED, not DONE. The old ordering checked
 * done-ness first and so reported sent-back work as delivered.
 */
export function kpiBucketOf(t: KpiBucketInput): KpiStatusBucket | null {
  if (!isCountableTask(t)) return null;

  if (t.approvalStatus === "approved") return "done";
  if (t.approvalStatus === "not_approved") return "notApproved";

  switch (t.status) {
    case "done":
    case "approved":
      return "done";
    case "not_approved":
      return "notApproved";
    case "not_started":
      return "notStarted";
    // need_help was retired into need_info (migration 0051) but imported rows
    // still carry it, so both feed the one card.
    case "need_info":
    case "need_help":
      return "needHelp";
    default:
      // Residual: initiated, follow_up(_1/2/3), on_hold, dont_know. Making
      // pending the residual is what guarantees the five cards sum to Total.
      return "pending";
  }
}

/** Does this task belong on the card `key`? `total` counts every countable row. */
export function inKpiBucket(t: KpiBucketInput, key: KpiBucketKey): boolean {
  if (key === "total") return isCountableTask(t);
  return kpiBucketOf(t) === key;
}

/** A task is OPEN when it is countable and not delivered. Deliberately wider
 *  than PENDING_STATUSES: sent-back (`not_approved`) work is still open work,
 *  which is why it shows up in Overdue / Due Today / Due This Week. */
export function isOpenTask(t: KpiBucketInput): boolean {
  const bucket = kpiBucketOf(t);
  return bucket !== null && bucket !== "done";
}

/**
 * The `status` values each card covers, for consumers that filter BY status
 * rather than classify a row — the /tasks deep links and the Status-by-Doer
 * column filter. Approval-verdict overrides can't be expressed here, so this
 * is a companion to `kpiBucketOf`, never a replacement for it.
 */
export const KPI_BUCKET_STATUSES: Record<KpiBucketKey, readonly TaskStatus[]> = {
  total: [],
  needHelp: ["need_info", "need_help"],
  notApproved: ["not_approved"],
  done: ["done", "approved"],
  pending: ["initiated", "follow_up", "follow_up_1", "follow_up_2", "follow_up_3", "on_hold", "dont_know"],
  notStarted: ["not_started"],
};
