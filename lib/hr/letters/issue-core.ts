import "server-only";

// Plain server-only module holding the HR-letter ISSUE logic. Imported ONLY by
// the /api/hr/letters/* route handlers (server) — never by a client component —
// so the pdfkit + Supabase + Resend graph it lazily pulls stays strictly
// server-runtime and never reaches a client bundle (which historically hung the
// webpack dev compile). Every write is auth-guarded (admin/HR) + rate-limited.

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { documentInstances, documentSignatures, employees, type Employee } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { canIssueLetters, LETTER_ISSUE_REFUSAL } from "./issue-access";
import { rateLimitOrError } from "@/lib/rate-limit";
import { getSupabaseAdmin, DOCUMENTS_BUCKET } from "@/lib/supabase/admin";
import { getEntity } from "@/lib/hr/entities";
import { normalizeGender } from "@/lib/hr/pronouns";
import { getLetter } from "./registry";
import { letterDate } from "./roster";
import { sendLetterPdfEmail } from "@/lib/email/hr-letter-email";
import type { DocKind } from "@/lib/documents/signing";

type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

const UUID = z.string().uuid();
const errorMessage = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/*
 * THE ADMIN TEST MOVED to lib/hr/letters/issue-access.ts (`canIssueLetters`).
 * It had three copies — here, on the letter page, and in the email-pdf route —
 * and all three asked "is this person an ADMIN?", which is not the question.
 * Sending an appointment letter and managing every employee in the application
 * were the same bit, so an HR person could only be given the first by being
 * given the second. One definition now, and it admits the narrow
 * `hr.letters.issue` grant.
 */

/** Agreements sign as 'agreement'; everything else signs as a 'letter'. */
function docKindForCategory(category: string): DocKind {
  return category === "appointment" ? "agreement" : "letter";
}

const IssueSchema = z.object({
  key: z.string().min(1),
  entity: z.string().trim().max(120).optional(),
  values: z.record(z.string(), z.string()).default({}),
  /** Candidate gender — resolves pronoun/salutation tokens on the issued PDF. */
  gender: z.string().trim().max(40).optional(),
  /** optional employee to file the letter under + drive e-sign */
  employeeId: UUID.nullish(),
  /** candidate recipient (when not attached to an employee) */
  candidateName: z.string().trim().max(200).optional(),
  candidateEmail: z.string().trim().email().max(200).optional(),
  /** optional uploaded scanned-signature image (data URL) for the sign-off */
  signatureImage: z.string().max(3_000_000).optional(),
  /** WHO signs, when HR picked explicitly in the editor ("director" = the
   *  proprietor's block, "hr" = the HR desk's). Omitted → the template's own
   *  rule. Threaded so the issued PDF carries the sign-off HR saw on screen. */
  signatory: z.enum(["director", "hr"]).optional(),
  /** Shrink the letter step by step until it fits one A4 page (lib/hr/letters/fit). */
  fitOnePage: z.boolean().optional(),
  /**
   * The letter's DATE, as the editor showed it ("21-Sep-2026").
   *
   * Optional, and falls back to today — but when it is sent it wins, because
   * the date HR saw on screen is the date they meant to issue. Before this
   * existed the issue path always stamped `letterDate()` at the moment the
   * request landed, so an edited date was silently discarded on the one copy
   * that gets archived. Feeds only a signature block's `showDate` line now —
   * the top-right chrome stamp it used to also feed was removed app-wide
   * (2026-09-22).
   */
  date: z.string().trim().max(40).optional(),
});

export type IssueLetterInput = z.infer<typeof IssueSchema>;

/**
 * Archive an already-rendered letter PDF: upload it to the private `documents`
 * bucket and record a `document_instances` row (status 'sent') so it lands in
 * the existing document flow. When the letter's signature model is 'esign' AND
 * it's attached to an employee, a PENDING `document_signatures` row is created
 * so the DigiLocker SignDocument flow can drive it later.
 *
 * Split out of `issueLetter()` (2026-09-24) so the "Send Email" button can
 * archive too, once the dedicated "Issue letter" button went away for doing
 * the same work email already did. Caller renders the PDF and resolves the
 * recipient; this function only persists.
 */
export async function archiveLetterInstance(input: {
  key: string;
  entity: string;
  template: ReturnType<typeof getLetter>;
  values: Record<string, string>;
  employeeId?: string | null;
  candidateName?: string | null;
  candidateEmail?: string | null;
  pdfBuffer: Buffer;
  issuedById: string;
}): Promise<Result<{ instanceId: string; pdfPath: string; signatureId: string | null }>> {
  const { key, entity, template, values, employeeId, candidateName, candidateEmail, pdfBuffer, issuedById } = input;
  if (!template) return { ok: false, error: "This letter isn't authored yet." };

  const folder = employeeId ?? "candidates";
  const pdfPath = `${folder}/hr-letters/${randomUUID()}.pdf`;
  const admin = getSupabaseAdmin();
  const { error: upErr } = await admin.storage
    .from(DOCUMENTS_BUCKET)
    .upload(pdfPath, pdfBuffer, { contentType: "application/pdf", upsert: false });
  if (upErr) return { ok: false, error: `Upload failed: ${upErr.message}` };

  const issuedAt = new Date();
  let instanceId: string;
  try {
    const [row] = await db
      .insert(documentInstances)
      .values({
        typeKey: key,
        employeeId: employeeId ?? null,
        candidateName: employeeId ? null : candidateName || null,
        candidateEmail: employeeId ? null : candidateEmail ?? null,
        status: "sent",
        mergeValues: { ...values, __entity: entity },
        bodySnapshotMd: JSON.stringify({ key, entity, values }),
        renderedPdfPath: pdfPath,
        issuedById,
        issuedAt,
      })
      .returning({ id: documentInstances.id });
    if (!row) throw new Error("insert returned no row");
    instanceId = row.id;
  } catch (err) {
    await admin.storage.from(DOCUMENTS_BUCKET).remove([pdfPath]).catch(() => {});
    return { ok: false, error: `DB: ${errorMessage(err)}` };
  }

  let signatureId: string | null = null;
  if ((template.signature ?? "none") === "esign" && employeeId) {
    try {
      const [sig] = await db
        .insert(documentSignatures)
        .values({
          docKind: docKindForCategory(template.category),
          docId: instanceId,
          signerEmployeeId: employeeId,
          status: "pending",
          createdById: issuedById,
        })
        .returning({ id: documentSignatures.id });
      signatureId = sig?.id ?? null;
    } catch {
      // Non-fatal — the letter is archived; signing can be started later.
      signatureId = null;
    }
  }

  return { ok: true, instanceId, pdfPath, signatureId };
}

