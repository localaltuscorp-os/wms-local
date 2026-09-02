import "server-only";
import { existsSync } from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import { format } from "date-fns";
import { formatDate } from "@/lib/format";
import { getEntity } from "@/lib/hr/entities";

/**
 * WS-5 — Shared payslip "house style" for pdfkit salary documents.
 *
 * The payslip (/salary/payslip/[runId]) and exit letters established the look:
 * brand stripe · embedded Altus logo · faint centered watermark · full-page
 * border · red section accents · system footer · Entity signatory block. The
 * NEW statement/earnings documents reuse these helpers so every salary PDF is
 * visually identical. All asset reads are guarded — a missing logo / mark /
 * signature never breaks a document.
 */

export const COLORS = {
  ink: "#0A0A0A",
  inkMuted: "#404040",
  inkSoft: "#525252",
  inkFaint: "#A3A3A3",
  hairline: "#E5E5E5",
  hairlineStrong: "#D4D4D4",
  brand: "#E10600",
  brandDeep: "#A80400",
  netTint: "#FDECEA",
} as const;

const LOGO_PATH = path.join(process.cwd(), "public", "logo.png");

/**
 * The PER-ENTITY logo for a paying entity (Sir: "correct logo for each entity").
 * Every slip used to print `public/logo.png` — the Altus mark — no matter which
 * entity actually paid, so an Unleashed or Gainmakers payslip carried the wrong
 * brand. `getEntity` resolves display names, legal names AND the legacy roster
 * spellings ("MJV HUF", "JSV HUF") to a canonical id, whose logo lives at
 * public/logos/<id>.jpg. Falls back to the Altus mark if that file is missing,
 * so a new entity can never produce a logo-less slip.
 */
export function entityLogoPath(entity: string | null | undefined): string {
  const id = getEntity(entity).id;
  const p = path.join(process.cwd(), "public", "logos", `${id}.jpg`);
  return existsSync(p) ? p : LOGO_PATH;
}
const MARK_PATH = path.join(process.cwd(), "public", "logo-mark.png");
export const SIG_DIR = path.join(process.cwd(), "public", "signatures");

/** Rupees with Indian grouping, no decimals. Uses the "Rs " prefix rather than
 *  the ₹ glyph: pdfkit's built-in Helvetica has no rupee glyph (it renders as
 *  "¹"), so every salary PDF must spell it "Rs" to stay readable. */
export const inr = (n: number): string =>
  "Rs " + Math.round(n).toLocaleString("en-IN", { maximumFractionDigits: 0 });

/** "dd MMMM yyyy" for a YYYY-MM-DD ISO date, or "" / the raw string on failure. */
export function fmtDate(iso?: string | null): string {
  return formatDate(iso ?? ""); // canonical "01 Jan 2026"
}

// ── number → Indian-system words (net-payable / total lines) ────────────────
const ONES = [
  "Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight",
  "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen",
  "Sixteen", "Seventeen", "Eighteen", "Nineteen",
] as const;
const TENS = [
  "", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy",
  "Eighty", "Ninety",
] as const;

