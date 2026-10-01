"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { opsVendorCategories, opsVendors } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { rateLimitOrError } from "@/lib/rate-limit";
import { isHrStaff } from "@/lib/hr/access";
import { DUMMY_MODE } from "@/lib/db/dummy-dir";
import { DOCUMENTS_BUCKET, getSupabaseAdmin, storageErrorMessage } from "@/lib/supabase/admin";
import { putObject } from "@/lib/storage/objects";
import { safeFileName, validateUpload, validateUploadMeta } from "@/lib/hr/upload";
import {
  normalizePincode,
  normalizeWebsite,
  vendorErrors,
  type VendorFields,
} from "@/lib/operations/directory";

type R<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

const PATH = "/operations/directory";
const CATEGORY_PATH = "/operations/directory/categories";
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
  companyName: text(160, "Company Name"),
  cellNo: text(24, "Cell No"),
  whatsappCellNo: text(24, "WhatsApp Cell No"),
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
  officeOpenTime: text(5, "Vendor Office Open Time"),
  officeEndTime: text(5, "Vendor Office End Time"),
  businessCardFrontPath: text(400, "Business Card Front"),
  businessCardBackPath: text(400, "Business Card Back"),
  cataloguePath: text(400, "PPT / Catalogue"),
  additionalLinks: text(2000, "Additional links"),
  notes: text(2000, "Notes"),
});

/** Validate one row and turn it into column values, or say what is wrong with it. */
function toValues(input: unknown, categories: Map<string, string>): { ok: true; values: ReturnType<typeof dbValues> } | { ok: false; error: string } {
  const parsed = VendorShape.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid details." };
  const errors = vendorErrors(parsed.data);
  if (errors.length) return { ok: false, error: `${errors.join("; ")}.` };
  const category = categories.get(parsed.data.category.trim().toLowerCase());
  if (!category) return { ok: false, error: "Vendor Category must be an active Vendor Category Master value." };
  const links = normalisedLinks(parsed.data.additionalLinks);
  if (!links.ok) return links;
  if (![parsed.data.businessCardFrontPath, parsed.data.businessCardBackPath, parsed.data.cataloguePath].every(isVendorStoragePath)) {
    return { ok: false, error: "An attachment does not belong to Vendor Directory." };
  }
  return { ok: true, values: dbValues(parsed.data, category, links.links) };
}

function dbValues(v: VendorFields, category: string, additionalLinks: string[]) {
  const t = (s: string) => s.trim() || null;
  return {
    category,
    firstName: v.firstName.trim(),
    lastName: t(v.lastName),
    companyName: t(v.companyName),
    cellNo: t(v.cellNo),
    whatsappCellNo: t(v.whatsappCellNo),
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
    officeOpenTime: t(v.officeOpenTime),
    officeEndTime: t(v.officeEndTime),
    businessCardFrontPath: t(v.businessCardFrontPath),
    businessCardBackPath: t(v.businessCardBackPath),
    cataloguePath: t(v.cataloguePath),
    additionalLinks,
    notes: t(v.notes),
  };
}

function normalisedLinks(raw: string): { ok: true; links: string[] } | { ok: false; error: string } {
  const links = raw.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean);
  if (links.length > 20) return { ok: false, error: "Use at most 20 additional links." };
  for (const link of links) {
    try {
      const parsed = new URL(normalizeWebsite(link));
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error();
    } catch {
      return { ok: false, error: `Additional link is not valid: ${link}` };
    }
  }
  return { ok: true, links: links.map(normalizeWebsite) };
}

function isVendorStoragePath(path: string): boolean {
  return !path.trim() || /^operations\/vendor-directory\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/.+/i.test(path.trim());
}

async function activeCategories(): Promise<Map<string, string>> {
  const rows = await db
    .select({ name: opsVendorCategories.name })
    .from(opsVendorCategories)
    .where(eq(opsVendorCategories.isActive, true));
  return new Map(rows.map((row) => [row.name.trim().toLowerCase(), row.name]));
}

