"use server";

import { revalidatePath } from "next/cache";
import { eq, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { billingPaymentTerms, billingSacCodes } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/current";
import { requireModuleEdit } from "@/lib/permissions/resolve";
import { rateLimitOrError } from "@/lib/rate-limit";
import { BillingPaymentTermSchema, BillingSacCodeSchema } from "@/lib/validators/billing";

/**
 * ADMIN › BILLING LOOKUPS — payment terms and SAC codes.
 *
 * Both are soft-deleted via `is_active` so a document raised under a term or a
 * SAC code that is later retired stays joinable and still prints what it was
 * actually issued with.
 */

export type BillingAdminResult = { ok: true; id?: string } | { ok: false; error: string };

function bust(): void {
  for (const p of [
    "/admin/billing-payment-terms",
    "/admin/billing-sac-codes",
    "/billing/documents",
  ]) {
    revalidatePath(p);
  }
}

export async function saveBillingPaymentTerm(
  id: string | null,
  values: Record<string, unknown>,
): Promise<BillingAdminResult> {
  const me = await requireAdmin();
  await requireModuleEdit("admin.masters.billing-payment-terms");
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return { ok: false, error: limited.error };
  if (id && !z.string().uuid().safeParse(id).success) return { ok: false, error: "Invalid id" };

  const parsed = BillingPaymentTermSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const v = parsed.data;
  const row = {
    label: v.label,
    dueDays: v.dueDays,
    isDefault: v.isDefault,
    isActive: v.isActive,
    sortOrder: v.sortOrder,
    updatedAt: new Date(),
  };

  try {
    let savedId = id;
    if (id) {
      await db.update(billingPaymentTerms).set(row).where(eq(billingPaymentTerms.id, id));
    } else {
      const [created] = await db
        .insert(billingPaymentTerms)
        .values(row)
        .returning({ id: billingPaymentTerms.id });
      savedId = created?.id ?? null;
    }
    // Exactly one default, or the form has to guess which one wins.
    if (v.isDefault && savedId) {
      await db
        .update(billingPaymentTerms)
        .set({ isDefault: false })
        .where(ne(billingPaymentTerms.id, savedId));
    }
    bust();
    return { ok: true, id: savedId ?? undefined };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/unique|duplicate/i.test(message)) {
      return { ok: false, error: `A payment term called "${v.label}" already exists.` };
    }
    return { ok: false, error: `DB: ${message}` };
  }
}

export async function saveBillingSacCode(
  id: string | null,
  values: Record<string, unknown>,
): Promise<BillingAdminResult> {
  const me = await requireAdmin();
  await requireModuleEdit("admin.masters.billing-sac-codes");
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return { ok: false, error: limited.error };
  if (id && !z.string().uuid().safeParse(id).success) return { ok: false, error: "Invalid id" };

  const parsed = BillingSacCodeSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const v = parsed.data;
  const row = {
    code: v.code,
    description: v.description,
    defaultGstRate: v.defaultGstRate === null ? null : String(v.defaultGstRate),
    isActive: v.isActive,
    sortOrder: v.sortOrder,
    updatedAt: new Date(),
  };

  try {
    if (id) {
      await db.update(billingSacCodes).set(row).where(eq(billingSacCodes.id, id));
      bust();
      return { ok: true, id };
    }
    const [created] = await db.insert(billingSacCodes).values(row).returning({ id: billingSacCodes.id });
    bust();
    return { ok: true, id: created?.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/unique|duplicate/i.test(message)) {
      return { ok: false, error: `SAC code ${v.code} already exists.` };
    }
    return { ok: false, error: `DB: ${message}` };
  }
}
