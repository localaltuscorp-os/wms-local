import { existsSync } from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import { format } from "date-fns";
import { formatDate } from "@/lib/format";
import { requireUser } from "@/lib/auth/current";
import { getRun } from "@/lib/queries/salary";
import { monthLabel } from "@/lib/salary/period";

/**
 * GET /salary/payslip/[runId]
 *
 * A4 portrait salary slip for one run, rendered with pdfkit (same stack as
 * /outstanding/export.pdf). Authorization: admins may fetch any slip; an
 * employee may fetch only their OWN run.
 *
 * Branding: embeds the real Altus logo in the header and a faint, large,
 * centered watermark of the Altus mark behind the content (both guarded so a
 * missing asset never breaks the PDF). Layout follows a standard MNC payslip:
 * company header block · "SALARY SLIP — Month Year" · employee details ·
 * two-column earnings/deductions table · highlighted NET PAYABLE · amount in
 * words · system-generated footer · full-page border.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COLORS = {
  ink: "#0A0A0A",
  inkMuted: "#525252",
  inkSoft: "#737373",
  inkFaint: "#A3A3A3",
  hairline: "#E5E5E5",
  hairlineStrong: "#D4D4D4",
  brand: "#E10600",
  brandDeep: "#A80400",
  netTint: "#FDECEA",
} as const;

const LOGO_PATH = path.join(process.cwd(), "public", "logo.png");
const MARK_PATH = path.join(process.cwd(), "public", "logo-mark.png");

const inr = (n: number) =>
  "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });

// ── Number → Indian-system words (for the net-payable amount) ──────────────
const ONES = [
  "Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight",
  "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen",
  "Sixteen", "Seventeen", "Eighteen", "Nineteen",
] as const;
const TENS = [
  "", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy",
  "Eighty", "Ninety",
] as const;

function twoDigits(n: number): string {
  if (n < 20) return ONES[n] ?? "";
  const t = Math.floor(n / 10);
  const o = n % 10;
  const tens = TENS[t] ?? "";
  return o === 0 ? tens : `${tens} ${ONES[o] ?? ""}`;
}

function threeDigits(n: number): string {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  if (h === 0) return twoDigits(rest);
  const hundreds = `${ONES[h] ?? ""} Hundred`;
  return rest === 0 ? hundreds : `${hundreds} ${twoDigits(rest)}`;
}

/** Indian-numbering words for a non-negative integer rupee amount. */
function rupeesToWords(amount: number): string {
  let n = Math.round(Math.abs(amount));
  if (n === 0) return "Zero";
  const parts: string[] = [];
  const crore = Math.floor(n / 10_000_000);
  n %= 10_000_000;
  const lakh = Math.floor(n / 100_000);
  n %= 100_000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  const hundred = n;
  if (crore) parts.push(`${threeDigits(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (hundred) parts.push(threeDigits(hundred));
  return parts.join(" ");
}

function netInWords(amount: number): string {
  const sign = amount < 0 ? "Minus " : "";
  return `${sign}Rupees ${rupeesToWords(amount)} Only`;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ runId: string }> },
): Promise<Response> {
  let me;
  try {
    me = await requireUser();
  } catch {
    return new Response("Forbidden", { status: 403 });
  }

  const { runId } = await params;
  const run = await getRun(runId);
  if (!run) return new Response("Not found", { status: 404 });

  // Authorization: admin OR the run's own employee.
  if (!me.isAdmin && me.id !== run.employeeId) {
    return new Response("Forbidden", { status: 403 });
  }

  const buf = await renderPayslip(run, { generatedBy: me.name });

  const safeName = run.employeeName.replace(/\s+/g, "");
  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="Payslip-${safeName}-${run.month}.pdf"`,
      "cache-control": "no-store",
    },
  });
}

type Run = NonNullable<Awaited<ReturnType<typeof getRun>>>;

