import PDFDocument from "pdfkit";
import { format } from "date-fns";
import { requireAdmin } from "@/lib/auth/current";
import { parseTaskFilters } from "@/lib/task-filters";
import { listTasksForExport, type TaskExportRow } from "@/lib/queries/tasks";
import { MAX_EXPORT_ROWS, EXPORT_TOO_LARGE } from "@/lib/exports/csv";
import { richExportFilename } from "@/lib/exports/tasks-rich";
import type { TaskStatus, TaskPriority, ApprovalStatus } from "@/db/enums";

/**
 * GET /tasks/export.pdf
 *
 * Admin-only landscape A4 PDF export of the current /tasks view. The
 * renderer is intentionally publication-grade — a thin Altus-red top
 * stripe, an editorial masthead, a four-up KPI band, then a tightly
 * typeset table with status pills, priority dots, and an overdue
 * marker rail down the left edge. Pagination is bottom-anchored with
 * "Page X of Y" + a confidentiality stamp.
 *
 * All visual constants live in the constants block below — tweak there,
 * the rest of the file composes them.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  let me;
  try {
    me = await requireAdmin();
  } catch {
    return new Response("Forbidden", { status: 403 });
  }

  const url = new URL(request.url);
  const sp: Record<string, string> = {};
  for (const [k, v] of url.searchParams.entries()) sp[k] = v;

  const archived = sp.archived === "1" || sp.archived === "true";
  const filters = parseTaskFilters(sp, archived, {
    defaultDoerId: me.isAdmin ? undefined : me.id,
  });

  const rows = await listTasksForExport(filters, {
    limit: MAX_EXPORT_ROWS + 1,
  });

  if (rows.length > MAX_EXPORT_ROWS) {
    return Response.json(
      { error: EXPORT_TOO_LARGE, cap: MAX_EXPORT_ROWS, totalRows: rows.length },
      { status: 422 },
    );
  }

  const pdfBuffer = await renderPdf(rows, { archived, generatedBy: me.name });

  return new Response(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${richExportFilename("pdf")}"`,
      "cache-control": "no-store",
    },
  });
}

// ─── Visual constants ────────────────────────────────────────────────────────

const COLORS = {
  ink: "#0A0A0A",
  inkMuted: "#525252",
  inkSoft: "#737373",
  paper: "#FFFFFF",
  hairline: "#E5E5E5",
  hairlineSoft: "#F4F4F5",
  brand: "#E10600", // Altus red (matches --color-altus-red in globals.css)
  brandDeep: "#B00500",
} as const;

// Status display table — pill background + foreground + the printed label.
// Kept in sync with components/ui status-tone styling so the PDF reads as
// part of the same product, not a separate export tool.
const STATUS_PILL: Record<TaskStatus, { bg: string; fg: string; label: string }> = {
  dont_know:    { bg: "#F1F5F9", fg: "#475569", label: "Unassessed" },
  not_started:  { bg: "#F1F5F9", fg: "#475569", label: "Not Started" },
  initiated:    { bg: "#DBEAFE", fg: "#1D4ED8", label: "Initiated" },
  follow_up:    { bg: "#FEF3C7", fg: "#92400E", label: "Follow-up" },
  need_help:    { bg: "#FEE2E2", fg: "#B91C1C", label: "Need Help" },
  on_hold:      { bg: "#F1F5F9", fg: "#475569", label: "On Hold" },
  need_info:    { bg: "#EDE9FE", fg: "#6D28D9", label: "Need Info" },
  follow_up_1:  { bg: "#FEF3C7", fg: "#92400E", label: "Follow-up 1" },
  follow_up_2:  { bg: "#FED7AA", fg: "#9A3412", label: "Follow-up 2" },
  follow_up_3:  { bg: "#FECACA", fg: "#B91C1C", label: "Follow-up 3" },
  done:         { bg: "#D1FAE5", fg: "#065F46", label: "Done" },
  approved:     { bg: "#D1FAE5", fg: "#065F46", label: "Approved" },
  not_approved: { bg: "#FEE2E2", fg: "#B91C1C", label: "Not Approved" },
  cancelled:    { bg: "#F1F5F9", fg: "#64748B", label: "Cancelled" },
  transferred:  { bg: "#E0E7FF", fg: "#3730A3", label: "Transferred" },
};

// Priority compressed to the Eisenhower-quadrant shorthand the dashboard uses
// internally — much more scannable than the full 4-word label in a cramped
// table column. The dot colour signals urgency at a glance.
const PRIORITY_GLYPH: Record<TaskPriority, { code: string; label: string; color: string }> = {
  imp_urgent:         { code: "P0", label: "Critical",  color: COLORS.brand },
  imp_not_urgent:     { code: "P1", label: "Important", color: "#D97706" },
  not_imp_urgent:     { code: "P2", label: "Urgent",    color: "#2563EB" },
  not_imp_not_urgent: { code: "P3", label: "Normal",    color: "#94A3B8" },
};

const APPROVAL_LABEL: Record<ApprovalStatus, string> = {
  approved:     "Approved",
  not_approved: "Not Approved",
  cancelled:    "Cancelled",
  transferred:  "Transferred",
};

interface ColumnSpec {
  key:
    | "client"
    | "subject"
    | "status"
    | "approval"
    | "priority"
    | "doer"
    | "initiator"
    | "due"
    | "created";
  label: string;
  width: number;
  align?: "left" | "center" | "right";
}

// ─── Renderer ────────────────────────────────────────────────────────────────

async function renderPdf(
  rows: TaskExportRow[],
  meta: { archived: boolean; generatedBy: string },
): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "A4",
    layout: "landscape",
    // Wider top margin so the masthead and brand stripe have room to
    // breathe without crowding the first table row.
    margin: 40,
    info: {
      Title: meta.archived ? "Altus Corp — Archived Tasks" : "Altus Corp — Tasks",
      Author: "Altus Corp Dashboard",
      Subject: "Internal Task Report",
    },
    bufferPages: true, // required for the "Page X of Y" pass at the end
  });

  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });

  // Page geometry — pdfkit reports `page.margins.left/right` after the
  // page is created, so derive them once and reuse.
  const pageLeft   = doc.page.margins.left;
  const pageRight  = doc.page.width - doc.page.margins.right;
  const pageWidth  = pageRight - pageLeft;
  const pageBottom = doc.page.height - doc.page.margins.bottom;

  // Column widths in points. Sums to ~770 on A4-landscape (842 - 2×36),
  // then we scale to the actual usable width below to absorb rounding
  // and any future margin tweak in one place.
  const columns: ColumnSpec[] = [
    { key: "client",    label: "CLIENT",   width: 150 },
    { key: "subject",   label: "SUBJECT",  width: 80  },
    { key: "status",    label: "STATUS",   width: 86  },
    { key: "approval",  label: "APPROVAL", width: 70  },
    { key: "priority",  label: "PRIORITY", width: 70  },
    { key: "doer",      label: "DOER",     width: 86  },
    { key: "initiator", label: "INITIATOR",width: 86  },
    { key: "due",       label: "DUE",      width: 70, align: "right" },
    { key: "created",   label: "CREATED",  width: 72, align: "right" },
  ];
  const totalColWidth = columns.reduce((a, c) => a + c.width, 0);
  const scale = pageWidth / totalColWidth;
  for (const c of columns) c.width *= scale;

  drawBrandStripe(doc, pageLeft, pageRight);
  drawMasthead(doc, { archived: meta.archived, generatedBy: meta.generatedBy, count: rows.length });
  drawStatBand(doc, rows, pageLeft, pageRight);
  drawSectionRule(doc, pageLeft, pageRight, meta.archived ? "ARCHIVED · DETAIL" : "ACTIVE · DETAIL");
  drawTableHeader(doc, columns, pageLeft);

  // Track which page-start positions we've drawn the brand stripe / header on
  // so addPage() callbacks can re-stamp the chrome consistently.
  const drawPageChrome = (resetCursor: boolean) => {
    drawBrandStripe(doc, pageLeft, pageRight);
    if (resetCursor) doc.y = doc.page.margins.top + 6;
    drawContinuationHeader(doc, pageLeft, pageRight);
    drawTableHeader(doc, columns, pageLeft);
  };

  doc.on("pageAdded", () => drawPageChrome(true));

  // ─── Body rows ───
  if (rows.length === 0) {
    doc
      .moveDown(2)
      .font("Helvetica-Oblique")
      .fontSize(11)
      .fillColor(COLORS.inkSoft)
      .text("No tasks match the current filters.", { align: "center" });
  }

  const now = Date.now();
  const ROW_PADDING_Y = 7;
  const ROW_PADDING_X = 8;

  for (const row of rows) {
    const rowH = measureRowHeight(doc, row, columns, ROW_PADDING_Y);
    if (doc.y + rowH > pageBottom - 24 /* footer reserve */) {
      doc.addPage({ size: "A4", layout: "landscape", margin: 40 });
    }
    drawRow(doc, row, columns, pageLeft, pageRight, {
      y: doc.y,
      rowH,
      padY: ROW_PADDING_Y,
      padX: ROW_PADDING_X,
      now,
    });
    doc.y += rowH;
  }

  // ─── Page numbering + confidentiality footer ───
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

