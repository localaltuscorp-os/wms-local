import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/current";
import { rateLimitOrError } from "@/lib/rate-limit";
import { loadAuthorisedSubmission, submissionFilename } from "@/lib/hr/forms/load";
import { sendHrFormPdfEmail } from "@/lib/email/hr-form-email";

export const dynamic = "force-dynamic";

/**
 * POST /api/hr/forms/<id>/email — mail a filled form as a PDF attachment.
 *
 * Recipient is resolved SERVER-SIDE from the submission's employee record; the
 * request body carries no address. That is deliberate: an attacker-supplied `to`
 * would turn this into an open relay for other people's HR documents, and the
 * only legitimate recipient is the person whose form it is (the HR desk is
 * copied by the sender itself).
 *
 * Authorisation re-runs `canViewHrSubmission` through `loadAuthorisedSubmission`
 * — the same rule as the View page and the PDF route — because this endpoint is
 * directly addressable.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return NextResponse.json({ error: limited.error }, { status: 429 });

  const loaded = await loadAuthorisedSubmission(id);
  if (!loaded.ok) return NextResponse.json({ error: "Not found" }, { status: loaded.status });

  const to = loaded.data.employeeEmail;
  if (!to) {
    return NextResponse.json(
      { error: `${loaded.data.employeeName} has no email address on file.` },
      { status: 422 },
    );
  }

  try {
    const { renderHrFormPdf } = await import("@/lib/hr/forms/pdf");
    const pdf = await renderHrFormPdf(loaded.data);

    const sent = await sendHrFormPdfEmail({
      to,
      recipientName: loaded.data.employeeName,
      formName: loaded.data.formName,
      sectionLabel: loaded.data.sectionLabel,
      submittedOn: loaded.data.submittedOn,
      status: loaded.data.status,
      pdf,
      filename: submissionFilename(loaded.data.formName, loaded.data.employeeName),
    });

    // `skipped` means Resend isn't configured (dev). Say so plainly rather than
    // reporting a success the user would go looking for in an inbox.
    if (sent.skipped) {
      return NextResponse.json(
        { error: "Email isn't configured on this environment." },
        { status: 503 },
      );
    }
    if (!sent.ok) {
      return NextResponse.json({ error: "Couldn't send the email. Try again." }, { status: 502 });
    }

    return NextResponse.json({ ok: true, to });
  } catch {
    return NextResponse.json({ error: "Couldn't prepare the form for email." }, { status: 500 });
  }
}
