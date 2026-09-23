import "server-only";

import {
  COLORS,
  amountInWords,
  drawChrome,
  drawFooter,
  drawMasthead,
  drawSectionHeading,
  drawSignatoryBlock,
  drawStatTiles,
  fmtDate,
  inr,
  newDoc,
} from "@/lib/salary/pdf-house-style";
import { signatoryForEntity } from "@/lib/salary/signatories";
import { WORKER_TYPE_LABELS, asWorkerType } from "@/lib/attendance/worker-type";
import type { SalarySlipData } from "@/lib/salary/salary-slip-data";

/**
 * THE EMPLOYEE SALARY STATEMENT — exactly three pages, and nothing interactive.
 *
 *   1. SALARY SLIP                      what was earned, what was deducted, net
 *   2. ATTENDANCE & SALARY CALCULATION  the week-by-week working that produced it
 *   3. INCENTIVE STATEMENT              what the incentive module owes and paid
 *
 * Every number is already computed when this file is reached: the salary and the
 * day ledger come from Employee → My Salary's own engine, the incentive figures
 * from the Accounts ledger, the reimbursement from its module. Nothing is
 * re-derived here, and no formula in this file divides a rupee.
 *
 * ── WHY THIS IS A DOCUMENT AGAIN, NOT AN APP ───────────────────────────────
 * This renderer used to draw one source page per VIEW — every week, every window,
 * every incentive — and compose them onto a single physical page as PDF layers
 * switched by an AcroForm dropdown with a JavaScript action. It printed as a
 * dozen overlapping tables, grew worse with data, and could not be trusted to say
 * the same thing as the screen.
 *
 * The browsing now lives on the web (components/salary/salary-statement.tsx),
 * which reads this same `SalarySlipData`. This file prints: the summary of every
 * week, the month's calculation, the incentive figures. Three `addPage()` calls,
 * always — no layers, no form fields, no scripts, nothing a print dialog can
 * turn into a blank page.
 *
 * ── WHAT THAT COSTS, AND HOW IT IS PAID ────────────────────────────────────
 * A fixed page count means content cannot spill onto page 4. So every table here
 * MEASURES its rows against the space left on the page and stops, printing how
 * many rows it left out (`fitRows`) — a short honest table beats a clipped one.
 */

/** A4, as every other salary document in this module. */
const PAGE_W = 595.28;
const PAGE_H = 841.89;

interface Ctx {
  doc: PDFKit.PDFDocument;
  /** Who generated the document — named in the footer. */
  generatedBy: string;
  left: number;
  right: number;
  width: number;
}

/** The document, with an A4 page and the module's chrome already on it. */
function startSource(): { doc: PDFKit.PDFDocument; done: Promise<Buffer> } {
  return newDoc({
    title: "Salary Slip",
    subject: "Salary Slip",
    margin: 44,
  });
}

/** The chrome every salary page carries: the border, the watermark, the logo. */
function pageChrome(doc: PDFKit.PDFDocument, data: SalarySlipData): void {
  drawChrome(doc);
  drawMasthead(
    doc,
    data.identity.entity ?? "Altus Corp",
    "Payroll Department  ·  Private & Confidential",
  );
}

/** PAGE 1's furniture — the chrome plus the slip's own centred header. */
function pageFurniture(doc: PDFKit.PDFDocument, data: SalarySlipData): void {
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const width = right - left;
  pageChrome(doc, data);

  // ── EVERY MAJOR HEADER IS CENTRED ───────────────────────────────────
  const centre = (
    text: string,
    y: number,
    opts: { size: number; bold?: boolean; color?: string },
  ): void => {
    doc
      .font(opts.bold ? "Helvetica-Bold" : "Helvetica")
      .fontSize(opts.size)
      .fillColor(opts.color ?? COLORS.ink);
    const w = doc.widthOfString(text);
    doc.text(text, left + (width - w) / 2, y, { lineBreak: false });
  };

  let y = doc.y + 4;
  centre(data.identity.name.toUpperCase(), y, { size: 16, bold: true });
  y += 21;
  centre("SALARY SLIP", y, { size: 10.5, bold: true, color: COLORS.brandDeep });
  y += 16;
  centre(`${data.identity.monthLabel.toUpperCase()}  ·  ${data.identity.fy}`, y, {
    size: 9.5,
    color: COLORS.inkMuted,
  });
  y += 14;
  centre("Payroll Department  ·  Private & Confidential", y, {
    size: 8.5,
    color: COLORS.inkFaint,
  });
  doc.y = y + 16;
}

