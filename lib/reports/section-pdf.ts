import "server-only";
import PDFDocument from "pdfkit";
import { existsSync } from "node:fs";
import path from "node:path";
import type { SectionReport, ReportColumn } from "./section-report";

/**
 * ONE RENDERER FOR EVERY DASHBOARD SECTION.
 *
 * ── WHAT WENT WRONG THE FIRST TIME, SO IT CANNOT RECUR ───────────────────
 * The first cut collided with itself in four ways, and every one traced back
 * to a layout that let content decide where it went:
 *
 *   1. `public/logo.png` is 973x1074 — TALLER than it is wide. It was placed
 *      with `{ width: 108 }`, so pdfkit scaled the height to 119pt inside a
 *      header that had reserved 44. The logo ran 75pt past its band, straight
 *      through the title, the filter line and into the first table rows.
 *      Every image is placed with `fit: [w, h]` now, which is `object-fit:
 *      contain` — it constrains BOTH axes, so an asset can never decide the
 *      height of the box it sits in.
 *
 *   2. `logo-mark.png` is byte-for-byte the same artwork as `logo.png`, so the
 *      "watermark" was a second copy of the header logo — drawn at 300pt wide,
 *      which on that aspect is 331pt tall, centred over the table. It is gone.
 *      A watermark that obscures the numbers is worth less than the numbers.
 *
 *   3. The title was drawn with `lineBreak: false` and no width, and the
 *      generated-on stamp was right-aligned across the FULL content width at
 *      the same y. A long title simply ran under the stamp. Every text box is
 *      now given an explicit x, y and width that cannot overlap its neighbour's.
 *
 *   4. Vertical position was read back out of `doc.y` after absolutely
 *      positioned writes, which is only sometimes what you think it is. Layout
 *      runs off an explicit `cursor` this module owns.
 *
 * pdfkit, not @react-pdf/renderer: the payslip, the weekly-goals report and the
 * Vasa report all render through pdfkit here, and the faults above were bad
 * geometry rather than a bad library — a new dependency would have carried the
 * same four mistakes into a different API.
 */

const LOGO_PATH = path.join(process.cwd(), "public", "logo.png");

const COLORS = {
  brand: "#E10600",
  brandSoft: "#fee2e2",
  brandInk: "#dc2626",
  headBg: "#0f172a",
  ink: "#0f172a",
  inkSoft: "#475569",
  inkMuted: "#64748B",
  inkFaint: "#94a3b8",
  rule: "#e2e8f0",
  ruleBrand: "#fecaca",
  zebra: "#f8fafc",
  nest: "#f1f5f9",
};

/* ── THE VERTICAL BUDGET ─────────────────────────────────────────
   Every number the renderer positions against lives here, and they are not
   guesses — they are solved for a target: TWENTY-FIVE rows on one A4 landscape
   sheet. On a 595.28pt page with 12mm (34pt) margins:

     floor  = 595.28 - 34 (margin) - 26 (footer)          = 535.3
     table  = 34 + BRAND_H(32) + GAP(12) + TITLE(22)
              + SUBTITLE(13) + PILL(21) + META(12) + 6    = 152
              + HEAD_ROW_H(20)                            = 172
     rows   = 535.3 - 172 = 363.3 available
     25 rows x ROW_H(14) = 350                            ✓ fits, 13pt spare

   Change any constant here and that sum has to be re-run; the row-capacity
   test in tests/unit/section-pdf.test.ts re-runs it for you. */
const BRAND_H = 32; // logo + stamp band
const HEADER_GAP = 12; // rule → title
const TITLE_H = 22; // 18pt bold
const SUBTITLE_H = 13; // 10pt muted
const PILL_H = 21; // the count badge, on its own row
const META_H = 12;
const ROW_H = 14;
const NEST_ROW_H = 12.5;
const HEAD_ROW_H = 20;
const FOOTER_H = 26;

type Doc = InstanceType<typeof PDFDocument>;

/** `24 Aug 2026, 06:42 PM` — IST, like every other date on the dashboard. */
function stamp(d: Date): string {
  return d
    .toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
      timeZone: "Asia/Kolkata",
    })
    .replace(/\s?(am|pm)/i, (m) => m.toUpperCase());
}

/** Column x-offsets and widths, in proportion to each column's weight. */
function layout(columns: ReportColumn[], width: number): { x: number[]; w: number[] } {
  const weights = columns.map((c) => c.weight ?? 1);
  const total = weights.reduce((s, n) => s + n, 0) || 1;
  const w = weights.map((n) => (n / total) * width);
  const x: number[] = [];
  let cursor = 0;
  for (const cw of w) {
    x.push(cursor);
    cursor += cw;
  }
  return { x, w };
}

