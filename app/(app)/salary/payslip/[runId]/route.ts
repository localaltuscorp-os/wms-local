import PDFDocument from "pdfkit";
import { format } from "date-fns";
import { requireUser } from "@/lib/auth/current";
import { getRun } from "@/lib/queries/salary";
import { monthLabel } from "@/lib/salary/period";

/**
 * GET /salary/payslip/[runId]
 *
 * A4 portrait salary slip for one run, rendered with pdfkit (same stack as
 * /outstanding/export.pdf). Authorization: admins may fetch any slip; an
 * employee may fetch only their OWN run.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COLORS = {
  ink: "#0A0A0A",
  inkMuted: "#525252",
  inkSoft: "#737373",
  hairline: "#E5E5E5",
  brand: "#E10600",
  brandDeep: "#B00500",
} as const;

const inr = (n: number) =>
  "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });

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
      "content-disposition": `attachment; filename="payslip-${safeName}-${run.month}.pdf"`,
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

  // ── Brand stripe ──
  doc.save().rect(0, 0, doc.page.width, 5).fill(COLORS.brand).restore();
  doc.save().rect(0, 5, doc.page.width, 1.2).fill(COLORS.brandDeep).restore();

  // ── Masthead ──
  const entity = run.payingEntityName || "ALTUS CORP";
  doc
    .font("Helvetica-Bold")
    .fontSize(24)
    .fillColor(COLORS.ink)
    .text(entity.toUpperCase(), left, doc.page.margins.top + 6, {
      characterSpacing: 1.6,
      lineBreak: false,
    });
  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor(COLORS.brand)
    .text("SALARY SLIP", left, doc.y + 6, {
      characterSpacing: 2,
      lineBreak: false,
    });
  doc
    .font("Helvetica")
    .fontSize(11)
    .fillColor(COLORS.inkMuted)
    .text(`${monthLabel(run.month)}  ·  ${run.fy}`, left, doc.y + 4, {
      lineBreak: false,
    });

  doc.moveDown(0.8);
  const ruleY = doc.y + 4;
  doc
    .save()
    .strokeColor(COLORS.ink)
    .lineWidth(0.8)
    .moveTo(left, ruleY)
    .lineTo(right, ruleY)
    .stroke()
    .restore();
  doc.y = ruleY + 16;

  // ── Employee block ──
  doc
    .font("Helvetica-Bold")
    .fontSize(9)
    .fillColor(COLORS.inkSoft)
    .text("EMPLOYEE", left, doc.y, { characterSpacing: 1.4 });
  doc
    .font("Helvetica-Bold")
    .fontSize(16)
    .fillColor(COLORS.ink)
    .text(run.employeeName, left, doc.y + 2);
  doc
    .font("Helvetica")
    .fontSize(12)
    .fillColor(COLORS.inkMuted)
    .text(run.designationName || "—", left, doc.y + 1);

  doc.moveDown(1.2);

  // ── Earnings / deductions table ──
  const monthlyCtc = run.annualCtc / 12;

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
    { label: "Gross", value: inr(run.gross), bold: true, rule: true },
    { label: "PT", value: "− " + inr(run.pt) },
    { label: "TDS", value: "− " + inr(run.tds) },
    { label: "Advances", value: "− " + inr(run.advances) },
    {
      label: "Pending balance b/f",
      value: (run.pendingBalanceIn >= 0 ? "+ " : "− ") + inr(Math.abs(run.pendingBalanceIn)),
      rule: true,
    },
    { label: "Net payable", value: inr(run.netPayable), bold: true },
  ];

  const labelX = left;
  const valueW = 180;
  const valueX = right - valueW;
  const ROW_H = 26;

  // header rule
  doc
    .save()
    .strokeColor(COLORS.ink)
    .lineWidth(0.6)
    .moveTo(left, doc.y)
    .lineTo(right, doc.y)
    .stroke()
    .restore();
  doc.y += 8;

  for (const ln of lines) {
    const y = doc.y;
    doc
      .font(ln.bold ? "Helvetica-Bold" : "Helvetica")
      .fontSize(ln.bold ? 14 : 12)
      .fillColor(ln.bold ? COLORS.ink : COLORS.inkMuted)
      .text(ln.label, labelX, y, { width: valueX - labelX - 12, lineBreak: false });
    doc
      .font(ln.bold ? "Helvetica-Bold" : "Helvetica")
      .fontSize(ln.bold ? 14 : 12)
      .fillColor(ln.bold ? COLORS.ink : COLORS.ink)
      .text(ln.value, valueX, y, {
        width: valueW,
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

  doc.y += 4;
  doc
    .save()
    .strokeColor(COLORS.ink)
    .lineWidth(0.8)
    .moveTo(left, doc.y)
    .lineTo(right, doc.y)
    .stroke()
    .restore();
  doc.y += 14;

  // ── Disbursed flag ──
  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor(COLORS.inkMuted)
    .text(`Disbursed: ${run.disbursed ? "Yes" : "No"}`, left, doc.y, {
      lineBreak: false,
    });

  // ── Footer ──
  const footerY = doc.page.height - doc.page.margins.bottom - 18;
  doc
    .save()
    .strokeColor(COLORS.hairline)
    .lineWidth(0.5)
    .moveTo(left, footerY - 8)
    .lineTo(right, footerY - 8)
    .stroke()
    .restore();
  doc
    .font("Helvetica")
    .fontSize(8.5)
    .fillColor(COLORS.inkSoft)
    .text(
      `Generated by ${meta.generatedBy} on ${format(new Date(), "EEE, MMM d, yyyy · HH:mm")}`,
      left,
      footerY,
      { width, lineBreak: false },
    );

  doc.end();
  return done;
}