/** A page-2/3 header for a view layer: title band drawn as centred text. */
function centredPageTitle(
  doc: PDFKit.PDFDocument,
  data: SalarySlipData,
  title: string,
  caption: string,
): void {
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const width = right - left;
  const centre = (text: string, y: number, size: number, bold: boolean, color: string) => {
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(size).fillColor(color);
    doc.text(text, left + (width - doc.widthOfString(text)) / 2, y, { lineBreak: false });
  };
  // Directly under the masthead the furniture just drew — no arithmetic on
  // `doc.y` offsets, which is how a header drifts when a logo changes height.
  let y = doc.y + 2;
  centre(data.identity.name.toUpperCase(), y, 13, true, COLORS.ink);
  y += 17;
  centre(title, y, 10.5, true, COLORS.brandDeep);
  y += 15;
  centre(caption, y, 9, false, COLORS.inkMuted);
  doc.y = y + 14;
}

/** One column of a table. */
interface Col {
  label: string;
  /** Fraction of the table width. Fractions must sum to 1. */
  flex: number;
  align?: "left" | "right";
}

function tableHead(doc: PDFKit.PDFDocument, ctx: Ctx, cols: Col[], y: number): number {
  doc.font("Helvetica-Bold").fontSize(7.5).fillColor(COLORS.inkSoft);
  let x = ctx.left;
  for (const c of cols) {
    const w = ctx.width * c.flex;
    doc.text(c.label.toUpperCase(), x + 2, y, {
      width: w - 4,
      align: c.align ?? "left",
      lineBreak: false,
    });
    x += w;
  }
  doc
    .save()
    .strokeColor(COLORS.hairlineStrong)
    .lineWidth(0.7)
    .moveTo(ctx.left, y + 12)
    .lineTo(ctx.right, y + 12)
    .stroke()
    .restore();
  return y + 17;
}

function tableRow(
  doc: PDFKit.PDFDocument,
  ctx: Ctx,
  cols: Col[],
  values: string[],
  y: number,
  opts: { bold?: boolean; color?: string } = {},
): number {
  doc
    .font(opts.bold ? "Helvetica-Bold" : "Helvetica")
    .fontSize(8.5)
    .fillColor(opts.color ?? COLORS.ink);
  let x = ctx.left;
  cols.forEach((c, i) => {
    const w = ctx.width * c.flex;
    doc.text(values[i] ?? "—", x + 2, y, {
      width: w - 4,
      align: c.align ?? "left",
      lineBreak: false,
      ellipsis: true,
    });
    x += w;
  });
  return y + 13;
}

/** A label/amount line, the shape the money sections use. */
function moneyRow(
  doc: PDFKit.PDFDocument,
  ctx: Ctx,
  label: string,
  value: string,
  y: number,
  opts: { bold?: boolean; color?: string; indent?: number } = {},
): number {
  doc
    .font(opts.bold ? "Helvetica-Bold" : "Helvetica")
    .fontSize(opts.bold ? 9.5 : 9)
    .fillColor(opts.color ?? (opts.bold ? COLORS.ink : COLORS.inkMuted));
  doc.text(label, ctx.left + (opts.indent ?? 0), y, { lineBreak: false });
  doc
    .font(opts.bold ? "Helvetica-Bold" : "Helvetica")
    .fillColor(opts.color ?? COLORS.ink)
    .text(value, ctx.right - 150, y, { width: 150, align: "right", lineBreak: false });
  return y + 14;
}

/** The band the net and the month's total live in. */
function highlightBand(
  doc: PDFKit.PDFDocument,
  ctx: Ctx,
  label: string,
  caption: string,
  amount: string,
  y: number,
): number {
  const H = 40;
  doc
    .save()
    .roundedRect(ctx.left, y, ctx.width, H, 4)
    .fillAndStroke(COLORS.netTint, COLORS.brand)
    .restore();
  doc.font("Helvetica-Bold").fontSize(8.5).fillColor(COLORS.brandDeep);
  doc.text(label.toUpperCase(), ctx.left + 10, y + 8, { lineBreak: false });
  doc.font("Helvetica").fontSize(7.5).fillColor(COLORS.inkSoft);
  doc.text(caption, ctx.left + 10, y + 21, { width: ctx.width - 220, lineBreak: false });
  doc.font("Helvetica-Bold").fontSize(17).fillColor(COLORS.brandDeep);
  doc.text(amount, ctx.right - 210, y + 12, { width: 200, align: "right", lineBreak: false });
  return y + H + 8;
}

