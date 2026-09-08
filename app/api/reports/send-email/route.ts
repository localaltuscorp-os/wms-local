import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, employees } from "@/lib/db";
import { requireUser } from "@/lib/auth/current";
import { rateLimitOrError } from "@/lib/rate-limit";
import { getResend, FROM, clampSubject, companyBcc } from "@/lib/email/resend";
import { renderSectionPdf } from "@/lib/reports/section-pdf";
import { isSectionReport, snapshotFilename } from "@/lib/reports/section-report";

/**
 * POST /api/reports/send-email
 *
 * Renders one dashboard section's current view and mails it as a PDF
 * attachment. Same payload as the download route, plus the recipient's employee
 * id — so the two exports are byte-identical documents and the emailed copy can
 * never differ from the downloaded one.
 *
 * THE RECIPIENT'S ADDRESS IS READ SERVER-SIDE from the employee row, never
 * taken from the request. A client-supplied `to` would turn an authenticated
 * dashboard button into an open relay that sends branded Altus mail anywhere.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BRAND = "#E10600";

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

export async function POST(req: Request) {
  try {
    const me = await requireUser();

    const limited = rateLimitOrError(me.id, "write");
    if (limited) return NextResponse.json({ error: limited.error }, { status: 429 });

    const body = (await req.json()) as { employeeId?: unknown; report?: unknown };
    if (typeof body.employeeId !== "string" || !body.employeeId) {
      return NextResponse.json({ error: "Pick someone to send this to." }, { status: 400 });
    }
    if (!isSectionReport(body.report)) {
      return NextResponse.json({ error: "Invalid report payload" }, { status: 400 });
    }
    const report = body.report;

    const [recipient] = await db
      .select({
        name: employees.name,
        email: employees.email,
        officialEmail: employees.officialEmail,
        isActive: employees.isActive,
      })
      .from(employees)
      .where(eq(employees.id, body.employeeId))
      .limit(1);

    if (!recipient || !recipient.isActive) {
      return NextResponse.json({ error: "That person is not on the active roster." }, { status: 404 });
    }
    // The official address when there is one - it is the company mailbox this
    // report belongs in - falling back to the login address.
    const to = recipient.officialEmail?.trim() || recipient.email;
    if (!to) {
      return NextResponse.json(
        { error: `${recipient.name} has no email address on file.` },
        { status: 422 },
      );
    }

    const resend = getResend();
    if (!resend) {
      return NextResponse.json(
        { error: "Email is not configured (no Resend key)." },
        { status: 503 },
      );
    }

    const now = new Date();
    const pdf = await renderSectionPdf(report, now);
    const filename = snapshotFilename(report.title);

    const metaRows = report.meta
      .map(
        (m) =>
          `<tr><td style="padding:3px 14px 3px 0;color:#64748b;font-size:12px">${esc(m.label)}</td>` +
          `<td style="padding:3px 0;color:#0f172a;font-size:12px;font-weight:600">${esc(m.value)}</td></tr>`,
      )
      .join("");

    /* THE EXECUTIVE SUMMARY - the first few rows, inline.
       A mail whose whole content is "see attached" makes the reader open a PDF
       on a phone to learn whether it was worth opening. The top rows in the
       body answer that in the preview pane; the attachment is then for the
       full set. Capped at five: past that it stops being a summary. */
    const PREVIEW = 5;
    const th = report.columns
      .map(
        (c, i) =>
          `<th style="padding:7px 10px;font-size:10px;letter-spacing:.5px;text-transform:uppercase;color:#fff;background:#0f172a;text-align:${
            c.align ?? (i === 0 ? "left" : "right")
          }">${esc(c.label)}</th>`,
      )
      .join("");
    const tr = report.rows
      .slice(0, PREVIEW)
      .map(
        (row, r) =>
          `<tr style="background:${r % 2 ? "#f8fafc" : "#ffffff"}">` +
          row
            .slice(0, report.columns.length)
            .map((cell, i) => {
              const col = report.columns[i]!;
              const align = col.align ?? (i === 0 ? "left" : "right");
              const hot = col.tone === "count" && cell !== "0" && cell !== "" && cell !== "-";
              return `<td style="padding:6px 10px;font-size:12px;text-align:${align};color:${
                hot ? "#dc2626" : "#0f172a"
              };font-weight:${hot || i === 0 ? 600 : 400};border-bottom:1px solid #e2e8f0">${esc(cell)}</td>`;
            })
            .join("") +
          `</tr>`,
      )
      .join("");
    const more = report.rows.length > PREVIEW ? report.rows.length - PREVIEW : 0;

    const { error } = await resend.emails.send({
      from: FROM,
      to,
      ...companyBcc(),
      subject: clampSubject(`${report.title} - Altus Corp Dashboard`),
      html: `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:620px;margin:0 auto">
  <div style="background:${BRAND};border-radius:10px 10px 0 0;padding:16px 20px">
    <div style="color:#fff;font-size:15px;font-weight:700;letter-spacing:.2px">Altus Corp · Executive Dashboard Report</div>
    <div style="color:rgba(255,255,255,.82);font-size:12px;margin-top:2px">${esc(report.title)}</div>
  </div>
  <div style="border:1px solid #e2e8f0;border-top:0;border-radius:0 0 10px 10px;padding:20px">
    <p style="font-size:14px;color:#0f172a;margin:0 0 4px">Hi ${esc(recipient.name)},</p>
    <p style="font-size:13px;color:#475569;margin:0 0 16px;line-height:1.5">Here is your ${esc(report.title)} snapshot from the Altus Corp dashboard${report.subtitle ? ` - ${esc(report.subtitle)}` : ""}.</p>
    ${report.summary ? `<div style="display:inline-block;background:#fee2e2;color:#dc2626;font-size:12px;font-weight:700;padding:5px 12px;border-radius:999px;margin:0 0 14px">${esc(report.summary)}</div>` : ""}
    ${metaRows ? `<table style="border-collapse:collapse;margin:0 0 16px">${metaRows}</table>` : ""}
    ${
      tr
        ? `<table style="border-collapse:collapse;width:100%;margin:0 0 10px"><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table>
    ${more ? `<p style="font-size:11.5px;color:#94a3b8;margin:0 0 14px">…and ${more} more ${more === 1 ? "row" : "rows"} in the attached PDF.</p>` : ""}`
        : ""
    }
    <p style="font-size:13px;color:#475569;margin:14px 0 0">The full table is attached as <strong style="color:#0f172a">${esc(filename)}</strong>.</p>
    <p style="font-size:11px;color:#94a3b8;margin:20px 0 0;border-top:1px solid #e2e8f0;padding-top:12px">Sent by ${esc(me.name)} from the Altus Corp Dashboard · Confidential - Internal Altus Corp Report</p>
  </div>
</div>`,
      attachments: [{ filename, content: pdf.toString("base64") }],
    });

    if (error) {
      return NextResponse.json({ error: error.message ?? "Send failed" }, { status: 502 });
    }
    // The address goes back so the toast can name it - "sent" with no recipient
    // is the kind of confirmation nobody trusts.
    return NextResponse.json({ ok: true, to, filename });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not send the report" },
      { status: 500 },
    );
  }
}
