import "server-only";
import PDFDocument from "pdfkit";
import { format } from "date-fns";
import { formatDate, formatInr } from "@/lib/format";
import type { CatalogRow } from "@/lib/queries/incentive-catalog";
import { eligibilityLabel } from "@/lib/exports/incentive-catalog";

/**
 * THE INCENTIVE TABLE, TYPESET — every row, drawn from data.
 *
 * ── NOT A PRINT DIALOG, NOT A SCREENSHOT ───────────────────────────────────
 * The bytes are drawn server-side with pdfkit, the same renderer
 * /tasks/export.pdf and lib/exports/attendance-statement-pdf.ts already use.
 * Nothing here reads the DOM, so nothing here can be cut off by a viewport,
 * hidden behind a scroll container, or limited to the rows a browser happened
 * to have rendered. The caller passes the COMPLETE catalog; this writes all of
 * it.
 *
 * ── THE THREE THINGS A MULTI-PAGE TABLE HAS TO GET RIGHT ───────────────────
 *   1. MEASURE BEFORE DRAWING. `measureRowHeight` asks pdfkit how tall each
 *      cell's wrapped text will actually be, and the row takes that height. A
 *      three-line description gets three lines of space instead of overprinting
 *      the row beneath it.
 *   2. BREAK BETWEEN ROWS, NEVER THROUGH ONE. If the measured height does not
 *      fit above the footer reserve, the page breaks FIRST.
 *   3. RE-STAMP THE HEADER. `doc.on("pageAdded")` redraws the brand rule, the
 *      continuation line and the column header on every new page, so page four
 *      is as readable as page one.
 *
 * Lives in lib/ rather than inside the route so it can be unit-tested against a
 * catalog long enough to paginate — a Next.js route file may only export HTTP
 * handlers, which would have made the renderer unreachable from a test.
 */

const COLORS = {
  ink: "#0A0A0A",
  inkMuted: "#525252",
  inkSoft: "#737373",
  hairline: "#E5E5E5",
  brand: "#E10600",
  brandDeep: "#B00500",
  sales: "#B00500",
  interns: "#1D4ED8",
} as const;

interface ColumnSpec {
  key: "incentive" | "amount" | "eligible" | "status";
  label: string;
  width: number;
  align?: "left" | "right";
}

const FOOTER_RESERVE = 26;
const ROW_PAD_Y = 7;
const CELL_PAD_X = 8;

export async function renderIncentiveCatalogPdf(
  rows: CatalogRow[],
  meta: { generatedBy: string },
): Promise<Buffer> {
  // PORTRAIT, unlike the tasks report. Four columns, two of which are prose —
  // portrait gives the description the vertical run it needs and keeps the
  // measure readable rather than stretching four columns across a landscape page.
  const doc = new PDFDocument({
    size: "A4",
    layout: "portrait",
    margin: 44,
    info: {
      Title: "Altus Corp — Incentive Table",
      Author: "Altus Corp Dashboard",
      Subject: "Incentive catalogue",
    },
    bufferPages: true, // needed for the "Page X of Y" pass at the end
  });

  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });

  const pageLeft = doc.page.margins.left;
  const pageRight = doc.page.width - doc.page.margins.right;
  const pageWidth = pageRight - pageLeft;
  const pageBottom = doc.page.height - doc.page.margins.bottom;

  const columns: ColumnSpec[] = [
    { key: "incentive", label: "INCENTIVE", width: 250 },
    { key: "amount", label: "AMOUNT", width: 86, align: "right" },
    { key: "eligible", label: "ELIGIBLE", width: 96 },
    { key: "status", label: "STATUS", width: 62 },
  ];
  const scale = pageWidth / columns.reduce((a, c) => a + c.width, 0);
  for (const c of columns) c.width *= scale;

  drawBrandStripe(doc);
  drawMasthead(doc, { generatedBy: meta.generatedBy, count: rows.length, total: sumAmount(rows) });
  drawTableHeader(doc, columns, pageLeft);

  // Every page after the first gets the chrome back: brand rule, a compact
  // continuation line, and THE COLUMN HEADER AGAIN.
  doc.on("pageAdded", () => {
    drawBrandStripe(doc);
    doc.y = doc.page.margins.top + 4;
    drawContinuationHeader(doc, pageLeft, pageRight);
    drawTableHeader(doc, columns, pageLeft);
  });

  if (rows.length === 0) {
    doc
      .moveDown(2)
      .font("Helvetica-Oblique")
      .fontSize(11)
      .fillColor(COLORS.inkSoft)
      .text("No incentives in the table yet.", pageLeft, doc.y, {
        width: pageWidth,
        align: "center",
      });
  }

  for (const row of rows) {
    const rowH = measureRowHeight(doc, row, columns);
    // Break BEFORE the row, never through it.
    if (doc.y + rowH > pageBottom - FOOTER_RESERVE) {
      doc.addPage({ size: "A4", layout: "portrait", margin: 44 });
    }
    drawRow(doc, row, columns, pageLeft, pageRight, doc.y, rowH);
    doc.y += rowH;
  }

  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    drawFooter(doc, pageLeft, pageRight, { pageNumber: i + 1, pageTotal: range.count });
  }

  doc.end();
  return done;
}

