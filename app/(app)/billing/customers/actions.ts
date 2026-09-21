"use server";

import { revalidatePath } from "next/cache";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { billingCustomers, billingLookups, departments, employeeDepartments } from "@/db/schema";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { rateLimitOrError } from "@/lib/rate-limit";
import { canEditLookup, lookupList, type LookupList } from "@/lib/billing/lookups";
import type { Employee } from "@/db/schema";

export type ActionResult<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

function firstIssue(e: z.ZodError): string {
  return e.issues[0]?.message ?? "That input is not valid.";
}

/**
 * THE PERMISSION GATE for the two description masters.
 *
 * Manan, 2026-09-17: only Accounts and he may add to Product Description and
 * Service Description. Everything else on the master is open.
 *
 * The department is read here rather than passed from the browser for the
 * obvious reason — a client that can say which team it belongs to is not a
 * permission check. Read once per action; these lists are edited rarely.
 */
type Guard =
  | { ok: false; error: string }
  | { ok: true; me: Employee; list: LookupList };

async function guard(kind: string): Promise<Guard> {
  const me = await requireWorkspace("billing");
  const list = lookupList(kind);
  if (!list) return { ok: false, error: `"${kind}" is not a list on this master.` };

  if (list.restricted) {
    const rows = await db
      .select({ name: departments.name })
      .from(employeeDepartments)
      .innerJoin(departments, eq(departments.id, employeeDepartments.departmentId))
      .where(eq(employeeDepartments.employeeId, me.id));
    if (!canEditLookup(list, me, rows.map((r) => r.name))) {
      return {
        ok: false,
        error:
          `${list.label} can only be changed by Accounts or by Manan Vasa — these options are ` +
          `printed on documents that leave the company.`,
      };
    }
  }
  return { ok: true, me, list };
}

function revalidate() {
  revalidatePath("/billing/customers/new");
  revalidatePath("/billing/recycle-bin");
}

const RestoreSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(["customer", "option"]),
});

/**
 * PUT SOMETHING BACK from the recycle bin.
 *
 * Restoring is clearing `deleted_at` — the row never left, so everything it
 * referenced and everything that referenced it is still intact and no ids
 * change. That is the whole reason removal is a timestamp.
 *
 * A restored dropdown option can collide with one added in the meantime, since
 * the unique index only covers live rows. Checked here so the answer is a
 * sentence rather than a constraint violation.
 */
export async function restoreFromBinAction(raw: unknown): Promise<ActionResult> {
  const parsed = RestoreSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const { id, kind } = parsed.data;

  const me = await requireWorkspace("billing");
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  if (kind === "customer") {
    await db
      .update(billingCustomers)
      .set({ deletedAt: null, deletedById: null })
      .where(eq(billingCustomers.id, id));
    revalidatePath("/billing/customers");
    revalidatePath("/billing/customers/addresses");
    revalidatePath("/billing/recycle-bin");
    return { ok: true };
  }

  const [row] = await db
    .select({ kind: billingLookups.kind, value: billingLookups.value })
    .from(billingLookups)
    .where(eq(billingLookups.id, id))
    .limit(1);
  if (!row) return { ok: false, error: "That option no longer exists." };

  const g = await guard(row.kind);
  if (!g.ok) return { ok: false, error: g.error };

  const clash = await db
    .select({ id: billingLookups.id })
    .from(billingLookups)
    .where(
      and(
        eq(billingLookups.kind, row.kind),
        sql`lower(${billingLookups.value}) = lower(${row.value})`,
        isNull(billingLookups.deletedAt),
      ),
    )
    .limit(1);
  if (clash.length > 0) {
    return {
      ok: false,
      error: `"${row.value}" was added back to ${g.list.label} in the meantime, so there is nothing to restore.`,
    };
  }

  await db.update(billingLookups).set({ deletedAt: null }).where(eq(billingLookups.id, id));
  revalidate();
  return { ok: true };
}