export async function saveVendor(input: VendorFields & { id?: string }): Promise<R<{ id: string }>> {
  const who = await editor();
  if (!who.ok) return who;

  const { id, ...fields } = input;
  if (id && !z.string().uuid().safeParse(id).success) return { ok: false, error: "Invalid vendor." };
  const res = toValues(fields, await activeCategories());
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

const CategoryShape = z.object({
  id: z.string().uuid().optional(),
  name: text(80, "Category name").transform((value) => value.trim().replace(/\s+/g, " ")),
  sortOrder: z.number().int().min(0).max(9999).default(0),
});

/** Add or rename a Vendor Category Master entry. Renames follow its vendors. */
export async function saveVendorCategory(input: unknown): Promise<R<{ id: string }>> {
  const who = await editor();
  if (!who.ok) return who;
  const parsed = CategoryShape.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid category." };
  if (!parsed.data.name) return { ok: false, error: "Category name is required." };

  try {
    if (parsed.data.id) {
      const result = await db.transaction(async (tx) => {
        const [current] = await tx
          .select({ id: opsVendorCategories.id, name: opsVendorCategories.name })
          .from(opsVendorCategories)
          .where(eq(opsVendorCategories.id, parsed.data.id!))
          .limit(1);
        if (!current) return null;
        await tx
          .update(opsVendorCategories)
          .set({ name: parsed.data.name, sortOrder: parsed.data.sortOrder, updatedById: who.id, updatedAt: new Date() })
          .where(eq(opsVendorCategories.id, current.id));
        if (current.name !== parsed.data.name) {
          await tx.update(opsVendors).set({ category: parsed.data.name, updatedById: who.id, updatedAt: new Date() }).where(eq(opsVendors.category, current.name));
        }
        return current.id;
      });
      if (!result) return { ok: false, error: "That category no longer exists." };
      revalidateDirectory();
      return { ok: true, id: result };
    }
    const [row] = await db
      .insert(opsVendorCategories)
      .values({ name: parsed.data.name, sortOrder: parsed.data.sortOrder, createdById: who.id, updatedById: who.id })
      .returning({ id: opsVendorCategories.id });
    revalidateDirectory();
    return { ok: true, id: row!.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save the category.";
    return { ok: false, error: /ops_vendor_categories_name_uidx|unique/i.test(message) ? "That Vendor Category already exists." : message };
  }
}

/** Retire or restore a category without invalidating historical vendor records. */
export async function setVendorCategoryActive(id: string, active: boolean): Promise<R> {
  const who = await editor();
  if (!who.ok) return who;
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Invalid category." };
  await db
    .update(opsVendorCategories)
    .set({ isActive: Boolean(active), updatedById: who.id, updatedAt: new Date() })
    .where(eq(opsVendorCategories.id, id));
  revalidateDirectory();
  return { ok: true };
}

function revalidateDirectory() {
  revalidatePath(PATH);
  revalidatePath(CATEGORY_PATH);
}

const VENDOR_UPLOAD_KINDS = ["business-card-front", "business-card-back", "catalogue"] as const;
type VendorUploadKind = (typeof VENDOR_UPLOAD_KINDS)[number];

function isVendorUploadKind(value: string): value is VendorUploadKind {
  return (VENDOR_UPLOAD_KINDS as readonly string[]).includes(value);
}

function vendorUploadPath(employeeId: string, fileName: string): string {
  return `operations/vendor-directory/${employeeId}/${randomUUID()}/${safeFileName(fileName)}`;
}

function isOwnVendorUploadPath(path: string, employeeId: string): boolean {
  return path.startsWith(`operations/vendor-directory/${employeeId}/`) && isVendorStoragePath(path);
}

/** Mint a storage target; files go browser → private storage, never through a server-action body. */
export async function createVendorUploadUrl(input: {
  kind: string;
  fileName: string;
  size: number;
  mime?: string | null;
}): Promise<R<{ direct: boolean; bucket: string; path: string; token: string | null }>> {
  const who = await editor();
  if (!who.ok) return who;
  if (!isVendorUploadKind(String(input?.kind ?? ""))) return { ok: false, error: "Unknown vendor attachment." };
  const valid = validateUploadMeta({ fileName: String(input.fileName ?? ""), size: Number(input.size ?? 0), mime: input.mime });
  if (!valid.ok) return valid;
  const path = vendorUploadPath(who.id, input.fileName);
  if (DUMMY_MODE) return { ok: true, direct: false, bucket: DOCUMENTS_BUCKET, path, token: null };
  try {
    const { data, error } = await getSupabaseAdmin().storage.from(DOCUMENTS_BUCKET).createSignedUploadUrl(path);
    if (error || !data) return { ok: false, error: storageErrorMessage(error?.message ?? "Could not start the upload.") };
    return { ok: true, direct: true, bucket: DOCUMENTS_BUCKET, path, token: data.token };
  } catch (error) {
    return { ok: false, error: storageErrorMessage(error instanceof Error ? error.message : "Could not start the upload.") };
  }
}

/** Local dummy-mode fallback for the browser-signed upload flow. */
export async function uploadVendorFileDirect(fd: FormData): Promise<R<{ path: string }>> {
  const who = await editor();
  if (!who.ok) return who;
  if (!DUMMY_MODE) return { ok: false, error: "Uploads must go directly to file storage. Reload and try again." };
  const file = fd.get("file");
  const kind = String(fd.get("kind") ?? "");
  const path = String(fd.get("path") ?? "");
  if (!(file instanceof File)) return { ok: false, error: "No file provided." };
  if (!isVendorUploadKind(kind)) return { ok: false, error: "Unknown vendor attachment." };
  const valid = validateUpload(file);
  if (!valid.ok) return valid;
  if (!isOwnVendorUploadPath(path, who.id)) return { ok: false, error: "Invalid upload target." };
  const saved = await putObject(DOCUMENTS_BUCKET, path, Buffer.from(await file.arrayBuffer()), file.type || "application/octet-stream");
  return saved.ok ? { ok: true, path } : { ok: false, error: storageErrorMessage(saved.error) };
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
  const categories = await activeCategories();
  rows.forEach((row, i) => {
    const res = toValues(row, categories);
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