function alignOf(col: ReportColumn, i: number): "left" | "right" | "center" {
  return col.align ?? (i === 0 ? "left" : "right");
}

/**
 * THREE STACKED ROWS, each owning its own band. Returns the y the table starts
 * at.
 *
 *   Row 1  logo left · generated stamp right — two halves that cannot meet
 *   Row 2  title, then subtitle, each on its own full-width line
 *   Row 3  the count pill, alone, BELOW the title
 *
 * The pill used to sit inline after the subtitle, which was safe only while the
 * subtitle was short. On its own row it cannot be pushed anywhere near the
 * branding no matter how long either string gets.
 */
function header(doc: Doc, report: SectionReport, left: number, width: number, now: Date): number {
  const top = doc.page.margins.top;
  const half = width / 2 - 12;
  const rightX = left + width - half;

  // ROW 1 — logo in a fixed 110x28 box, contained. `fit` constrains BOTH axes;
  // `width` alone is what let a 973x1074 asset become 119pt tall and run
  // through everything below it.
  if (existsSync(LOGO_PATH)) {
    try {
      // `fit` alone — left/top is pdfkit's default anchor, and its types only
      // accept center/right and center/bottom for the overrides.
      doc.image(LOGO_PATH, left, top, { fit: [110, 28] });
    } catch {
      /* missing or corrupt asset — the band still renders as text */
    }
  }
  doc
    .font("Helvetica-Bold")
    .fontSize(8.5)
    .fillColor(COLORS.ink)
    .text(`Generated ${stamp(now)}`, rightX, top + 4, {
      width: half,
      align: "right",
      lineBreak: false,
    });
  doc
    .font("Helvetica")
    .fontSize(7.5)
    .fillColor(COLORS.inkFaint)
    .text("Altus Corp · Executive Dashboard Report", rightX, top + 16, {
      width: half,
      align: "right",
      lineBreak: false,
    });

  // The band's closing rule, at a FIXED offset — not wherever the text ended.
  const ruleY = top + BRAND_H;
  doc.save().moveTo(left, ruleY).lineTo(left + width, ruleY).lineWidth(1).stroke(COLORS.ruleBrand).restore();

  let cursor = ruleY + HEADER_GAP;

  // ROW 2 — title on its own full-width line. This is what stops it running
  // under the timestamp: the two are no longer on the same row.
  doc
    .font("Helvetica-Bold")
    .fontSize(18)
    .fillColor(COLORS.ink)
    .text(report.title.toUpperCase(), left, cursor, {
      width,
      lineBreak: false,
      ellipsis: true,
      characterSpacing: 0.4,
    });
  cursor += TITLE_H;

  if (report.subtitle) {
    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor(COLORS.inkMuted)
      .text(report.subtitle, left, cursor, { width, lineBreak: false, ellipsis: true });
    cursor += SUBTITLE_H;
  }

  // ROW 3 — the count badge, standalone. Measured so the capsule wraps the
  // text rather than the text being centred in a guessed box.
  if (report.summary) {
    doc.font("Helvetica-Bold").fontSize(8);
    const pillW = doc.widthOfString(report.summary) + 20;
    doc.save().roundedRect(left, cursor + 2, pillW, 16, 8).fill(COLORS.brandSoft).restore();
    doc.fillColor(COLORS.brandInk).text(report.summary, left, cursor + 7, {
      width: pillW,
      align: "center",
      lineBreak: false,
    });
    cursor += PILL_H;
  }

  // FILTER LINE — what the reader had applied. Without it a printed table is a
  // set of numbers with no stated scope.
  if (report.meta.length > 0) {
    doc
      .font("Helvetica")
      .fontSize(8.5)
      .fillColor(COLORS.inkFaint)
      .text(report.meta.map((m) => `${m.label}: ${m.value}`).join("   ·   "), left, cursor + 2, {
        width,
        lineBreak: false,
        ellipsis: true,
      });
    cursor += META_H;
  }

  return cursor + 6;
}

/** The dark header row. Returns the y beneath it. */
function tableHead(
  doc: Doc,
  columns: ReportColumn[],
  left: number,
  width: number,
  cols: { x: number[]; w: number[] },
  y: number,
): number {
  doc.save().roundedRect(left, y, width, HEAD_ROW_H, 4).fill(COLORS.headBg).restore();
  doc.font("Helvetica-Bold").fontSize(7.5).fillColor("#ffffff");
  columns.forEach((c, i) => {
    doc.text(c.label.toUpperCase(), left + cols.x[i]! + 6, y + 7.5, {
      width: cols.w[i]! - 12,
      align: alignOf(c, i),
      lineBreak: false,
      ellipsis: true,
      characterSpacing: 0.4,
    });
  });
  return y + HEAD_ROW_H;
}

