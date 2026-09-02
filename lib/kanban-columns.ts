import { USER_TASK_STATUSES, type TaskStatus } from "@/db/enums";

// Sentinel id for the synthetic "Archived" column (not a real TaskStatus).
export const ARCHIVE_COL = "__archived__" as const;
export type ColId = TaskStatus | typeof ARCHIVE_COL;

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
  "approved",
  ARCHIVE_COL,
  "on_hold",
];

// Non-admins: their curated lifecycle list with Archived appended.
export const USER_COLUMN_ORDER: ColId[] = [...USER_TASK_STATUSES, ARCHIVE_COL];

const ADMIN_COLUMN_SET = new Set<string>(DEFAULT_ADMIN_COLUMN_ORDER);

/** True if `id` is a column the admin board can render/reorder. */
export function isValidColumnId(id: string): id is ColId {
  return ADMIN_COLUMN_SET.has(id);
}

/**
 * Resolve the effective admin column order from a stored order that may be
 * null, stale, or partial. Drops unknown/deprecated ids, de-dupes, and
 * appends any live columns the stored order didn't mention — so a status
 * added after the order was saved never silently disappears.
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
  for (const id of DEFAULT_ADMIN_COLUMN_ORDER) {
    if (!seen.has(id)) ordered.push(id);
  }
  return ordered;
}