const sumAmount = (rows: CatalogRow[]): number =>
  rows.reduce((s, r) => s + (Number.isFinite(r.amount) ? r.amount : 0), 0);

/* ── Chrome ───────────────────────────────────────────────────────────────── */

function drawBrandStripe(doc: PDFKit.PDFDocument): void {
  doc.save().rect(0, 0, doc.page.width, 4).fill(COLORS.brand).restore();
  doc.save().rect(0, 4, doc.page.width, 1).fill(COLORS.brandDeep).restore();
}

function drawMasthead(
  doc: PDFKit.PDFDocument,
  meta: { generatedBy: string; count: number; total: number },
): void {
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const top = doc.page.margins.top + 4;

  doc
    .font("Helvetica-Bold")
    .fontSize(19)
    .fillColor(COLORS.ink)
    .text("ALTUS CORP", left, top, { characterSpacing: 2.2, lineBreak: false });

  const subY = top + 25;
  doc.save().circle(left + 3, subY + 4, 2.2).fill(COLORS.brand).restore();
  doc
    .font("Helvetica-Bold")
    .fontSize(7.5)
    .fillColor(COLORS.inkMuted)
    .text("INCENTIVE TABLE", left + 11, subY, { characterSpacing: 1.6, lineBreak: false });

  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor(COLORS.inkMuted)
    .text(`${formatDate(new Date())} · ${format(new Date(), "HH:mm")}`, left, top, {
      width: right - left,
      align: "right",
      lineBreak: false,
    });
  doc
    .font("Helvetica-Bold")
    .fontSize(7.5)
    .fillColor(COLORS.ink)
    .text(`PREPARED BY · ${meta.generatedBy.toUpperCase()}`, left, top + 13, {
      width: right - left,
      align: "right",
      characterSpacing: 1.4,
      lineBreak: false,
    });

  // A single summary line rather than a KPI band: the catalog has exactly two
  // facts worth stating up front, and a four-cell band for two of them would be
  // decoration.
  const sumY = subY + 20;
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor(COLORS.inkMuted)
    .text(
      `${meta.count} ${meta.count === 1 ? "incentive" : "incentives"} · ${formatInr(meta.total)} total across the table`,
      left,
      sumY,
      { width: right - left, lineBreak: false },
    );

  doc.y = sumY + 20;
}

