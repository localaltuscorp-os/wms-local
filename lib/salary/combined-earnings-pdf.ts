import "server-only";
import { signatoryForEntity } from "@/lib/salary/signatories";
import type { CombinedEarnings } from "@/lib/salary/combined-earnings";
import type { TargetVsPaid } from "@/lib/queries/earnings";
import {
  COLORS,
  amountInWords,
  drawChrome,
  drawFooter,
  drawMasthead,
  drawSectionHeading,
  drawSignatoryBlock,
  drawTitleBand,
  drawStatTiles,
  drawStackedBar,
  drawBarMeter,
  fmtDate,
  inr,
  newDoc,
} from "@/lib/salary/pdf-house-style";

/**
 * WS-5 + WS-6 — Combined "total earnings" document → A4 PDF (payslip house
 * style). Salary + attendance analytics + incentive Target-vs-Paid (this month
 * / last 3 months / YTD) + the retention line when paid, closed with the Entity
 * signatory block and a highlighted TOTAL EARNINGS row.
 */

/** "3/30 (10%)" — the X/N-with-% form the spec asks for on discipline lines. */
function xOverN(x: number, n: number): string {
  const pct = n > 0 ? Math.round((x / n) * 100) : 0;
  return `${x}/${n}  (${pct}%)`;
}

