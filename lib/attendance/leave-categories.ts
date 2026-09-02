import "server-only";
import { and, asc, eq, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { leaveCategories } from "@/db/schema";

/**
 * LEAVE CATEGORIES — the human reason on a leave request, and the one part of
 * the leave form the business is meant to edit for itself (0208).
 *
 * ── WHY THIS IS NOT `leave_requests.kind` ──────────────────────────────────
 * `kind` is 'paid' | 'unpaid'. The salary engine branches on it, `leaveDays`
 * charges an allowance against it, and the encashment close reads it. It has to
 * stay a closed union that no form can extend, because a new value there is a
 * new payroll behaviour nobody wrote.
 *
 * The category — Casual, Sick, Exam, Death — answers a completely different
 * question and is EXPECTED to grow. Keeping the two apart is what lets HR add
 * "Paternity Leave" on a Tuesday afternoon without anyone thinking about money.
 *
 * ── RETIRE, NEVER DELETE ───────────────────────────────────────────────────
 * A leave taken last March under "Family Duties" must keep saying so after
 * someone tidies the dropdown. Deleting the row would blank the category on
 * every historical request that pointed at it (ON DELETE SET NULL) — rewriting
 * the past to tidy the present. `is_active = false` removes it from the picker
 * and leaves the history intact.
 *
 * The uniqueness index is partial on `is_active`, so retiring "Vacation" also
 * frees the name to be added again later.
 */

export interface LeaveCategoryRow {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
}

/** The dropdown, in the order the business thinks in. */
export async function listLeaveCategories(
  opts: { includeInactive?: boolean } = {},
): Promise<LeaveCategoryRow[]> {
  return db
    .select({
      id: leaveCategories.id,
      name: leaveCategories.name,
      sortOrder: leaveCategories.sortOrder,
      isActive: leaveCategories.isActive,
    })
    .from(leaveCategories)
    .where(opts.includeInactive ? undefined : eq(leaveCategories.isActive, true))
    .orderBy(asc(leaveCategories.sortOrder), asc(leaveCategories.name));
}

/**
 * Is this id a category an employee may actually pick right now?
 *
 * The server action calls this rather than trusting the id off the form: a
 * retired category is absent from the picker but its id is perfectly guessable,
 * and nothing in the schema stops a request pointing at one.
 */
export async function isSelectableLeaveCategory(id: string): Promise<boolean> {
  const [row] = await db
    .select({ id: leaveCategories.id })
    .from(leaveCategories)
    .where(and(eq(leaveCategories.id, id), eq(leaveCategories.isActive, true)))
    .limit(1);
  return !!row;
}

export type SaveResult = { ok: true; id: string } | { ok: false; error: string };

/**
 * Create or rename a category.
 *
 * The duplicate check is done HERE, case-insensitively and against active rows
 * only, so the partial unique index never surfaces as a raw Postgres error. It
 * mirrors the index exactly — including the `is_active` predicate — because a
 * friendlier check that disagreed with the constraint would reject names the DB
 * would have accepted.
 */
export async function saveLeaveCategory(input: {
  id?: string;
  name: string;
  sortOrder?: number;
  actorId: string;
}): Promise<SaveResult> {
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Give the category a name." };

  const clash = await db
    .select({ id: leaveCategories.id })
    .from(leaveCategories)
    .where(
      and(
        sql`lower(${leaveCategories.name}) = lower(${name})`,
        eq(leaveCategories.isActive, true),
        input.id ? ne(leaveCategories.id, input.id) : undefined,
      ),
    )
    .limit(1);
  if (clash[0]) return { ok: false, error: `"${name}" is already in the list.` };

  try {
    if (input.id) {
      const [row] = await db
        .update(leaveCategories)
        .set({
          name,
          ...(input.sortOrder != null ? { sortOrder: input.sortOrder } : {}),
          updatedAt: new Date(),
        })
        .where(eq(leaveCategories.id, input.id))
        .returning({ id: leaveCategories.id });
      if (!row) return { ok: false, error: "That category no longer exists." };
      return { ok: true, id: row.id };
    }

    const [row] = await db
      .insert(leaveCategories)
      .values({
        name,
        // New categories land at the END of the list rather than jostling the
        // seven the business already reads in a fixed order.
        sortOrder: input.sortOrder ?? (await nextSortOrder()),
        createdById: input.actorId,
      })
      .returning({ id: leaveCategories.id });
    if (!row) return { ok: false, error: "Could not save the category." };
    return { ok: true, id: row.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not save the category." };
  }
}

async function nextSortOrder(): Promise<number> {
  const [row] = await db
    .select({ max: sql<number>`coalesce(max(${leaveCategories.sortOrder}), 0)` })
    .from(leaveCategories);
  return Number(row?.max ?? 0) + 10;
}

/** Take a category out of the picker without touching the leaves that used it. */
export async function setLeaveCategoryActive(
  id: string,
  isActive: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  // REVIVING can collide: the unique index is partial on `is_active`, so while
  // "Vacation" sat retired someone may have added a second "Vacation". Refuse
  // in words here rather than letting the index refuse in Postgres.
  if (isActive) {
    const [row] = await db
      .select({ name: leaveCategories.name })
      .from(leaveCategories)
      .where(eq(leaveCategories.id, id))
      .limit(1);
    if (!row) return { ok: false, error: "That category no longer exists." };
    const clash = await db
      .select({ id: leaveCategories.id })
      .from(leaveCategories)
      .where(
        and(
          sql`lower(${leaveCategories.name}) = lower(${row.name})`,
          eq(leaveCategories.isActive, true),
          ne(leaveCategories.id, id),
        ),
      )
      .limit(1);
    if (clash[0]) {
      return { ok: false, error: `"${row.name}" is already in the list — rename one of them first.` };
    }
  }

  try {
    await db
      .update(leaveCategories)
      .set({ isActive, updatedAt: new Date() })
      .where(eq(leaveCategories.id, id));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not update the category." };
  }
}
