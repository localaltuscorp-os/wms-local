import "server-only";

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { hrContacts, vendorRegistrationLinks } from "@/db/schema";
import { DOCUMENTS_BUCKET, getSupabaseAdmin, storageErrorMessage } from "@/lib/supabase/admin";
import { panFromGstin } from "@/lib/hr/vendor-tax";

const tokenHash = (token: string) => createHash("sha256").update(token, "utf8").digest("hex");
export const VENDOR_REGISTRATION_TTL_DAYS = 30;

const text = (max: number) => z.string().trim().max(max).optional().transform((value) => value || null);
const email = z.string().trim().max(160).optional().refine((value) => !value || z.string().email().safeParse(value).success, "Enter a valid email address.").transform((value) => value ? value.toLowerCase() : null);
const cell = z.string().trim().regex(/^\d{10}$/, "Enter a 10-digit cell number.");
const optionalCell = z.string().trim().optional().refine((value) => !value || /^\d{10}$/.test(value), "Enter a 10-digit cell number.").transform((value) => value || null);
const fileRef = z.object({ path: z.string().min(1).max(500), fileName: z.string().min(1).max(240), mime: z.string().max(120).nullable(), size: z.number().int().nonnegative().max(15 * 1024 * 1024) });

/** The first four fields and AMC / On-call are intentionally required, exactly
 * as specified for both vendor and HR-consultant registration. */
export const VendorRegistrationInput = z.object({
  firstName: z.string().trim().min(1, "Enter the first name.").max(80),
  lastName: z.string().trim().min(1, "Enter the last name.").max(80),
  cellNo: cell,
  category: z.string().trim().min(1, "Enter the category.").max(120),
  utility: text(120),
  amcOnCall: z.string().trim().min(1, "Choose AMC or On-call.").max(40),
  companyName: text(160),
  email,
  addressLine1: text(160),
  addressLine2: text(160),
  addressLine3: text(160),
  addressLine4: text(160),
  pincode: text(12),
  gstNo: text(30),
  panNo: text(20),
  gstName: text(160),
  accountName: text(160),
  accountNo: text(50),
  accountType: text(40),
  micrCode: text(20),
  branchAddress: text(240),
  bankPincode: text(12),
  contact1Name: text(120),
  contact1CellNo: optionalCell,
  contact1Email: email,
  contact2Name: text(120),
  contact2CellNo: optionalCell,
  contact2Email: email,
  attachments: z.object({
    gstCertificate: fileRef.optional(),
    panCard: fileRef.optional(),
    cancelledCheque: fileRef.optional(),
    upiScanner: fileRef.optional(),
  }).default({}),
});

export type VendorRegistrationValues = z.input<typeof VendorRegistrationInput>;

export function displayName(firstName: string | null, lastName: string | null, fallback: string): string {
  return [firstName, lastName].filter(Boolean).join(" ").trim() || fallback;
}

export async function resolveVendorRegistration(token: string | undefined | null) {
  if (!token || token.length < 32) return null;
  const [row] = await db
    .select({ link: vendorRegistrationLinks, contact: hrContacts })
    .from(vendorRegistrationLinks)
    .innerJoin(hrContacts, eq(vendorRegistrationLinks.contactId, hrContacts.id))
    .where(and(eq(vendorRegistrationLinks.tokenHash, tokenHash(token)), gt(vendorRegistrationLinks.expiresAt, new Date())))
    .limit(1);
  return row ?? null;
}

export async function issueVendorRegistrationLink(input: { contactId: string; createdById: string }) {
  const rawToken = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + VENDOR_REGISTRATION_TTL_DAYS * 24 * 60 * 60 * 1000);
  await db.insert(vendorRegistrationLinks).values({
    contactId: input.contactId,
    tokenHash: tokenHash(rawToken),
    expiresAt,
    createdById: input.createdById,
  });
  return { token: rawToken, expiresAt };
}

export async function submitVendorRegistration(token: string, input: unknown) {
  const context = await resolveVendorRegistration(token);
  if (!context) return { ok: false as const, error: "This registration link is invalid or has expired." };
  const parsed = VendorRegistrationInput.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Check the form details." };
  const values = parsed.data;
  const now = new Date();
  const bankDetails = {
    accountName: values.accountName ?? "", accountNo: values.accountNo ?? "", accountType: values.accountType ?? "",
    micrCode: values.micrCode ?? "", branchAddress: values.branchAddress ?? "", pincode: values.bankPincode ?? "",
  };
  await db.update(hrContacts).set({
    personName: displayName(values.firstName, values.lastName, context.contact.personName),
    firstName: values.firstName, lastName: values.lastName, cellNo: values.cellNo,
    category: values.category, utility: values.utility, amcOnCall: values.amcOnCall,
    companyName: values.companyName, email: values.email,
    addressLine1: values.addressLine1, addressLine2: values.addressLine2, addressLine3: values.addressLine3, addressLine4: values.addressLine4, pincode: values.pincode,
    gstNo: values.gstNo, panNo: panFromGstin(values.gstNo) ?? values.panNo, gstName: values.gstName,
    bankDetails, contact1Name: values.contact1Name, contact1CellNo: values.contact1CellNo, contact1Email: values.contact1Email,
    contact2Name: values.contact2Name, contact2CellNo: values.contact2CellNo, contact2Email: values.contact2Email,
    attachments: values.attachments, registrationSubmittedAt: now, updatedAt: now,
  }).where(eq(hrContacts.id, context.contact.id));
  await db.update(vendorRegistrationLinks).set({ submittedAt: now }).where(eq(vendorRegistrationLinks.id, context.link.id));
  return { ok: true as const };
}

const attachmentKeys = new Set(["gstCertificate", "panCard", "cancelledCheque", "upiScanner"]);

export async function mintVendorRegistrationUpload(token: string, input: { key: string; fileName: string; mime: string | null; size: number }) {
  const context = await resolveVendorRegistration(token);
  if (!context) return { ok: false as const, error: "This registration link is invalid or has expired." };
  if (!attachmentKeys.has(input.key) || !input.fileName.trim() || input.size < 1 || input.size > 15 * 1024 * 1024) return { ok: false as const, error: "Choose a document no larger than 15 MB." };
  const safeName = input.fileName.trim().replace(/[^A-Za-z0-9._-]/g, "_").slice(-180);
  const path = `vendor-registration/${context.contact.id}/${input.key}-${randomUUID()}-${safeName}`;
  try {
    const { data, error } = await getSupabaseAdmin().storage.from(DOCUMENTS_BUCKET).createSignedUploadUrl(path);
    if (error || !data) return { ok: false as const, error: storageErrorMessage(error?.message ?? "Could not start upload.") };
    return { ok: true as const, bucket: DOCUMENTS_BUCKET, path, token: data.token };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? storageErrorMessage(error.message) : "Could not start upload." };
  }
}