/**
 * HOW MANY TABLE ROWS FIT before the footer band.
 *
 * The document is exactly three pages, so a table cannot push the page count up.
 * Every table asks this first and prints the rows that fit plus a line saying how
 * many were left out — clipping a row mid-height is how a PDF becomes unreadable,
 * and silently dropping rows without saying so is worse.
 */
function fitRows(doc: PDFKit.PDFDocument, ctx: Ctx, rowHeight: number, reserve: number): number {
  const bottom = PAGE_H - doc.page.margins.bottom - reserve;
  const available = bottom - doc.y;
  return Math.max(0, Math.floor(available / rowHeight));
}

/** "…and 3 more rows" — printed whenever a table was cut to fit. */
function omittedNote(
  doc: PDFKit.PDFDocument,
  ctx: Ctx,
  omitted: number,
  what: string,
  y: number,
): number {
  if (omitted <= 0) return y;
  doc.font("Helvetica-Oblique").fontSize(7.5).fillColor(COLORS.inkFaint);
  doc.text(
    `${omitted} more ${what} not shown — open the Salary Statement on the web to see every row.`,
    ctx.left,
    y,
    { width: ctx.width, lineBreak: false },
  );
  return y + 11;
}

// ── PAGE 1 — THE SLIP ───────────────────────────────────────────────────────

