import "server-only";
import { and, eq, isNotNull, lte, sql } from "drizzle-orm";
import { db, tasks, taskEvents } from "@/lib/db";

/**
 * AUTO-ARCHIVE — an approved task moves itself to Archive seven working days
 * after it was signed off.
 *
 * ── WHICH DAYS COUNT, AND WHY THIS IS WORTH READING ──────────────────────
 * The brief says exclude Saturday AND Sunday. THIS COMPANY WORKS SATURDAYS:
 * `employees.weekly_off` defaults to 0 (Sunday), the dashboard's own targets
 * read "6 working of 7 days", and lib/transforms/working-days.ts defaults to
 * `weeklyOff = [0]`. So the two definitions disagree, and they disagree by
 * about two calendar days on every task:
 *
 *   Mon-Fri  (this file, per the brief)   7 working days ≈ 9-11 calendar days
 *   Mon-Sat  (the rest of the app)        7 working days ≈ 8 calendar days
 *
 * The brief is explicit and supplied the rule as code, so that is what runs
 * here. WEEKEND_DAYS is the single place it lives: switching this file to the
 * company calendar is deleting `6` from that set, and adding holidays on top
 * means calling countWorkingDays() from lib/transforms/working-days.ts, which
 * already takes the holiday table.
 *
 * ── WHY IT IS NOT A SETTIMEOUT ───────────────────────────────────────────
 * Nothing schedules itself per task. A sweep asks "which approved tasks are now
 * past their window", which is stateless, idempotent, and correct after a
 * deploy, a restart or a missed run — none of which a per-task timer survives.
 */

/** 0 = Sunday, 6 = Saturday, per Date#getUTCDay. */
const WEEKEND_DAYS = new Set([0, 6]);

/** How many working days an approved task waits before it archives itself. */
export const AUTO_ARCHIVE_WORKING_DAYS = 7;

const MS_PER_DAY = 86_400_000;

/**
 * Whole working days strictly between `approvedAt` and `now`.
 *
 * UTC throughout. The brief's reference implementation used the LOCAL getDay()
 * and mutated a Date in a loop, which reads the server's timezone rather than
 * the business's — on a UTC host that is a day out for exactly the IST evening
 * hours when most approvals actually happen.
 */
export function workingDaysBetween(approvedAt: Date, now: Date): number {
  // Midnight-anchored so the count is in whole days and cannot drift with the
  // time of day an approval happened to land on.
  let cursor = Date.UTC(
    approvedAt.getUTCFullYear(),
    approvedAt.getUTCMonth(),
    approvedAt.getUTCDate(),
  );
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  let elapsed = 0;
  while (cursor < end) {
    cursor += MS_PER_DAY;
    if (!WEEKEND_DAYS.has(new Date(cursor).getUTCDay())) elapsed += 1;
  }
  return elapsed;
}

/** True once the approval is at least AUTO_ARCHIVE_WORKING_DAYS old. */
export function isEligibleForAutoArchive(approvedAt: Date, now: Date): boolean {
  return workingDaysBetween(approvedAt, now) >= AUTO_ARCHIVE_WORKING_DAYS;
}

/**
 * The earliest approval timestamp that could possibly be eligible.
 *
 * A PRE-FILTER, not the decision. Seven working days can never span fewer than
 * seven calendar days, so anything approved more recently than that is
 * definitely too new — and excluding it in SQL keeps the sweep from pulling the
 * entire approved backlog into memory to reject most of it. The exact verdict
 * is still `isEligibleForAutoArchive`, row by row.
 */
function earliestPossible(now: Date): Date {
  return new Date(now.getTime() - AUTO_ARCHIVE_WORKING_DAYS * MS_PER_DAY);
}

export interface AutoArchiveResult {
  /** Rows that cleared the SQL pre-filter. */
  considered: number;
  /** Rows that were actually archived. */
  archived: number;
  taskIds: string[];
}

/**
 * Archive every approved task past its window.
 *
 * IDEMPOTENT: the `archived = false` predicate means a second run in the same
 * hour, an overlapping fire, or a retry after a timeout all converge on the
 * same state rather than double-writing events.
 */
export async function runTaskAutoArchive(now: Date = new Date()): Promise<AutoArchiveResult> {
  const candidates = await db
    .select({
      id: tasks.id,
      approvedAt: tasks.approvedAt,
      approvedById: tasks.approvedById,
      initiatorId: tasks.initiatorId,
    })
    .from(tasks)
    .where(
      and(
        eq(tasks.approvalStatus, "approved"),
        eq(tasks.archived, false),
        isNotNull(tasks.approvedAt),
        lte(tasks.approvedAt, earliestPossible(now)),
      ),
    );

  const due = candidates.filter((t) => isEligibleForAutoArchive(t.approvedAt!, now));
  if (due.length === 0) {
    return { considered: candidates.length, archived: 0, taskIds: [] };
  }

  const ids = due.map((t) => t.id);

  await db.transaction(async (tx) => {
    await tx
      .update(tasks)
      .set({ archived: true, updatedAt: now })
      .where(and(sql`${tasks.id} = ANY(${ids})`, eq(tasks.archived, false)));

    // ATTRIBUTED TO THE APPROVER, because `task_events.actor_id` is NOT NULL
    // against `employees` and a sweep has no human actor of its own. The
    // approver is the honest choice: their sign-off is what started the clock,
    // and the note says plainly that the system, not they, moved it. Falling
    // back to the initiator covers a task whose approver has since been deleted
    // (`approved_by_id` is ON DELETE SET NULL).
    await tx.insert(taskEvents).values(
      due.map((t) => ({
        taskId: t.id,
        actorId: t.approvedById ?? t.initiatorId,
        eventType: "archived",
        fromValue: { archived: false, approvedAt: t.approvedAt?.toISOString() ?? null },
        toValue: { archived: true, auto: true },
        note: `System automatically transferred task to Archive after ${AUTO_ARCHIVE_WORKING_DAYS} working days`,
      })),
    );
  });

  return { considered: candidates.length, archived: ids.length, taskIds: ids };
}
