import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { opsVendorCategories, opsVendors } from "@/db/schema";
import { DOCUMENTS_BUCKET } from "@/lib/supabase/admin";
import { createSignedObjectUrl } from "@/lib/storage/objects";

const FILE_URL_TTL_SECONDS = 60 * 30;

/** One directory row as the page renders it. */
export interface VendorRow {
  id: string;
  category: string;
  firstName: string;
  lastName: string | null;
  companyName: string | null;
  cellNo: string | null;
  whatsappCellNo: string | null;
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
  officeOpenTime: string | null;
  officeEndTime: string | null;
  businessCardFrontPath: string | null;
  businessCardBackPath: string | null;
  cataloguePath: string | null;
  businessCardFrontUrl: string | null;
  businessCardBackUrl: string | null;
  catalogueUrl: string | null;
  additionalLinks: string[];
  notes: string | null;
  isActive: boolean;
}

export async function listVendors(): Promise<VendorRow[]> {
  const rows = await db
    .select({
      id: opsVendors.id,
      category: opsVendors.category,
      firstName: opsVendors.firstName,
      lastName: opsVendors.lastName,
      companyName: opsVendors.companyName,
      cellNo: opsVendors.cellNo,
      whatsappCellNo: opsVendors.whatsappCellNo,
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
      officeOpenTime: opsVendors.officeOpenTime,
      officeEndTime: opsVendors.officeEndTime,
      businessCardFrontPath: opsVendors.businessCardFrontPath,
      businessCardBackPath: opsVendors.businessCardBackPath,
      cataloguePath: opsVendors.cataloguePath,
      additionalLinks: opsVendors.additionalLinks,
      notes: opsVendors.notes,
      isActive: opsVendors.isActive,
    })
    .from(opsVendors)
    .orderBy(asc(opsVendors.category), asc(opsVendors.firstName));

  return Promise.all(
    rows.map(async (row) => {
      const [businessCardFrontUrl, businessCardBackUrl, catalogueUrl] = await Promise.all([
        row.businessCardFrontPath ? createSignedObjectUrl(DOCUMENTS_BUCKET, row.businessCardFrontPath, FILE_URL_TTL_SECONDS).catch(() => null) : null,
        row.businessCardBackPath ? createSignedObjectUrl(DOCUMENTS_BUCKET, row.businessCardBackPath, FILE_URL_TTL_SECONDS).catch(() => null) : null,
        row.cataloguePath ? createSignedObjectUrl(DOCUMENTS_BUCKET, row.cataloguePath, FILE_URL_TTL_SECONDS).catch(() => null) : null,
      ]);
      return { ...row, businessCardFrontUrl, businessCardBackUrl, catalogueUrl };
    }),
  );
}

export interface VendorCategoryRow {
  id: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
}

/** Active category names drive both Directory selection and the generated workbook. */
export async function listActiveVendorCategories(): Promise<VendorCategoryRow[]> {
  return db
    .select({ id: opsVendorCategories.id, name: opsVendorCategories.name, isActive: opsVendorCategories.isActive, sortOrder: opsVendorCategories.sortOrder })
    .from(opsVendorCategories)
    .where(eq(opsVendorCategories.isActive, true))
    .orderBy(asc(opsVendorCategories.sortOrder), asc(opsVendorCategories.name));
}

export async function listVendorCategories(): Promise<VendorCategoryRow[]> {
  return db
    .select({ id: opsVendorCategories.id, name: opsVendorCategories.name, isActive: opsVendorCategories.isActive, sortOrder: opsVendorCategories.sortOrder })
    .from(opsVendorCategories)
    .orderBy(asc(opsVendorCategories.isActive), asc(opsVendorCategories.sortOrder), asc(opsVendorCategories.name));
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