function drawSalarySlipPage(doc: PDFKit.PDFDocument, ctx: Ctx, data: SalarySlipData): void {
  pageFurniture(doc, data);

  const id = data.identity;
  const salary = data.salary;

  // ── EMPLOYEE INFORMATION ────────────────────────────────────────────
  drawSectionHeading(doc, "Employee");
  let y = doc.y + 4;
  const colW = ctx.width / 2;
  // 23pt per row: the 7.5pt label needs a full line of leading before its 9pt
  // value, or the two print on top of each other.
  const ROW_H = 23;
  const field = (label: string, value: string, row: number, col: number): number => {
    const x = ctx.left + col * colW;
    const ly = y + row * ROW_H;
    doc.font("Helvetica").fontSize(7.5).fillColor(COLORS.inkSoft);
    doc.text(label.toUpperCase(), x, ly, { width: colW - 8, lineBreak: false });
    doc.font("Helvetica-Bold").fontSize(9).fillColor(COLORS.ink);
    doc.text(value || "—", x, ly + 9.5, { width: colW - 8, lineBreak: false, ellipsis: true });
    return ly;
  };
  const pairs: [string, string][] = [
    ["Employee", id.name],
    ["Employee Code", id.code ?? "—"],
    ["Designation", id.designation ?? "—"],
    ["Function", id.fn ?? "—"],
    ["Entity", id.entity ?? "—"],
    ["Employee Type", id.workerType ? WORKER_TYPE_LABELS[asWorkerType(id.workerType)] : "—"],
    ["DOJ", id.doj ? fmtDate(id.doj) : "—"],
    ["Payroll Month", `${id.monthLabel} (${id.month})`],
  ];
  pairs.forEach((p, i) => field(p[0], p[1], Math.floor(i / 2), i % 2));
  // The section headings below draw from `doc.y`, so the flow position has to
  // be brought up to the explicit y this block finished at.
  doc.y = y + Math.ceil(pairs.length / 2) * ROW_H + 6;
  y = doc.y;

  // ── THE FOUR FIGURES ────────────────────────────────────────────────
  drawSectionHeading(doc, "Salary");
  doc.y += 4;
  drawStatTiles(doc, [
    { label: "Monthly CTC", value: inr(salary?.monthlyCtc ?? 0), accent: true },
    { label: "Salary / Day", value: inr(salary?.perDay ?? 0) },
    { label: "Payable Days", value: String(salary?.payableDays ?? 0) },
    { label: "Salary Earned", value: inr(salary?.gross ?? 0) },
  ]);
  y = doc.y + 10;

  // ── EARNINGS ────────────────────────────────────────────────────────
  drawSectionHeading(doc, "Earnings");
  y = doc.y + 5;
  for (const line of salary?.earnings ?? []) {
    y = moneyRow(doc, ctx, line.label, inr(line.amount), y);
  }
  y = moneyRow(doc, ctx, "Gross Earnings", inr(salary?.gross ?? 0), y, { bold: true });
  if ((salary?.attendanceShortfall ?? 0) > 0) {
    // Formatted with the house `inr` — "Rs", never the rupee sign: Helvetica's
    // WinAnsi encoding has no ₹ glyph and prints a box for it.
    doc.font("Helvetica-Oblique").fontSize(7.5).fillColor(COLORS.inkFaint);
    doc.text(
      `Monthly CTC ${inr(salary!.monthlyCtc)} less ${inr(salary!.attendanceShortfall)} for attendance — already reflected in the earnings above.`,
      ctx.left,
      y,
      { width: ctx.width, lineBreak: false },
    );
    y += 12;
  }

  // ── ADDITIONS — what is added after the gross ───────────────────────
  if ((salary?.additions.length ?? 0) > 0) {
    y += 4;
    doc.y = y;
    drawSectionHeading(doc, "Additions");
    y = doc.y + 5;
    for (const line of salary?.additions ?? []) {
      y = moneyRow(doc, ctx, line.label, inr(line.amount), y);
    }
    y = moneyRow(doc, ctx, "Total Additions", inr(salary?.additionTotal ?? 0), y, { bold: true });
  }

  // ── DEDUCTIONS ──────────────────────────────────────────────────────
  y += 6;
  doc.y = y;
  drawSectionHeading(doc, "Deductions");
  y = doc.y + 5;
  if ((salary?.deductions.length ?? 0) === 0) {
    y = moneyRow(doc, ctx, "No deductions this month", inr(0), y);
  }
  for (const line of salary?.deductions ?? []) {
    y = moneyRow(doc, ctx, line.label, inr(line.amount), y);
  }
  y = moneyRow(doc, ctx, "Total Deductions", inr(salary?.deductionTotal ?? 0), y, {
    bold: true,
  });

  // ── NET + THE MONTH'S TOTAL ─────────────────────────────────────────
  y += 8;
  // ASCII "-" for the subtraction, not U+2212: WinAnsi has no minus glyph and
  // pdfkit writes the byte as 0x22, so the caption printed `additions " Rs 0
  // deductions` — a stray double-quote mid-sentence. Same rule as signedInr.
  y = highlightBand(
    doc,
    ctx,
    "Net Salary Payable",
    `${inr(salary?.gross ?? 0)} gross + ${inr(salary?.additionTotal ?? 0)} additions - ${inr(salary?.deductionTotal ?? 0)} deductions${salary?.paid ? "  ·  marked paid" : "  ·  not yet paid"}`,
    inr(salary?.net ?? 0),
    y,
  );

  const parts: string[] = [`Salary ${inr(salary?.net ?? 0)}`];
  parts.push(`Incentive Paid ${inr(data.incentive.totals.paid)}`);
  if (data.reimbursement.paidThisMonth > 0) {
    parts.push(`Reimbursement ${inr(data.reimbursement.paidThisMonth)}`);
  }
  if (data.retention?.paidThisMonth) parts.push(`Retention ${inr(data.retention.amount)}`);
  y = highlightBand(
    doc,
    ctx,
    "Total Earnings This Month",
    parts.join("  ·  "),
    inr(data.totalEarnings),
    y,
  );
  doc.font("Helvetica-Oblique").fontSize(8).fillColor(COLORS.inkSoft);
  doc.text(`In words: ${amountInWords(data.totalEarnings)}`, ctx.left, y, { lineBreak: false });
  y += 14;

  if (data.reimbursement.lines.length > 0) {
    doc.y = y;
    drawSectionHeading(doc, "Reimbursement");
    y = doc.y + 5;
    for (const line of data.reimbursement.lines) {
      y = moneyRow(
        doc,
        ctx,
        `${line.expenseFor}  ·  ${line.state}${line.paidDate ? ` ${fmtDate(line.paidDate)}` : ""}`,
        inr(line.amount),
        y,
        { color: line.state === "paid" ? COLORS.ink : COLORS.inkMuted },
      );
    }
    y += 6;
  }

  // ── SIGNATORY + FOOTER ──────────────────────────────────────────────
  const signatory = signatoryForEntity(data.identity.entity);
  const blockY = Math.max(y + 10, PAGE_H - doc.page.margins.bottom - 150);
  drawSignatoryBlock(doc, {
    x: ctx.right - 240,
    y: blockY,
    entity: data.identity.entity ?? "Altus Corp",
    signatoryName: signatory.name,
    assetFile: signatory.assetFile,
    date: fmtDate(new Date().toISOString().slice(0, 10)),
    place: "Pune",
  });
  drawFooter(doc, `Salary Slip · ${data.identity.monthLabel}`, ctx.generatedBy);
}

