import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { vendors, type Vendor } from "@/db/schema";

/**
 * The VENDOR master (migration 0184) — the external parties a goal or a project
 * action can be tagged to. Mirrors lib/queries/departments.ts: pickers read the
 * ACTIVE list, the admin surface reads everything (so a retired vendor is still
 * visible and can be re-activated).
 */

/** Every vendor, ordered by sort_order then name — includes inactive rows. */
export async function listVendors(): Promise<Vendor[]> {
  return db.select().from(vendors).orderBy(asc(vendors.sortOrder), asc(vendors.name));
}

/** Active vendors only — what the goal / project pickers offer. */
export async function listActiveVendors(): Promise<Vendor[]> {
  return db
    .select()
    .from(vendors)
    .where(eq(vendors.isActive, true))
    .orderBy(asc(vendors.sortOrder), asc(vendors.name));
}

/** `{value,label}` options for a managed dropdown. */
export async function listVendorOptions(): Promise<{ value: string; label: string }[]> {
  const rows = await listActiveVendors();
  return rows.map((v) => ({ value: v.id, label: v.name }));
}
