"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { hrContacts } from "@/db/schema";
import { requireHrStaff } from "@/lib/hr/access";
import { rateLimitOrError } from "@/lib/rate-limit";
import { isMissingRegisterTable, listDirectoryContacts } from "@/lib/hr/registers-server";
import { directoryReport, safeDirectoryType } from "@/lib/hr/directory";
import { issueVendorRegistrationLink, VendorRegistrationInput } from "@/lib/hr/vendor-registration";
import { renderSectionPdf } from "@/lib/reports/section-pdf";
import { snapshotFilename } from "@/lib/reports/section-report";
import { companyBcc, clampSubject, FROM, getResend } from "@/lib/email/resend";
import { siteUrl } from "@/lib/site-url";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const ContactSchema = VendorRegistrationInput.extend({
  id: z.string().uuid().optional(),
  directoryType: z.enum(["vendor", "hr_consultant"]),
  rateNegotiated: z.string().trim().max(40).optional().transform((value) => value || null),
  paymentTerms: z.string().trim().max(80).optional().transform((value) => value || null),
  notes: z.string().trim().max(1000).optional().transform((value) => value || null),
});

const InviteSchema = z.object({
  firstName: z.string().trim().min(1, "Enter the first name.").max(80),
  lastName: z.string().trim().min(1, "Enter the last name.").max(80),
  cellNo: z.string().trim().regex(/^\d{10}$/, "Enter a 10-digit cell number."),
  companyName: z.string().trim().max(160).optional().transform((value) => value || null),
});

async function editor(): Promise<Result<{ id: string; email: string; officialEmail: string | null }>> {
  const me = await requireHrStaff();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return { ok: false, error: limited.error };
  return { ok: true, id: me.id, email: me.email, officialEmail: me.officialEmail };
}

function revalidateDirectory(): void {
  revalidatePath("/hr/directory");
  revalidatePath("/hr/address-book");
}

export async function saveDirectoryContact(input: unknown): Promise<Result<{ id: string }>> {
  const who = await editor();
  if (!who.ok) return who;
  const parsed = ContactSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid directory contact." };
  const { id, directoryType, accountName, accountNo, accountType, micrCode, branchAddress, bankPincode, ...values } = parsed.data;
  const data = {
    ...values,
    personName: `${values.firstName} ${values.lastName}`.trim(),
    directoryType: safeDirectoryType(directoryType),
    service: values.category,
    bankDetails: { accountName: accountName ?? "", accountNo: accountNo ?? "", accountType: accountType ?? "", micrCode: micrCode ?? "", branchAddress: branchAddress ?? "", pincode: bankPincode ?? "" },
    updatedById: who.id,
    updatedAt: new Date(),
  };
  try {
    if (id) {
      const [row] = await db.update(hrContacts).set(data).where(eq(hrContacts.id, id)).returning({ id: hrContacts.id });
      if (!row) return { ok: false, error: "That directory contact no longer exists." };
      revalidateDirectory();
      return { ok: true, id: row.id };
    }
    const [row] = await db.insert(hrContacts).values({ ...data, createdById: who.id }).returning({ id: hrContacts.id });
    revalidateDirectory();
    return { ok: true, id: row!.id };
  } catch (error) {
    if (isMissingRegisterTable(error)) {
      return { ok: false, error: "This database needs migration 0264 before Directory entries can be edited. Use the local test workspace to test every control." };
    }
    return { ok: false, error: error instanceof Error ? error.message : "Could not save the directory contact." };
  }
}

/** Creates the small prefilled record and a secure link that can be copied or
 * shared on WhatsApp. The vendor completes the rest without a dashboard login. */
