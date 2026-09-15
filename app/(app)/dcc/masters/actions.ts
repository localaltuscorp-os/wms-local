"use server";

import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { dccMasterItems, designations } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { rateLimitOrError } from "@/lib/rate-limit";
import { parseAmount } from "@/lib/accounts/amounts";
import { isMissingTable, reconcileDccMasters } from "@/lib/dcc/master-sync";

/**
 * DCC MASTER authoring. Manan Sir and the super-admins only (account holder,
 * 2026-09-15): a master changes the DCC of everyone in a position at once.
 * Team Leads keep adding person-specific KPIs from the DCC board as before.
 *
 * Every change is applied to the holders before returning, so the author sees
 * the result on the page they are on.
 */

export type ActionResult<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };
function fail(error: string): { ok: false; error: string } {
  return { ok: false, error };
}

const NOT_ALLOWED = "Only Manan Sir and the super-admins can change a DCC Master.";
const NOT_SET_UP = "DCC Master isn't set up yet — migration 0230 must be applied first.";

const optText = z
  .preprocess((v) => (typeof v === "string" ? v.trim() : v), z.string().max(4000).nullable().optional())
  .transform((s) => (s ? s : null));

const Fields = z.object({
  section: optText,
  code: optText,
  title: z.string().trim().min(1, "A title is required.").max(2000),
  frequency: optText,
  targetNumber: z.any(),
  unit: optText,
});

function num(v: unknown): string | null {
  const n = parseAmount(typeof v === "string" || typeof v === "number" ? v : null);
  return n === null ? null : String(n);
}

async function authorOrFail() {
  const me = await requireUser();
  if (!isSuperAdmin(me.email)) return { me, error: fail(NOT_ALLOWED) };
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return { me, error: limited };
  return { me, error: null };
}

async function applyAndRefresh(): Promise<number> {
  const r = await reconcileDccMasters();
  revalidatePath("/dcc/masters");
  revalidatePath("/dcc");
  return r.created + r.updated + r.archived;
}

function errorResult(err: unknown): { ok: false; error: string } {
  if (isMissingTable(err)) return fail(NOT_SET_UP);
  return fail(err instanceof Error ? err.message : String(err));
}

export async function createDccMasterItem(input: unknown): Promise<ActionResult<{ id: string; changed: number }>> {
  const { me, error } = await authorOrFail();
  if (error) return error;
  const parsed = Fields.extend({ designationId: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  const d = parsed.data;
  try {
    const [desig] = await db.select({ id: designations.id }).from(designations).where(eq(designations.id, d.designationId)).limit(1);
    if (!desig) return fail("That position no longer exists.");
    const [next] = (await db
      .select({ n: sql<number>`coalesce(max(${dccMasterItems.sortOrder}), 0) + 1` })
      .from(dccMasterItems)
      .where(eq(dccMasterItems.designationId, d.designationId))) as Array<{ n: number }>;
    const [row] = await db
      .insert(dccMasterItems)
      .values({
        designationId: d.designationId,
        section: d.section,
        code: d.code,
        title: d.title,
        frequency: d.frequency,
        targetNumber: num(d.targetNumber),
        unit: d.unit,
        sortOrder: next?.n ?? 1,
        createdById: me.id,
        updatedById: me.id,
      })
      .returning({ id: dccMasterItems.id });
    return { ok: true, id: row!.id, changed: await applyAndRefresh() };
  } catch (err) {
    return errorResult(err);
  }
}

export async function updateDccMasterItem(input: unknown): Promise<ActionResult<{ changed: number }>> {
  const { me, error } = await authorOrFail();
  if (error) return error;
  const parsed = Fields.extend({ id: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  const { id, ...d } = parsed.data;
  try {
    const updated = await db
      .update(dccMasterItems)
      .set({
        section: d.section,
        code: d.code,
        title: d.title,
        frequency: d.frequency,
        targetNumber: num(d.targetNumber),
        unit: d.unit,
        updatedById: me.id,
        updatedAt: new Date(),
      })
      .where(eq(dccMasterItems.id, id))
      .returning({ id: dccMasterItems.id });
    if (updated.length === 0) return fail("That master KPI is gone.");
    return { ok: true, changed: await applyAndRefresh() };
  } catch (err) {
    return errorResult(err);
  }
}

/** Retire (or restore) a master KPI. Holders' copies are archived, never deleted. */
export async function setDccMasterItemActive(input: unknown): Promise<ActionResult<{ changed: number }>> {
  const { me, error } = await authorOrFail();
  if (error) return error;
  const parsed = z.object({ id: z.string().uuid(), isActive: z.boolean() }).safeParse(input);
  if (!parsed.success) return fail("Invalid input.");
  try {
    const updated = await db
      .update(dccMasterItems)
      .set({ isActive: parsed.data.isActive, updatedById: me.id, updatedAt: new Date() })
      .where(eq(dccMasterItems.id, parsed.data.id))
      .returning({ id: dccMasterItems.id });
    if (updated.length === 0) return fail("That master KPI is gone.");
    return { ok: true, changed: await applyAndRefresh() };
  } catch (err) {
    return errorResult(err);
  }
}
