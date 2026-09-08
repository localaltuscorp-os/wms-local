import "server-only";

import PDFDocument from "pdfkit";
import type { VasaCell } from "@/lib/queries/accounts-vasa";
import { formatFullInr, INR_PDF } from "@/lib/accounts/inr-format";
import { snapshotLabel, quarterOf, quarterKey } from "@/lib/accounts/vasa-report";

/**
 * VASA INTERPERSONAL BALANCE — the emailed PDF.
 *
 * The email attachment is a PDF and only a PDF (Sir): a spreadsheet lands in an
 * inbox as something to open and edit, a PDF lands as something to read and
 * file. Excel is still downloadable and still what WhatsApp shares — this is
 * the reading copy, not a replacement.
 *
 * WHY IT IS NOT A GREYSCALE TABLE DUMP. The whole sheet is read by its colour:
 * green is owed TO the party, red is owed BY them. A black-and-white export
 * throws away the one signal the reader is scanning for, so the value colours
 * are carried through, the header band wears the house red, and the grid has
 * real borders and banded rows rather than whitespace pretending to be a table.
 *
 * LANDSCAPE, because this is a square matrix: every party is both a row and a
 * column, so the page has to grow sideways as the family does. Columns are
 * sized from the page width and the type steps down as more parties are added,
 * rather than the table silently running off the edge.
 *
 * Imported LAZILY by the email action so pdfkit's font payload never reaches a
 * client bundle — the same rule lib/hr/letters/pdf.ts follows.
 */

const RED = "#E10600";
const RED_DEEP = "#A80400";
const GREEN_DEEP = "#15803D";
const INK = "#0F172A";
const INK_MUTED = "#475569";
const INK_FAINT = "#94A3B8";
const HAIRLINE = "#CBD5E1";
const BAND = "#F1F5F9";

/** A4 landscape, in points. */
const PAGE_W = 841.89;
const PAGE_H = 595.28;
const MARGIN = 40;
const HEADER_H = 74;
const FOOTER_H = 34;

export interface VasaPdfInput {
  cells: VasaCell[];
  parties: string[];
  asOn: string;
  /** Who pressed Email — printed in the footer so the report is attributable. */
  senderName?: string | null;
}

