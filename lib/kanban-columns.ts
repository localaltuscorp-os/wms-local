import { USER_TASK_STATUSES, type TaskStatus } from "@/db/enums";

// Sentinel id for the synthetic "Archived" column (not a real TaskStatus).
export const ARCHIVE_COL = "__archived__" as const;

/**
 * THE TWO SYNTHETIC APPROVED COLUMNS ARE GONE (they were `manager_approved` /
 * `admin_approved`, derived from `tasks.approval_level`, mig 0185).
 *
 * They never worked on the board. The renderer buckets cards with
 * `t.status === col`, and no task ever has a status of "manager_approved" or
 * "admin_approved" — the status is plain `approved`, with the stage held in a
 * separate column. So the board rendered two permanently-empty containers with
 * blank headers (there is no `labels[]` entry for a non-status id either), and
 * every approved task fell through the cracks and appeared in NO column at all.
 *
 * The board is back to the one real `approved` status column. The two-stage
 * approval data (`approval_level`, `lib/tasks/approval-permissions.ts`) is
 * untouched — it just isn't a column split any more.
 */

export type ColId = TaskStatus | typeof ARCHIVE_COL;

/** Which column a task belongs in — Archived wins over the bare status. */
export function boardColumnFor(t: {
  status: TaskStatus;
  archived?: boolean;
}): ColId {
  return t.archived ? ARCHIVE_COL : t.status;
}

// Default admin board order (sir's changes #7): the working lane, then the
// terminal verdicts, then Archived, with On Hold pulled out to the very end —
// "On Hold has to be placed after Archived". Deprecated statuses
// (follow_up_1/2/3, cancelled, transferred) are intentionally absent.
export const DEFAULT_ADMIN_COLUMN_ORDER: ColId[] = [
  "dont_know",
  "not_started",
  "initiated",
  "follow_up",
  "need_info",
  "done",
  "not_approved",
  // Approved sits with the other terminal verdict, straight after Done /
  // Not Approved and before Archived.
  "approved",
  ARCHIVE_COL,
  "on_hold",
];

// Non-admins: their curated lifecycle list, plus the terminal verdicts. They can
// SEE where their work got to even though they cannot move it there.
//
// NOT APPROVED was missing here. `USER_TASK_STATUSES` is the DOER's operational
// lifecycle and deliberately stops at `done`, so a non-admin board showed the
// approved column but no Not Approved column — sent-back work simply vanished
// from the board for the person who has to redo it. It is appended explicitly,
// in the same place the admin order puts it: straight after Done.
export const USER_COLUMN_ORDER: ColId[] = [
  ...USER_TASK_STATUSES,
  "not_approved",
  "approved",
  ARCHIVE_COL,
];

const ADMIN_COLUMN_SET = new Set<string>(DEFAULT_ADMIN_COLUMN_ORDER);

/** True if `id` is a column the admin board can render/reorder. */
export function isValidColumnId(id: string): id is ColId {
  return ADMIN_COLUMN_SET.has(id);
}

/**
 * Resolve the effective admin column order from a stored order that may be
 * null, stale, or partial. Drops unknown/deprecated ids, de-dupes, and splices
 * in any live column the stored order didn't mention — so a status added (or
 * restored) after the order was saved never silently disappears.
 *
 * MISSING COLUMNS ARE SPLICED AT THEIR DEFAULT POSITION, NOT APPENDED. Every
 * board that was saved while the two synthetic approved columns existed has a
 * stored order that names them and NOT `approved`; appending would have parked
 * Approved past On Hold, at the far right of the board, instead of after Not
 * Approved where the workflow puts it.
 */
export function resolveAdminColumnOrder(
  stored: string[] | null | undefined,
): ColId[] {
  if (!stored || stored.length === 0) return DEFAULT_ADMIN_COLUMN_ORDER;
  const seen = new Set<string>();
  const ordered: ColId[] = [];
  for (const id of stored) {
    if (ADMIN_COLUMN_SET.has(id) && !seen.has(id)) {
      ordered.push(id as ColId);
      seen.add(id);
    }
  }
  // Walk the default order and drop each unmentioned column in after the last
  // default-neighbour that IS present (front of the board if it has none yet).
  DEFAULT_ADMIN_COLUMN_ORDER.forEach((id, i) => {
    if (seen.has(id)) return;
    let at = 0;
    for (let j = i - 1; j >= 0; j--) {
      const before = DEFAULT_ADMIN_COLUMN_ORDER[j];
      const idx = before === undefined ? -1 : ordered.indexOf(before);
      if (idx !== -1) {
        at = idx + 1;
        break;
      }
    }
    ordered.splice(at, 0, id);
    seen.add(id);
  });
  return ordered;
}