export async function renderCombinedEarningsPdf(
  data: CombinedEarnings,
  meta: { generatedBy: string; place?: string | null },
): Promise<Buffer> {
  const entity = (data.entity || "Altus Corp").trim();
  const signatory = signatoryForEntity(entity);

  const { doc, done } = newDoc({
    title: `Total Earnings — ${data.employeeName} — ${data.monthLabel}`,
    subject: "Total Earnings Statement",
    margin: 48,
  });

  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const width = right - left;

  drawChrome(doc);
  drawMasthead(doc, entity, "Payroll Department  ·  Private & Confidential");
  drawTitleBand(doc, `Total Earnings  —  ${data.monthLabel}`, data.fy);

  // ── Employee line ──
  doc
    .font("Helvetica-Bold")
    .fontSize(12)
    .fillColor(COLORS.ink)
    .text(data.employeeName, left, doc.y, { lineBreak: false });
  doc.y += 15;
  doc
    .font("Helvetica")
    .fontSize(9.5)
    .fillColor(COLORS.inkSoft)
    .text([data.designation, entity].filter(Boolean).join("  ·  ") || "—", left, doc.y, {
      lineBreak: false,
    });
  doc.y += 20;

  // ── two-column key/value writer ──
  const rowLine = (label: string, value: string, opts?: { bold?: boolean }) => {
    const y = doc.y;
    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor(COLORS.inkMuted)
      .text(label, left + 4, y, { width: width * 0.6, lineBreak: false });
    doc
      .font(opts?.bold ? "Helvetica-Bold" : "Helvetica")
      .fontSize(10)
      .fillColor(COLORS.ink)
      .text(value, right - 200, y, { width: 200, align: "right", lineBreak: false });
    doc.y = y + 17;
  };

  // ── 1. Salary ──
  drawSectionHeading(doc, "Salary");
  if (data.salary) {
    rowLine("Monthly CTC", inr(data.salary.monthlyCtc));
    rowLine(
      `Payable days`,
      `${data.salary.finalWorkingDays.toLocaleString("en-IN")} / ${data.salary.daysInMonth.toLocaleString("en-IN")}`,
    );
    rowLine("Payable after PT", inr(data.salary.payableAfterPt));
    if (data.salary.advance > 0) rowLine("Advance", "− " + inr(data.salary.advance));
    if (data.salary.previousPending !== 0) {
      rowLine("Previous pending", inr(data.salary.previousPending));
    }
    rowLine("Salary — final payment", inr(data.salary.finalPayment), { bold: true });
  } else {
    doc
      .font("Helvetica-Oblique")
      .fontSize(9.5)
      .fillColor(COLORS.inkFaint)
      .text("No salary-sheet row imported for this month.", left + 4, doc.y, {
        lineBreak: false,
      });
    doc.y += 17;
  }
  doc.y += 8;

  // ── 2. Attendance analytics + DASHBOARD ──
  drawSectionHeading(doc, "Attendance analytics");
  const a = data.attendance;

  // Dashboard band: headline tiles, the hours meter the payable days are earned
  // from (9h = 1 day), then the day-distribution bar.
  drawStatTiles(doc, [
    { label: "Payable days", value: String(a.payableDays), caption: `of ${a.daysInMonth} days`, accent: true },
    { label: "Hours worked", value: `${a.workedHours}h`, caption: "9h = 1 day" },
    { label: "Present", value: String(a.present) },
    { label: "Absent", value: String(a.absent) },
  ]);
  // Target = 9h for every day that was payable — i.e. did the hours match the days.
  const hoursTarget = Math.max(a.payableDays * 9, 1);
  drawBarMeter(doc, {
    label: "Hours worked vs target (9h per attendance day, 54h per full week)",
    value: a.workedHours,
    max: hoursTarget,
    caption: `${a.workedHours}h of ${Math.round(hoursTarget)}h`,
  });
  drawStackedBar(doc, [
    { label: "Present", value: a.present, color: "#7FB77E" },
    { label: "Half-day", value: a.halfDay, color: "#F2C94C" },
    { label: "Absent", value: a.absent, color: "#E4756D" },
    { label: "Weekly off", value: a.weeklyOff, color: "#B7C4CF" },
  ]);

  rowLine("Present", xOverN(a.present, a.daysInMonth));
  rowLine("Days late", xOverN(a.lateDays, a.daysInMonth));
  rowLine("Days waived", xOverN(a.waivedDays, a.daysInMonth));
  rowLine("Left early", xOverN(a.leftEarlyDays, a.daysInMonth));
  rowLine(
    "Absent / half-day / weekly-off",
    `${a.absent} / ${a.halfDay} / ${a.weeklyOff}`,
  );
  doc.y += 8;

  // ── 3. Incentive: Target vs Paid ──
  drawSectionHeading(doc, "Incentive · Target vs Paid");
  const tvpHeader = () => {
    const y = doc.y;
    const c1 = left + 4;
    const c2 = left + width * 0.42;
    const c3 = left + width * 0.62;
    const c4 = left + width * 0.82;
    doc.font("Helvetica-Bold").fontSize(8).fillColor(COLORS.inkSoft);
    doc.text("WINDOW", c1, y, { lineBreak: false });
    doc.text("TARGET", c2, y, { width: width * 0.18, align: "right", lineBreak: false });
    doc.text("PAID", c3, y, { width: width * 0.18, align: "right", lineBreak: false });
    doc.text("ATTAIN.", c4, y, { width: width * 0.18 - 4, align: "right", lineBreak: false });
    doc.y = y + 14;
    doc
      .save()
      .strokeColor(COLORS.hairline)
      .lineWidth(0.5)
      .moveTo(left, doc.y)
      .lineTo(right, doc.y)
      .stroke()
      .restore();
    doc.y += 5;
  };
  const tvpRow = (label: string, w: TargetVsPaid) => {
    const y = doc.y;
    const c1 = left + 4;
    const c2 = left + width * 0.42;
    const c3 = left + width * 0.62;
    const c4 = left + width * 0.82;
    doc.font("Helvetica").fontSize(9.5).fillColor(COLORS.inkMuted);
    doc.text(label, c1, y, { lineBreak: false });
    doc.fillColor(COLORS.ink);
    doc.text(inr(w.target), c2, y, { width: width * 0.18, align: "right", lineBreak: false });
    doc.text(inr(w.paid), c3, y, { width: width * 0.18, align: "right", lineBreak: false });
    doc.text(
      w.attainmentPct == null ? "—" : `${Math.round(w.attainmentPct)}%`,
      c4,
      y,
      { width: width * 0.18 - 4, align: "right", lineBreak: false },
    );
    doc.y = y + 16;
  };
  // Incentive DASHBOARD — headline tiles, then an attainment meter per window so
  // target-vs-paid reads at a glance before the exact figures below.
  const inc = data.incentive;
  drawStatTiles(doc, [
    { label: "Paid this month", value: inr(inc.thisMonth.paid), accent: true },
    { label: "Target", value: inr(inc.thisMonth.target) },
    {
      label: "Attainment",
      value: inc.thisMonth.attainmentPct == null ? "—" : `${Math.round(inc.thisMonth.attainmentPct)}%`,
    },
    { label: "Year to date", value: inr(inc.ytd.paid) },
  ]);
  const meter = (label: string, w: TargetVsPaid) => {
    if (w.target <= 0 && w.paid <= 0) return;
    drawBarMeter(doc, {
      label,
      value: w.paid,
      max: w.target > 0 ? w.target : w.paid,
      caption:
        w.attainmentPct == null
          ? `${inr(w.paid)} paid`
          : `${inr(w.paid)} of ${inr(w.target)} · ${Math.round(w.attainmentPct)}%`,
      // Hitting target reads green; short of it stays brand red.
      color: (w.attainmentPct ?? 0) >= 100 ? "#7FB77E" : undefined,
    });
  };
  meter("This month", inc.thisMonth);
  meter("Last 3 months", inc.last3Months);
  meter("Year to date", inc.ytd);
  doc.y += 2;

  tvpHeader();
  tvpRow("This month", data.incentive.thisMonth);
  tvpRow("Last 3 months", data.incentive.last3Months);
  tvpRow("Year to date", data.incentive.ytd);
  doc.y += 8;

  // ── 4. Retention bonus (only when paid) ──
  if (data.retention) {
    drawSectionHeading(doc, "Retention bonus");
    rowLine(
      data.retention.paidDate
        ? `Retention bonus (paid ${fmtDate(data.retention.paidDate)})`
        : "Retention bonus (paid)",
      inr(data.retention.amount),
      { bold: true },
    );
    if (data.retention.note) {
      doc
        .font("Helvetica-Oblique")
        .fontSize(8.5)
        .fillColor(COLORS.inkFaint)
        .text(data.retention.note, left + 4, doc.y, { width, lineBreak: false });
      doc.y += 14;
    }
    doc.y += 8;
  }

  // ── Total earnings highlight ──
  const totY = doc.y;
  doc.save().rect(left, totY, width, 40).fillColor(COLORS.netTint).fill().restore();
  doc
    .save()
    .strokeColor(COLORS.brand)
    .lineWidth(1.2)
    .rect(left, totY, width, 40)
    .stroke()
    .restore();
  doc
    .font("Helvetica-Bold")
    .fontSize(12)
    .fillColor(COLORS.brandDeep)
    .text("TOTAL EARNINGS THIS MONTH", left + 12, totY + 8, { lineBreak: false });
  doc
    .font("Helvetica")
    .fontSize(7.5)
    .fillColor(COLORS.inkSoft)
    .text("Salary + incentive paid + retention paid this month", left + 12, totY + 24, {
      lineBreak: false,
    });
  doc
    .font("Helvetica-Bold")
    .fontSize(17)
    .fillColor(COLORS.brandDeep)
    .text(inr(data.totalEarnings), right - 204, totY + 11, {
      width: 200,
      align: "right",
      lineBreak: false,
    });
  doc.y = totY + 40 + 10;

  doc
    .font("Helvetica-Oblique")
    .fontSize(9)
    .fillColor(COLORS.inkMuted)
    .text(`In words: ${amountInWords(data.totalEarnings)}`, left, doc.y, { width });
  doc.y += 22;

  // ── Signatory block ──
  drawSignatoryBlock(doc, {
    x: right - 240,
    y: doc.y,
    entity,
    signatoryName: signatory.name,
    assetFile: signatory.assetFile,
    date: fmtDate(new Date().toISOString().slice(0, 10)),
    place: meta.place?.trim() || "",
  });

  drawFooter(doc, `Total Earnings · ${data.monthLabel}`, meta.generatedBy);
  doc.end();
  return done;
}