/** Render one chart to a print-ready A4 landscape PDF. */
export async function renderVasaPdf(input: VasaPdfInput): Promise<Buffer> {
  const { cells, parties, asOn } = input;

  const byKey = new Map<string, number>();
  for (const c of cells) {
    if (c.asOn === asOn) byKey.set(`${c.party}|${c.counterparty}`, Number(c.amount));
  }

  const doc = new PDFDocument({
    // "A4" + landscape, NOT an explicit [w,h] array. pdfkit applies `layout` to
    // a NAMED size, so passing the already-swapped dimensions alongside
    // landscape swaps them back and the page comes out portrait.
    size: "A4",
    layout: "landscape",
    margin: MARGIN,
    info: {
      Title: `Vasa Family Interpersonal Balance - ${snapshotLabel(asOn)}`,
      Author: "Altus Corp Dashboard",
      Subject: "Interpersonal reconciliation",
    },
  });

  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });

  const left = MARGIN;
  const width = PAGE_W - MARGIN * 2;

  // ── Column geometry ────────────────────────────────────────────────────
  // The party column is fixed and generous (names are the widest text here);
  // the value columns share what is left, with Net given the same width as a
  // party column so the last figure does not look like an afterthought.
  const partyW = Math.min(150, Math.max(96, width * 0.16));
  const valueCols = parties.length + 1; // parties + Net
  const valueW = Math.max(48, (width - partyW) / Math.max(1, valueCols));
  // Step the type down as the matrix widens, so a big family still fits the page.
  const bodySize = valueW >= 84 ? 9 : valueW >= 66 ? 8 : 7;
  const headSize = Math.max(6.5, bodySize - 0.5);
  const rowH = bodySize + 11;

  /**
   * Stamp the fixed band + footer with the page margins COLLAPSED.
   *
   * The footer sits below the body's bottom margin, and pdfkit runs a
   * vertical-overflow check on `text()` even with `lineBreak:false` — it decides
   * the string will not fit, auto-adds a page "to make room", and the table then
   * draws onto that new page instead. The first render of this report came out
   * as three pages with an empty first one for exactly that reason. Zeroing the
   * margins for the duration of the paint removes the check; they are restored
   * immediately after. Same fix, same reason, as lib/hr/letters/pdf.ts.
   */
  function paintFrame(): void {
    const m = doc.page.margins;
    const prev = { top: m.top, bottom: m.bottom };
    doc.page.margins.top = 0;
    doc.page.margins.bottom = 0;
    drawHeaderBand();
    drawFooter();
    doc.page.margins.top = prev.top;
    doc.page.margins.bottom = prev.bottom;
  }

  function drawHeaderBand(): void {
    doc.save();
    doc.rect(0, 0, PAGE_W, HEADER_H).fill(RED_DEEP);
    // A lighter wedge on the right, echoing the letterhead's angular ribbon.
    doc.moveTo(PAGE_W * 0.62, 0).lineTo(PAGE_W, 0).lineTo(PAGE_W, HEADER_H).fill(RED);
    doc.restore();

    doc
      .font("Helvetica-Bold")
      .fontSize(17)
      .fillColor("#FFFFFF")
      .text("Vasa Family Interpersonal Balance", left, 18, { width, lineBreak: false });

    const q = quarterOf(asOn);
    const sub = `As on ${snapshotLabel(asOn)}${q ? `  ·  ${quarterKey(q.q, q.year)}` : ""}`;
    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor("rgba(255,255,255,0.92)")
      .text(sub, left, 44, { width, lineBreak: false });
  }

  function drawFooter(): void {
    const y = PAGE_H - FOOTER_H;
    doc.save();
    doc.moveTo(left, y).lineTo(PAGE_W - MARGIN, y).lineWidth(0.75).stroke(HAIRLINE);
    doc.restore();
    const stamp = new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date());
    doc
      .font("Helvetica")
      .fontSize(7.5)
      .fillColor(INK_FAINT)
      .text(
        `Generated ${stamp} IST${input.senderName ? ` · ${input.senderName}` : ""}`,
        left,
        y + 9,
        { width: width * 0.6, lineBreak: false },
      );
    doc
      .font("Helvetica")
      .fontSize(7.5)
      .fillColor(INK_FAINT)
      .text("Green = owed to the party · Red = owed by the party", left, y + 9, {
        width,
        align: "right",
        lineBreak: false,
      });
  }

  paintFrame();

  // ── Column header row ──────────────────────────────────────────────────
  let y = HEADER_H + 22;

  function colX(i: number): number {
    return left + partyW + i * valueW;
  }

  function drawTableHead(): void {
    doc.save();
    doc.rect(left, y, width, rowH + 4).fill(BAND);
    doc.restore();

    doc
      .font("Helvetica-Bold")
      .fontSize(headSize)
      .fillColor(INK_MUTED)
      .text("PARTY", left + 6, y + 6, { width: partyW - 10, lineBreak: false });

    parties.forEach((p, i) => {
      doc
        .font("Helvetica-Bold")
        .fontSize(headSize)
        .fillColor(INK)
        .text(p, colX(i) + 3, y + 6, {
          width: valueW - 6,
          align: "right",
          lineBreak: false,
          ellipsis: true,
        });
    });
    doc
      .font("Helvetica-Bold")
      .fontSize(headSize)
      .fillColor(RED_DEEP)
      .text("NET", colX(parties.length) + 3, y + 6, {
        width: valueW - 6,
        align: "right",
        lineBreak: false,
      });

    y += rowH + 4;
    doc.moveTo(left, y).lineTo(left + width, y).lineWidth(1).stroke(HAIRLINE);
  }

  drawTableHead();

  const bottom = PAGE_H - FOOTER_H - 12;

  parties.forEach((row, ri) => {
    // Page break — repeat the band and the column head so a continued table is
    // still readable rather than a floating block of numbers.
    if (y + rowH > bottom) {
      doc.addPage();
      paintFrame();
      y = HEADER_H + 22;
      drawTableHead();
    }

    if (ri % 2 === 1) {
      doc.save();
      doc.rect(left, y, width, rowH).fill("#FAFBFC");
      doc.restore();
    }

    doc
      .font("Helvetica-Bold")
      .fontSize(bodySize)
      .fillColor(INK)
      .text(row, left + 6, y + 4, { width: partyW - 10, lineBreak: false, ellipsis: true });

    let net = 0;
    parties.forEach((col, ci) => {
      const x = colX(ci);
      if (col === row) {
        // The diagonal is not a balance — a dash, greyed, so it never reads as 0.
        doc
          .font("Helvetica")
          .fontSize(bodySize)
          .fillColor(INK_FAINT)
          .text("-", x + 3, y + 4, { width: valueW - 6, align: "center", lineBreak: false });
        return;
      }
      const v = byKey.get(`${row}|${col}`);
      if (v === undefined || v === 0) {
        doc
          .font("Helvetica")
          .fontSize(bodySize)
          .fillColor(INK_FAINT)
          .text("·", x + 3, y + 4, { width: valueW - 6, align: "center", lineBreak: false });
        return;
      }
      net += v;
      doc
        .font("Helvetica")
        .fontSize(bodySize)
        .fillColor(v < 0 ? RED : GREEN_DEEP)
        .text(formatFullInr(v, INR_PDF), x + 3, y + 4, {
          width: valueW - 6,
          align: "right",
          lineBreak: false,
          ellipsis: true,
        });
    });

    // NET — bold, same red/green vocabulary, on a faint seat so the eye lands
    // on the column that answers "where does this party stand".
    const nx = colX(parties.length);
    doc.save();
    doc.rect(nx, y, valueW, rowH).fill(BAND);
    doc.restore();
    doc
      .font("Helvetica-Bold")
      .fontSize(bodySize)
      .fillColor(net > 0 ? GREEN_DEEP : net < 0 ? RED : INK_FAINT)
      .text(net === 0 ? "-" : formatFullInr(net, INR_PDF), nx + 3, y + 4, {
        width: valueW - 6,
        align: "right",
        lineBreak: false,
        ellipsis: true,
      });

    y += rowH;
    doc.moveTo(left, y).lineTo(left + width, y).lineWidth(0.5).stroke(HAIRLINE);
  });

  // Vertical rules, drawn once over the whole block — cheaper than per-cell
  // borders and they cannot end up misaligned between rows.
  const tableTop = HEADER_H + 22;
  doc.save();
  doc.lineWidth(0.5);
  for (let i = 0; i <= valueCols; i++) {
    const x = colX(i);
    doc.moveTo(x, tableTop).lineTo(x, y).stroke(HAIRLINE);
  }
  doc.moveTo(left, tableTop).lineTo(left, y).stroke(HAIRLINE);
  doc.moveTo(left + width, tableTop).lineTo(left + width, y).stroke(HAIRLINE);
  doc.restore();

  if (parties.length === 0) {
    doc
      .font("Helvetica")
      .fontSize(11)
      .fillColor(INK_MUTED)
      .text("No parties on this chart.", left, y + 20, { width, align: "center" });
  }

  doc.end();
  return done;
}
