"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { employeeDocuments, employees } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { rateLimitOrError } from "@/lib/rate-limit";
import { getSupabaseAdmin, DOCUMENTS_BUCKET } from "@/lib/supabase/admin";
import { hrSupportEnabled } from "@/lib/hr/flag";
import { isLetterType, LETTER_DOCTYPE_PREFIX } from "@/lib/hr/letter-types";
import { safeFileName, validateUpload } from "@/lib/hr/upload";
import { renderExitLetterPdf } from "@/lib/salary/exit-letter-pdf";
import {
  EXIT_LETTER_META,
  EXIT_LETTER_TYPES,
  type ExitLetterInput,
  type ExitLetterType,
} from "@/lib/salary/exit-letters";
import type { Employee } from "@/db/schema";

type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

const TitleSchema = z.string().trim().min(1, "Give the letter a title").max(200, "Title too long");

/** Letters are issued BY HR — only admins/super-admins upload or remove them.
 *  (Employees read their own on the Letters page.) */
function isAdmin(me: Employee): boolean {
  return me.isAdmin || isSuperAdmin(me.email);
}

/** Upload one letter for an employee. Admin-only. FormData: employeeId,
 *  letterType, title, effectiveDate?, notes?, file. */
export async function uploadLetter(form: FormData): Promise<Result<{ id: string }>> {
  if (!hrSupportEnabled()) return { ok: false, error: "HR module is off." };
  const me = await requireUser();
  if (!isAdmin(me)) return { ok: false, error: "Forbidden" };
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const employeeId = String(form.get("employeeId") ?? "");
  if (!z.string().uuid().safeParse(employeeId).success) return { ok: false, error: "Pick an employee." };

  const letterType = String(form.get("letterType") ?? "");
  if (!isLetterType(letterType)) return { ok: false, error: "Pick a letter type." };

  const titleRes = TitleSchema.safeParse(form.get("title"));
  if (!titleRes.success) return { ok: false, error: titleRes.error.issues[0]!.message };

  const effRaw = String(form.get("effectiveDate") ?? "").trim();
  const effectiveDate = effRaw && /^\d{4}-\d{2}-\d{2}$/.test(effRaw) ? effRaw : null;
  const notes = String(form.get("notes") ?? "").trim().slice(0, 2000) || null;

  const file = form.get("file");
  if (!(file instanceof File)) return { ok: false, error: "Pick a file to upload." };
  const shape = validateUpload(file);
  if (!shape.ok) return shape;

  const emp = await db.query.employees.findFirst({ where: eq(employees.id, employeeId), columns: { id: true } });
  if (!emp) return { ok: false, error: "Employee not found." };

  const path = `hr-letters/${employeeId}/${crypto.randomUUID()}/${safeFileName(file.name)}`;
  const admin = getSupabaseAdmin();
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await admin.storage
    .from(DOCUMENTS_BUCKET)
    .upload(path, buffer, { contentType: file.type || "application/octet-stream", upsert: false });
  if (upErr) return { ok: false, error: `Upload failed: ${upErr.message}` };

  let inserted;
  try {
    [inserted] = await db
      .insert(employeeDocuments)
      .values({
        employeeId,
        docType: letterType,
        title: titleRes.data,
        effectiveDate,
        storagePath: path,
        fileName: file.name.slice(0, 200),
        mimeType: file.type || null,
        sizeBytes: file.size,
        notes,
        uploadedById: me.id,
      })
      .returning({ id: employeeDocuments.id });
  } catch (err) {
    await admin.storage.from(DOCUMENTS_BUCKET).remove([path]).catch(() => {});
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (!inserted) return { ok: false, error: "Insert returned no row" };

  revalidatePath("/letters");
  return { ok: true, id: inserted.id };
}

/**
 * Exit-document docType prefix (`exit_`) — a sibling of the letter space in the
 * dossier `employee_documents` table. These are the WS-5 exit letters (Full &
 * Final / Return of Assets / Handover Accepted) once archived for e-signing.
 */
const EXIT_DOCTYPE_PREFIX = "exit_";

const ExitSaveSchema = z.object({
  employeeId: z.string().uuid("Pick an employee to enable signing."),
  type: z.enum(EXIT_LETTER_TYPES as [ExitLetterType, ...ExitLetterType[]]),
  employeeName: z.string().trim().min(1).max(200),
  entity: z.string().trim().min(1).max(120),
  designation: z.string().trim().max(200).optional(),
  letterDate: z.string().trim().max(40).optional(),
  place: z.string().trim().max(120).optional(),
  lastWorkingDay: z.string().trim().max(40).optional(),
  settlementAmount: z.string().trim().max(200).optional(),
  settlementBreakup: z.string().trim().max(4000).optional(),
  assets: z.string().trim().max(4000).optional(),
  assetReturnBy: z.string().trim().max(40).optional(),
  handoverTo: z.string().trim().max(200).optional(),
  handoverSummary: z.string().trim().max(4000).optional(),
});

export interface ExitSaveInput {
  employeeId: string;
  type: string;
  employeeName: string;
  entity: string;
  designation?: string;
  letterDate?: string;
  place?: string;
  lastWorkingDay?: string;
  settlementAmount?: string;
  settlementBreakup?: string;
  assets?: string;
  assetReturnBy?: string;
  handoverTo?: string;
  handoverSummary?: string;
}

/**
 * Render the current exit letter as a PDF, archive it to the employee's private
 * document vault (`employee_documents`, docType `exit_<type>`), and return the
 * new row id so the builder can hand off to the DigiLocker-verified signing flow
 * (docKind "exit_doc"). Admin-only; requires a real employee (signing binds to
 * an employees.id). Additive — reuses the same renderer as the download route.
 */
export async function saveExitDocForSigning(
  input: ExitSaveInput,
): Promise<Result<{ id: string }>> {
  if (!hrSupportEnabled()) return { ok: false, error: "HR module is off." };
  const me = await requireUser();
  if (!isAdmin(me)) return { ok: false, error: "Forbidden" };
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = ExitSaveSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const d = parsed.data;

  const emp = await db.query.employees.findFirst({
    where: eq(employees.id, d.employeeId),
    columns: { id: true },
  });
  if (!emp) return { ok: false, error: "Employee not found." };

  const letterInput: ExitLetterInput = {
    type: d.type,
    employeeName: d.employeeName,
    entity: d.entity,
    designation: d.designation ?? null,
    letterDate: d.letterDate ?? null,
    place: d.place ?? null,
    lastWorkingDay: d.lastWorkingDay ?? null,
    settlementAmount: d.settlementAmount ?? null,
    settlementBreakup: d.settlementBreakup ?? null,
    assets: d.assets ?? null,
    assetReturnBy: d.assetReturnBy ?? null,
    handoverTo: d.handoverTo ?? null,
    handoverSummary: d.handoverSummary ?? null,
  };

  let pdf: Buffer;
  try {
    pdf = await renderExitLetterPdf(letterInput, { generatedBy: me.name });
  } catch (err) {
    return { ok: false, error: `Could not render the letter: ${err instanceof Error ? err.message : String(err)}` };
  }

  const meta = EXIT_LETTER_META[d.type];
  const fileName = `${meta.type}-${d.employeeName.replace(/\s+/g, "")}.pdf`;
  const path = `hr-exit/${d.employeeId}/${crypto.randomUUID()}/${safeFileName(fileName)}`;
  const admin = getSupabaseAdmin();
  const { error: upErr } = await admin.storage
    .from(DOCUMENTS_BUCKET)
    .upload(path, pdf, { contentType: "application/pdf", upsert: false });
  if (upErr) return { ok: false, error: `Upload failed: ${upErr.message}` };

  let inserted;
  try {
    [inserted] = await db
      .insert(employeeDocuments)
      .values({
        employeeId: d.employeeId,
        docType: `${EXIT_DOCTYPE_PREFIX}${d.type}`,
        title: meta.title,
        effectiveDate: d.letterDate && /^\d{4}-\d{2}-\d{2}$/.test(d.letterDate) ? d.letterDate : null,
        storagePath: path,
        fileName,
        mimeType: "application/pdf",
        sizeBytes: pdf.length,
        uploadedById: me.id,
      })
      .returning({ id: employeeDocuments.id });
  } catch (err) {
    await admin.storage.from(DOCUMENTS_BUCKET).remove([path]).catch(() => {});
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (!inserted) return { ok: false, error: "Insert returned no row" };

  revalidatePath("/letters");
  return { ok: true, id: inserted.id };
}

/** Delete a letter (admin-only). Guarded to the letter docType space so it can
 *  never remove a dossier (non-letter) document. */
export async function deleteLetter(id: string): Promise<Result> {
  if (!hrSupportEnabled()) return { ok: false, error: "HR module is off." };
  const me = await requireUser();
  if (!isAdmin(me)) return { ok: false, error: "Forbidden" };
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Invalid id" };

  const [row] = await db
    .select({ id: employeeDocuments.id, docType: employeeDocuments.docType, storagePath: employeeDocuments.storagePath })
    .from(employeeDocuments)
    .where(eq(employeeDocuments.id, id))
    .limit(1);
  if (!row) return { ok: false, error: "Letter not found" };
  if (!row.docType.startsWith(LETTER_DOCTYPE_PREFIX)) return { ok: false, error: "Not a letter." };

  await getSupabaseAdmin().storage.from(DOCUMENTS_BUCKET).remove([row.storagePath]).catch(() => {});
  await db.delete(employeeDocuments).where(eq(employeeDocuments.id, id));
  revalidatePath("/letters");
  return { ok: true };
}