function drawTableHeader(
  doc: PDFKit.PDFDocument,
  columns: ColumnSpec[],
  left: number,
): void {
  const y = doc.y;
  const HEADER_H = 18;
  const tableW = columns.reduce((a, c) => a + c.width, 0);

  doc
    .save()
    .strokeColor(COLORS.ink)
    .lineWidth(0.6)
    .moveTo(left, y)
    .lineTo(left + tableW, y)
    .stroke()
    .restore();

  let x = left;
  doc.font("Helvetica-Bold").fontSize(7).fillColor(COLORS.inkMuted);
  for (const c of columns) {
    doc.text(c.label, x + CELL_PAD_X, y + 5, {
      width: c.width - CELL_PAD_X * 2,
      characterSpacing: 1.4,
      align: c.align ?? "left",
      lineBreak: false,
    });
    x += c.width;
  }

  doc
    .save()
    .strokeColor(COLORS.ink)
    .lineWidth(0.4)
    .moveTo(left, y + HEADER_H)
    .lineTo(left + tableW, y + HEADER_H)
    .stroke()
    .restore();
  doc.y = y + HEADER_H + 4;
}

function drawContinuationHeader(
  doc: PDFKit.PDFDocument,
  left: number,
  right: number,
): void {
  doc
    .font("Helvetica-Bold")
    .fontSize(8)
    .fillColor(COLORS.ink)
    .text("ALTUS CORP", left, doc.page.margins.top + 6, {
      characterSpacing: 1.8,
      lineBreak: false,
    });
  doc
    .font("Helvetica")
    .fontSize(7.5)
    .fillColor(COLORS.inkMuted)
    .text("Incentive Table · continued", left, doc.page.margins.top + 6, {
      width: right - left,
      align: "right",
      lineBreak: false,
    });
  doc.y = doc.page.margins.top + 24;
}

function drawFooter(
  doc: PDFKit.PDFDocument,
  left: number,
  right: number,
  meta: { pageNumber: number; pageTotal: number },
): void {
  const y = doc.page.height - doc.page.margins.bottom + 8;
  doc
    .save()
    .moveTo(left, y + 8)
    .lineTo(left + 6, y + 8)
    .lineTo(left + 3, y + 2)
    .closePath()
    .fill(COLORS.brand)
    .restore();
  doc
    .font("Helvetica-Bold")
    .fontSize(6.5)
    .fillColor(COLORS.inkMuted)
    .text("ALTUS CORP · CONFIDENTIAL", left + 12, y + 2, {
      characterSpacing: 1.4,
      lineBreak: false,
    });
  // RIGHT-ALIGNED THE HARD WAY — measure, then place — and it has to be.
  //
  // The footer sits BELOW the bottom margin (that is what a footer is), and
  // pdfkit's `{ width, align: "right" }` runs its line-wrapping machinery even
  // with `lineBreak: false`. Past the bottom margin that machinery fires
  // `addPage`, so every document picked up a spurious trailing blank page —
  // reproduced exactly: `{ width, align }` adds a page where the same call
  // without them does not. Positioning from the measured string width avoids
  // the wrapper entirely.
  const label = `Page ${meta.pageNumber} of ${meta.pageTotal}`;
  doc.font("Helvetica").fontSize(6.5).fillColor(COLORS.inkMuted);
  doc.text(label, right - doc.widthOfString(label), y + 2, { lineBreak: false });
}

/* ── Rows ─────────────────────────────────────────────────────────────────── */

/**
 * How tall this row needs to be once its prose has wrapped.
 *
 * The incentive column stacks up to three blocks — name, description, notes —
 * so its height is their sum, not the tallest of them. Everything else is one
 * line. Without this a long description would be drawn over the row below it.
 */
function measureRowHeight(
  doc: PDFKit.PDFDocument,
  row: CatalogRow,
  columns: ColumnSpec[],
): number {
  const nameCol = columns[0]!;
  const w = nameCol.width - CELL_PAD_X * 2;

  doc.font("Helvetica-Bold").fontSize(10);
  let h = doc.heightOfString(row.name, { width: w });

  if (row.description) {
    doc.font("Helvetica").fontSize(8.5);
    h += 2 + doc.heightOfString(row.description, { width: w });
  }
  if (row.notes) {
    doc.font("Helvetica").fontSize(7.5);
    h += 2 + doc.heightOfString(row.notes, { width: w });
  }
  return Math.max(h, 18) + ROW_PAD_Y * 2;
}

