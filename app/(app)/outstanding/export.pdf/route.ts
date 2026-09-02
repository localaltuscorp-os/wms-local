import PDFDocument from "pdfkit";
import { format } from "date-fns";
import { requireUser } from "@/lib/auth/current";
import { parseOutstandingFilters } from "@/lib/outstanding/filters";
import { loadOutstandingDashboard } from "@/lib/queries/outstanding";
import { todayISO, rollingHorizon } from "@/lib/outstanding/horizon";
import {
  cycleLabel,
  fmtDue,
  outstandingExportFilename,
} from "@/lib/exports/outstanding-rich";
import type { DerivedInstallment } from "@/lib/outstanding/types";

/**
 * GET /outstanding/export.pdf
 *
 * Landscape A4 PDF of the current Outstanding dashboard entries — mirrors
 * /tasks/export.pdf (same pdfkit stack, brand stripe, editorial masthead,
 * KPI stat band, typeset table with an overdue marker rail). Any signed-in
 * user; reflects the dashboard's active filters.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const inr = (n: number) =>
  "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });

export async function GET(request: Request): Promise<Response> {
  let me;
  try {
    me = await requireUser();
  } catch {
    return new Response("Forbidden", { status: 403 });
  }

  const url = new URL(request.url);
  const sp: Record<string, string> = {};
  for (const [k, v] of url.searchParams.entries()) sp[k] = v;

  const today = todayISO();
  const horizon = rollingHorizon(today);
  const filters = parseOutstandingFilters(sp);
  const { entries } = await loadOutstandingDashboard(filters, today, horizon);

  const pdfBuffer = await renderPdf(entries, { generatedBy: me.name });

  return new Response(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${outstandingExportFilename("pdf", "data")}"`,
      "cache-control": "no-store",
    },
  });
}

// ─── Visual constants (shared palette with tasks/export.pdf) ─────────────────

const COLORS = {
  ink: "#0A0A0A",
  inkMuted: "#525252",
  inkSoft: "#737373",
  hairline: "#E5E5E5",
  hairlineSoft: "#F4F4F5",
  brand: "#E10600",
  brandDeep: "#B00500",
} as const;

interface ColumnSpec {
  key:
    | "client"
    | "product"
    | "cycle"
    | "due"
    | "balance"
    | "entity"
    | "responsible"
    | "status";
  label: string;
  width: number;
  align?: "left" | "center" | "right";
}

// ─── Renderer ────────────────────────────────────────────────────────────────

async function renderPdf(
  rows: DerivedInstallment[],
  meta: { generatedBy: string },
): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "A4",
    layout: "landscape",
    margin: 40,
    info: {
      Title: "Altus Corp — Outstanding",
      Author: "Altus Corp Dashboard",
      Subject: "Receivables Report",
    },
    bufferPages: true,
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
    { key: "client", label: "CLIENT", width: 150 },
    { key: "product", label: "PRODUCT", width: 100 },
    { key: "cycle", label: "CYCLE", width: 78 },
    { key: "due", label: "DUE", width: 80, align: "right" },
    { key: "balance", label: "BALANCE", width: 90, align: "right" },
    { key: "entity", label: "ENTITY", width: 90 },
    { key: "responsible", label: "RESPONSIBLE", width: 90 },
    { key: "status", label: "STATUS", width: 80 },
  ];
  const totalColWidth = columns.reduce((a, c) => a + c.width, 0);
  const scale = pageWidth / totalColWidth;
  for (const c of columns) c.width *= scale;

  drawBrandStripe(doc);
  drawMasthead(doc, { generatedBy: meta.generatedBy });
  drawStatBand(doc, rows, pageLeft, pageRight);
  drawSectionRule(doc, pageLeft, pageRight, "OUTSTANDING · DETAIL");
  drawTableHeader(doc, columns, pageLeft);

  const drawPageChrome = () => {
    drawBrandStripe(doc);
    doc.y = doc.page.margins.top + 6;
    drawContinuationHeader(doc, pageLeft, pageRight);
    drawTableHeader(doc, columns, pageLeft);
  };
  doc.on("pageAdded", () => drawPageChrome());

  if (rows.length === 0) {
    doc
      .moveDown(2)
      .font("Helvetica-Oblique")
      .fontSize(11)
      .fillColor(COLORS.inkSoft)
      .text("No outstanding entries match the current filters.", {
        align: "center",
      });
  }

  const ROW_PADDING_Y = 7;
  for (const row of rows) {
    const rowH = measureRowHeight(doc, row, columns, ROW_PADDING_Y);
    if (doc.y + rowH > pageBottom - 24) {
      doc.addPage({ size: "A4", layout: "landscape", margin: 40 });
    }
    drawRow(doc, row, columns, pageLeft, pageRight, {
      y: doc.y,
      rowH,
      padY: ROW_PADDING_Y,
    });
    doc.y += rowH;
  }

  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    drawFooter(doc, pageLeft, pageRight, {
      pageNumber: i + 1,
      pageTotal: range.count,
    });
  }

  doc.end();
  return done;
}

// ─── Chrome ──────────────────────────────────────────────────────────────────

function drawBrandStripe(doc: PDFKit.PDFDocument): void {
  doc.save().rect(0, 0, doc.page.width, 4).fill(COLORS.brand).restore();
  doc.save().rect(0, 4, doc.page.width, 1).fill(COLORS.brandDeep).restore();
}

function drawMasthead(
  doc: PDFKit.PDFDocument,
  meta: { generatedBy: string },
): void {
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const top = doc.page.margins.top + 6;

  doc
    .font("Helvetica-Bold")
    .fontSize(20)
    .fillColor(COLORS.ink)
    .text("ALTUS CORP", left, top, { characterSpacing: 2.2, lineBreak: false });

  const subY = top + 26;
  doc.save().circle(left + 3, subY + 4, 2.2).fill(COLORS.brand).restore();
  doc
    .font("Helvetica-Bold")
    .fontSize(7.5)
    .fillColor(COLORS.inkMuted)
    .text("OUTSTANDING REPORT", left + 11, subY, {
      characterSpacing: 1.6,
      lineBreak: false,
    });

  const generated = format(new Date(), "EEE, MMM d, yyyy · HH:mm");
  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor(COLORS.inkMuted)
    .text(generated, left, top, {
      width: right - left,
      align: "right",
      lineBreak: false,
    });
  doc
    .font("Helvetica-Bold")
    .fontSize(7.5)
    .fillColor(COLORS.ink)
    .text(`PREPARED BY · ${meta.generatedBy.toUpperCase()}`, left, top + 14, {
      width: right - left,
      align: "right",
      characterSpacing: 1.4,
      lineBreak: false,
    });

  doc.y = subY + 22;
}

function drawStatBand(
  doc: PDFKit.PDFDocument,
  rows: DerivedInstallment[],
  left: number,
  right: number,
): void {
  const total = rows.length;
  const overdueRows = rows.filter((r) => r.state === "overdue");
  const overdue = overdueRows.length;
  const overdueAmt = overdueRows.reduce((a, r) => a + r.balance, 0);
  const totalBalance = rows.reduce((a, r) => a + r.balance, 0);

  const cells = [
    { value: String(total), label: "ENTRIES", accent: COLORS.ink },
    { value: inr(totalBalance), label: "BALANCE", accent: "#D97706" },
    { value: String(overdue), label: "OVERDUE", accent: COLORS.brand },
    { value: inr(overdueAmt), label: "OVERDUE ₹", accent: COLORS.brand },
  ];

  const y = doc.y + 12;
  const bandH = 56;
  const cellW = (right - left) / cells.length;

  doc
    .save()
    .strokeColor(COLORS.ink)
    .lineWidth(0.8)
    .moveTo(left, y)
    .lineTo(right, y)
    .stroke()
    .strokeColor(COLORS.hairline)
    .lineWidth(0.4)
    .moveTo(left, y + bandH)
    .lineTo(right, y + bandH)
    .stroke()
    .restore();

  cells.forEach((cell, i) => {
    const cx = left + i * cellW;
    if (i > 0) {
      doc
        .save()
        .strokeColor(COLORS.hairlineSoft)
        .lineWidth(0.5)
        .moveTo(cx, y + 8)
        .lineTo(cx, y + bandH - 8)
        .stroke()
        .restore();
    }
    doc
      .font("Times-BoldItalic")
      .fontSize(24)
      .fillColor(cell.accent)
      .text(cell.value, cx + 16, y + 10, { width: cellW - 32, lineBreak: false });
    doc
      .font("Helvetica-Bold")
      .fontSize(7.5)
      .fillColor(COLORS.inkMuted)
      .text(cell.label, cx + 16, y + 42, {
        width: cellW - 32,
        characterSpacing: 1.6,
        lineBreak: false,
      });
  });

  doc.y = y + bandH + 16;
}

function drawSectionRule(
  doc: PDFKit.PDFDocument,
  left: number,
  right: number,
  label: string,
): void {
  const y = doc.y;
  doc
    .font("Helvetica-Bold")
    .fontSize(7.5)
    .fillColor(COLORS.ink)
    .text(label, left, y, { characterSpacing: 1.8, lineBreak: false, width: 200 });
  const labelWidth = doc.widthOfString(label, { characterSpacing: 1.8 });
  doc
    .save()
    .strokeColor(COLORS.ink)
    .lineWidth(0.6)
    .moveTo(left + labelWidth + 10, y + 5)
    .lineTo(right, y + 5)
    .stroke()
    .restore();
  doc.y = y + 16;
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
    doc.text(c.label, x + 8, y + 5, {
      width: c.width - 16,
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
    .text("ALTUS CORP", left, doc.page.margins.top + 8, {
      characterSpacing: 1.8,
      lineBreak: false,
    });
  doc
    .font("Helvetica")
    .fontSize(7.5)
    .fillColor(COLORS.inkMuted)
    .text("Outstanding Report · continued", left, doc.page.margins.top + 8, {
      width: right - left,
      align: "right",
      lineBreak: false,
    });
  doc.y = doc.page.margins.top + 28;
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
  doc
    .font("Helvetica")
    .fontSize(6.5)
    .fillColor(COLORS.inkMuted)
    .text(`Page ${meta.pageNumber} of ${meta.pageTotal}`, left, y + 2, {
      width: right - left,
      align: "right",
      lineBreak: false,
    });
}

// ─── Row drawing ─────────────────────────────────────────────────────────────

function measureRowHeight(
  doc: PDFKit.PDFDocument,
  row: DerivedInstallment,
  columns: ColumnSpec[],
  padY: number,
): number {
  doc.font("Helvetica").fontSize(9);
  let maxH = 0;
  for (const c of columns) {
    let text = "";
    switch (c.key) {
      case "client":
        text = row.clientName;
        break;
      case "product":
        text = row.productName ?? "";
        break;
      case "entity":
        text = row.entityName ?? "";
        break;
      case "responsible":
        text = row.responsibleName ?? "";
        break;
      default:
        continue;
    }
    const h = doc.heightOfString(text, { width: c.width - 16 });
    if (h > maxH) maxH = h;
  }
  return Math.max(maxH, 14) + padY * 2;
}

function drawRow(
  doc: PDFKit.PDFDocument,
  row: DerivedInstallment,
  columns: ColumnSpec[],
  pageLeft: number,
  pageRight: number,
  layout: { y: number; rowH: number; padY: number },
): void {
  const { y, rowH, padY } = layout;
  const isOverdue = row.state === "overdue";

  if (isOverdue) {
    doc
      .save()
      .rect(pageLeft - 4, y + 2, 2, rowH - 4)
      .fill(COLORS.brand)
      .restore();
  }

  let x = pageLeft;
  for (const c of columns) {
    drawCell(doc, row, c, x, y, padY, isOverdue);
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
  row: DerivedInstallment,
  c: ColumnSpec,
  x: number,
  y: number,
  padY: number,
  isOverdue: boolean,
): void {
  const cellX = x + 8;
  const cellW = c.width - 16;
  const cellY = y + padY;

  switch (c.key) {
    case "client": {
      doc
        .font("Helvetica-Bold")
        .fontSize(9)
        .fillColor(COLORS.ink)
        .text(row.clientName, cellX, cellY, { width: cellW, lineBreak: true });
      break;
    }
    case "product":
    case "entity":
    case "responsible": {
      const text =
        c.key === "product"
          ? row.productName
          : c.key === "entity"
            ? row.entityName
            : row.responsibleName;
      doc
        .font("Helvetica")
        .fontSize(9)
        .fillColor(COLORS.inkMuted)
        .text(text || "—", cellX, cellY, { width: cellW, lineBreak: true });
      break;
    }
    case "cycle": {
      doc
        .font("Helvetica")
        .fontSize(9)
        .fillColor(COLORS.inkMuted)
        .text(cycleLabel(row.cycle) || "—", cellX, cellY, {
          width: cellW,
          lineBreak: false,
          ellipsis: true,
        });
      break;
    }
    case "due": {
      doc
        .font(isOverdue ? "Helvetica-Bold" : "Helvetica")
        .fontSize(9)
        .fillColor(isOverdue ? COLORS.brand : COLORS.ink)
        .text(fmtDue(row.dueDate), cellX, cellY, {
          width: cellW,
          align: c.align ?? "left",
          lineBreak: false,
        });
      if (isOverdue) {
        doc
          .font("Helvetica-Bold")
          .fontSize(6)
          .fillColor(COLORS.brand)
          .text(`${row.daysOverdue}D OVERDUE`, cellX, cellY + 11, {
            width: cellW,
            align: c.align ?? "left",
            characterSpacing: 1.0,
            lineBreak: false,
          });
      }
      break;
    }
    case "balance": {
      doc
        .font("Helvetica-Bold")
        .fontSize(9)
        .fillColor(isOverdue ? COLORS.brand : COLORS.ink)
        .text(inr(row.balance), cellX, cellY, {
          width: cellW,
          align: c.align ?? "left",
          lineBreak: false,
        });
      break;
    }
    case "status": {
      const label = isOverdue ? "Overdue" : "Not Due";
      const bg = isOverdue ? "#FEE2E2" : "#F1F5F9";
      const fg = isOverdue ? "#B91C1C" : "#475569";
      drawPill(doc, cellX, cellY, cellW, label, bg, fg);
      break;
    }
  }
}

function drawPill(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  cellW: number,
  label: string,
  bg: string,
  fg: string,
): void {
  doc.font("Helvetica-Bold").fontSize(7).fillColor(fg);
  const textW = Math.min(
    doc.widthOfString(label, { characterSpacing: 0.8 }),
    cellW - 12,
  );
  const pillW = textW + 12;
  const pillH = 14;
  doc.save().roundedRect(x, y + 1, pillW, pillH, 3).fill(bg).restore();
  doc
    .fillColor(fg)
    .text(label.toUpperCase(), x + 6, y + 5, {
      width: pillW - 12,
      characterSpacing: 0.8,
      lineBreak: false,
      ellipsis: true,
    });
}
