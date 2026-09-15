import "server-only";
import { and, asc, desc, eq, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { employeeManagerHistory, employees } from "@/db/schema";

/**
 * REPORTING-MANAGER HISTORY.
 *
 * ── WHAT ALREADY WORKED, AND WHY THIS IS NOT A FAN-OUT ─────────────────────
 * `employees.manager_id` is the one canonical reporting relationship, and the
 * audit behind this work found that every consumer already resolves it live from
 * that column at query time: tasks, WMS tasks, goals, daily goals, DCC, KPI,
 * team KPI, manager dashboards, team dashboards, reporting views, approvals,
 * PMS, appraisal, attendance analytics. Not one of them keeps its own copy.
 *
 * So moving an employee between managers ALREADY propagates everywhere, in one
 * UPDATE, with nothing to recalculate. The brief's §7 list is satisfied by that
 * single column continuing to be the only place the answer lives — and the worst
 * thing this module could do is start writing manager ids onto historical task,
 * goal and KPI rows, which is exactly what "Do not blindly update every
 * historical record's manager ID if that destroys historical reporting" warns
 * against.
 *
 * ── WHAT WAS ACTUALLY MISSING ──────────────────────────────────────────────
 * The other direction: because the current manager is one mutable column,
 * changing it silently rewrote the PAST as well. Move Rudra from Rohan to
 * Rutvisha in September and every report about August re-read Rutvisha.
 *
 * This module is that missing memory. `employees.manager_id` stays the current
 * truth; `employee_manager_history` records the intervals, so a report about a
 * past period can ask who the manager WAS then.
 *
 * ── HOW HISTORICAL DATA IS HANDLED, PRECISELY ──────────────────────────────
 * Nothing is reassigned. Historical rows keep their own ownership fields exactly
 * as written. A report that wants the historical reporting line calls
 * `managerOn(employeeId, date)`; one that wants the present calls
 * `employees.manager_id` as it always has. Neither rewrites the other.
 */

/** `Date` → 'YYYY-MM-DD'. The history columns are DATE, and Drizzle hands them
 *  to us as strings, so the boundary is converted in exactly one place. */
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export interface ManagerPeriod {
  managerId: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  changedById: string | null;
  note: string | null;
}

/**
 * RECORD A MOVE. Closes the open period and opens a new one.
 *
 * ── ONE TRANSACTION, BECAUSE THE INVARIANT IS ACROSS ROWS ──────────────────
 * The table guarantees exactly one open period per employee (a partial unique
 * index). Closing the old row and inserting the new one are therefore not two
 * independent writes: between them the employee has zero open periods, and if
 * the insert failed there they would keep none — their current manager would
 * read as "unknown" forever after. Both statements go in one transaction so the
 * pair either happens or does not.
 *
 * ── SAME-DAY RE-ASSIGNMENT ─────────────────────────────────────────────────
 * A move on the same day the current period began would produce a zero-length
 * period. Rather than store one, the open row is UPDATED in place: the employee
 * moved before the previous line had a day to mean anything, and a period from
 * the 10th to the 10th followed by another from the 10th would make
 * `managerOn(…, '2026-09-10')` ambiguous.
 *
 * ── NO-OP MOVES ARE NOT RECORDED ───────────────────────────────────────────
 * Re-saving the same manager writes nothing. An audit trail whose entries are
 * mostly "changed from Rohan to Rohan" is one nobody reads.
 *
 * @returns whether anything was written.
 */
export async function recordManagerChange(input: {
  employeeId: string;
  managerId: string | null;
  changedById: string | null;
  note?: string | null;
  /** Injected so tests can pin the clock. */
  now?: Date;
}): Promise<{ changed: boolean }> {
  const today = isoDate(input.now ?? new Date());
  const nextManager = input.managerId ?? null;

  return await db.transaction(async (tx) => {
    const [open] = await tx
      .select()
      .from(employeeManagerHistory)
      .where(
        and(
          eq(employeeManagerHistory.employeeId, input.employeeId),
          isNull(employeeManagerHistory.effectiveTo),
        ),
      )
      .limit(1);

    if (open && (open.managerId ?? null) === nextManager) return { changed: false };

    if (open) {
      if (open.effectiveFrom === today) {
        // Same-day correction — rewrite the open period rather than stacking a
        // zero-length one behind it.
        await tx
          .update(employeeManagerHistory)
          .set({
            managerId: nextManager,
            changedById: input.changedById,
            note: input.note ?? open.note,
          })
          .where(eq(employeeManagerHistory.id, open.id));
        return { changed: true };
      }

      // The old period ends the day BEFORE the new one starts, so the two never
      // both contain `today` and `managerOn` has exactly one answer for it.
      await tx
        .update(employeeManagerHistory)
        .set({ effectiveTo: sql`(${today}::date - interval '1 day')::date` })
        .where(eq(employeeManagerHistory.id, open.id));
    }

    await tx.insert(employeeManagerHistory).values({
      employeeId: input.employeeId,
      managerId: nextManager,
      effectiveFrom: today,
      changedById: input.changedById,
      note: input.note ?? null,
    });

    return { changed: true };
  });
}

/**
 * THE ONE WRITE PATH for a reporting-manager change.
 *
 * Updates `employees.manager_id` AND records the interval, together. Every
 * surface that moves somebody — the admin employee editor, the bulk editor, the
 * hierarchy board — goes through here, so it is not possible to change a manager
 * and forget the history: there is no second place that writes the column.
 *
 * Validation that belongs to the CALLER (authorization, "is this a real
 * employee") is not repeated here, but the two rules that would corrupt the
 * TREE are enforced, because a cycle makes every recursive downline query in the
 * application hang or error:
 *   · nobody manages themselves
 *   · nobody manages one of their own ancestors
 */
export async function setReportingManager(input: {
  employeeId: string;
  managerId: string | null;
  changedById: string | null;
  note?: string | null;
  now?: Date;
}): Promise<{ ok: true; changed: boolean } | { ok: false; error: string }> {
  if (input.managerId && input.managerId === input.employeeId) {
    return { ok: false, error: "An employee can't be their own manager." };
  }

  if (input.managerId) {
    const cycle = await wouldCreateCycle(input.employeeId, input.managerId);
    if (cycle) {
      return {
        ok: false,
        error:
          "That would create a loop in the reporting chain — the chosen manager already reports to this employee.",
      };
    }
  }

  const [current] = await db
    .select({ managerId: employees.managerId })
    .from(employees)
    .where(eq(employees.id, input.employeeId))
    .limit(1);
  if (!current) return { ok: false, error: "Employee not found." };

  const next = input.managerId ?? null;
  if ((current.managerId ?? null) === next) {
    // Still reconcile the history: an employee whose column was set before this
    // table existed, or by a path that predates it, gets their open period
    // corrected without a spurious "change".
    await recordManagerChange({ ...input, managerId: next });
    return { ok: true, changed: false };
  }

  await db
    .update(employees)
    .set({ managerId: next })
    .where(eq(employees.id, input.employeeId));

  const { changed } = await recordManagerChange({ ...input, managerId: next });
  return { ok: true, changed };
}

/**
 * Would making `managerId` the manager of `employeeId` create a cycle?
 *
 * True when `managerId` is already somewhere BELOW `employeeId`. Walks up from
 * the proposed manager rather than down from the employee: the chain upward is
 * at most the depth of the org (a handful of rows), while the downline can be
 * most of the company.
 *
 * The step cap is a safety net for a cycle that already exists in the data —
 * without it this function would be the thing that hangs while detecting hangs.
 */
export async function wouldCreateCycle(
  employeeId: string,
  managerId: string,
): Promise<boolean> {
  let cursor: string | null = managerId;
  for (let steps = 0; cursor && steps < 64; steps += 1) {
    if (cursor === employeeId) return true;
    const [row] = await db
      .select({ managerId: employees.managerId })
      .from(employees)
      .where(eq(employees.id, cursor))
      .limit(1);
    cursor = row?.managerId ?? null;
  }
  return false;
}

/**
 * WHO MANAGED THIS PERSON ON THIS DATE.
 *
 * The question every historical report asks. Returns the manager id, or null for
 * "reported to nobody" — which the table records deliberately, and which is not
 * the same as "we have no record".
 *
 * `undefined` is that third answer: no period covers the date, i.e. the date is
 * before anything we know about. Callers that treat undefined as null would
 * silently report "no manager" for a period the company simply has no data for.
 */
export async function managerOn(
  employeeId: string,
  date: Date | string,
): Promise<string | null | undefined> {
  const day = typeof date === "string" ? date : isoDate(date);
  const [row] = await db
    .select({ managerId: employeeManagerHistory.managerId })
    .from(employeeManagerHistory)
    .where(
      and(
        eq(employeeManagerHistory.employeeId, employeeId),
        lte(employeeManagerHistory.effectiveFrom, day),
        or(
          isNull(employeeManagerHistory.effectiveTo),
          sql`${employeeManagerHistory.effectiveTo} >= ${day}`,
        ),
      ),
    )
    .orderBy(desc(employeeManagerHistory.effectiveFrom))
    .limit(1);
  if (!row) return undefined;
  return row.managerId ?? null;
}

/** Everyone who reported to `managerId` on `date` — the team-level historical
 *  read, for a manager dashboard asked about a past month. */
export async function reportsToOn(
  managerId: string,
  date: Date | string,
): Promise<string[]> {
  const day = typeof date === "string" ? date : isoDate(date);
  const rows = await db
    .select({ employeeId: employeeManagerHistory.employeeId })
    .from(employeeManagerHistory)
    .where(
      and(
        eq(employeeManagerHistory.managerId, managerId),
        lte(employeeManagerHistory.effectiveFrom, day),
        or(
          isNull(employeeManagerHistory.effectiveTo),
          sql`${employeeManagerHistory.effectiveTo} >= ${day}`,
        ),
      ),
    );
  return [...new Set(rows.map((r) => r.employeeId))];
}

/** One employee's full reporting history, oldest first — rendered on the
 *  hierarchy screen so a move is visible and auditable. */
export async function managerHistoryFor(employeeId: string): Promise<ManagerPeriod[]> {
  const rows = await db
    .select({
      managerId: employeeManagerHistory.managerId,
      effectiveFrom: employeeManagerHistory.effectiveFrom,
      effectiveTo: employeeManagerHistory.effectiveTo,
      changedById: employeeManagerHistory.changedById,
      note: employeeManagerHistory.note,
    })
    .from(employeeManagerHistory)
    .where(eq(employeeManagerHistory.employeeId, employeeId))
    .orderBy(asc(employeeManagerHistory.effectiveFrom));
  return rows;
}