/**
 * Left "Confidential", right "Page X of Y", above a hairline.
 *
 * THE BOTTOM MARGIN IS DROPPED FOR THE DURATION, and that is not a flourish:
 * pdfkit's `text()` checks whether the line would cross `page.maxY()` and, if
 * it would, silently starts a new page and resets the cursor to the TOP margin.
 * A footer is by definition drawn below that line, so the first version was
 * bounced to y=40 on every page and printed straight through the branding band.
 * Zeroing the margin for the two writes is the documented way to opt out of
 * that check; it is restored immediately so nothing else inherits it.
 */
function footer(doc: Doc, left: number, width: number, page: number, total: number): void {
  const keep = doc.page.margins.bottom;
  doc.page.margins.bottom = 0;
  const y = doc.page.height - keep - FOOTER_H + 12;
  doc.save().moveTo(left, y).lineTo(left + width, y).lineWidth(0.6).stroke(COLORS.rule).restore();
  doc.font("Helvetica").fontSize(9).fillColor(COLORS.inkFaint);
  doc.text("Confidential — Internal Altus Corp Report", left, y + 8, {
    width,
    align: "left",
    lineBreak: false,
  });
  doc.text(`Page ${page} of ${total}`, left, y + 8, { width, align: "right", lineBreak: false });
  doc.page.margins.bottom = keep;
}

/**
 * Assemble the PDF. Resolves with the finished buffer rather than streaming:
 * one caller attaches it to an email, the other hands it to the browser, and
 * both need the whole thing in hand.
 */
export function renderSectionPdf(report: SectionReport, now: Date = new Date()): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      // Landscape: these tables run to eleven columns, and portrait would
      // either clip them or shrink the type past reading size.
      layout: "landscape",
      // 12mm all round, the `@page { margin: 12mm }` the brief asks for.
      margins: { top: 34, bottom: 34, left: 34, right: 34 },
      // REQUIRED for the footer pass: "Page 1 of N" cannot be written until the
      // body is laid out, and without buffering pdfkit has already flushed the
      // page by then.
      bufferPages: true,
      info: { Title: report.title, Author: "Altus Corp Dashboard" },
    });

    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const left = doc.page.margins.left;
    const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    // The last y a row may START at. Reserving the footer here is what keeps
    // the final row of a page off the page number.
    const floor = doc.page.height - doc.page.margins.bottom - FOOTER_H;
    const cols = layout(report.columns, width);

    let y = header(doc, report, left, width, now);
    y = tableHead(doc, report.columns, left, width, cols, y);

    if (report.rows.length === 0) {
      doc
        .font("Helvetica-Oblique")
        .fontSize(10)
        .fillColor(COLORS.inkFaint)
        .text("No rows matched the filters in force when this was exported.", left, y + 18, {
          width,
          align: "center",
        });
    }

    report.rows.forEach((row, r) => {
      const depth = report.depth?.[r] ?? 0;
      const rowH = depth > 0 ? NEST_ROW_H : ROW_H;

      // Break BEFORE drawing, and redraw both the header band and the column
      // labels — a continuation sheet of bare numbers under no headings is a
      // puzzle, not a report.
      if (y + rowH > floor) {
        doc.addPage();
        y = header(doc, report, left, width, now);
        y = tableHead(doc, report.columns, left, width, cols, y);
      }

      const bg = depth > 0 ? COLORS.nest : r % 2 === 1 ? COLORS.zebra : null;
      if (bg) doc.save().rect(left, y, width, rowH).fill(bg).restore();

      row.forEach((cell, i) => {
        if (i >= report.columns.length) return;
        const col = report.columns[i]!;
        const align = alignOf(col, i);
        const indent = i === 0 ? depth * 12 : 0;
        // A `count` column reads crimson and bold when it is carrying
        // something, and stays quiet at zero — the same emphasis the web view
        // gives it, so the two do not disagree about what matters.
        const hot = col.tone === "count" && cell !== "0" && cell !== "" && cell !== "—";
        doc
          .font(hot || (depth === 0 && i === 0) ? "Helvetica-Bold" : "Helvetica")
          .fontSize(depth > 0 ? 7 : 8)
          .fillColor(hot ? COLORS.brandInk : depth > 0 ? COLORS.inkSoft : COLORS.ink)
          .text(cell, left + cols.x[i]! + 6 + indent, y + (rowH - 9) / 2, {
            width: cols.w[i]! - 12 - indent,
            align,
            lineBreak: false,
            ellipsis: true,
          });
      });

      y += rowH;
      doc.save().moveTo(left, y).lineTo(left + width, y).lineWidth(0.4).stroke(COLORS.rule).restore();
    });

    // Footers LAST: the page count is only known once the body is laid out.
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i += 1) {
      doc.switchToPage(range.start + i);
      footer(doc, left, width, i + 1, range.count);
    }

    doc.end();
  });
}