function twoDigits(n: number): string {
  if (n < 20) return ONES[n] ?? "";
  const t = Math.floor(n / 10);
  const o = n % 10;
  const tens = TENS[t] ?? "";
  return o === 0 ? tens : `${tens} ${ONES[o] ?? ""}`;
}
function threeDigits(n: number): string {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  if (h === 0) return twoDigits(rest);
  const hundreds = `${ONES[h] ?? ""} Hundred`;
  return rest === 0 ? hundreds : `${hundreds} ${twoDigits(rest)}`;
}
function rupeesToWords(amount: number): string {
  let n = Math.round(Math.abs(amount));
  if (n === 0) return "Zero";
  const parts: string[] = [];
  const crore = Math.floor(n / 10_000_000);
  n %= 10_000_000;
  const lakh = Math.floor(n / 100_000);
  n %= 100_000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  if (crore) parts.push(`${threeDigits(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (n) parts.push(threeDigits(n));
  return parts.join(" ");
}
export function amountInWords(amount: number): string {
  const sign = amount < 0 ? "Minus " : "";
  return `${sign}Rupees ${rupeesToWords(amount)} Only`;
}

/** Create an A4 portrait doc + a promise that resolves to the finished Buffer. */
export function newDoc(meta: {
  title: string;
  subject: string;
  margin?: number;
}): { doc: PDFKit.PDFDocument; done: Promise<Buffer> } {
  const doc = new PDFDocument({
    size: "A4",
    layout: "portrait",
    margin: meta.margin ?? 48,
    info: { Title: meta.title, Author: "Altus Corp Dashboard", Subject: meta.subject },
  });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });
  return { doc, done };
}

/** Full-page border + faint watermark + brand stripe (drawn first). */
export function drawChrome(doc: PDFKit.PDFDocument): void {
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const width = right - left;

  doc
    .save()
    .strokeColor(COLORS.hairlineStrong)
    .lineWidth(1)
    .rect(left - 16, 26, width + 32, doc.page.height - 52)
    .stroke()
    .restore();

  if (existsSync(MARK_PATH)) {
    try {
      const wm = 360;
      doc.save();
      doc.opacity(0.055);
      doc.image(MARK_PATH, doc.page.width / 2 - wm / 2, doc.page.height / 2 - wm / 2, {
        width: wm,
      });
      doc.opacity(1);
      doc.restore();
    } catch {
      /* missing/corrupt asset → no watermark */
    }
  }

  doc.save().rect(0, 0, doc.page.width, 5).fill(COLORS.brand).restore();
  doc.save().rect(0, 5, doc.page.width, 1.2).fill(COLORS.brandDeep).restore();
}

/** Logo + entity name + a small confidential subline. Advances doc.y.
 *
 * The logo is sized by HEIGHT (not width): the mark is portrait (≈973×1074), so
 * sizing by width made it ~137px tall and it crashed straight through the title
 * band below. A fixed logo height keeps the masthead a tidy single band, and the
 * entity name is vertically centred against it. */
export function drawMasthead(
  doc: PDFKit.PDFDocument,
  entity: string,
  subline: string,
): void {
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const headerTop = doc.page.margins.top + 2;
  const LOGO_H = 46;
  let textX = left;
  let logoBottom = headerTop;
  // The PAYING ENTITY's own logo — not the Altus mark for everyone.
  const logoPath = entityLogoPath(entity);
  if (existsSync(logoPath)) {
    try {
      // Real aspect ratio → width for this height (fallback to the known ratio).
      let logoW = Math.round(LOGO_H * (973 / 1074));
      try {
        const img = (doc as unknown as { openImage: (p: string) => { width: number; height: number } }).openImage(logoPath);
        if (img?.width && img?.height) logoW = Math.round((img.width / img.height) * LOGO_H);
      } catch {
        /* keep fallback width */
      }
      doc.image(logoPath, left, headerTop, { height: LOGO_H });
      textX = left + logoW + 14;
      logoBottom = headerTop + LOGO_H;
    } catch {
      /* text-only masthead */
    }
  }
  // Vertically centre the name + subline block against the logo band. Both are
  // positioned at EXPLICIT y's (never doc.y between them) — pdfkit does not
  // reliably advance doc.y after a `lineBreak:false` text, which previously made
  // the subline land on top of the entity name.
  const NAME_SIZE = 16;
  const NAME_H = 18;
  const SUB_GAP = 5;
  const blockH = NAME_H + SUB_GAP + 10;
  const nameY = headerTop + Math.max(0, (LOGO_H - blockH) / 2);
  const subY = nameY + NAME_H + SUB_GAP;
  doc
    .font("Helvetica-Bold")
    .fontSize(NAME_SIZE)
    .fillColor(COLORS.ink)
    .text(entity.toUpperCase(), textX, nameY, {
      characterSpacing: 0.6,
      lineBreak: false,
    });
  doc
    .font("Helvetica")
    .fontSize(8.5)
    .fillColor(COLORS.inkSoft)
    .text(subline, textX, subY, { lineBreak: false });
  // End the masthead below the taller of logo / text, then a hairline rule so
  // the title band that follows reads as a separate, structured block.
  doc.y = Math.max(logoBottom, subY + 12) + 12;
  doc
    .save()
    .strokeColor(COLORS.hairline)
    .lineWidth(0.6)
    .moveTo(left, doc.y)
    .lineTo(right, doc.y)
    .stroke()
    .restore();
  doc.y += 14;
}

/** Red title band with a left title and optional right-aligned caption. */
export function drawTitleBand(
  doc: PDFKit.PDFDocument,
  title: string,
  rightCaption?: string,
): void {
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const width = right - left;
  const titleY = doc.y;
  doc.save().rect(left, titleY, width, 30).fill(COLORS.brand).restore();
  doc
    .font("Helvetica-Bold")
    .fontSize(12.5)
    .fillColor("#FFFFFF")
    .text(title.toUpperCase(), left + 12, titleY + 9, {
      characterSpacing: 0.9,
      lineBreak: false,
    });
  if (rightCaption) {
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor("#FFFFFF")
      .text(rightCaption, left, titleY + 11, {
        width: width - 12,
        align: "right",
        lineBreak: false,
      });
  }
  doc.y = titleY + 30 + 16;
}

/** Small uppercase section heading with a hairline under it. */
export function drawSectionHeading(doc: PDFKit.PDFDocument, label: string): void {
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  doc
    .font("Helvetica-Bold")
    .fontSize(9.5)
    .fillColor(COLORS.brandDeep)
    .text(label.toUpperCase(), left, doc.y, { characterSpacing: 0.8, lineBreak: false });
  doc.y += 14;
  doc
    .save()
    .strokeColor(COLORS.hairlineStrong)
    .lineWidth(0.8)
    .moveTo(left, doc.y)
    .lineTo(right, doc.y)
    .stroke()
    .restore();
  doc.y += 8;
}

/* ------------------------------------------------------------------ */
/* Dashboard primitives — the visual blocks the Attendance + Incentive   */
/* slips render (Sir: "Attendance Slip WITH DASHBOARD").                 */
/* ------------------------------------------------------------------ */

/** One big-number tile in a {@link drawStatTiles} row. */
export interface StatTile {
  label: string;
  value: string;
  /** Optional small caption under the value (e.g. "of 26 days"). */
  caption?: string;
  /** Tint the value with the brand red (use for the headline figure). */
  accent?: boolean;
}

/**
 * A row of big-number tiles — the "at a glance" band at the top of a dashboard
 * section. Tiles share the content width evenly and the row wraps to a new page
 * if it would not fit.
 */
export function drawStatTiles(doc: PDFKit.PDFDocument, tiles: StatTile[]): void {
  if (tiles.length === 0) return;
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const width = right - left;
  const H = 46;
  const gap = 8;
  const w = (width - gap * (tiles.length - 1)) / tiles.length;

  if (doc.y + H > doc.page.height - doc.page.margins.bottom - 40) doc.addPage();
  const top = doc.y;

  tiles.forEach((t, i) => {
    const x = left + i * (w + gap);
    doc.save().roundedRect(x, top, w, H, 5).fillColor(COLORS.netTint).fill().restore();
    doc
      .font("Helvetica")
      .fontSize(7)
      .fillColor(COLORS.inkSoft)
      .text(t.label.toUpperCase(), x + 8, top + 7, {
        width: w - 16,
        characterSpacing: 0.5,
        lineBreak: false,
      });
    doc
      .font("Helvetica-Bold")
      .fontSize(15)
      .fillColor(t.accent ? COLORS.brandDeep : COLORS.ink)
      .text(t.value, x + 8, top + 18, { width: w - 16, lineBreak: false });
    if (t.caption) {
      doc
        .font("Helvetica")
        .fontSize(7)
        .fillColor(COLORS.inkSoft)
        .text(t.caption, x + 8, top + 35, { width: w - 16, lineBreak: false });
    }
  });
  doc.y = top + H + 10;
}

/** One segment of a {@link drawStackedBar} distribution. */
export interface BarSegment {
  label: string;
  value: number;
  color: string;
}

/**
 * A single horizontal stacked bar + a legend beneath it — the distribution view
 * (present / absent / half-day / weekly-off). Zero-value segments are dropped
 * from both the bar and the legend so the chart never shows an empty sliver.
 */
export function drawStackedBar(doc: PDFKit.PDFDocument, segments: BarSegment[]): void {
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const width = right - left;
  const shown = segments.filter((s) => s.value > 0);
  const total = shown.reduce((s, x) => s + x.value, 0);
  if (total <= 0) return;

  const BAR_H = 13;
  if (doc.y + BAR_H + 26 > doc.page.height - doc.page.margins.bottom - 40) doc.addPage();
  const top = doc.y;

  let x = left;
  shown.forEach((s, i) => {
    // Last segment absorbs rounding so the bar always ends flush at `right`.
    const w = i === shown.length - 1 ? right - x : (s.value / total) * width;
    doc.save().rect(x, top, w, BAR_H).fillColor(s.color).fill().restore();
    x += w;
  });

  // Legend — swatch + "Label n" pairs, wrapped across the content width.
  let lx = left;
  let ly = top + BAR_H + 7;
  doc.font("Helvetica").fontSize(7.5);
  for (const s of shown) {
    const text = `${s.label} ${round1(s.value)}`;
    const tw = doc.widthOfString(text) + 16;
    if (lx + tw > right) {
      lx = left;
      ly += 11;
    }
    doc.save().roundedRect(lx, ly + 1, 6, 6, 1).fillColor(s.color).fill().restore();
    doc.fillColor(COLORS.inkSoft).text(text, lx + 9, ly, { lineBreak: false });
    lx += tw;
  }
  doc.y = ly + 15;
}

/**
 * A labelled progress meter — "worked 45.0h of 54h" style. `value` beyond `max`
 * fills the bar completely (it never overflows its track).
 */
export function drawBarMeter(
  doc: PDFKit.PDFDocument,
  opts: { label: string; value: number; max: number; caption?: string; color?: string },
): void {
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const width = right - left;
  const BAR_H = 9;
  if (doc.y + BAR_H + 24 > doc.page.height - doc.page.margins.bottom - 40) doc.addPage();

  const top = doc.y;
  doc
    .font("Helvetica-Bold")
    .fontSize(8)
    .fillColor(COLORS.ink)
    .text(opts.label, left, top, { lineBreak: false });
  if (opts.caption) {
    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor(COLORS.inkSoft)
      .text(opts.caption, left, top, { width, align: "right", lineBreak: false });
  }

  const barY = top + 12;
  doc.save().roundedRect(left, barY, width, BAR_H, 4).fillColor(COLORS.hairline).fill().restore();
  const pct = opts.max > 0 ? Math.max(0, Math.min(1, opts.value / opts.max)) : 0;
  if (pct > 0) {
    doc
      .save()
      .roundedRect(left, barY, Math.max(width * pct, 3), BAR_H, 4)
      .fillColor(opts.color ?? COLORS.brand)
      .fill()
      .restore();
  }
  doc.y = barY + BAR_H + 9;
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

/** `For <Entity>` / signature image (or placeholder) / Authorised Signatory / Date / Place. */
export function drawSignatoryBlock(
  doc: PDFKit.PDFDocument,
  o: {
    x: number;
    y: number;
    entity: string;
    signatoryName: string;
    assetFile: string;
    date: string;
    place: string;
  },
): void {
  const blockW = 220;
  let y = o.y;

  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor(COLORS.ink)
    .text(`For ${o.entity}`, o.x, y, { width: blockW, lineBreak: false });
  y += 20;

  const sigH = 52;
  const assetPath = path.join(SIG_DIR, o.assetFile);
  let drawn = false;
  if (existsSync(assetPath)) {
    try {
      doc.image(assetPath, o.x, y, { fit: [blockW, sigH] });
      drawn = true;
    } catch {
      drawn = false;
    }
  }
  if (!drawn) {
    doc
      .font("Helvetica-Oblique")
      .fontSize(18)
      .fillColor(COLORS.inkSoft)
      .text(o.signatoryName, o.x, y + sigH - 26, { lineBreak: false });
    doc
      .font("Helvetica")
      .fontSize(7)
      .fillColor(COLORS.inkFaint)
      .text("(signature image pending)", o.x, y + sigH - 4, { lineBreak: false });
  }
  y += sigH + 2;

  doc.save().rect(o.x, y, blockW, 1.6).fill(COLORS.brand).restore();
  y += 8;

  doc
    .font("Helvetica-Bold")
    .fontSize(8.5)
    .fillColor(COLORS.inkSoft)
    .text("AUTHORISED SIGNATORY", o.x, y, { characterSpacing: 0.8, lineBreak: false });
  y += 16;

  doc
    .font("Helvetica")
    .fontSize(9.5)
    .fillColor(COLORS.inkMuted)
    .text(`Date:  ${o.date || "____________"}`, o.x, y, { lineBreak: false });
  y += 13;
  doc
    .font("Helvetica")
    .fontSize(9.5)
    .fillColor(COLORS.inkMuted)
    .text(`Place: ${o.place || "____________"}`, o.x, y, { lineBreak: false });
}

/** System footer: hairline + "Generated by … on …". */
export function drawFooter(doc: PDFKit.PDFDocument, prefix: string, generatedBy: string): void {
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const width = right - left;
  const footerY = doc.page.height - doc.page.margins.bottom - 22;
  doc
    .save()
    .strokeColor(COLORS.hairline)
    .lineWidth(0.5)
    .moveTo(left, footerY - 10)
    .lineTo(right, footerY - 10)
    .stroke()
    .restore();
  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor(COLORS.inkFaint)
    .text(
      `${prefix} · Generated by ${generatedBy} on ${formatDate(new Date())} · ${format(new Date(), "HH:mm")}`,
      left,
      footerY,
      { width, lineBreak: false },
    );
}
