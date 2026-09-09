import "server-only";
import { signatoryForEntity } from "@/lib/salary/signatories";
import type { AnnualStatement } from "@/lib/salary/annual-statement";
import {
  COLORS,
  amountInWords,
  drawChrome,
  drawFooter,
  drawMasthead,
  drawSignatoryBlock,
  drawTitleBand,
  fmtDate,
  inr,
  newDoc,
} from "@/lib/salary/pdf-house-style";

/**
 * WS-5 — Annual Salary Statement → A4 PDF in the payslip house style.
 *
 * A per-month ledger (Apr → Mar) with a bold YEAR TOTAL row, closed with the
 * Entity signatory block. Reports the LIVE salary-sheet figures — it does not
 * recompute pay.
 */
export async function renderAnnualStatementPdf(
  stmt: AnnualStatement,
  meta: { generatedBy: string; place?: string | null },
): Promise<Buffer> {
  const entity = (stmt.companyName || "Altus Corp").trim();
  const signatory = signatoryForEntity(entity);

  const { doc, done } = newDoc({
    title: `Annual Salary Statement — ${stmt.employeeName} — ${stmt.fy}`,
    subject: "Annual Salary Statement",
    margin: 48,
  });

  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const width = right - left;

  drawChrome(doc);
  drawMasthead(doc, entity, "Payroll Department  ·  Private & Confidential");
  drawTitleBand(doc, `Annual Salary Statement  —  ${stmt.fy}`, "1 Apr – 31 Mar");

  // ── Employee details ──
  doc
    .font("Helvetica-Bold")
    .fontSize(12)
    .fillColor(COLORS.ink)
    .text(stmt.employeeName, left, doc.y, { lineBreak: false });
  doc.y += 15;
  doc
    .font("Helvetica")
    .fontSize(9.5)
    .fillColor(COLORS.inkSoft)
    .text(
      [stmt.designation, entity].filter(Boolean).join("  ·  ") || "—",
      left,
      doc.y,
      { lineBreak: false },
    );
  doc.y += 20;

  // ── Month ledger ──
  const cols = [
    { key: "label", label: "Month", w: 92, align: "left" as const },
    { key: "days", label: "Paid days", w: 62, align: "right" as const },
    { key: "ctc", label: "Monthly CTC", w: 92, align: "right" as const },
    { key: "pt", label: "Payable a/PT", w: 92, align: "right" as const },
    { key: "adv", label: "Advance", w: 76, align: "right" as const },
    { key: "final", label: "Final pay", w: 0, align: "right" as const }, // fills remainder
  ];
  const fixed = cols.reduce((s, c) => s + c.w, 0);
  cols[cols.length - 1]!.w = width - fixed;

  // Header row
  const headY = doc.y;
  doc.save().rect(left, headY, width, 22).fillColor("#F4F4F5").fill().restore();
  let cx = left;
  for (const c of cols) {
    doc
      .font("Helvetica-Bold")
      .fontSize(8)
      .fillColor(COLORS.inkSoft)
      .text(c.label.toUpperCase(), cx + (c.align === "right" ? 0 : 8), headY + 7, {
        width: c.w - 8,
        align: c.align,
        characterSpacing: 0.4,
        lineBreak: false,
      });
    cx += c.w;
  }
  doc.y = headY + 22;
  doc
    .save()
    .strokeColor(COLORS.hairlineStrong)
    .lineWidth(0.8)
    .moveTo(left, doc.y)
    .lineTo(right, doc.y)
    .stroke()
    .restore();

  const ROW_H = 19;
  for (const m of stmt.months) {
    const y = doc.y + 5;
    const cells = [
      m.label,
      m.present ? m.finalWorkingDays.toLocaleString("en-IN") : "—",
      m.present ? inr(m.monthlyCtc) : "—",
      m.present ? inr(m.payableAfterPt) : "—",
      m.present && m.advance > 0 ? inr(m.advance) : "—",
      m.present ? inr(m.finalPayment) : "—",
    ];
    cx = left;
    cells.forEach((val, i) => {
      const c = cols[i]!;
      doc
        .font("Helvetica")
        .fontSize(9)
        .fillColor(m.present ? COLORS.ink : COLORS.inkFaint)
        .text(val, cx + (c.align === "right" ? 0 : 8), y, {
          width: c.w - 8,
          align: c.align,
          lineBreak: false,
        });
      cx += c.w;
    });
    doc.y = y + ROW_H - 5;
    doc
      .save()
      .strokeColor(COLORS.hairline)
      .lineWidth(0.4)
      .moveTo(left, doc.y)
      .lineTo(right, doc.y)
      .stroke()
      .restore();
  }

  // ── Year total row ──
  const totY = doc.y + 2;
  doc.save().rect(left, totY, width, 30).fillColor(COLORS.netTint).fill().restore();
  doc
    .save()
    .strokeColor(COLORS.brand)
    .lineWidth(1.1)
    .rect(left, totY, width, 30)
    .stroke()
    .restore();
  doc
    .font("Helvetica-Bold")
    .fontSize(10.5)
    .fillColor(COLORS.brandDeep)
    .text(`YEAR TOTAL  (${stmt.totals.monthsPaid} months paid)`, left + 8, totY + 9, {
      lineBreak: false,
    });
  // Right-align the total under the "Final pay" column.
  const finalColW = cols[cols.length - 1]!.w;
  doc
    .font("Helvetica-Bold")
    .fontSize(13)
    .fillColor(COLORS.brandDeep)
    .text(inr(stmt.totals.finalPayment), right - finalColW, totY + 8, {
      width: finalColW - 4,
      align: "right",
      lineBreak: false,
    });
  doc.y = totY + 30 + 12;

  doc
    .font("Helvetica-Oblique")
    .fontSize(9)
    .fillColor(COLORS.inkMuted)
    .text(`Total paid in words: ${amountInWords(stmt.totals.finalPayment)}`, left, doc.y, {
      width,
    });
  doc.y += 22;

  // ── Signatory block (right-aligned) ──
  drawSignatoryBlock(doc, {
    x: right - 240,
    y: doc.y,
    entity,
    signatoryName: signatory.name,
    assetFile: signatory.assetFile,
    date: fmtDate(new Date().toISOString().slice(0, 10)),
    place: meta.place?.trim() || "",
  });

  drawFooter(doc, `Annual Salary Statement · ${stmt.fy}`, meta.generatedBy);
  doc.end();
  return done;
}
