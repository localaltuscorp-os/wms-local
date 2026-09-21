import "server-only";
import { asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { opsVendors } from "@/db/schema";

/** One directory row as the page renders it. */
export interface VendorRow {
  id: string;
  category: string;
  firstName: string;
  lastName: string | null;
  cellNo: string | null;
  email: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  addressLine3: string | null;
  addressLine4: string | null;
  landmark: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  website: string | null;
  amc: boolean;
  notes: string | null;
  isActive: boolean;
}

export async function listVendors(): Promise<VendorRow[]> {
  return db
    .select({
      id: opsVendors.id,
      category: opsVendors.category,
      firstName: opsVendors.firstName,
      lastName: opsVendors.lastName,
      cellNo: opsVendors.cellNo,
      email: opsVendors.email,
      addressLine1: opsVendors.addressLine1,
      addressLine2: opsVendors.addressLine2,
      addressLine3: opsVendors.addressLine3,
      addressLine4: opsVendors.addressLine4,
      landmark: opsVendors.landmark,
      city: opsVendors.city,
      state: opsVendors.state,
      pincode: opsVendors.pincode,
      website: opsVendors.website,
      amc: opsVendors.amc,
      notes: opsVendors.notes,
      isActive: opsVendors.isActive,
    })
    .from(opsVendors)
    .orderBy(asc(opsVendors.category), asc(opsVendors.firstName));
}

/**
 * True when a query failed because 0228 has not been applied yet (undefined
 * table / column). Migrations are applied by hand, so the page can be deployed
 * before its table exists; that window gets an actionable notice, not a 500.
 */
export function isMissingVendorTable(e: unknown): boolean {
  const codeOf = (v: unknown): unknown =>
    typeof v === "object" && v !== null ? (v as { code?: unknown }).code : undefined;
  const hit = (c: unknown) => c === "42P01" || c === "42703";
  if (hit(codeOf(e))) return true;
  const cause = typeof e === "object" && e !== null ? (e as { cause?: unknown }).cause : undefined;
  return hit(codeOf(cause));
}
