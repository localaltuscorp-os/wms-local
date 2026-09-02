import "server-only";
import PDFDocument from "pdfkit";
import { COLORS, inr } from "@/lib/salary/pdf-house-style";
import {
  toCompanySubtotals,
  type PayrollExportRow,
} from "@/lib/salary/payroll-rows";

/**
 * Payroll PDF (landscape) of the on-screen salary sheet — a clean sheet Sir can
 * read and pay from. Opens with a COMPANY BREAKDOWN summary (headcount + payable
 * + advance + PT + final pay per paying-from entity), then the employee detail
 * table grouped by entity with per-entity subtotals + a grand total.
 *
 * Pure/testable: takes already-shaped payroll rows + a month label and returns
 * the finished Buffer. The route only does auth + data fetch.
 */

interface Col {
  key: keyof PayrollExportRow;
  label: string;
  w: number;
  align: "left" | "right";
  money?: boolean;
}
const COLS: Col[] = [
  { key: "sr", label: "Sr", w: 26, align: "left" },
  { key: "employee", label: "Employee", w: 128, align: "left" },
  { key: "designation", label: "Designation", w: 92, align: "left" },
  { key: "entity", label: "Entity", w: 84, align: "left" },
  { key: "workingDays", label: "Days", w: 36, align: "right" },
  { key: "monthlyCtc", label: "Monthly CTC", w: 74, align: "right", money: true },
  { key: "payableAfterPt", label: "After PT", w: 72, align: "right", money: true },
  { key: "advance", label: "Advance", w: 60, align: "right", money: true },
  { key: "previousPending", label: "Prev.", w: 56, align: "right", money: true },
  { key: "netPayable", label: "Net Pay", w: 82, align: "right", money: true },
];

