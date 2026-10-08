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
import { renderSectionPdf } from "@/lib/reports/section-pdf";
import { snapshotFilename } from "@/lib/reports/section-report";
import { companyBcc, clampSubject, FROM, getResend } from "@/lib/email/resend";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const optionalText = (max: number) => z.string().trim().max(max).optional().transform((value) => value || null);
const optionalEmail = z.string().trim().max(160).optional().refine((value) => !value || z.string().email().safeParse(value).success, "Enter a valid email address.").transform((value) => value ? value.toLowerCase() : null);
const phoneNumber = z.string().trim().regex(/^\d{10}$/, "Enter a 10-digit cell number.");
const optionalPhoneNumber = z.string().trim().optional().refine((value) => !value || /^\d{10}$/.test(value), "Enter a 10-digit cell number.").transform((value) => value || null);

const ContactSchema = z.object({
  id: z.string().uuid().optional(),
  directoryType: z.enum(["vendor", "hr_consultant"]),
  personName: z.string().trim().min(1, "Enter the contact name.").max(120),
  companyName: optionalText(160),
  cellNo: phoneNumber,
  email: optionalEmail,
  contact2Name: optionalText(120),
  contact2CellNo: optionalPhoneNumber,
  contact2Email: optionalEmail,
  service: optionalText(80),
  notes: optionalText(1000),
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
  const { id, directoryType, ...values } = parsed.data;
  const data = { ...values, directoryType: safeDirectoryType(directoryType), service: values.service ?? "Other", updatedById: who.id, updatedAt: new Date() };
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
