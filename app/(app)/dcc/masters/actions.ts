"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { dccMasterItems } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { rateLimitOrError } from "@/lib/rate-limit";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { isMissingTable, reconcileDccMasters } from "@/lib/dcc/master-sync";

/**
 * EDITING A POSITION'S DCC MASTER (DCC-SPEC §3).
 *
 * Every write here ends in a RECONCILE, because a master that is saved but not
 * applied is worse than no master at all: the screen says the position carries
 * the duty and nobody's board shows it. The reconcile is idempotent and takes an
 * advisory lock, so two quick saves cannot give anybody the same KPI twice.
 *
 * WHO: admins and super-admins. A Team Lead authors KPIs for their own people
 * (app/(app)/dcc/actions.ts) — changing what a POSITION carries is a different
 * power, because it lands on everybody holding that seat, including people the
 * Team Lead has never met.
 */

export type MasterResult = { ok: true; changed?: number } | { ok: false; error: string };

const NOT_ALLOWED = "Only an admin can change what a position's DCC carries.";
const NEEDS_MIGRATION =
  "DCC Masters aren't set up in this database yet — migration 0230_dcc_master_items.sql must be applied.";

async function guard() {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return { ok: false as const, error: limited.error };
  if (!(me.isAdmin || isSuperAdmin(me.email))) return { ok: false as const, error: NOT_ALLOWED };
  return { ok: true as const, me };
}

const ItemInput = z.object({
  id: z.string().uuid().optional(),
  designationId: z.string().uuid(),
  title: z.string().trim().min(1).max(300),
  section: z.string().trim().max(120).nullable().optional(),
  code: z.string().trim().max(40).nullable().optional(),
  frequency: z.string().trim().max(120).nullable().optional(),
  targetNumber: z.string().trim().max(20).nullable().optional(),
  unit: z.string().trim().max(40).nullable().optional(),
  sortOrder: z.number().int().min(0).max(100_000).optional(),
});

export async function saveDccMasterItem(raw: z.input<typeof ItemInput>): Promise<MasterResult> {
  const g = await guard();
  if (!g.ok) return g;

  const parsed = ItemInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Give the compliance a title." };
  const d = parsed.data;

  const fields = {
    designationId: d.designationId,
    title: d.title,
    section: d.section || null,
    code: d.code || null,
    frequency: d.frequency || null,
    targetNumber: d.targetNumber || null,
    unit: d.unit || null,
    sortOrder: d.sortOrder ?? 100,
    updatedById: g.me.id,
    updatedAt: new Date(),
  };

  try {
    if (d.id) {
      await db.update(dccMasterItems).set(fields).where(eq(dccMasterItems.id, d.id));
    } else {
      await db.insert(dccMasterItems).values({ ...fields, createdById: g.me.id });
    }
  } catch (e) {
    if (isMissingTable(e)) return { ok: false, error: NEEDS_MIGRATION };
    throw e;
  }

  return finish();
}

/**
 * RETIRE, not delete. `is_active = false` archives every holder's copy on the
 * next reconcile while leaving the entries recorded against it untouched — those
 * are the record of what people actually did, and a hard delete would cascade
 * them away along with the template row.
 */
export async function retireDccMasterItem(id: string): Promise<MasterResult> {
  const g = await guard();
  if (!g.ok) return g;
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Unknown row." };

  try {
    await db
      .update(dccMasterItems)
      .set({ isActive: false, updatedById: g.me.id, updatedAt: new Date() })
      .where(eq(dccMasterItems.id, id));
  } catch (e) {
    if (isMissingTable(e)) return { ok: false, error: NEEDS_MIGRATION };
    throw e;
  }

  return finish();
}

export async function restoreDccMasterItem(id: string): Promise<MasterResult> {
  const g = await guard();
  if (!g.ok) return g;
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Unknown row." };

  try {
    await db
      .update(dccMasterItems)
      .set({ isActive: true, updatedById: g.me.id, updatedAt: new Date() })
      .where(eq(dccMasterItems.id, id));
  } catch (e) {
    if (isMissingTable(e)) return { ok: false, error: NEEDS_MIGRATION };
    throw e;
  }

  return finish();
}

/** Apply the masters to every holder, and refresh the screens that show them. */
async function finish(): Promise<MasterResult> {
  const res = await reconcileDccMasters();
  revalidatePath("/dcc/masters");
  revalidatePath("/dcc");
  return { ok: true, changed: res.created + res.updated + res.archived };
}

/** The "Apply to everyone now" button — a reconcile with no edit in front of it. */
export async function reconcileNow(): Promise<MasterResult> {
  const g = await guard();
  if (!g.ok) return g;
  return finish();
}
