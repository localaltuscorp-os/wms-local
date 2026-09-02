import { getResend, FROM, companyBcc, clampSubject } from "./resend";

/**
 * Recruiter OUTCOME email — sent to the recruiter/consultant when a candidate's
 * management decision is recorded (selected / rejected). Raw-HTML Resend body
 * (same isolated pattern as report-emails.ts), on brand. Never throws; no-ops
 * gracefully when Resend is unconfigured (returns { ok:false, skipped:true }).
 */

const BRAND = "#E10600";

type Outcome = "selected" | "shortlisted" | "rejected";

function verdictWord(outcome: Outcome): string {
  if (outcome === "selected") return "Selected";
  if (outcome === "shortlisted") return "Shortlisted";
  return "Rejected";
}

function shell(title: string, sub: string, inner: string): string {
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:640px;margin:0 auto;color:#1a1a1a">
    <div style="border-bottom:3px solid ${BRAND};padding-bottom:10px;margin-bottom:16px">
      <div style="font-size:12px;font-weight:800;letter-spacing:2px;color:${BRAND};text-transform:uppercase">Altus Corp</div>
      <h1 style="margin:6px 0 2px;font-size:22px;font-weight:800">${title}</h1>
      <div style="color:#666;font-size:14px">${sub}</div>
    </div>
    ${inner}
    <p style="margin-top:24px;color:#999;font-size:11px">This is an automated update from the Altus Corp Dashboard.</p>
  </div>`;
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] ?? c));
}

/**
 * Intake SUBMIT email — sent to the referring recruiter/consultant when a
 * candidate's interview form is submitted, so they know their referral landed.
 * Best-effort: never throws; no-ops when Resend is unconfigured
 * (returns { ok:false, skipped:true }).
 */
export async function sendRecruiterIntakeEmail(args: {
  to: string;
  recruiterName?: string;
  candidateName: string;
  position?: string;
}): Promise<{ ok: boolean; skipped?: boolean }> {
  try {
    const resend = getResend();
    if (!resend) return { ok: false, skipped: true };

    const greeting = args.recruiterName?.trim()
      ? `Hi ${esc(args.recruiterName.trim().split(" ")[0]!)},`
      : "Hello,";
    const posLine = args.position?.trim() ? ` — ${esc(args.position.trim())}` : "";

    const card = `<table style="width:100%;border-collapse:separate;border-spacing:0;margin:6px 0 14px"><tr>
      <td style="padding:14px 16px;border:1px solid #eee;border-radius:10px">
        <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:.5px">Candidate submitted</div>
        <div style="font-size:20px;font-weight:800;color:#1a1a1a">${esc(args.candidateName)}</div>
        <div style="font-size:13px;color:#555;margin-top:4px">${args.position?.trim() ? esc(args.position.trim()) : "Interview form received"}</div>
      </td>
    </tr></table>`;

    const inner = `<p style="font-size:14px;margin:0 0 14px">${greeting} a candidate you referred has just submitted their interview form to Altus Corp.</p>
      ${card}
      <p style="font-size:12.5px;color:#666;margin-top:10px">Thank you for the referral. Our HR team will take it from here and keep you posted on the outcome.</p>`;

    const { error } = await resend.emails.send({
      from: FROM,
      to: args.to,
      subject: clampSubject(`New candidate submitted — ${args.candidateName}`),
      html: shell("New candidate submitted", `${args.candidateName}${posLine}`, inner),
      ...companyBcc(),
    });
    if (error) return { ok: false };
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

export async function sendRecruiterOutcomeEmail(args: {
  to: string;
  recruiterName?: string;
  candidateName: string;
  position: string;
  outcome: Outcome;
  reason?: string;
}): Promise<{ ok: boolean; skipped?: boolean }> {
  try {
    const resend = getResend();
    if (!resend) return { ok: false, skipped: true };

    const verdict = verdictWord(args.outcome);
    const tone = args.outcome === "rejected" ? BRAND : "#059669";
    const greeting = args.recruiterName?.trim()
      ? `Hi ${esc(args.recruiterName.trim().split(" ")[0]!)},`
      : "Hello,";

    const decisionCard = `<table style="width:100%;border-collapse:separate;border-spacing:0;margin:6px 0 14px"><tr>
      <td style="padding:14px 16px;border:1px solid #eee;border-radius:10px">
        <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:.5px">Decision</div>
        <div style="font-size:22px;font-weight:800;color:${tone}">${verdict}</div>
        <div style="font-size:13px;color:#555;margin-top:4px"><b>${esc(args.candidateName)}</b> — ${esc(args.position)}</div>
      </td>
    </tr></table>`;

    const reasonBlock =
      args.outcome === "rejected" && args.reason?.trim()
        ? `<div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:10px;padding:12px 14px;margin-bottom:14px;font-size:13px;color:#7f1d1d">
             <div style="font-weight:800;text-transform:uppercase;font-size:11px;letter-spacing:.5px;margin-bottom:4px">Reason</div>
             ${esc(args.reason.trim())}
           </div>`
        : "";

    const inner = `<p style="font-size:14px;margin:0 0 14px">${greeting} here is the outcome for the candidate you referred.</p>
      ${decisionCard}${reasonBlock}
      <p style="font-size:12.5px;color:#666;margin-top:10px">Thank you for the referral. Please reach out to the HR team for any questions.</p>`;

    const { error } = await resend.emails.send({
      from: FROM,
      to: args.to,
      subject: clampSubject(`Candidate ${args.candidateName} — ${verdict}`),
      html: shell("Candidate outcome", `${args.candidateName} — ${args.position}`, inner),
      ...companyBcc(),
    });
    if (error) return { ok: false };
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