export async function createVendorRegistrationLink(input: unknown): Promise<Result<{ url: string; expiresAt: string }>> {
  const who = await editor();
  if (!who.ok) return who;
  const parsed = InviteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the invite details." };
  try {
    const invite = parsed.data;
    const [contact] = await db.insert(hrContacts).values({
      directoryType: "vendor",
      firstName: invite.firstName,
      lastName: invite.lastName,
      personName: `${invite.firstName} ${invite.lastName}`.trim(),
      cellNo: invite.cellNo,
      companyName: invite.companyName,
      service: "Pending registration",
      createdById: who.id,
      updatedById: who.id,
    }).returning({ id: hrContacts.id });
    if (!contact) return { ok: false, error: "Could not create the vendor invitation." };
    const issued = await issueVendorRegistrationLink({ contactId: contact.id, createdById: who.id });
    revalidateDirectory();
    return { ok: true, url: `${siteUrl()}/vendor-registration/${encodeURIComponent(issued.token)}`, expiresAt: issued.expiresAt.toISOString() };
  } catch (error) {
    if (isMissingRegisterTable(error)) return { ok: false, error: "Run migration 0269 before creating vendor registration links." };
    return { ok: false, error: error instanceof Error ? error.message : "Could not create the vendor registration link." };
  }
}

/** Reissues a private form link for an existing vendor record. Each vendor gets
 * their own token and therefore sees only their own prefilled registration. */
export async function createVendorRegistrationLinkForContact(contactId: string): Promise<Result<{ url: string; expiresAt: string }>> {
  const who = await editor();
  if (!who.ok) return who;
  if (!z.string().uuid().safeParse(contactId).success) return { ok: false, error: "Invalid vendor record." };
  try {
    const [contact] = await db.select({ id: hrContacts.id, directoryType: hrContacts.directoryType }).from(hrContacts).where(eq(hrContacts.id, contactId)).limit(1);
    if (!contact || contact.directoryType !== "vendor") return { ok: false, error: "That vendor record is no longer available." };
    const issued = await issueVendorRegistrationLink({ contactId: contact.id, createdById: who.id });
    return { ok: true, url: `${siteUrl()}/vendor-registration/${encodeURIComponent(issued.token)}`, expiresAt: issued.expiresAt.toISOString() };
  } catch (error) {
    if (isMissingRegisterTable(error)) return { ok: false, error: "Run migration 0269 before creating vendor registration links." };
    return { ok: false, error: error instanceof Error ? error.message : "Could not create the vendor registration link." };
  }
}

export async function setDirectoryContactActive(id: string, active: boolean): Promise<Result> {
  const who = await editor();
  if (!who.ok) return who;
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Invalid directory contact." };
  try {
    await db.update(hrContacts).set({ isActive: active, updatedById: who.id, updatedAt: new Date() }).where(eq(hrContacts.id, id));
    revalidateDirectory();
    return { ok: true };
  } catch (error) {
    if (isMissingRegisterTable(error)) {
      return { ok: false, error: "This database needs migration 0264 before Directory entries can be changed." };
    }
    return { ok: false, error: error instanceof Error ? error.message : "Could not update the directory contact." };
  }
}

/** Sends the complete active directory PDF to the signed-in HR staff member only. */
export async function emailDirectoryPdf(): Promise<Result<{ to: string }>> {
  const who = await editor();
  if (!who.ok) return who;
  const resend = getResend();
  if (!resend) return { ok: false, error: "Email is not configured." };
  const contacts = await listDirectoryContacts();
  const report = directoryReport(contacts);
  const pdf = await renderSectionPdf(report);
  const to = who.officialEmail?.trim() || who.email;
  if (!to) return { ok: false, error: "Your account has no email address." };
  const { error } = await resend.emails.send({
    from: FROM,
    to,
    subject: clampSubject("HR Directory — Altus Corp Dashboard"),
    html: "<p>Attached is the current HR Directory PDF, including Vendors and HR Consultants.</p>",
    attachments: [{ filename: snapshotFilename(report.title), content: pdf.toString("base64") }],
    ...companyBcc(),
  });
  return error ? { ok: false, error: error.message ?? "Could not send the directory PDF." } : { ok: true, to };
}