// ── PAGE 2 — ATTENDANCE ─────────────────────────────────────────────────────

function attendanceHeader(doc: PDFKit.PDFDocument, ctx: Ctx, data: SalarySlipData): number {
  pageChrome(doc, data);
  centredPageTitle(
    doc,
    data,
    "ATTENDANCE & SALARY CALCULATION",
    `${data.identity.monthLabel.toUpperCase()}  ·  ${data.identity.daysInMonth} DAYS`,
  );
  const a = data.attendance;
  drawStatTiles(doc, [
    { label: "Salary / Day", value: inr(data.salary?.perDay ?? 0), accent: true },
    { label: "Target Hours", value: a.targetHours == null ? "—" : `${a.targetHours} h` },
    { label: "Worked Hours", value: a.workedHours == null ? "—" : `${a.workedHours} h` },
    { label: "Payable Days", value: String(a.payableDays) },
  ]);
  return doc.y + 8;
}

/**
 * PAGE 2 — ATTENDANCE & SALARY CALCULATION.
 *
 * The month's figures, then the weekly summary, then the month's calculation.
 * What is deliberately NOT here is the per-day dump of every week: it was the
 * reason this page became unreadable, and it is what the web statement's week
 * dropdown is for. The weekly summary carries the same information at the size a
 * printed page can take — a week per row, with the month's total beneath it.
 */
