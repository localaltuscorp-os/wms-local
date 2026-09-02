import "server-only";

// Server-only ISSUE logic for RICH ("Edit freely" / Google-Docs) HR letters.
// Mirrors issue-core.ts but the body is arbitrary TipTap HTML rendered to PDF
// via headless Chromium (renderRichLetterPdf) instead of pdfkit. Imported ONLY
// by the /api/hr/letters/issue-rich route handler — never by a client component
// — so the Chromium + Supabase graph it lazily pulls stays server-runtime only
// (the documented webpack-hang guard). Auth-guarded (admin/HR) + rate-limited by
// the calling route; this module re-checks admin as a defence-in-depth belt.

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  documentInstances,
  documentSignatures,
  employees,
  type Employee,
} from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { getSupabaseAdmin, DOCUMENTS_BUCKET } from "@/lib/supabase/admin";
import { getEntity } from "@/lib/hr/entities";
import { getLetter } from "./registry";
import { sendLetterPdfEmail } from "@/lib/email/hr-letter-email";
import type { DocKind } from "@/lib/documents/signing";
import type { LetterSignature } from "./types";

type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

const UUID = z.string().uuid();
const errorMessage = (e: unknown): string => (e instanceof Error ? e.message : String(e));

function isAdmin(me: Employee): boolean {
  return me.isAdmin || isSuperAdmin(me.email);
}

/** Agreements sign as 'agreement'; everything else signs as a 'letter'. */
function docKindForCategory(category: string): DocKind {
  return category === "appointment" ? "agreement" : "letter";
}

const IssueRichSchema = z.object({
  key: z.string().min(1),
  entity: z.string().trim().max(120).optional(),
  /** The free-form TipTap HTML — the frozen snapshot + Chromium PDF source. */
  bodyHtml: z.string().min(1),
  /** Signing model chosen in rich mode (independent of any template default). */
  signingModel: z.enum(["none", "acknowledge", "esign"]).default("none"),
  /** optional employee to file the letter under + drive e-sign */
  employeeId: UUID.nullish(),
  /** candidate recipient (when not attached to an employee) */
  candidateName: z.string().trim().max(200).optional(),
  candidateEmail: z.string().trim().email().max(200).optional(),
});

export type IssueRichLetterInput = z.infer<typeof IssueRichSchema>;

/**
 * Issue a RICH ("Edit freely") letter: render its arbitrary TipTap HTML to a PDF
 * on the selected entity's letterhead (headless Chromium), archive it to the
 * private `documents` bucket, and record a `document_instances` row with
 * content_kind='rich' + a frozen body_html/body_rich snapshot (status 'sent').
 * When the chosen signing model is 'esign' AND it's attached to an employee, a
 * PENDING `document_signatures` row is created — content-agnostic, exactly like
 * the structured issue flow. Admin/HR-only.
 */
export async function issueRichLetter(
  input: IssueRichLetterInput,
): Promise<Result<{ instanceId: string; pdfPath: string; signatureId: string | null; emailed: boolean; emailedTo: string | null }>> {
  const me = await requireUser();
  if (!isAdmin(me)) return { ok: false, error: "Forbidden" };

  const parsed = IssueRichSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const { key, entity, bodyHtml, signingModel, employeeId, candidateName, candidateEmail } =
    parsed.data;

  // The template supplies category (for the sign docKind) + entity default; a
  // rich letter is still authored from a known key, but stay tolerant if not.
  const template = getLetter(key);

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

  const resolvedEntity = getEntity(entity ?? template?.entityDefault ?? null);

  // ── Render (headless Chromium) ──
  let pdfBuffer: Uint8Array;
  try {
    const { renderRichLetterPdf } = await import("./render-rich");
    pdfBuffer = await renderRichLetterPdf({ entity: resolvedEntity.id, bodyHtml });
  } catch (err) {
    return { ok: false, error: `Could not render the PDF: ${errorMessage(err)}` };
  }

  // ── Upload (same path convention as issue-core) ──
  const folder = employeeId ?? "candidates";
  const pdfPath = `${folder}/hr-letters/${randomUUID()}.pdf`;
  const admin = getSupabaseAdmin();
  const { error: upErr } = await admin.storage
    .from(DOCUMENTS_BUCKET)
    .upload(pdfPath, pdfBuffer, { contentType: "application/pdf", upsert: false });
  if (upErr) return { ok: false, error: `Upload failed: ${upErr.message}` };

  // ── Record the instance (frozen rich HTML snapshot) ──
  const issuedAt = new Date();
  let instanceId: string;
  try {
    const [row] = await db
      .insert(documentInstances)
      .values({
        typeKey: key,
        employeeId: employeeId ?? null,
        candidateName: employeeId ? null : recipientName || null,
        candidateEmail: employeeId ? null : candidateEmail ?? null,
        status: "sent",
        contentKind: "rich",
        bodyRich: { html: bodyHtml },
        bodyHtml,
        mergeValues: { __entity: resolvedEntity.id },
        renderedPdfPath: pdfPath,
        issuedById: me.id,
        issuedAt,
      })
      .returning({ id: documentInstances.id });
    if (!row) throw new Error("insert returned no row");
    instanceId = row.id;
  } catch (err) {
    await admin.storage.from(DOCUMENTS_BUCKET).remove([pdfPath]).catch(() => {});
    return { ok: false, error: `DB: ${errorMessage(err)}` };
  }

  // ── E-sign wiring (needs a real employee signer) ──
  let signatureId: string | null = null;
  const model: LetterSignature = signingModel;
  if (model === "esign" && employeeId) {
    try {
      const category = template?.category ?? "recruitment";
      const [sig] = await db
        .insert(documentSignatures)
        .values({
          docKind: docKindForCategory(category),
          docId: instanceId,
          signerEmployeeId: employeeId,
          status: "pending",
          createdById: me.id,
        })
        .returning({ id: documentSignatures.id });
      signatureId = sig?.id ?? null;
    } catch {
      // Non-fatal — the letter is issued; signing can be started later.
      signatureId = null;
    }
  }

  // ── Deliver: EMAIL the issued letter PDF to its recipient. Issue used to only
  //    archive the letter — recipients never actually received it. Best-effort. ──
  let emailed = false;
  let emailedTo: string | null = null;
  if (recipientEmail) {
    const sent = await sendLetterPdfEmail({
      to: recipientEmail,
      recipientName,
      letterTitle: template?.title ?? key,
      entityName: resolvedEntity.displayName,
      pdf: Buffer.from(pdfBuffer),
      filename: `${key}.pdf`,
    });
    emailed = sent.ok;
    if (sent.ok) emailedTo = recipientEmail;
  }

  return { ok: true, instanceId, pdfPath, signatureId, emailed, emailedTo };
}
