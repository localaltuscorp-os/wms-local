import "server-only";
import { sql } from "drizzle-orm";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees } from "@/db/schema";

/**
 * A manual display order among people sharing the same manager (migration
 * 0251) — "move a full card up/down" on Team Reporting.
 *
 * `sort_order` is deliberately NOT a column on `employees` in db/schema.ts —
 * see lib/hr/background-check.ts's note for why: `localSessionEmployee` runs
 * a full-row `select()` on every request, so naming an unmigrated column
 * there costs sign-in, not just this feature. Read and written here by name,
 * tolerant of a database without 0251 (reorder attempts just fail cleanly).
 */

type Result = { ok: true } | { ok: false; error: string };

/** id → sort_order (or null), for every active employee. Empty map on a
 *  database without 0251 — callers then fall back to their existing order. */
export async function loadSortOrders(): Promise<Map<string, number | null>> {
  try {
    const rows = (await db.execute(sql`
      SELECT id, sort_order FROM employees WHERE is_active = true
    `)) as unknown as Array<{ id: string; sort_order: number | null }>;
    return new Map(rows.map((r) => [r.id, r.sort_order]));
  } catch {
    return new Map();
  }
}

/**
 * Move `employeeId` one place up or down among its SIBLINGS — everyone
 * currently sharing its `manager_id` (including the "No manager assigned"
 * group, siblings there share `manager_id IS NULL`).
 *
 * NORMALIZES the whole sibling group to clean sequential values first (10,
 * 20, 30…) from whatever order they currently read in (existing sort_order
 * where set, falling back to the same join-order/id tiebreak
 * `lib/queries/hierarchy.ts` uses), THEN swaps the mover with its neighbour.
 * A one-shot swap of two possibly-null values could not otherwise guarantee
 * moving even one visible place, since ties and nulls collapse together.
 */
export async function reorderSibling(employeeId: string, direction: "up" | "down"): Promise<Result> {
  try {
    const [mover] = await db
      .select({ id: employees.id, managerId: employees.managerId })
      .from(employees)
      .where(and(eq(employees.id, employeeId), eq(employees.isActive, true)))
      .limit(1);
    if (!mover) return { ok: false, error: "Employee not found." };

    const siblingRows = await db
      .select({ id: employees.id, createdAt: employees.createdAt })
      .from(employees)
      .where(
        mover.managerId === null
          ? and(sql`${employees.managerId} IS NULL`, eq(employees.isActive, true))
          : and(eq(employees.managerId, mover.managerId), eq(employees.isActive, true)),
      );
    if (siblingRows.length < 2) return { ok: true }; // nothing to reorder against

    const sortOrders = await loadSortOrders();
    const ordered = [...siblingRows].sort((a, b) => {
      const soA = sortOrders.get(a.id) ?? null;
      const soB = sortOrders.get(b.id) ?? null;
      if (soA !== null || soB !== null) return (soA ?? Infinity) - (soB ?? Infinity);
      return a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id);
    });

    const index = ordered.findIndex((r) => r.id === employeeId);
    const swapWith = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || swapWith < 0 || swapWith >= ordered.length) return { ok: true }; // already at the edge

    // Normalize everyone to 10, 20, 30… (their current order), then swap the
    // two positions being moved.
    const next = ordered.map((r, i) => ({ id: r.id, order: (i + 1) * 10 }));
    const a = next[index]!;
    const b = next[swapWith]!;
    [a.order, b.order] = [b.order, a.order];

    for (const row of next) {
      await db.execute(sql`UPDATE employees SET sort_order = ${row.order} WHERE id = ${row.id}`);
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Manual ordering isn't set up on this database yet." };
  }
}