function drawAttendanceCalculationPage(
  doc: PDFKit.PDFDocument,
  ctx: Ctx,
  data: SalarySlipData,
): void {
  let y = attendanceHeader(doc, ctx, data);
  const ledger = data.ledger;

  doc.y = y;
  drawSectionHeading(doc, "Weekly Summary");
  y = doc.y + 6;

  const cols: Col[] = [
    // The first column has to clear the words "Month total" in bold, not just
    // "Week 1" — it carries the label as well as the numbers.
    { label: "Week", flex: 0.13 },
    { label: "Present", flex: 0.08, align: "right" },
    { label: "Half Day", flex: 0.09, align: "right" },
    { label: "Absent", flex: 0.08, align: "right" },
    { label: "Weekly Off", flex: 0.1, align: "right" },
    { label: "Worked / Target", flex: 0.18, align: "right" },
    { label: "Salary Earned", flex: 0.17, align: "right" },
    { label: "Ded. / Add. Pay", flex: 0.17, align: "right" },
  ];
  y = tableHead(doc, ctx, cols, y);

  if (!ledger) {
    doc.font("Helvetica").fontSize(8.5).fillColor(COLORS.inkSoft);
    doc.text(
      "The attendance engine has no day-by-day record for this month, so the weekly working cannot be shown.",
      ctx.left,
      y,
      { width: ctx.width, lineBreak: false },
    );
    return;
  }

  // The totals row and the two notes need ~60pt; the weeks themselves are the
  // only thing that could ever grow, and a month is six weeks at most.
  const room = fitRows(doc, ctx, 13, 90);
  const shown = ledger.weeks.slice(0, room);
  for (const week of shown) {
    const c = week.totals.counts;
    const adjusted = (week.totals.adjustment ?? 0) !== 0;
    y = tableRow(
      doc,
      ctx,
      cols,
      [
        `Week ${week.index}`,
        String(c.full_day ?? 0),
        String(c.half_day ?? 0),
        String(c.absent ?? 0),
        String(c.weekly_off ?? 0),
        `${hm(week.totals.workedMinutes)} / ${hm(week.totals.requiredMinutes)}`,
        week.totals.earned == null ? "—" : inr(week.totals.earned),
        week.totals.adjustment == null || week.totals.adjustment === 0
          ? "—"
          : signedInr(week.totals.adjustment),
      ],
      y,
      { color: adjusted ? COLORS.brandDeep : COLORS.ink },
    );
  }

  // MONTH TOTAL — the LEDGER's own totals (`ledger.totals`), not a sum taken
  // here, so this row and the web statement's bottom row are the same numbers.
  const t = ledger.totals;
  y = tableRow(
    doc,
    ctx,
    cols,
    [
      "Month total",
      String(data.attendance.present),
      String(data.attendance.halfDay),
      String(data.attendance.absent),
      String(data.attendance.weeklyOff),
      `${hm(t.workedMinutes)} / ${hm(t.requiredMinutes)}`,
      t.earned == null ? "—" : inr(t.earned),
      t.adjustment == null || t.adjustment === 0 ? "—" : signedInr(t.adjustment),
    ],
    y + 2,
    { bold: true },
  );
  y += 4;
  y = omittedNote(doc, ctx, ledger.weeks.length - shown.length, "weeks", y);

  if (!ledger.hasMoney && ledger.moneyNote) {
    // The engine refused to price this month's days and said why; printing five
    // columns of dashes without that sentence reads as a rendering bug.
    doc.font("Helvetica-Oblique").fontSize(7.5).fillColor(COLORS.inkSoft);
    doc.text(ledger.moneyNote, ctx.left, y, { width: ctx.width, lineBreak: false });
    y += 11;
  }

  // ── THE MONTH'S CALCULATION ─────────────────────────────────────────
  // The week detail the old PDF dumped for all six weeks is summarised once,
  // for the month, in the same terms the web statement uses for one week.
  y += 6;
  doc.y = y;
  drawSectionHeading(doc, "Month Calculation");
  y = doc.y + 6;
  const monthAdjustment = t.adjustment ?? 0;
  const lines: [string, string][] = [
    ["Target Hours", data.attendance.targetHours == null ? hm(t.requiredMinutes) : `${data.attendance.targetHours} h`],
    ["Worked Hours", data.attendance.workedHours == null ? hm(t.workedMinutes) : `${data.attendance.workedHours} h`],
    ["Hours Difference", signedHm(t.balanceMinutes)],
    ["Salary / Day", data.salary ? inr(data.salary.perDay) : "—"],
    ["Payable Days", String(data.attendance.payableDays)],
    ["Attendance Salary", t.earned == null ? "—" : inr(t.earned)],
    ["Deduction", monthAdjustment < 0 ? signedInr(monthAdjustment) : "—"],
    ["Additional Pay", monthAdjustment > 0 ? signedInr(monthAdjustment) : "—"],
    // The same figure the slip's "Salary Earned" shows — one month, one number.
    ["Final Month Salary", data.salary ? inr(data.salary.gross) : "—"],
  ];
  for (const [label, value] of lines) y = moneyRow(doc, ctx, label, value, y);

  doc.font("Helvetica").fontSize(7.5).fillColor(COLORS.inkSoft);
  doc.text(
    "Ded./Add. Pay: a negative figure is a deduction, a positive figure is overtime or additional pay. The weeks are the attendance engine's own buckets, not calendar rows. Open the Salary Statement on the web to see any single week day by day.",
    ctx.left,
    y,
    { width: ctx.width, lineBreak: false },
  );
  y += 12;

  drawFooter(doc, `Attendance & Salary Calculation · ${data.identity.monthLabel}`, ctx.generatedBy);
}

// ── PAGE 3 — INCENTIVE ──────────────────────────────────────────────────────

function incentiveHeader(doc: PDFKit.PDFDocument, ctx: Ctx, data: SalarySlipData): number {
  pageChrome(doc, data);
  centredPageTitle(
    doc,
    data,
    "INCENTIVE STATEMENT",
    `${data.identity.monthLabel.toUpperCase()}  ·  ${data.identity.fy}`,
  );
  const t = data.incentive.totals;
  drawStatTiles(doc, [
    { label: "Earned", value: inr(t.earned), accent: true },
    { label: "Paid", value: inr(t.paid) },
    { label: "Payable", value: inr(t.payable) },
    {
      label: "Negative Payable",
      value: inr(t.adjustment),
      caption: "adjustment",
    },
  ]);
  return doc.y + 8;
}

const RECORD_COLS: Col[] = [
  { label: "Incentive", flex: 0.19 },
  { label: "Prospect", flex: 0.18 },
  { label: "Introducer", flex: 0.17 },
  // The product column holds a NAME AND A CODE per product ("PS (PS)"), so it
  // is the one column that must not be starved for the others.
  { label: "Product", flex: 0.22 },
  { label: "Date", flex: 0.12 },
  { label: "Status", flex: 0.12 },
];

