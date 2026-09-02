import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { employees } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { rateLimitOrError } from "@/lib/rate-limit";
import { getEntity } from "@/lib/hr/entities";
import { getLetter } from "@/lib/hr/letters/registry";
import { normalizeGender } from "@/lib/hr/pronouns";
import { letterDate } from "@/lib/hr/letters/roster";
import { sendLetterPdfEmail } from "@/lib/email/hr-letter-email";

export const dynamic = "force-dynamic";

/**
 * POST /api/hr/send-letter-email — the letter editor's "Send Email" composer.
 *
 * Renders the letter exactly as the export does (structured → pdfkit, rich →
 * headless Chromium), then emails it as a PDF ATTACHMENT to the address the
 * sender typed, with the composed subject and optional message, copying the HR
 * desk. Admin/HR-only, rate-limited.
 *
 * This differs from /api/hr/letters/email-pdf (one-click "Export & Email", which
 * always resolves the recipient server-side and uses the default subject) only in
 * that the composer supplies `to`, `subject` and `message`. Both share the same
 * renderers and the same sendLetterPdfEmail transport, so the PDF that lands in
 * the inbox is byte-for-byte the export PDF.
 */

const Schema = z.object({
  key: z.string().min(1),
  entity: z.string().trim().max(120).optional(),
  values: z.record(z.string(), z.string()).default({}),
  /** Candidate gender — resolves pronoun/salutation tokens on the PDF. */
  gender: z.string().trim().max(40).optional(),
  /** Formatted letter date (defaults to today). */
  date: z.string().trim().max(60).optional(),
  /** "rich" → render bodyHtml via headless Chromium instead of pdfkit. */
  contentKind: z.enum(["structured", "rich"]).optional(),
  bodyHtml: z.string().optional(),
  /** The composed recipient. Falls back to the attached employee's email on file. */
  to: z.string().trim().email().max(200).optional(),
  subject: z.string().trim().min(1).max(300),
  /** Optional free-text note shown above the standard body. */
  message: z.string().trim().max(4000).optional(),
  /** Attach to an employee → their name is used for the greeting. */
  employeeId: z.string().uuid().nullish(),
  /** Candidate recipient (when not attached to an employee). */
  candidateName: z.string().trim().max(200).optional(),
  /** Optional uploaded scanned-signature image (data URL) for the sign-off. */
  signatureImage: z.string().max(3_000_000).optional(),
});

export async function POST(req: Request): Promise<Response> {
  let me;
  try {
    me = await requireUser();
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!(me.isAdmin || isSuperAdmin(me.email))) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return NextResponse.json(limited);

  const input = await req.json().catch(() => ({}));
  const parsed = Schema.safeParse(input);
  if (!parsed.success) {
    return NextResponse.json({
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    });
  }
  const b = parsed.data;

  const template = getLetter(b.key);
  if (!template) return NextResponse.json({ ok: false, error: "This letter isn't authored yet." });

  // ── Recipient: the typed address wins; the attached employee is the fallback
  //    (and always supplies the greeting name). ──
  let to = (b.to ?? "").trim();
  let recipientName = b.candidateName ?? "";
  if (b.employeeId) {
    const emp = await db.query.employees.findFirst({ where: eq(employees.id, b.employeeId) });
    if (!emp) return NextResponse.json({ ok: false, error: "Employee not found." });
    recipientName = emp.name;
    if (!to) to = (emp.email ?? "").trim();
  }
  if (!to) {
    return NextResponse.json({
      ok: false,
      error: "Add a recipient email address before sending.",
    });
  }

  const entity = getEntity(b.entity ?? template.entityDefault ?? null);

  // ── Render the PDF (rich → Chromium; structured → pdfkit) ──
  let pdf: Buffer;
  try {
    if (b.contentKind === "rich" && b.bodyHtml) {
      const { renderRichLetterPdf } = await import("@/lib/hr/letters/render-rich");
      pdf = Buffer.from(await renderRichLetterPdf({ entity: entity.id, bodyHtml: b.bodyHtml }));
    } else {
      const { renderLetterPdf } = await import("@/lib/hr/letters/pdf");
      pdf = await renderLetterPdf({
        template,
        entity: entity.id,
        values: b.values,
        date: b.date?.trim() || letterDate(),
        gender: normalizeGender(b.gender),
        signatureImage: b.signatureImage,
      });
    }
  } catch {
    return NextResponse.json({ ok: false, error: "Could not render the PDF." });
  }

  // ── Email it (typed TO, HR desk CC, company archive BCC) ──
  const res = await sendLetterPdfEmail({
    to,
    recipientName,
    letterTitle: template.title,
    entityName: entity.displayName,
    pdf,
    filename: `${template.key}.pdf`,
    subject: b.subject,
    message: b.message,
  });
  if (!res.ok) {
    return NextResponse.json({
      ok: false,
      error: res.skipped
        ? "Email isn't configured on this environment (RESEND_API_KEY is missing)."
        : "The email could not be sent. Please try again.",
    });
  }

  return NextResponse.json({ ok: true, to });
}