export async function renderPayrollPdf(
  payrollRows: PayrollExportRow[],
  monthLabelStr: string,
): Promise<Buffer> {
  const companies = toCompanySubtotals(payrollRows);
  // Detail grouped by entity, then name.
  const rows = [...payrollRows].sort(
    (a, b) => a.entity.localeCompare(b.entity) || a.employee.localeCompare(b.employee),
  );

  const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 28 });
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve) => {
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });

  const left = 28;
  const totalW = COLS.reduce((s, c) => s + c.w, 0);
  const pageBottom = doc.page.height - 40;

  const drawHeaderBand = () => {
    doc.save().rect(0, 0, doc.page.width, 4).fill(COLORS.brand).restore();
    doc.fillColor(COLORS.brand).font("Helvetica-Bold").fontSize(15).text("ALTUS CORP", left, 16);
    doc.fillColor("#0f172a").font("Helvetica-Bold").fontSize(12).text(`Payroll — ${monthLabelStr}`, left, 34);
    doc
      .fillColor("#64748b")
      .font("Helvetica")
      .fontSize(8)
      .text(`${rows.length} employees · figures in Rupees · generated for internal use`, left, 50);
  };

  const drawColHeader = (y: number): number => {
    doc.save().rect(left, y, totalW, 18).fill("#f1f5f9").restore();
    let x = left;
    doc.font("Helvetica-Bold").fontSize(7.5).fillColor("#334155");
    for (const c of COLS) {
      doc.text(c.label, x + 4, y + 5, { width: c.w - 8, align: c.align });
      x += c.w;
    }
    return y + 18;
  };

  // ── Company breakdown summary (page 1 only) — who pays whom, at a glance ──
  interface SumCol {
    label: string;
    w: number;
    align: "left" | "right";
    val: (c: (typeof companies)[number]) => string;
    totalVal: () => string;
  }
  const sumCols: SumCol[] = [
    { label: "Company", w: 180, align: "left", val: (c) => c.entity, totalVal: () => "ALL COMPANIES" },
    { label: "Headcount", w: 74, align: "right", val: (c) => String(c.headcount), totalVal: () => String(rows.length) },
    { label: "Payable A/PT", w: 108, align: "right", val: (c) => inr(c.payableAfterPt), totalVal: () => inr(companies.reduce((s, c) => s + c.payableAfterPt, 0)) },
    { label: "Advance", w: 92, align: "right", val: (c) => inr(c.advance), totalVal: () => inr(companies.reduce((s, c) => s + c.advance, 0)) },
    { label: "PT", w: 78, align: "right", val: (c) => inr(c.pt), totalVal: () => inr(companies.reduce((s, c) => s + c.pt, 0)) },
    { label: "Final Pay", w: 118, align: "right", val: (c) => inr(c.finalPayment), totalVal: () => inr(companies.reduce((s, c) => s + c.finalPayment, 0)) },
  ];
  const sumW = sumCols.reduce((s, c) => s + c.w, 0);

  const drawCompanySummary = (startY: number): number => {
    let sy = startY;
    doc.font("Helvetica-Bold").fontSize(9).fillColor(COLORS.brandDeep);
    doc.text("BY COMPANY — PAYING FROM", left, sy, { characterSpacing: 0.6 });
    sy += 15;
    doc.save().rect(left, sy, sumW, 16).fill("#f1f5f9").restore();
    let x = left;
    doc.font("Helvetica-Bold").fontSize(7.5).fillColor("#334155");
    for (const c of sumCols) {
      doc.text(c.label, x + 5, sy + 4.5, { width: c.w - 10, align: c.align });
      x += c.w;
    }
    sy += 16;
    companies.forEach((c, i) => {
      doc.save().rect(left, sy, sumW, 15).fill(i % 2 ? "#ffffff" : "#fafafa").restore();
      x = left;
      for (const col of sumCols) {
        const bold = col.label === "Final Pay";
        doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(8).fillColor(bold ? "#0f172a" : "#1f2937");
        doc.text(col.val(c), x + 5, sy + 3.5, { width: col.w - 10, align: col.align, lineBreak: false, ellipsis: true });
        x += col.w;
      }
      sy += 15;
    });
    doc.save().rect(left, sy, sumW, 18).fill("#ecfdf5").restore();
    x = left;
    for (const col of sumCols) {
      doc.font("Helvetica-Bold").fontSize(8).fillColor(COLORS.brandDeep);
      doc.text(col.totalVal(), x + 5, sy + 5, { width: col.w - 10, align: col.align, lineBreak: false });
      x += col.w;
    }
    sy += 18;
    return sy;
  };

  drawHeaderBand();
  let y = drawCompanySummary(66);
  y += 14;
  doc.font("Helvetica-Bold").fontSize(9).fillColor(COLORS.brandDeep).text("EMPLOYEE DETAIL", left, y, { characterSpacing: 0.6 });
  y += 15;
  y = drawColHeader(y);

  const cell = (r: PayrollExportRow) => {
    let x = left;
    doc.font("Helvetica").fontSize(7.5).fillColor("#1f2937");
    for (const c of COLS) {
      const raw = r[c.key];
      const txt = c.money ? inr(Number(raw) || 0) : String(raw ?? "");
      const bold = c.key === "netPayable";
      doc.font(bold ? "Helvetica-Bold" : "Helvetica").fillColor(bold ? "#0f172a" : "#1f2937");
      doc.text(txt, x + 4, y + 4, { width: c.w - 8, align: c.align, lineBreak: false, ellipsis: true });
      x += c.w;
    }
  };

  let entity = "";
  let grand = 0;
  let entitySub = 0;
  const flushEntitySub = () => {
    if (!entity) return;
    doc.save().rect(left, y, totalW, 15).fill("#ecfdf5").restore();
    doc.font("Helvetica-Bold").fontSize(7.5).fillColor(COLORS.brandDeep);
    doc.text(`${entity} — subtotal`, left + 4, y + 4, { width: totalW - 90, align: "left" });
    doc.text(inr(entitySub), left + totalW - 86, y + 4, { width: 82, align: "right" });
    y += 15;
    entitySub = 0;
  };

  for (const r of rows) {
    if (r.entity !== entity) {
      flushEntitySub();
      entity = r.entity;
    }
    if (y + 15 > pageBottom) {
      doc.addPage();
      drawHeaderBand();
      y = drawColHeader(66);
    }
    doc.save().rect(left, y, totalW, 14).fill(rows.indexOf(r) % 2 ? "#ffffff" : "#fafafa").restore();
    cell(r);
    y += 14;
    entitySub += r.netPayable;
    grand += r.netPayable;
  }
  flushEntitySub();

  y += 4;
  doc.save().rect(left, y, totalW, 20).fill(COLORS.brand).restore();
  doc.font("Helvetica-Bold").fontSize(9.5).fillColor("#ffffff");
  doc.text("TOTAL PAYABLE", left + 6, y + 5, { width: totalW - 130, align: "left" });
  doc.text(inr(grand), left + totalW - 124, y + 5, { width: 120, align: "right" });

  doc.end();
  return done;
}