const PAYMENT_COLS: Col[] = [
  { label: "Incentive", flex: 0.26 },
  { label: "Earned", flex: 0.14, align: "right" },
  { label: "Paid", flex: 0.14, align: "right" },
  { label: "Payable", flex: 0.14, align: "right" },
  { label: "Adjustment", flex: 0.16, align: "right" },
  { label: "Payment Date", flex: 0.16, align: "right" },
];

const STATE_LABELS: Record<string, string> = {
  paid: "Paid",
  part_paid: "Part paid",
  unpaid: "Unpaid",
  reversed: "Net step-down",
};

function drawTargetVsAchievement(
  doc: PDFKit.PDFDocument,
  ctx: Ctx,
  data: SalarySlipData,
  y: number,
): number {
  doc.y = y;
  drawSectionHeading(doc, "Target vs Achievement");
  y = doc.y + 6;
  const cols: Col[] = [
    { label: "Period", flex: 0.4 },
    { label: "Target", flex: 0.2, align: "right" },
    { label: "Earned / Paid", flex: 0.2, align: "right" },
    { label: "Attainment", flex: 0.2, align: "right" },
  ];
  y = tableHead(doc, ctx, cols, y);
  const tvp = data.incentive.targetVsPaid;
  const rows: [string, { target: number; paid: number; attainmentPct: number | null }][] = [
    ["This Month", tvp.thisMonth],
    ["Last 3 Months", tvp.last3Months],
    ["Year to Date", tvp.ytd],
  ];
  for (const [label, w] of rows) {
    y = tableRow(
      doc,
      ctx,
      cols,
      [
        label,
        inr(w.target),
        inr(w.paid),
        w.attainmentPct == null ? "—" : `${w.attainmentPct.toFixed(1)}%`,
      ],
      y,
    );
  }
  return y + 6;
}

/**
 * PAGE 3 — INCENTIVE STATEMENT, for THIS payroll month.
 *
 * One pass, one set of tables, and ONE empty state when there is nothing to
 * show. The old renderer printed five near-identical window pages and one page
 * per incentive, so a month with no incentives printed "no incentive payment"
 * four times over — the repetition the brief calls out. Windows (this month /
 * last 3 / YTD) and the per-incentive breakdown are browsing, and they live on
 * the web statement; what belongs in a printed statement is this month.
 */
function drawIncentiveStatementPage(doc: PDFKit.PDFDocument, ctx: Ctx, data: SalarySlipData): void {
  let y = incentiveHeader(doc, ctx, data);

  const month = data.identity.month;
  const records = data.incentive.recordsByMonth[month] ?? [];
  const lines = data.incentive.linesByMonth[month] ?? data.incentive.lines;

  // ONE empty state, before any table is drawn — so there is no header with
  // nothing under it, and no second "no payments" paragraph beneath the first.
  if (records.length === 0 && lines.length === 0) {
    doc.y = y + 4;
    doc.font("Helvetica").fontSize(9.5).fillColor(COLORS.inkSoft);
    doc.text("No incentive records for this period.", ctx.left, doc.y, {
      width: ctx.width,
      align: "center",
      lineBreak: false,
    });
    doc.y += 20;
    doc.font("Helvetica").fontSize(7.5).fillColor(COLORS.inkFaint);
    doc.text(
      "Incentives you earn appear here once a request is approved and the Accounts ledger has a row for it.",
      ctx.left,
      doc.y,
      { width: ctx.width, align: "center", lineBreak: false },
    );
    drawFooter(doc, `Incentive Statement · ${data.identity.monthLabel}`, ctx.generatedBy);
    return;
  }

  // ── WHAT WAS SUBMITTED — the request records, which carry the names ──
  doc.y = y;
  drawSectionHeading(doc, "Incentive Records");
  y = doc.y + 6;
  y = tableHead(doc, ctx, RECORD_COLS, y);
  const recordRoom = fitRows(doc, ctx, 13, 200);
  const shownRecords = records.slice(0, recordRoom);
  for (const r of shownRecords) {
    y = tableRow(
      doc,
      ctx,
      RECORD_COLS,
      [
        r.typeLabel,
        r.prospect || "—",
        r.introducer || "—",
        // The code, from the Product Master — and the name too when the master
        // has one, so the row reads without a lookup.
        r.productCodes.length > 0
          ? r.productNames
              .map((n, i) => (r.productCodes[i] ? `${n} (${r.productCodes[i]})` : n))
              .join(", ")
          : "—",
        r.date ? fmtDate(r.date) : "—",
        r.status.replace(/_/g, " "),
      ],
      y,
    );
  }
  y = omittedNote(doc, ctx, records.length - shownRecords.length, "records", y);

  // ── WHAT IS OWED AND PAID — the Accounts ledger, which carries money ─
  y += 10;
  doc.y = y;
  drawSectionHeading(doc, "Incentive Payments");
  y = doc.y + 6;
  y = tableHead(doc, ctx, PAYMENT_COLS, y);
  const paymentRoom = fitRows(doc, ctx, 13, 150);
  const shownLines = lines.slice(0, paymentRoom);
  for (const l of shownLines) {
    y = tableRow(
      doc,
      ctx,
      PAYMENT_COLS,
      [
        l.incentiveName,
        inr(l.earned),
        inr(l.paid),
        inr(l.payable),
        l.adjustment === 0 ? "—" : signedInr(l.adjustment),
        l.paidDate ? fmtDate(l.paidDate) : "—",
      ],
      y,
      { color: l.adjustment < 0 ? COLORS.brandDeep : COLORS.ink },
    );
  }
  // The month's own totals, from the DATA — the same four figures the tiles at
  // the top of this page show, so the table cannot disagree with its summary.
  const t = data.incentive.totals;
  y = tableRow(
    doc,
    ctx,
    PAYMENT_COLS,
    [
      "Month total",
      inr(t.earned),
      inr(t.paid),
      inr(t.payable),
      t.adjustment === 0 ? "—" : signedInr(t.adjustment),
      "",
    ],
    y + 2,
    { bold: true },
  );
  y = omittedNote(doc, ctx, lines.length - shownLines.length, "payments", y);

  y += 10;
  y = drawTargetVsAchievement(doc, ctx, data, y);

  doc.font("Helvetica").fontSize(7.5).fillColor(COLORS.inkFaint);
  doc.text(
    "The incentive module keeps submissions and payments as two records; this statement prints each from its own source rather than guessing a link between them. Period views (this month, last 3 months, year to date) and the per-incentive breakdown are on the Salary Statement on the web.",
    ctx.left,
    y,
    { width: ctx.width, lineBreak: false },
  );

  drawFooter(doc, `Incentive Statement · ${data.identity.monthLabel}`, ctx.generatedBy);
}

