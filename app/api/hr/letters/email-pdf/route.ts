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
 * POST /api/hr/letters/email-pdf — render an HR letter to a PDF (on the selected
 * paying-entity letterhead) and EMAIL it to the recipient (candidate email on the
 * letter, or the attached employee's email on file) with a copy to the HR desk.
 * One click from the editor's "Export & Email PDF" button. Admin/HR-only,
 * rate-limited. Reuses the same pdfkit / headless-Chromium renderers as the
 * export + issue flows, so the produced PDF is byte-for-byte the export PDF.
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
  /** Attach to an employee → resolve their email server-side. */
  employeeId: z.string().uuid().nullish(),
  /** Candidate recipient (when not attached to an employee). */
  candidateName: z.string().trim().max(200).optional(),
  candidateEmail: z.string().trim().email().max(200).optional(),
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

  // ── Resolve the recipient email + name ──
  let to = (b.candidateEmail ?? "").trim();
  let recipientName = b.candidateName ?? "";
  if (b.employeeId) {
    const emp = await db.query.employees.findFirst({ where: eq(employees.id, b.employeeId) });
    if (!emp) return NextResponse.json({ ok: false, error: "Employee not found." });
    to = (emp.email ?? "").trim();
    recipientName = emp.name;
  }
  if (!to) {
    return NextResponse.json({
      ok: false,
      error:
        "No recipient email — add the candidate's email on the letter, or attach an employee with an email on file.",
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

  // ── Email it (candidate/employee TO, HR desk CC, company archive BCC) ──
  const res = await sendLetterPdfEmail({
    to,
    recipientName,
    letterTitle: template.title,
    entityName: entity.displayName,
    pdf,
    filename: `${template.key}.pdf`,
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