async function renderPayslip(
  run: Run,
  meta: { generatedBy: string },
): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "A4",
    layout: "portrait",
    margin: 48,
    info: {
      Title: `Salary Slip — ${run.employeeName} — ${run.month}`,
      Author: "Altus Corp Dashboard",
      Subject: "Salary Slip",
    },
  });

  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });

  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const width = right - left;
  const entity = (run.payingEntityName || "Altus Corp").trim();

  // ── Full-page border (drawn first, lives behind everything) ──
  doc
    .save()
    .strokeColor(COLORS.hairlineStrong)
    .lineWidth(1)
    .rect(left - 16, 26, width + 32, doc.page.height - 52)
    .stroke()
    .restore();

  // ── Watermark: faint, large, centered Altus mark behind the content ──
  if (existsSync(MARK_PATH)) {
    try {
      const wm = 360;
      const cx = doc.page.width / 2 - wm / 2;
      const cy = doc.page.height / 2 - wm / 2;
      doc.save();
      doc.opacity(0.06);
      doc.image(MARK_PATH, cx, cy, { width: wm });
      doc.opacity(1);
      doc.restore();
    } catch {
      /* missing/corrupt asset → render without watermark */
    }
  }

  // ── Brand stripe ──
  doc.save().rect(0, 0, doc.page.width, 5).fill(COLORS.brand).restore();
  doc.save().rect(0, 5, doc.page.width, 1.2).fill(COLORS.brandDeep).restore();

  // ── Company header block: logo + entity + confidential line ──
  const headerTop = doc.page.margins.top + 4;
  let textX = left;
  if (existsSync(LOGO_PATH)) {
    try {
      const logoW = 132;
      doc.image(LOGO_PATH, left, headerTop, { width: logoW });
      textX = left + logoW + 18;
    } catch {
      /* missing/corrupt asset → fall back to text-only masthead */
    }
  }

  doc
    .font("Helvetica-Bold")
    .fontSize(20)
    .fillColor(COLORS.ink)
    .text(entity.toUpperCase(), textX, headerTop + 2, {
      characterSpacing: 0.8,
      lineBreak: false,
    });
  doc
    .font("Helvetica")
    .fontSize(8.5)
    .fillColor(COLORS.inkSoft)
    .text(
      "Payroll Department  ·  Private & Confidential",
      textX,
      doc.y + 3,
      { lineBreak: false },
    );

  // Move below the taller of logo / header text.
  doc.y = Math.max(doc.y, headerTop + 56) + 10;

  // ── Title band ──
  const titleY = doc.y;
  doc
    .save()
    .rect(left, titleY, width, 30)
    .fill(COLORS.brand)
    .restore();
  doc
    .font("Helvetica-Bold")
    .fontSize(13)
    .fillColor("#FFFFFF")
    .text(
      `SALARY SLIP  —  ${monthLabel(run.month)}`,
      left + 12,
      titleY + 8.5,
      { characterSpacing: 1.2, lineBreak: false },
    );
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor("#FFFFFF")
    .text(`FY ${run.fy}`, left, titleY + 10.5, {
      width: width - 12,
      align: "right",
      lineBreak: false,
    });
  doc.y = titleY + 30 + 16;

  // ── Employee details block ──
  const idShort = run.employeeId.slice(0, 8).toUpperCase();
  const detailRows: Array<[string, string, string, string]> = [
    ["Employee Name", run.employeeName, "Employee ID", idShort],
    [
      "Designation",
      run.designationName || "—",
      "Pay Period",
      monthLabel(run.month),
    ],
    [
      "Paying Entity",
      entity,
      "Payable Days",
      `${run.payableDays} / ${run.daysInMonth}`,
    ],
  ];

  const blockTop = doc.y;
  const blockH = detailRows.length * 22 + 14;
  doc
    .save()
    .rect(left, blockTop, width, blockH)
    .fillColor("#FAFAFA")
    .fill()
    .restore();
  doc
    .save()
    .strokeColor(COLORS.hairline)
    .lineWidth(0.8)
    .rect(left, blockTop, width, blockH)
    .stroke()
    .restore();

  const colA = left + 14;
  const colAVal = left + 110;
  const colB = left + width / 2 + 8;
  const colBVal = left + width / 2 + 104;
  let ry = blockTop + 12;
  for (const [la, va, lb, vb] of detailRows) {
    doc
      .font("Helvetica")
      .fontSize(8.5)
      .fillColor(COLORS.inkFaint)
      .text(la.toUpperCase(), colA, ry, { characterSpacing: 0.6, lineBreak: false });
    doc
      .font("Helvetica-Bold")
      .fontSize(10.5)
      .fillColor(COLORS.ink)
      .text(va, colAVal, ry - 1, { width: colB - colAVal - 8, lineBreak: false });
    doc
      .font("Helvetica")
      .fontSize(8.5)
      .fillColor(COLORS.inkFaint)
      .text(lb.toUpperCase(), colB, ry, { characterSpacing: 0.6, lineBreak: false });
    doc
      .font("Helvetica-Bold")
      .fontSize(10.5)
      .fillColor(COLORS.ink)
      .text(vb, colBVal, ry - 1, { width: right - colBVal, lineBreak: false });
    ry += 22;
  }
  doc.y = blockTop + blockH + 20;

  // ── Earnings / deductions table ──
  const monthlyCtc = run.annualCtc / 12;

  /** "2h" not "2.00h"; "1.5h" keeps its half. */
  const trimHours = (h: number): string =>
    Number.isInteger(h) ? String(h) : String(Math.round(h * 100) / 100);
  // The stored canonical rate (0211 single-source), backing out of the money
  // only for older runs generated before the column carried it.
  const additionalRate =
    run.hourlyRate != null && run.hourlyRate > 0
      ? run.hourlyRate
      : run.overtimeHours > 0
        ? run.overtimeAmount / run.overtimeHours
        : 0;

  type Line = {
    label: string;
    value: string;
    bold?: boolean;
    rule?: boolean;
  };
  const lines: Line[] = [
    { label: "Monthly CTC", value: inr(monthlyCtc) },
    {
      label: `Payable days (${run.payableDays} of ${run.daysInMonth})`,
      value: `${run.payableDays} / ${run.daysInMonth}`,
    },
    {
      label: "Late deduction",
      value: `${run.lateDeductionDays} day${run.lateDeductionDays === 1 ? "" : "s"}`,
    },
    // Additional hours — surplus beyond the expected hours, paid at the SAME
    // hourly rate (there is no overtime premium in this firm — spec §13). Shown
    // ONLY when earned, so a full-timer's slip is not cluttered with a
    // permanent ₹0 line; the hours are printed beside the money so the line
    // shows BOTH how much extra was worked and what it paid.
    ...(run.overtimeHours > 0
      ? [
          {
            label: `Additional hours (${trimHours(run.overtimeHours)}h @ ${inr(additionalRate)}/h)`,
            value: "+ " + inr(run.overtimeAmount),
          } satisfies Line,
        ]
      : []),
    { label: "Gross", value: inr(run.gross), bold: true, rule: true },
    { label: "PT", value: "− " + inr(run.pt) },
    { label: "TDS", value: "− " + inr(run.tds) },
    { label: "Advances", value: "− " + inr(run.advances) },
    {
      label: "Pending balance b/f",
      value: (run.pendingBalanceIn >= 0 ? "+ " : "− ") + inr(Math.abs(run.pendingBalanceIn)),
      rule: true,
    },
  ];

  const labelX = left;
  const valueW = 180;
  const valueX = right - valueW;
  const ROW_H = 24;

  // Table header
  doc
    .save()
    .rect(left, doc.y, width, 22)
    .fillColor("#F4F4F5")
    .fill()
    .restore();
  doc
    .font("Helvetica-Bold")
    .fontSize(8.5)
    .fillColor(COLORS.inkSoft)
    .text("PARTICULARS", labelX + 12, doc.y + 7, { characterSpacing: 0.8, lineBreak: false });
  doc
    .font("Helvetica-Bold")
    .fontSize(8.5)
    .fillColor(COLORS.inkSoft)
    .text("AMOUNT", valueX, doc.y + 7, {
      width: valueW - 12,
      align: "right",
      characterSpacing: 0.8,
      lineBreak: false,
    });
  doc.y += 22;
  doc
    .save()
    .strokeColor(COLORS.hairlineStrong)
    .lineWidth(0.8)
    .moveTo(left, doc.y)
    .lineTo(right, doc.y)
    .stroke()
    .restore();
  doc.y += 8;

  for (const ln of lines) {
    const y = doc.y;
    doc
      .font(ln.bold ? "Helvetica-Bold" : "Helvetica")
      .fontSize(ln.bold ? 12 : 11)
      .fillColor(ln.bold ? COLORS.ink : COLORS.inkMuted)
      .text(ln.label, labelX + 12, y, { width: valueX - labelX - 24, lineBreak: false });
    doc
      .font(ln.bold ? "Helvetica-Bold" : "Helvetica")
      .fontSize(ln.bold ? 12 : 11)
      .fillColor(COLORS.ink)
      .text(ln.value, valueX, y, {
        width: valueW - 12,
        align: "right",
        lineBreak: false,
      });
    doc.y = y + ROW_H;
    if (ln.rule) {
      doc
        .save()
        .strokeColor(COLORS.hairline)
        .lineWidth(0.5)
        .moveTo(left, doc.y - 6)
        .lineTo(right, doc.y - 6)
        .stroke()
        .restore();
    }
  }

  doc.y += 6;

  // ── NET PAYABLE highlighted row ──
  const netY = doc.y;
  const netH = 38;
  doc
    .save()
    .rect(left, netY, width, netH)
    .fillColor(COLORS.netTint)
    .fill()
    .restore();
  doc
    .save()
    .strokeColor(COLORS.brand)
    .lineWidth(1.2)
    .rect(left, netY, width, netH)
    .stroke()
    .restore();
  doc
    .font("Helvetica-Bold")
    .fontSize(13)
    .fillColor(COLORS.brandDeep)
    .text("NET PAYABLE", labelX + 12, netY + 12, {
      characterSpacing: 0.8,
      lineBreak: false,
    });
  doc
    .font("Helvetica-Bold")
    .fontSize(16)
    .fillColor(COLORS.brandDeep)
    .text(inr(run.netPayable), valueX, netY + 10, {
      width: valueW - 12,
      align: "right",
      lineBreak: false,
    });
  doc.y = netY + netH + 12;

  // ── Amount in words ──
  doc
    .font("Helvetica-Oblique")
    .fontSize(9.5)
    .fillColor(COLORS.inkMuted)
    .text(`Amount in words: ${netInWords(run.netPayable)}`, left, doc.y, {
      width,
      lineBreak: true,
    });
  doc.y += 18;

  // ── Disbursed flag ──
  doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .fillColor(COLORS.inkMuted)
    .text(`Disbursed: ${run.disbursed ? "Yes" : "No"}`, left, doc.y, {
      lineBreak: false,
    });

  // ── Footer ──
  const footerY = doc.page.height - doc.page.margins.bottom - 24;
  doc
    .save()
    .strokeColor(COLORS.hairline)
    .lineWidth(0.5)
    .moveTo(left, footerY - 10)
    .lineTo(right, footerY - 10)
    .stroke()
    .restore();
  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor(COLORS.inkSoft)
    .text(
      "This is a computer-generated payslip and does not require a signature.",
      left,
      footerY,
      { width, lineBreak: false },
    );
  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor(COLORS.inkFaint)
    .text(
      `Generated by ${meta.generatedBy} on ${formatDate(new Date())} · ${format(new Date(), "HH:mm")}`,
      left,
      footerY + 11,
      { width, lineBreak: false },
    );

  doc.end();
  return done;
}