/**
 * Issue a letter: render its PDF (on the selected entity's letterhead), archive
 * it (`archiveLetterInstance`), and email it to the recipient. Admin/HR-only.
 *
 * No longer called by the letter editor (its "Issue letter" button was removed
 * 2026-09-24 — "Send Email" now archives too, see the route). Kept for any
 * other caller that still wants render+archive+email in one call.
 */
export async function issueLetter(
  input: IssueLetterInput,
): Promise<Result<{ instanceId: string; pdfPath: string; signatureId: string | null; emailed: boolean; emailedTo: string | null }>> {
  const me = await requireUser();
  if (!(await canIssueLetters(me))) return { ok: false, error: LETTER_ISSUE_REFUSAL };
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = IssueSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const {
    key,
    entity,
    values,
    gender,
    employeeId,
    candidateName,
    candidateEmail,
    signatureImage,
    signatory,
    fitOnePage,
    date: requestedDate,
  } = parsed.data;

  const template = getLetter(key);
  if (!template) return { ok: false, error: "This letter isn't authored yet." };

  // A recipient: either an employee (for filing + e-sign) or a candidate name.
  // Capture the recipient EMAIL too — the issued letter is emailed to them below.
  let recipientName = candidateName ?? "";
  let recipientEmail = (candidateEmail ?? "").trim();
  if (employeeId) {
    const emp = await db.query.employees.findFirst({ where: eq(employees.id, employeeId) });
    if (!emp) return { ok: false, error: "Employee not found." };
    recipientName = emp.name;
    recipientEmail = (emp.email ?? "").trim();
  }

  const resolvedEntity = getEntity(entity ?? template.entityDefault ?? null);
  // The screen's date when one was sent, today otherwise — see the schema.
  const date = requestedDate?.trim() || letterDate();

  // ── Render ──
  let pdfBuffer: Buffer;
  try {
    const { renderLetterPdf } = await import("./pdf");
    pdfBuffer = await renderLetterPdf({
      template,
      entity: resolvedEntity.id,
      values,
      date,
      gender: normalizeGender(gender),
      signatureImage,
      signatory,
      fitOnePage: fitOnePage === true,
    });
  } catch (err) {
    return { ok: false, error: `Could not render the PDF: ${errorMessage(err)}` };
  }

  const archived = await archiveLetterInstance({
    key,
    entity: resolvedEntity.id,
    template,
    values,
    employeeId,
    candidateName: recipientName,
    candidateEmail,
    pdfBuffer,
    issuedById: me.id,
  });
  if (!archived.ok) return archived;
  const { instanceId, pdfPath, signatureId } = archived;

  // ── Deliver: EMAIL the issued letter PDF to its recipient. Issue used to only
  //    archive the letter — recipients never actually received it. Best-effort:
  //    the letter stays issued/archived even if the mail can't go out, and we
  //    report `emailed`/`emailedTo` so the caller can tell the user the truth. ──
  let emailed = false;
  let emailedTo: string | null = null;
  if (recipientEmail) {
    const sent = await sendLetterPdfEmail({
      to: recipientEmail,
      recipientName,
      letterTitle: template.title,
      entityName: resolvedEntity.displayName,
      pdf: pdfBuffer,
      filename: `${key}.pdf`,
    });
    emailed = sent.ok;
    if (sent.ok) emailedTo = recipientEmail;
  }

  return { ok: true, instanceId, pdfPath, signatureId, emailed, emailedTo };
}

/**
 * Best-effort DRAFT: record a `document_instances` draft for a letter WITHOUT
 * rendering/uploading. Used by the appraisal finalize flow (which composes an
 * appraisal letter intent). Tolerant of not-yet-authored keys — it stores a bare
 * draft so the record exists; NEVER throws for the caller.
 */
export async function composeDraft(input: {
  typeKey: string;
  employeeId?: string | null;
}): Promise<Result<{ instanceId: string }>> {
  try {
    const me = await requireUser();
    if (!(await canIssueLetters(me))) return { ok: false, error: LETTER_ISSUE_REFUSAL };
    const [row] = await db
      .insert(documentInstances)
      .values({
        typeKey: input.typeKey,
        employeeId: input.employeeId ?? null,
        status: "draft",
        mergeValues: {},
        issuedById: null,
      })
      .returning({ id: documentInstances.id });
    if (!row) return { ok: false, error: "Could not create the draft." };
    return { ok: true, instanceId: row.id };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}