/** Hairline-thin brand red stripe running edge-to-edge along the top of every page. */
function drawBrandStripe(doc: PDFKit.PDFDocument, left: number, right: number): void {
  doc
    .save()
    .rect(0, 0, doc.page.width, 4)
    .fill(COLORS.brand)
    .restore();
  // Secondary deeper-red sliver underneath for a subtle two-tone depth cue.
  doc
    .save()
    .rect(0, 4, doc.page.width, 1)
    .fill(COLORS.brandDeep)
    .restore();
  void left; void right;
}

function drawMasthead(
  doc: PDFKit.PDFDocument,
  meta: { archived: boolean; generatedBy: string; count: number },
): void {
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const top = doc.page.margins.top + 6;

  // Top-left brand wordmark — heavy, tracked.
  doc
    .font("Helvetica-Bold")
    .fontSize(20)
    .fillColor(COLORS.ink)
    .text("ALTUS CORP", left, top, {
      characterSpacing: 2.2,
      lineBreak: false,
    });

  // Below the wordmark — small tracked subhead with a brand-red bullet.
  const subY = top + 26;
  doc
    .save()
    .circle(left + 3, subY + 4, 2.2)
    .fill(COLORS.brand)
    .restore();
  doc
    .font("Helvetica-Bold")
    .fontSize(7.5)
    .fillColor(COLORS.inkMuted)
    .text(
      meta.archived ? "ARCHIVED TASK REPORT" : "TASK REPORT",
      left + 11,
      subY,
      { characterSpacing: 1.6, lineBreak: false },
    );

  // Top-right meta column — generated timestamp on top, signature below.
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
  rows: TaskExportRow[],
  left: number,
  right: number,
): void {
  // Aggregate for the four headline KPIs. Computed inline so a future
  // chart-band rev can swap derivations without ceremony.
  const now = Date.now();
  const total   = rows.length;
  const done    = rows.filter((r) => r.status === "done" || r.status === "approved").length;
  const pending = rows.filter(
    (r) =>
      !r.archived &&
      r.status !== "done" &&
      r.status !== "approved" &&
      r.status !== "cancelled" &&
      r.status !== "transferred" &&
      r.status !== "not_approved",
  ).length;
  const overdue = rows.filter(
    (r) =>
      !r.archived &&
      r.status !== "done" &&
      r.status !== "approved" &&
      r.status !== "cancelled" &&
      r.status !== "transferred" &&
      r.status !== "not_approved" &&
      r.dueAt.getTime() < now,
  ).length;

  const cells = [
    { value: total,   label: "TOTAL",   accent: COLORS.ink },
    { value: pending, label: "PENDING", accent: "#D97706" },
    { value: done,    label: "DONE",    accent: "#16A34A" },
    { value: overdue, label: "OVERDUE", accent: COLORS.brand },
  ];

  const y = doc.y + 12;
  const bandH = 56;
  const cellW = (right - left) / cells.length;

  // Top + bottom hairline rules wrapping the band — gives it newspaper-stat-block weight.
  doc
    .save()
    .strokeColor(COLORS.ink)
    .lineWidth(0.8)
    .moveTo(left, y).lineTo(right, y).stroke()
    .strokeColor(COLORS.hairline)
    .lineWidth(0.4)
    .moveTo(left, y + bandH).lineTo(right, y + bandH).stroke()
    .restore();

  cells.forEach((cell, i) => {
    const cx = left + i * cellW;
    // Thin vertical separator between cells (skip the leftmost).
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
    // Big number — set in a serif italic for editorial flavour, like
    // the dashboard hero. Times-BoldItalic ships with pdfkit so no
    // font-embed needed.
    doc
      .font("Times-BoldItalic")
      .fontSize(28)
      .fillColor(cell.accent)
      .text(String(cell.value), cx + 16, y + 8, {
        width: cellW - 32,
        lineBreak: false,
      });
    // Label below, tracked small caps.
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
  // Label in tracked caps on the left, hairline pushed to the right.
  doc
    .font("Helvetica-Bold")
    .fontSize(7.5)
    .fillColor(COLORS.ink)
    .text(label, left, y, {
      characterSpacing: 1.8,
      lineBreak: false,
      width: 200,
    });
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
  // Top + bottom double-rule, no fill — gives the header a refined,
  // editorial feel without the heavy grey block from the previous pass.
  doc
    .save()
    .strokeColor(COLORS.ink)
    .lineWidth(0.6)
    .moveTo(left, y).lineTo(left + columns.reduce((a, c) => a + c.width, 0), y).stroke()
    .restore();

  let x = left;
  doc
    .font("Helvetica-Bold")
    .fontSize(7)
    .fillColor(COLORS.inkMuted);
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
    .moveTo(left, y + HEADER_H).lineTo(left + columns.reduce((a, c) => a + c.width, 0), y + HEADER_H).stroke()
    .restore();
  doc.y = y + HEADER_H + 4;
}

/** Tighter continuation banner on follow-on pages — no full masthead. */
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
    .text("Task Report · continued", left, doc.page.margins.top + 8, {
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
  // Brand red triangle glyph on the far left — mirrors the dashboard's
  // header mark and gives the page a recognisable Altus stamp.
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
    .text(
      `Page ${meta.pageNumber} of ${meta.pageTotal}`,
      left,
      y + 2,
      { width: right - left, align: "right", lineBreak: false },
    );
}

// ─── Row drawing ─────────────────────────────────────────────────────────────

/**
 * Measures the natural height of a row given the (already-scaled) column
 * widths. Two text fields dominate the wrap behaviour — `client` and
 * `subject` — so we measure those and add padding.
 */
function measureRowHeight(
  doc: PDFKit.PDFDocument,
  row: TaskExportRow,
  columns: ColumnSpec[],
  padY: number,
): number {
  doc.font("Helvetica").fontSize(9);
  let maxH = 0;
  for (const c of columns) {
    let text = "";
    switch (c.key) {
      case "client":   text = row.title; break;
      case "subject":  text = row.subject ?? ""; break;
      case "doer":     text = row.doerName ?? ""; break;
      case "initiator":text = row.initiatorName ?? ""; break;
      // Status, approval, priority, dates render at fixed heights —
      // exclude them from natural-wrap calculation.
      default:         continue;
    }
    const h = doc.heightOfString(text, { width: c.width - 16 });
    if (h > maxH) maxH = h;
  }
  // Reserve a second compact line under the client name for tags +
  // revised target date when present.
  const hasSubtext =
    (row.tags && row.tags.length > 0) || row.revisedTargetDate !== null;
  const subtextH = hasSubtext ? 10 : 0;
  return Math.max(maxH + subtextH, 20) + padY * 2;
}

function drawRow(
  doc: PDFKit.PDFDocument,
  row: TaskExportRow,
  columns: ColumnSpec[],
  pageLeft: number,
  pageRight: number,
  layout: { y: number; rowH: number; padY: number; padX: number; now: number },
): void {
  const { y, rowH, padY, now } = layout;
  const isOverdue =
    !row.archived &&
    row.status !== "done" &&
    row.status !== "approved" &&
    row.status !== "cancelled" &&
    row.status !== "transferred" &&
    row.status !== "not_approved" &&
    row.dueAt.getTime() < now;

  // Left-edge accent strip — 2pt wide, brand red — flags overdue rows
  // without needing a separate column. Sits just outside the table's
  // text area so the rest of the row remains visually clean.
  if (isOverdue) {
    doc
      .save()
      .rect(pageLeft - 4, y + 2, 2, rowH - 4)
      .fill(COLORS.brand)
      .restore();
  }

  let x = pageLeft;
  for (const c of columns) {
    drawCell(doc, row, c, x, y, rowH, padY, isOverdue, now);
    x += c.width;
  }

  // Hairline row separator.
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
  row: TaskExportRow,
  c: ColumnSpec,
  x: number,
  y: number,
  rowH: number,
  padY: number,
  isOverdue: boolean,
  now: number,
): void {
  const cellX = x + 8;
  const cellW = c.width - 16;
  const cellY = y + padY;

  switch (c.key) {
    case "client": {
      // Two-line layout: bold title up top, tiny tracked subline with
      // tags + revised target when relevant.
      doc
        .font("Helvetica-Bold")
        .fontSize(9)
        .fillColor(COLORS.ink)
        .text(row.title, cellX, cellY, { width: cellW, lineBreak: true });
      const subParts: string[] = [];
      if (row.revisedTargetDate) {
        subParts.push(`REVISED ${format(row.revisedTargetDate, "MMM d").toUpperCase()}`);
      }
      if (row.tags && row.tags.length > 0) {
        subParts.push(row.tags.join(" · ").toUpperCase());
      }
      if (subParts.length > 0) {
        const titleH = doc.heightOfString(row.title, { width: cellW });
        doc
          .font("Helvetica-Bold")
          .fontSize(6)
          .fillColor(COLORS.inkSoft)
          .text(subParts.join("  ·  "), cellX, cellY + titleH + 2, {
            width: cellW,
            characterSpacing: 1.0,
            lineBreak: false,
            ellipsis: true,
          });
      }
      break;
    }

    case "subject": {
      doc
        .font("Helvetica")
        .fontSize(9)
        .fillColor(COLORS.inkMuted)
        .text(row.subject || "—", cellX, cellY, {
          width: cellW,
          lineBreak: true,
        });
      break;
    }

    case "status": {
      const pill = STATUS_PILL[row.status];
      drawPill(doc, cellX, cellY, cellW, pill.label, pill.bg, pill.fg);
      break;
    }

    case "approval": {
      const val = row.approvalStatus;
      if (!val) {
        doc
          .font("Helvetica")
          .fontSize(9)
          .fillColor(COLORS.inkSoft)
          .text("—", cellX, cellY, { width: cellW, lineBreak: false });
      } else {
        // Approval uses a thinner outline pill so it doesn't compete
        // with the colour-saturated status pill next door.
        const fg =
          val === "approved" ? "#065F46" :
          val === "not_approved" ? "#B91C1C" :
          val === "transferred" ? "#3730A3" : "#525252";
        drawOutlinePill(doc, cellX, cellY, cellW, APPROVAL_LABEL[val], fg);
      }
      break;
    }

    case "priority": {
      const p = PRIORITY_GLYPH[row.priority];
      // Filled dot + tracked code label — "● P0" with the dot taking
      // the priority colour. Reads at a glance even on a printed page.
      doc
        .save()
        .circle(cellX + 3, cellY + 7, 3)
        .fill(p.color)
        .restore();
      doc
        .font("Helvetica-Bold")
        .fontSize(8.5)
        .fillColor(COLORS.ink)
        .text(p.code, cellX + 11, cellY + 3, {
          width: cellW - 11,
          characterSpacing: 1.0,
          lineBreak: false,
        });
      // Tiny sub-label tucked underneath for context.
      doc
        .font("Helvetica")
        .fontSize(6.5)
        .fillColor(COLORS.inkSoft)
        .text(p.label, cellX + 11, cellY + 13, {
          width: cellW - 11,
          lineBreak: false,
          ellipsis: true,
        });
      break;
    }

    case "doer":
    case "initiator": {
      const text = c.key === "doer" ? row.doerName ?? "—" : row.initiatorName ?? "—";
      doc
        .font("Helvetica")
        .fontSize(9)
        .fillColor(COLORS.ink)
        .text(text, cellX, cellY, { width: cellW, lineBreak: true });
      break;
    }

    case "due": {
      const dueStr = format(row.dueAt, "MMM d, yyyy");
      doc
        .font(isOverdue ? "Helvetica-Bold" : "Helvetica")
        .fontSize(9)
        .fillColor(isOverdue ? COLORS.brand : COLORS.ink)
        .text(dueStr, cellX, cellY, {
          width: cellW,
          align: c.align ?? "left",
          lineBreak: false,
        });
      if (isOverdue) {
        const days = Math.floor((now - row.dueAt.getTime()) / 86_400_000);
        doc
          .font("Helvetica-Bold")
          .fontSize(6)
          .fillColor(COLORS.brand)
          .text(`${days}D OVERDUE`, cellX, cellY + 11, {
            width: cellW,
            align: c.align ?? "left",
            characterSpacing: 1.0,
            lineBreak: false,
          });
      }
      break;
    }

    case "created": {
      doc
        .font("Helvetica")
        .fontSize(9)
        .fillColor(COLORS.inkMuted)
        .text(format(row.createdAt, "MMM d, yyyy"), cellX, cellY, {
          width: cellW,
          align: c.align ?? "left",
          lineBreak: false,
        });
      break;
    }
  }
  void rowH;
}

/**
 * Filled, rounded "chip" rendered the same way the dashboard's
 * StatusBadge component does on screen — solid tinted background, dark
 * foreground text, 4pt corner radius, sized to fit its label.
 */
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
  doc
    .save()
    .roundedRect(x, y + 1, pillW, pillH, 3)
    .fill(bg)
    .restore();
  doc
    .fillColor(fg)
    .text(label.toUpperCase(), x + 6, y + 5, {
      width: pillW - 12,
      characterSpacing: 0.8,
      lineBreak: false,
      ellipsis: true,
    });
}

function drawOutlinePill(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  cellW: number,
  label: string,
  fg: string,
): void {
  doc.font("Helvetica-Bold").fontSize(7).fillColor(fg);
  const textW = Math.min(
    doc.widthOfString(label, { characterSpacing: 0.8 }),
    cellW - 12,
  );
  const pillW = textW + 12;
  const pillH = 14;
  doc
    .save()
    .roundedRect(x, y + 1, pillW, pillH, 3)
    .lineWidth(0.6)
    .strokeColor(fg)
    .stroke()
    .restore();
  doc
    .fillColor(fg)
    .text(label.toUpperCase(), x + 6, y + 5, {
      width: pillW - 12,
      characterSpacing: 0.8,
      lineBreak: false,
      ellipsis: true,
    });
}
