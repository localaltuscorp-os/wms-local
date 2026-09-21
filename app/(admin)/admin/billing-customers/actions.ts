"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { billingCustomers } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/current";
import { requireModuleEdit } from "@/lib/permissions/resolve";
import { rateLimitOrError } from "@/lib/rate-limit";
import { BillingCustomerSchema } from "@/lib/validators/billing";

/**
 * ADMIN › BILLING CUSTOMERS — the bill-to master.
 *
 * Same guard stack as the other master screens: admin, then the permission
 * matrix for edit rights (so "Edit: NO" means something for a POST and not only
 * for a hidden button), then the rate limiter, then zod.
 *
 * NO DELETE, deliberately. `billing_documents.customer_id` points here and a
 * document must stay joinable to the customer it was raised for; deactivating
 * removes a customer from every new-document picker while history is untouched.
 */

const NODE = "admin.masters.billing-customers";
const PATHS = ["/admin/billing-customers", "/billing/documents"];

export type BillingAdminResult = { ok: true; id?: string } | { ok: false; error: string };

function bust(): void {
  for (const p of PATHS) revalidatePath(p);
}

export async function saveBillingCustomer(
  id: string | null,
  values: Record<string, unknown>,
): Promise<BillingAdminResult> {
  const me = await requireAdmin();
  await requireModuleEdit(NODE);
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return { ok: false, error: limited.error };

  if (id && !z.string().uuid().safeParse(id).success) return { ok: false, error: "Invalid id" };

  const parsed = BillingCustomerSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const v = parsed.data;

  const row = {
    name: v.name,
    legalName: v.legalName,
    contactName: v.contactName,
    email: v.email,
    whatsapp: v.whatsapp,
    phone: v.phone,
    pan: v.pan,
    gstin: v.gstin,
    addressLine1: v.addressLine1,
    addressLine2: v.addressLine2,
    city: v.city,
    stateName: v.stateName,
    stateCode: v.stateCode,
    pincode: v.pincode,
    country: v.country || "India",
    notes: v.notes,
    isActive: v.isActive,
    updatedById: me.id,
    updatedAt: new Date(),
  };

  try {
    if (id) {
      await db.update(billingCustomers).set(row).where(eq(billingCustomers.id, id));
      bust();
      return { ok: true, id };
    }
    const [created] = await db
      .insert(billingCustomers)
      .values({ ...row, createdById: me.id })
      .returning({ id: billingCustomers.id });
    bust();
    return { ok: true, id: created?.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/unique|duplicate/i.test(message)) {
      return { ok: false, error: `A customer called "${v.name}" already exists.` };
    }
    return { ok: false, error: `DB: ${message}` };
  }
}
