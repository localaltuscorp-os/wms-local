"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { opsVendors } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { rateLimitOrError } from "@/lib/rate-limit";
import { isHrStaff } from "@/lib/hr/access";
import {
  normalizePincode,
  normalizeWebsite,
  vendorErrors,
  type VendorFields,
} from "@/lib/operations/directory";

type R<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

const PATH = "/operations/directory";
const MAX_BULK_ROWS = 500;
const INSERT_CHUNK = 100;

/**
 * Directory writes. Ruchita, Rutvisha and Manan only (lib/operations/directory.ts)
 * — checked HERE on every write, because a hidden button is a courtesy and this
 * action is the rule.
 */
async function editor(): Promise<R<{ id: string }>> {
  const me = await requireUser();
  if (!(await isHrStaff(me))) {
    return { ok: false, error: "Only HR and super-admins can change the Directory." };
  }
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return { ok: false, error: limited.error };
  return { ok: true, id: me.id };
}

const text = (max: number, label: string) =>
  z.string().max(max, `${label} is too long (max ${max} characters).`);

/** Shape + length only. What makes a row VALID lives in `vendorErrors`, shared with the bulk review. */
const VendorShape = z.object({
  category: text(80, "Category"),
  firstName: text(80, "First Name"),
  lastName: text(80, "Last Name"),
  cellNo: text(24, "Cell No"),
  email: text(160, "Email"),
  addressLine1: text(200, "Address Line 1"),
  addressLine2: text(200, "Address Line 2"),
  addressLine3: text(200, "Address Line 3"),
  addressLine4: text(200, "Address Line 4"),
  landmark: text(160, "Nearby Landmark"),
  city: text(80, "City"),
  state: text(80, "State"),
  pincode: text(12, "Pincode"),
  website: text(300, "Website"),
  amc: z.boolean(),
  notes: text(2000, "Notes"),
});

/** Validate one row and turn it into column values, or say what is wrong with it. */
function toValues(input: unknown): { ok: true; values: ReturnType<typeof dbValues> } | { ok: false; error: string } {
  const parsed = VendorShape.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid details." };
  const errors = vendorErrors(parsed.data);
  if (errors.length) return { ok: false, error: `${errors.join("; ")}.` };
  return { ok: true, values: dbValues(parsed.data) };
}

function dbValues(v: VendorFields) {
  const t = (s: string) => s.trim() || null;
  return {
    category: v.category.trim(),
    firstName: v.firstName.trim(),
    lastName: t(v.lastName),
    cellNo: t(v.cellNo),
    email: t(v.email)?.toLowerCase() ?? null,
    addressLine1: t(v.addressLine1),
    addressLine2: t(v.addressLine2),
    addressLine3: t(v.addressLine3),
    addressLine4: t(v.addressLine4),
    landmark: t(v.landmark),
    city: t(v.city),
    state: t(v.state),
    pincode: normalizePincode(v.pincode) || null,
    website: normalizeWebsite(v.website) || null,
    amc: v.amc,
    notes: t(v.notes),
  };
}

export async function saveVendor(input: VendorFields & { id?: string }): Promise<R<{ id: string }>> {
  const who = await editor();
  if (!who.ok) return who;

  const { id, ...fields } = input;
  if (id && !z.string().uuid().safeParse(id).success) return { ok: false, error: "Invalid vendor." };
  const res = toValues(fields);
  if (!res.ok) return res;

  try {
    if (id) {
      const [row] = await db
        .update(opsVendors)
        .set({ ...res.values, updatedById: who.id, updatedAt: new Date() })
        .where(eq(opsVendors.id, id))
        .returning({ id: opsVendors.id });
      if (!row) return { ok: false, error: "That vendor no longer exists." };
      revalidatePath(PATH);
      return { ok: true, id: row.id };
    }
    const [row] = await db
      .insert(opsVendors)
      .values({ ...res.values, createdById: who.id, updatedById: who.id })
      .returning({ id: opsVendors.id });
    revalidatePath(PATH);
    return { ok: true, id: row!.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not save the vendor." };
  }
}

/** Mark a vendor active / inactive. Inactive vendors are kept and listed separately. */
export async function setVendorActive(id: string, active: boolean): Promise<R> {
  const who = await editor();
  if (!who.ok) return who;
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Invalid vendor." };
  await db
    .update(opsVendors)
    .set({ isActive: active, updatedById: who.id, updatedAt: new Date() })
    .where(eq(opsVendors.id, id));
  revalidatePath(PATH);
  return { ok: true };
}

export async function deleteVendor(id: string): Promise<R> {
  const who = await editor();
  if (!who.ok) return who;
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Invalid vendor." };
  await db.delete(opsVendors).where(eq(opsVendors.id, id));
  revalidatePath(PATH);
  return { ok: true };
}

/**
 * Bulk upload from the grid. Every row is re-validated here — the review step
 * is a preview, not a guarantee — and a bad row is reported as "Row N: …" and
 * skipped rather than failing the whole batch, the same contract as
 * bulkCreateTasks.
 */
export async function bulkCreateVendors(input: {
  rows: VendorFields[];
}): Promise<R<{ created: number; failed: string[] }>> {
  const who = await editor();
  if (!who.ok) return who;

  const rows = Array.isArray(input?.rows) ? input.rows : [];
  if (rows.length === 0) return { ok: false, error: "Add at least one vendor." };
  if (rows.length > MAX_BULK_ROWS) {
    return { ok: false, error: `Upload at most ${MAX_BULK_ROWS} vendors at a time.` };
  }

  const failed: string[] = [];
  const values: (ReturnType<typeof dbValues> & { createdById: string; updatedById: string })[] = [];
  rows.forEach((row, i) => {
    const res = toValues(row);
    if (!res.ok) failed.push(`Row ${i + 1}: ${res.error}`);
    else values.push({ ...res.values, createdById: who.id, updatedById: who.id });
  });

  if (values.length === 0) return { ok: false, error: failed[0] ?? "No valid rows to create." };

  try {
    for (let i = 0; i < values.length; i += INSERT_CHUNK) {
      await db.insert(opsVendors).values(values.slice(i, i + INSERT_CHUNK));
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not save the vendors." };
  }

  revalidatePath(PATH);
  return { ok: true, created: values.length, failed };
}
