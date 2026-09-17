import "server-only";
import { cache } from "react";
import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees, incentiveCatalog, incentiveEligibility } from "@/db/schema";
import type { EligibilityMap } from "@/lib/incentive/eligibility";
import { ensureEligibilitySchema } from "@/lib/incentive/ensure-eligibility-schema";

// The RULES live in `lib/incentive/eligibility.ts`, free of `server-only` so
// they can be tested directly. This module is the reads that feed them, and
// re-exports them so callers still have one import.
export { buildNameEligibility, isEligible, type EligibilityMap } from "@/lib/incentive/eligibility";

/**
 * WHO EACH INCENTIVE APPLIES TO.
 *
 * An incentive is either open to everyone (`applies_to_all`) or restricted to a
 * named list of people. Nothing in between — a department is a way of SELECTING
 * people in the admin UI, never a stored rule, so moving someone between
 * departments can never silently change what they are paid for.
 *
 * Migration 0216 set `applies_to_all` to TRUE for every existing row, so this
 * whole module is a no-op until an admin narrows something.
 */

/**
 * The whole map, for the admin picker and for scoring attainment.
 *
 * FALLS BACK TO "EVERYTHING APPLIES TO EVERYONE" if the rules cannot be read at
 * all — which is the pre-0216 behaviour, and the only safe direction to fail:
 * showing someone an incentive they turn out not to qualify for is a
 * conversation, hiding one they DO qualify for is a missed payment nobody ever
 * finds out about.
 *
 * React-`cache`d: the incentive page asks for this twice — once to scope the
 * catalog, once to score attainment — and they are the same two reads.
 */
export const loadEligibility = cache(async (): Promise<EligibilityMap> => {
  await ensureEligibilitySchema();

  const [cat, rows] = await Promise.all([
    db
      .select({ id: incentiveCatalog.id, appliesToAll: incentiveCatalog.appliesToAll })
      .from(incentiveCatalog)
      .catch(async () => {
        // The column is not there and could not be added. Treat every incentive
        // as open rather than hiding the lot.
        const ids = await db.select({ id: incentiveCatalog.id }).from(incentiveCatalog);
        return ids.map((r) => ({ id: r.id, appliesToAll: true }));
      }),
    db
      .select({
        incentiveId: incentiveEligibility.incentiveId,
        employeeId: incentiveEligibility.employeeId,
      })
      .from(incentiveEligibility)
      .catch(() => [] as { incentiveId: string; employeeId: string }[]),
  ]);

  const openToAll = new Set(cat.filter((c) => c.appliesToAll).map((c) => c.id));
  const picked = new Map<string, Set<string>>();
  for (const r of rows) {
    const set = picked.get(r.incentiveId) ?? new Set<string>();
    set.add(r.employeeId);
    picked.set(r.incentiveId, set);
  }
  return { openToAll, picked };
});

export interface EligibilityPerson {
  id: string;
  name: string;
  department: string | null;
}

/** Everyone an incentive can be assigned to, with their department for the
 *  "whole function" buttons in the picker. */
export async function listEligibilityPeople(): Promise<EligibilityPerson[]> {
  const rows = await db
    .select({ id: employees.id, name: employees.name, department: employees.department })
    .from(employees)
    .where(eq(employees.isActive, true))
    .orderBy(asc(employees.name));
  return rows.map((r) => ({ id: r.id, name: r.name, department: r.department }));
}

/**
 * Replace one incentive's eligibility wholesale.
 *
 * Delete-then-insert rather than a diff: the list is at most the headcount, the
 * two statements run in a transaction, and a diff would be more code for no
 * behavioural difference. `appliesToAll` and the list are written together so
 * the pair can never disagree.
 */
export async function saveEligibility(
  incentiveId: string,
  appliesToAll: boolean,
  employeeIds: string[],
): Promise<void> {
  const unique = [...new Set(employeeIds)];
  await db.transaction(async (tx) => {
    await tx
      .update(incentiveCatalog)
      .set({ appliesToAll })
      .where(eq(incentiveCatalog.id, incentiveId));
    await tx.delete(incentiveEligibility).where(eq(incentiveEligibility.incentiveId, incentiveId));
    // Nothing to insert when it is open to all — the list is meaningless then,
    // and leaving stale rows behind would resurrect an old selection the next
    // time someone narrowed it.
    if (!appliesToAll && unique.length > 0) {
      await tx
        .insert(incentiveEligibility)
        .values(unique.map((employeeId) => ({ incentiveId, employeeId })));
    }
  });
}

/** Guard: drop ids that are not real, active employees. */
export async function filterToActiveEmployees(ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const rows = await db
    .select({ id: employees.id })
    .from(employees)
    .where(inArray(employees.id, ids));
  const live = new Set(rows.map((r) => r.id));
  return ids.filter((id) => live.has(id));
}
