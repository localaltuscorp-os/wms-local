import PDFDocument from "pdfkit";
import { format } from "date-fns";
import { requireAdmin } from "@/lib/auth/current";
import { localDateString } from "@/lib/format";
import {
  getMonthDashboard,
  type DashboardRow,
} from "@/lib/queries/attendance-status";
import {
  attendanceExportFilename,
  monthTitle,
} from "@/lib/exports/attendance-rich";

/**
 * GET /attendance/export.pdf?y=&m=
 *
 * Admin-only A4-landscape PDF of the monthly attendance summary. Mirrors the
 * tasks/outstanding report chrome: brand stripe, editorial masthead, a KPI
 * stat band, then a tightly typeset per-employee summary table.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_TZ = "Asia/Kolkata";

function resolveYM(url: URL): { year: number; month: number } {
  const todayISO = localDateString(DEFAULT_TZ);
  const [cy, cm] = todayISO.split("-").map(Number);
  const rawY = Number(url.searchParams.get("y"));
  const rawM = Number(url.searchParams.get("m"));
  const year =
    Number.isInteger(rawY) && rawY >= 2000 && rawY <= 2100 ? rawY : (cy ?? 2026);
  const month =
    Number.isInteger(rawM) && rawM >= 1 && rawM <= 12 ? rawM : (cm ?? 1);
  return { year, month };
}

export async function GET(request: Request): Promise<Response> {
  let me;
  try {
    me = await requireAdmin();
  } catch {
    return new Response("Forbidden", { status: 403 });
  }

  const url = new URL(request.url);
  const { year, month } = resolveYM(url);
  const todayISO = localDateString(DEFAULT_TZ);

  const rows = await getMonthDashboard(year, month, todayISO);
  const pdfBuffer = await renderPdf(rows, {
    title: monthTitle(year, month),
    generatedBy: me.name,
  });

  return new Response(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${attendanceExportFilename(year, month, "pdf")}"`,
      "cache-control": "no-store",
    },
  });
}

// ─── Visual constants ────────────────────────────────────────────────────────

const COLORS = {
  ink: "#0A0A0A",
  inkMuted: "#525252",
  inkSoft: "#737373",
  hairline: "#E5E5E5",
  hairlineSoft: "#F4F4F5",
  brand: "#E10600",
  brandDeep: "#B00500",
} as const;

interface ColSpec {
  key: keyof DashboardRow["summary"] | "name";
  label: string;
  width: number;
  align?: "left" | "right";
}

async function renderPdf(
  rows: DashboardRow[],
  meta: { title: string; generatedBy: string },
): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "A4",
    layout: "landscape",
    margin: 40,
    info: {
      Title: `Altus Corp — Attendance ${meta.title}`,
      Author: "Altus Corp Dashboard",
      Subject: "Monthly Attendance Report",
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

  const columns: ColSpec[] = [
    { key: "name", label: "EMPLOYEE", width: 150 },
    { key: "present", label: "PRES", width: 48, align: "right" },
    { key: "absent", label: "ABS", width: 44, align: "right" },
    { key: "halfDay", label: "HALF", width: 46, align: "right" },
    { key: "late", label: "LATE", width: 46, align: "right" },
    { key: "leftEarly", label: "L-EARLY", width: 56, align: "right" },
    { key: "lateWaived", label: "L-WAIVED", width: 62, align: "right" },
    { key: "weeklyOff", label: "W/O", width: 44, align: "right" },
    { key: "holiday", label: "HOL", width: 44, align: "right" },
    { key: "holidayPresent", label: "HP", width: 40, align: "right" },
    { key: "paidLeave", label: "PL", width: 40, align: "right" },
    { key: "unpaidLeave", label: "LWP", width: 44, align: "right" },
    { key: "compOff", label: "C-OFF", width: 48, align: "right" },
    { key: "payableDays", label: "PAYABLE", width: 66, align: "right" },
  ];
  const totalColWidth = columns.reduce((a, c) => a + c.width, 0);
  const scale = pageWidth / totalColWidth;
  for (const c of columns) c.width *= scale;

  drawBrandStripe(doc);
  drawMasthead(doc, meta);
  drawStatBand(doc, rows, pageLeft, pageRight);
  drawSectionRule(doc, pageLeft, pageRight, "PER-EMPLOYEE · SUMMARY");
  drawTableHeader(doc, columns, pageLeft);

  doc.on("pageAdded", () => {
    drawBrandStripe(doc);
    doc.y = doc.page.margins.top + 6;
    drawContinuationHeader(doc, pageLeft, pageRight);
    drawTableHeader(doc, columns, pageLeft);
  });

  if (rows.length === 0) {
    doc
      .moveDown(2)
      .font("Helvetica-Oblique")
      .fontSize(11)
      .fillColor(COLORS.inkSoft)
      .text("No active employees for this month.", { align: "center" });
  }

  const ROW_H = 22;
  for (const row of rows) {
    if (doc.y + ROW_H > pageBottom - 24) {
      doc.addPage({ size: "A4", layout: "landscape", margin: 40 });
    }
    drawRow(doc, row, columns, pageLeft, pageRight, doc.y, ROW_H);
    doc.y += ROW_H;
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
  meta: { title: string; generatedBy: string },
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
    .text(`ATTENDANCE REPORT · ${meta.title.toUpperCase()}`, left + 11, subY, {
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
  rows: DashboardRow[],
  left: number,
  right: number,
): void {
  const people = rows.length;
  const present = rows.reduce((a, r) => a + r.summary.present, 0);
  const absent = rows.reduce((a, r) => a + r.summary.absent, 0);
  const late = rows.reduce((a, r) => a + r.summary.late, 0);
  const payable = rows.reduce((a, r) => a + r.summary.payableDays, 0);

  const cells = [
    { value: people, label: "EMPLOYEES", accent: COLORS.ink },
    { value: present, label: "PRESENT DAYS", accent: "#16A34A" },
    { value: absent, label: "ABSENT DAYS", accent: COLORS.brand },
    { value: late, label: "LATE", accent: "#D97706" },
    { value: payable, label: "PAYABLE DAYS", accent: COLORS.ink },
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
      .fontSize(26)
      .fillColor(cell.accent)
      .text(String(cell.value), cx + 16, y + 9, {
        width: cellW - 32,
        lineBreak: false,
      });
    doc
      .font("Helvetica-Bold")
      .fontSize(7)
      .fillColor(COLORS.inkMuted)
      .text(cell.label, cx + 16, y + 42, {
        width: cellW - 32,
        characterSpacing: 1.4,
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
    .text(label, left, y, { characterSpacing: 1.8, lineBreak: false, width: 240 });
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
  columns: ColSpec[],
  left: number,
): void {
  const y = doc.y;
  const HEADER_H = 18;
  const totalW = columns.reduce((a, c) => a + c.width, 0);
  doc
    .save()
    .strokeColor(COLORS.ink)
    .lineWidth(0.6)
    .moveTo(left, y)
    .lineTo(left + totalW, y)
    .stroke()
    .restore();

  let x = left;
  doc.font("Helvetica-Bold").fontSize(7).fillColor(COLORS.inkMuted);
  for (const c of columns) {
    doc.text(c.label, x + 8, y + 5, {
      width: c.width - 16,
      characterSpacing: 1.2,
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
    .lineTo(left + totalW, y + HEADER_H)
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
    .text("Attendance Report · continued", left, doc.page.margins.top + 8, {
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

function drawRow(
  doc: PDFKit.PDFDocument,
  row: DashboardRow,
  columns: ColSpec[],
  pageLeft: number,
  pageRight: number,
  y: number,
  rowH: number,
): void {
  let x = pageLeft;
  const cellY = y + 6;
  for (const c of columns) {
    const cellX = x + 8;
    const cellW = c.width - 16;
    if (c.key === "name") {
      doc
        .font("Helvetica-Bold")
        .fontSize(9)
        .fillColor(COLORS.ink)
        .text(row.name, cellX, cellY, { width: cellW, lineBreak: false, ellipsis: true });
    } else {
      const value = row.summary[c.key];
      const isFlag =
        (c.key === "late" && row.summary.late > 0) ||
        (c.key === "absent" && row.summary.absent > 0);
      doc
        .font(c.key === "payableDays" ? "Helvetica-Bold" : "Helvetica")
        .fontSize(9)
        .fillColor(isFlag ? COLORS.brand : COLORS.ink)
        .text(String(value), cellX, cellY, {
          width: cellW,
          align: c.align ?? "left",
          lineBreak: false,
        });
    }
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