function drawRow(
  doc: PDFKit.PDFDocument,
  row: CatalogRow,
  columns: ColumnSpec[],
  pageLeft: number,
  pageRight: number,
  y: number,
  rowH: number,
): void {
  let x = pageLeft;
  for (const c of columns) {
    drawCell(doc, row, c, x, y);
    x += c.width;
  }
  doc
    .save()
    .strokeColor(COLORS.hairline)
    .lineWidth(0.4)
    .moveTo(pageLeft, y + rowH)
    .lineTo(pageRight, y + rowH)
    .stroke()
    .restore();
}

function drawCell(
  doc: PDFKit.PDFDocument,
  row: CatalogRow,
  c: ColumnSpec,
  x: number,
  y: number,
): void {
  const cellX = x + CELL_PAD_X;
  const cellW = c.width - CELL_PAD_X * 2;
  const cellY = y + ROW_PAD_Y;

  switch (c.key) {
    case "incentive": {
      // Name, then description, then notes — each wrapping inside the column,
      // stacked exactly the way measureRowHeight budgeted for.
      doc
        .font("Helvetica-Bold")
        .fontSize(10)
        .fillColor(COLORS.ink)
        .text(row.name, cellX, cellY, { width: cellW });
      if (row.description) {
        doc
          .font("Helvetica")
          .fontSize(8.5)
          .fillColor(COLORS.inkMuted)
          .text(row.description, cellX, doc.y + 2, { width: cellW });
      }
      if (row.notes) {
        doc
          .font("Helvetica")
          .fontSize(7.5)
          .fillColor(COLORS.inkSoft)
          .text(row.notes, cellX, doc.y + 2, { width: cellW });
      }
      break;
    }

    case "amount": {
      // formatInr — the SAME currency formatter the screen uses, so the PDF and
      // the dialog cannot disagree about what an incentive is worth.
      doc
        .font("Helvetica-Bold")
        .fontSize(10.5)
        .fillColor(COLORS.ink)
        .text(formatInr(row.amount), cellX, cellY, {
          width: cellW,
          align: "right",
          lineBreak: false,
        });
      break;
    }

    case "eligible": {
      if (!row.salesEligible && !row.internsEligible) {
        doc
          .font("Helvetica")
          .fontSize(9)
          .fillColor(COLORS.inkSoft)
          .text(eligibilityLabel(row), cellX, cellY, { width: cellW, lineBreak: false });
        break;
      }
      // Two small tags, stacked when both apply — the on-screen chips, printed.
      let ty = cellY;
      if (row.salesEligible) {
        drawTag(doc, cellX, ty, cellW, "SALES", COLORS.sales);
        ty += 15;
      }
      if (row.internsEligible) {
        drawTag(doc, cellX, ty, cellW, "INTERNS", COLORS.interns);
      }
      break;
    }

    case "status": {
      doc
        .font(row.active ? "Helvetica" : "Helvetica-Bold")
        .fontSize(8.5)
        .fillColor(row.active ? COLORS.inkMuted : COLORS.brand)
        .text(row.active ? "Active" : "Inactive", cellX, cellY, {
          width: cellW,
          lineBreak: false,
        });
      break;
    }
  }
}

function drawTag(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  cellW: number,
  label: string,
  fg: string,
): void {
  doc.font("Helvetica-Bold").fontSize(6.5).fillColor(fg);
  const textW = Math.min(doc.widthOfString(label, { characterSpacing: 0.8 }), cellW - 12);
  doc
    .save()
    .roundedRect(x, y, textW + 12, 13, 3)
    .lineWidth(0.6)
    .strokeColor(fg)
    .stroke()
    .restore();
  doc.fillColor(fg).text(label, x + 6, y + 4, {
    width: textW,
    characterSpacing: 0.8,
    lineBreak: false,
  });
}