// ── RENDER ──────────────────────────────────────────────────────────────────

/**
 * Render the statement: three pages, in this order, every time.
 *
 *   1. the slip          2. the attendance calculation          3. the incentives
 *
 * Two `addPage()` calls and no more, so the page count is a property of this
 * function rather than of how much data a month happens to carry. Each page
 * draws its own footer, so a reader who prints only page 2 still gets the
 * document's name and the month on it.
 *
 * SINGLE SOURCE: `data` is the same object the web Salary Statement renders
 * (loadSalarySlipData). Nothing here reads the database, and no figure is
 * computed — so the screen and the PDF cannot disagree.
 */
export async function renderSalarySlipPdf(
  data: SalarySlipData,
  meta: { generatedBy: string },
): Promise<Buffer> {
  const { doc, done } = startSource();
  const ctx: Ctx = {
    doc,
    generatedBy: meta.generatedBy,
    left: doc.page.margins.left,
    right: doc.page.width - doc.page.margins.right,
    width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
  };

  drawSalarySlipPage(doc, ctx, data);

  doc.addPage();
  drawAttendanceCalculationPage(doc, ctx, data);

  doc.addPage();
  drawIncentiveStatementPage(doc, ctx, data);

  doc.end();
  return done;
}

/** "7h 21m" — the words the attendance tables use for a duration. */
function hm(minutes: number): string {
  const sign = minutes < 0 ? "-" : "";
  const abs = Math.abs(Math.round(minutes));
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${sign}${h}h ${String(m).padStart(2, "0")}m`;
}

/** "− 7h 21m" / "+ 0h 30m" — a signed duration. */
function signedHm(minutes: number): string {
  const v = Math.round(minutes);
  if (v === 0) return "0h 00m";
  // ASCII "-", not U+2212: Helvetica has no minus glyph in WinAnsi.
  return `${v > 0 ? "+" : "-"} ${hm(Math.abs(v))}`;
}

/** "− Rs 500" / "+ Rs 250" — a signed amount. */
function signedInr(amount: number): string {
  const v = Math.round(amount * 100) / 100;
  if (v === 0) return "—";
  return `${v > 0 ? "+" : "-"} ${inr(Math.abs(v))}`;
}

