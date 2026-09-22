import "server-only";
import { signatoryForEntity } from "@/lib/salary/signatories";
import type { IncentiveBreakup } from "@/lib/incentive/breakup";
import {
  COLORS,
  amountInWords,
  drawChrome,
  drawFooter,
  drawMasthead,
  drawSectionHeading,
  drawSignatoryBlock,
  drawTitleBand,
  fmtDate,
  inr,
  newDoc,
} from "@/lib/salary/pdf-house-style";

/**
 * WS-6 — Incentive Breakup → A4 PDF in the salary-slip house style. Same
 * masthead/title/signatory chrome as the salary slip, but the body is the
 * incentive breakup: approved (due), paid, reversal adjustment and NET for each
 * entry, closed with a highlighted total.
 */

export async function renderIncentiveBreakupPdf(
  data: IncentiveBreakup,
  meta: { generatedBy: string; place?: string | null },
): Promise<Buffer> {
  const entity = (data.entity || "Altus Corp").trim();
  const signatory = signatoryForEntity(entity);

  const { doc, done } = newDoc({
    title: `Incentive Breakup — ${data.employeeName} — ${data.monthLabel}`,
    subject: "Incentive Breakup",
    margin: 48,
  });

  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const width = right - left;

  drawChrome(doc);
  drawMasthead(doc, entity, "Payroll Department  ·  Private & Confidential");
  drawTitleBand(doc, `Incentive Breakup  —  ${data.monthLabel}`, data.fy);

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
  doc.y += 22;

  drawSectionHeading(doc, "Incentive breakup");

  if (data.lines.length === 0) {
    doc
      .font("Helvetica-Oblique")
      .fontSize(9.5)
      .fillColor(COLORS.inkFaint)
      .text("No incentive activity this month.", left + 4, doc.y, { lineBreak: false });
    doc.y += 20;
  } else {
    const c1 = left + 4;
    const c2 = left + width * 0.34;
    const c3 = left + width * 0.52;
    const c4 = left + width * 0.70;
    const c5 = left + width * 0.88;

    const header = () => {
      const y = doc.y;
      doc.font("Helvetica-Bold").fontSize(8).fillColor(COLORS.inkSoft);
      doc.text("INCENTIVE", c1, y, { lineBreak: false });
      doc.text("DATE", c2, y, { lineBreak: false });
      doc.text("APPROVED", c3, y, { width: width * 0.16, align: "right", lineBreak: false });
      doc.text("PAID", c4, y, { width: width * 0.16, align: "right", lineBreak: false });
      doc.text("NET", c5, y, { width: width * 0.12 - 4, align: "right", lineBreak: false });
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

    const row = (l: IncentiveBreakup["lines"][number]) => {
      const y = doc.y;
      doc.font("Helvetica").fontSize(9).fillColor(COLORS.inkMuted);
      doc.text(l.incentiveName, c1, y, { width: width * 0.30, lineBreak: false });
      doc.text(l.date ? fmtDate(l.date) : "—", c2, y, { lineBreak: false });
      doc.fillColor(COLORS.ink);
      doc.text(inr(l.approved), c3, y, { width: width * 0.16, align: "right", lineBreak: false });
      doc.text(inr(l.paid), c4, y, { width: width * 0.16, align: "right", lineBreak: false });
      doc
        .fillColor(l.reversal < 0 ? COLORS.brandDeep : COLORS.ink)
        .font(l.reversal < 0 ? "Helvetica-Bold" : "Helvetica");
      doc.text(inr(l.net), c5, y, { width: width * 0.12 - 4, align: "right", lineBreak: false });
      doc.y = y + 16;
      if (l.reversal < 0) {
        doc
          .font("Helvetica-Oblique")
          .fontSize(7.5)
          .fillColor(COLORS.inkFaint)
          .text(`includes reversal adjustment −${inr(-l.reversal)}`, c2, doc.y - 7, {
            lineBreak: false,
          });
      }
    };

    header();
    for (const l of data.lines) row(l);
    doc.y += 8;
  }

  // ── Total highlight ──
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
    .text("NET INCENTIVE THIS MONTH", left + 12, totY + 8, { lineBreak: false });
  doc
    .font("Helvetica")
    .fontSize(7.5)
    .fillColor(COLORS.inkSoft)
    .text("approved · paid · reversal adjustment", left + 12, totY + 24, { lineBreak: false });
  doc
    .font("Helvetica-Bold")
    .fontSize(17)
    .fillColor(COLORS.brandDeep)
    .text(inr(data.totals.net), right - 204, totY + 11, {
      width: 200,
      align: "right",
      lineBreak: false,
    });
  doc.y = totY + 40 + 10;

  doc
    .font("Helvetica-Oblique")
    .fontSize(9)
    .fillColor(COLORS.inkMuted)
    .text(`In words: ${amountInWords(data.totals.net)}`, left, doc.y, { width });
  doc.y += 22;

  drawSignatoryBlock(doc, {
    x: right - 240,
    y: doc.y,
    entity,
    signatoryName: signatory.name,
    assetFile: signatory.assetFile,
    date: fmtDate(new Date().toISOString().slice(0, 10)),
    place: meta.place?.trim() || "",
  });

  drawFooter(doc, `Incentive Breakup · ${data.monthLabel}`, meta.generatedBy);
  doc.end();
  return done;
}
