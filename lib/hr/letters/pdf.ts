import "server-only";

import { existsSync } from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import { formatDateHr } from "@/lib/format";
import { getEntity, type EntityId, type Entity } from "@/lib/hr/entities";
import { applyPronouns, type Gender } from "@/lib/hr/pronouns";
import { applyFirm, HR_SIGNATORY, HR_SIGNATURE_IMAGE } from "@/lib/hr/firm";
import {
  type LetterTemplate,
  type Block,
  type LetterSignatory,
  type Span,
  hasBodyDateField,
  resolveSpans,
  signatoryOf,
  tableRowVisible,
} from "./types";

/**
 * HR LETTERS — server-only (Node) PDF renderer, pdfkit.
 *
 * Walks a `LetterTemplate`'s `blocks` with the filled field values and paints
 * them onto an A4 page wearing the SAME visual language as the on-screen
 * <Letterhead>: an angular red header band with the paying-entity logo on a
 * white plate + the entity caption, the letter body, and the two-line red footer
 * (contact line + solid address bar). Mirrors the proven pattern in
 * lib/hr/candidate/resume-pdf.ts — default Helvetica fonts, guarded image embeds,
 * every asset read wrapped so bad input never breaks the PDF.
 *
 * Imported LAZILY by the /api/hr/letters/pdf + issue routes so pdfkit (which
 * bundles thousands of font glyphs) never reaches a client graph. Load-neutral.
 */

const RED = "#E10600";
const RED_DEEP = "#A80400";
const RED_BRIGHT = "#F5150F";
const INK = "#0F172A";
const INK_MUTED = "#334155";
const INK_FAINT = "#94A3B8";
const HAIRLINE = "#E2E8F0";

/** A4 in points. */
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN_X = 56;
const HEADER_H = 112; // ≈ the letterhead's 150/794 band, scaled to A4
const FOOTER_H = 58;

/** Resolve the entity logo file on disk (public/logos/<id>.png), guarded. */
function entityLogoPath(entity: Entity): string | null {
  // entity.logo is like "/logos/altus-corp.png"
  const rel = entity.logo.replace(/^\//, "");
  const p = path.join(process.cwd(), "public", rel);
  if (existsSync(p)) return p;
  const fallback = path.join(process.cwd(), "public", "logo.png");
  return existsSync(fallback) ? fallback : null;
}

export interface RenderLetterInput {
  template: LetterTemplate;
  entity?: EntityId | string | null;
  /** field-id → filled value (the red text). */
  values: Record<string, string>;
  /** Formatted letter date, e.g. "25 July 2026" (defaults to today). */
  date?: string;
  /** Candidate gender — resolves pronoun/salutation tokens (Mr./Ms., his/her…). */
  gender?: Gender;
  /**
   * An OPTIONAL scanned-signature image (a `data:image/...;base64,…` URL) the HR
   * desk uploaded for the signatory. When present it replaces the baked-in
   * proprietor signature in the sign-off. Degrades gracefully when omitted.
   */
  signatureImage?: string;
}

/** Decode a `data:image/...;base64,…` URL into a Buffer pdfkit can embed. */
function dataUrlToBuffer(dataUrl?: string): Buffer | null {
  if (!dataUrl) return null;
  const m = /^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$/.exec(dataUrl.trim());
  if (!m || !m[1]) return null;
  try {
    return Buffer.from(m[1], "base64");
  } catch {
    return null;
  }
}

/** Render a filled letter to a print-ready A4 PDF Buffer. */
export async function renderLetterPdf(input: RenderLetterInput): Promise<Buffer> {
  const entity = getEntity(input.entity ?? input.template.entityDefault ?? null);
  const values = input.values ?? {};
  const gender: Gender = input.gender ?? "neutral";
  const letterDate = input.date?.trim() || formatDateHr(new Date());

  const doc = new PDFDocument({
    size: "A4",
    layout: "portrait",
    margin: MARGIN_X,
    info: {
      Title: input.template.title,
      Author: `${entity.displayName} · Altus Corp Dashboard`,
      Subject: `${entity.displayName} · ${input.template.title}`,
    },
  });
  // Top/bottom content margins carve out room for the fixed band + footer.
  const TOP = HEADER_H + 34;
  const BOTTOM_MARGIN = FOOTER_H + 28;
  const setMargins = (): void => {
    doc.page.margins.top = TOP;
    doc.page.margins.bottom = BOTTOM_MARGIN;
  };
  setMargins();

  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });

  const left = MARGIN_X;
  const right = PAGE_W - MARGIN_X;
  const width = right - left;

  const paintFrame = (): void => {
    // Collapse the page margins while stamping the FIXED header/footer. Their
    // text is absolutely positioned near the page edges (the footer sits BELOW
    // the body's bottom margin); pdfkit 0.18 runs a vertical-overflow check on
    // it even with lineBreak:false, auto-adds a page to "make room", which
    // re-fires `pageAdded` → repaints → overflows → … infinite recursion
    // ("Maximum call stack size exceeded"). Zeroing the margins during the paint
    // removes the overflow check; we restore the real body margins right after.
    doc.page.margins.top = 0;
    doc.page.margins.bottom = 0;
    drawHeaderBand(doc, entity);
    drawFooter(doc, entity);
    setMargins();
  };
  doc.on("pageAdded", () => {
    paintFrame();
    doc.y = TOP;
  });
  paintFrame();
  doc.y = TOP;

  const bottom = (): number => PAGE_H - BOTTOM_MARGIN;
  const ensure = (need: number): void => {
    if (doc.y + need > bottom()) doc.addPage();
  };

  /* ---- Letter date, right-aligned at the top of the body ----
     Skipped for templates that print their own editable `Date:` row in the
     body (Intern Appointment, Confirmation, F&F…) — stamping it here too
     printed the date twice. Matches the on-screen editor. */
  if (!hasBodyDateField(input.template)) {
    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor(INK_MUTED)
      .text(letterDate, left, doc.y, { width, align: "right", lineBreak: false });
    doc.y += 22;
  }

  /* ---- Body blocks ---- */
  const signatory = signatoryOf(input.template);
  for (const block of input.template.blocks) {
    renderBlock(doc, block, {
      left,
      width,
      values,
      entity,
      letterDate,
      ensure,
      gender,
      signatory,
      signatureImage: input.signatureImage,
    });
  }

  doc.end();
  return done;
}

/* ------------------------------------------------------------------ */
/* Block rendering                                                      */
/* ------------------------------------------------------------------ */

interface Ctx {
  left: number;
  width: number;
  values: Record<string, string>;
  entity: Entity;
  letterDate: string;
  ensure: (need: number) => void;
  gender: Gender;
  /** Who signs — drives the signature block (director vs HR desk). */
  signatory: LetterSignatory;
  /** Optional uploaded scanned-signature image (data URL). */
  signatureImage?: string;
}

function renderBlock(doc: PDFKit.PDFDocument, block: Block, ctx: Ctx): void {
  const { left, width, values, gender, entity } = ctx;
  /** Resolve a span array AND its gendered + firm-name tokens. */
  const resolve = (spans: Span[]): string =>
    applyFirm(applyPronouns(resolveSpans(spans, values), gender), entity);
  switch (block.kind) {
    case "spacer": {
      doc.y += block.size === "lg" ? 22 : block.size === "sm" ? 6 : 12;
      return;
    }
    case "heading": {
      const size = block.level === 1 ? 15 : block.level === 3 ? 11 : 12.5;
      ctx.ensure(size + 16);
      doc.y += 6;
      doc
        .font("Helvetica-Bold")
        .fontSize(size)
        .fillColor(INK)
        .text(applyFirm(applyPronouns(block.text, gender), entity), left, doc.y, { width, lineGap: 2 });
      doc.y += 6;
      return;
    }
    case "paragraph": {
      const text = resolve(block.spans);
      if (!text.trim()) {
        doc.y += 8;
        return;
      }
      const h = doc.fontSize(11).heightOfString(text, { width, lineGap: 3 });
      ctx.ensure(h + 6);
      doc
        .font("Helvetica")
        .fontSize(11)
        .fillColor(INK_MUTED)
        .text(text, left, doc.y, {
          width,
          lineGap: 3,
          align:
            block.align === "center"
              ? "center"
              : block.align === "right"
                ? "right"
                : "left",
        });
      doc.y += 8;
      return;
    }
    case "term": {
      // Employment terms print as a professional bordered 2-column table row
      // (Field | Detail). Consecutive terms stack into one visual table.
      const value = resolve(block.value);
      const label = applyFirm(applyPronouns(block.label, gender), entity);
      const LABEL_W = Math.round(width * 0.38);
      const VAL_W = width - LABEL_W;
      const PAD = 7;
      doc.font("Helvetica-Bold").fontSize(10.5);
      const lh = doc.heightOfString(label, { width: LABEL_W - PAD * 2 });
      doc.font("Helvetica").fontSize(10.5);
      const vh = doc.heightOfString(value || " ", { width: VAL_W - PAD * 2 });
      const rowH = Math.max(lh, vh) + PAD * 2;
      ctx.ensure(rowH);
      const top = doc.y;
      // Label cell background + both cell borders.
      doc.save();
      doc.rect(left, top, LABEL_W, rowH).fill("#f6f5f7");
      doc.restore();
      doc.lineWidth(0.7).strokeColor("#d4d4d8");
      doc.rect(left, top, LABEL_W, rowH).stroke();
      doc.rect(left + LABEL_W, top, VAL_W, rowH).stroke();
      doc.font("Helvetica-Bold").fontSize(10.5).fillColor(INK)
        .text(label, left + PAD, top + PAD, { width: LABEL_W - PAD * 2 });
      doc.font("Helvetica").fontSize(10.5).fillColor(INK)
        .text(value, left + LABEL_W + PAD, top + PAD, { width: VAL_W - PAD * 2 });
      doc.y = top + rowH;
      return;
    }
    case "bullets": {
      for (const item of block.items) {
        const text = resolve(item);
        const bw = width - 16;
        const h = doc.fontSize(11).heightOfString(text, { width: bw, lineGap: 2 });
        ctx.ensure(h + 5);
        const top = doc.y;
        doc.font("Helvetica-Bold").fontSize(11).fillColor(RED).text("•", left, top, {
          width: 10,
          lineBreak: false,
        });
        doc
          .font("Helvetica")
          .fontSize(11)
          .fillColor(INK_MUTED)
          .text(text, left + 16, top, { width: bw, lineGap: 2 });
        doc.y = Math.max(doc.y, top + h) + 4;
      }
      doc.y += 4;
      return;
    }
    case "table": {
      renderTable(doc, block, ctx);
      return;
    }
    case "signature": {
      renderSignature(doc, block, ctx);
      return;
    }
  }
}

/**
 * Draw a bordered table. Component rows (those carrying `amountFieldId`) whose
 * amount is blank/zero are dropped — the produced PDF never prints ₹0 lines.
 * First column is left-aligned; the rest are right-aligned money columns.
 * group / total / grand rows carry distinct fills. Page-break aware per row.
 */
function renderTable(
  doc: PDFKit.PDFDocument,
  block: Extract<Block, { kind: "table" }>,
  ctx: Ctx,
): void {
  const { left, width, values, gender, entity } = ctx;
  const resolve = (spans: Span[]): string =>
    applyFirm(applyPronouns(resolveSpans(spans, values), gender), entity);
  const cols = block.columns.length;
  const firstW = cols > 1 ? Math.round(width * 0.5) : width;
  const restW = cols > 1 ? (width - firstW) / (cols - 1) : 0;
  const colX = (i: number): number => left + (i === 0 ? 0 : firstW + restW * (i - 1));
  const colW = (i: number): number => (i === 0 ? firstW : restW);
  const padX = 9;
  const padY = 6;

  doc.y += 6;

  const drawBorders = (y: number, h: number, top: boolean): void => {
    doc.save();
    doc.lineWidth(0.6).strokeColor(HAIRLINE);
    if (top) doc.moveTo(left, y).lineTo(left + width, y).stroke();
    for (let i = 0; i <= cols; i++) {
      const x = i === cols ? left + width : colX(i);
      doc.moveTo(x, y).lineTo(x, y + h).stroke();
    }
    doc.moveTo(left, y + h).lineTo(left + width, y + h).stroke();
    doc.restore();
  };

  /* ---- Header ---- */
  const headerH = 20;
  ctx.ensure(headerH + 20);
  let y = doc.y;
  doc.save();
  doc.rect(left, y, width, headerH).fill("#F2F3F6");
  doc.restore();
  doc.font("Helvetica-Bold").fontSize(8).fillColor(INK_MUTED);
  for (let i = 0; i < cols; i++) {
    doc.text((block.columns[i] ?? "").toUpperCase(), colX(i) + padX, y + 7, {
      width: colW(i) - padX * 2,
      align: i === 0 ? "left" : "right",
      lineBreak: false,
    });
  }
  drawBorders(y, headerH, true);
  doc.y = y + headerH;

  /* ---- Body rows ---- */
  for (const row of block.rows) {
    if (!tableRowVisible(row, values)) continue;
    const kind = row.kind ?? "normal";
    const isGroup = kind === "group";
    const cellText = (i: number): string => resolve(row.cells[i] ?? []);

    // Measure the tallest cell to size the row.
    let contentH = 0;
    if (isGroup) {
      doc.font("Helvetica-Bold").fontSize(8.5);
      contentH = doc.heightOfString(cellText(0) || " ", { width: width - padX * 2 });
    } else {
      for (let i = 0; i < cols; i++) {
        doc.font(i === 0 && kind === "normal" ? "Helvetica" : "Helvetica-Bold").fontSize(9.5);
        const h = doc.heightOfString(cellText(i) || " ", { width: colW(i) - padX * 2 });
        if (h > contentH) contentH = h;
      }
    }
    const rowH = Math.max(contentH + padY * 2, 18);
    ctx.ensure(rowH);
    y = doc.y;

    const bg = kind === "grand" ? RED_DEEP : kind === "total" ? "#FCEBEA" : isGroup ? "#F4F5F7" : null;
    if (bg) {
      doc.save();
      doc.rect(left, y, width, rowH).fill(bg);
      doc.restore();
    }

    if (isGroup) {
      doc
        .font("Helvetica-Bold")
        .fontSize(8.5)
        .fillColor(RED_DEEP)
        .text(cellText(0).toUpperCase(), left + padX, y + padY, { width: width - padX * 2 });
    } else {
      for (let i = 0; i < cols; i++) {
        const color = kind === "grand" ? "#FFFFFF" : i === 0 ? INK : INK_MUTED;
        const bold = kind === "grand" || kind === "total" || i > 0;
        doc
          .font(bold ? "Helvetica-Bold" : "Helvetica")
          .fontSize(9.5)
          .fillColor(color)
          .text(cellText(i), colX(i) + padX, y + padY, {
            width: colW(i) - padX * 2,
            align: i === 0 ? "left" : "right",
          });
      }
    }
    drawBorders(y, rowH, false);
    doc.y = y + rowH;
  }
  doc.y += 8;
}

function renderSignature(
  doc: PDFKit.PDFDocument,
  block: Extract<Block, { kind: "signature" }>,
  ctx: Ctx,
): void {
  const { left, values, entity, letterDate, gender } = ctx;
  const resolve = (spans: Span[]): string =>
    applyFirm(applyPronouns(resolveSpans(spans, values), gender), entity);
  ctx.ensure(120);
  doc.y += 16;
  const line = (text: string, opts: { bold?: boolean; color?: string; size?: number; gap?: number } = {}) => {
    if (!text.trim()) return;
    doc
      .font(opts.bold ? "Helvetica-Bold" : "Helvetica")
      .fontSize(opts.size ?? 11)
      .fillColor(opts.color ?? INK)
      .text(text, left, doc.y, { lineBreak: false });
    doc.y += opts.gap ?? 15;
  };

  const isHr = ctx.signatory === "hr";
  // A block carrying its OWN baked signature (e.g. the Selection letter's founder
  // sign-off) prints its own name + designation, never the generic HR-desk block.
  const bakedRel = block.imageSrc; // e.g. "/signatures/manan-sign.jpeg"
  const ownSignatory = Boolean(bakedRel) || !isHr;

  if (block.forEntity) line(`For ${entity.displayName}`, { bold: true, color: RED_DEEP });
  // Signature image, in precedence order: an uploaded scanned signature wins;
  // else a per-letter baked signature (the Selection letter's founder block);
  // else the standing signature for whoever signs this letter — the proprietor
  // for Director letters, the HR desk for everything else.
  //
  // HR letters used to fall through to a BLANK strip here, which is why e-sign
  // "wasn't automated": every HR letter needed a scan uploaded per issue or a
  // wet signature on the printout. They now carry HR_SIGNATURE_IMAGE by default.
  void INK_FAINT;
  try {
    const uploaded = dataUrlToBuffer(ctx.signatureImage);
    const standingRel = isHr ? HR_SIGNATURE_IMAGE : "/signatures/proprietor-signature.jpg";
    const rel = bakedRel ?? standingRel;
    const bakedPath = path.join(process.cwd(), "public", ...rel.replace(/^\//, "").split("/"));
    if (uploaded) {
      ctx.ensure(62);
      doc.image(uploaded, left, doc.y, { height: 46 });
      doc.y += 52;
    } else if (existsSync(bakedPath)) {
      ctx.ensure(62);
      doc.image(bakedPath, left, doc.y, { height: 46 });
      doc.y += 52;
    } else if (isHr) {
      // File missing at runtime — reserve the blank strip rather than collapsing
      // the layout, so the letter can still be signed by hand.
      doc.y += 30;
    } else {
      doc.y += 8;
    }
  } catch {
    doc.y += 8;
  }

  const name = ownSignatory ? resolve(block.name) : HR_SIGNATORY.name;
  line(name, { bold: true });
  const desig = bakedRel
    ? resolve(block.designation ?? [])
    : isHr
      ? HR_SIGNATORY.designation
      : "Proprietor";
  line(desig, { color: INK_MUTED, size: 10 });
  if (block.showDate) line(`Date: ${letterDate}`, { color: INK_MUTED, size: 10 });
  if (block.place) {
    const place = resolve(block.place);
    if (place.trim()) line(`Place: ${place}`, { color: INK_MUTED, size: 10 });
  }
  // HR desk contact (email + HR Manager) already prints in the red letterhead
  // footer — no greyed duplicate under the sign-off.
}

/* ------------------------------------------------------------------ */
/* Frame — header band + footer (echoes <Letterhead>)                   */
/* ------------------------------------------------------------------ */

function drawHeaderBand(doc: PDFKit.PDFDocument, entity: Entity): void {
  // Preferred: embed the SAME baked header strip the on-screen <Letterhead>
  // renders (public/letterhead/header-<id>.jpg — opaque JPEG, pdfkit-safe), at
  // full page width, so the exported/issued PDF matches the preview pixel-for-
  // pixel. The strip carries the entity's own logo + the angular red ribbon.
  const strip = path.join(process.cwd(), "public", "letterhead", `header-${entity.id}.jpg`);
  if (existsSync(strip)) {
    try {
      doc.image(strip, 0, 0, { width: PAGE_W });
      return;
    } catch {
      /* bad strip → fall through to the code-drawn band below */
    }
  }

  // Fallback (strip missing/unreadable): the original code-drawn red header.
  doc.save();
  // Base red band.
  doc.rect(0, 0, PAGE_W, HEADER_H).fill(RED);
  // Bright accent triangle from the far left.
  doc
    .moveTo(0, 0)
    .lineTo(PAGE_W * 0.34, 0)
    .lineTo(0, HEADER_H)
    .fill(RED_BRIGHT);
  // Darker maroon sweep from the right.
  doc
    .moveTo(PAGE_W * 0.45, 0)
    .lineTo(PAGE_W, 0)
    .lineTo(PAGE_W, HEADER_H)
    .lineTo(PAGE_W * 0.7, HEADER_H)
    .fill(RED_DEEP);
  doc.restore();

  // White logo plate + entity logo, top-left.
  const plate = 68;
  const plateX = MARGIN_X - 8;
  const plateY = (HEADER_H - plate) / 2;
  doc.save();
  doc.roundedRect(plateX, plateY, plate, plate, 12).fill("#FFFFFF");
  const logo = entityLogoPath(entity);
  if (logo) {
    try {
      doc.image(logo, plateX + 8, plateY + 8, { fit: [plate - 16, plate - 16], align: "center", valign: "center" });
    } catch {
      /* bad asset → blank plate */
    }
  }
  doc.restore();

  // Entity caption (white), right of the plate.
  const capX = plateX + plate + 16;
  const capW = PAGE_W - capX - MARGIN_X;
  doc
    .font("Helvetica-Bold")
    .fontSize(16)
    .fillColor("#FFFFFF")
    .text(entity.displayName, capX, HEADER_H / 2 - (entity.legalName !== entity.displayName ? 14 : 8), {
      width: capW,
      lineBreak: false,
      ellipsis: true,
    });
  if (entity.legalName !== entity.displayName) {
    doc
      .font("Helvetica")
      .fontSize(8.5)
      .fillColor("#FFECEC")
      .text(entity.legalName, capX, HEADER_H / 2 + 6, { width: capW, lineBreak: false, ellipsis: true });
  }
}

function drawFooter(doc: PDFKit.PDFDocument, entity: Entity): void {
  const contactY = PAGE_H - FOOTER_H;
  const addressH = 26;
  // Contact line (white bg, red text) on a thin top hairline.
  doc.save();
  doc
    .strokeColor(HAIRLINE)
    .lineWidth(0.8)
    .moveTo(0, contactY)
    .lineTo(PAGE_W, contactY)
    .stroke();
  doc
    .font("Helvetica-Bold")
    .fontSize(8.5)
    .fillColor(RED_DEEP)
    .text(entity.contactLine, 0, contactY + 9, { width: PAGE_W, align: "center", lineBreak: false });
  doc.restore();
  // Address bar (solid red, white text) at the very bottom.
  doc.save();
  doc.rect(0, PAGE_H - addressH, PAGE_W, addressH).fill(RED_DEEP);
  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor("#FFFFFF")
    .text(entity.addressLine, 0, PAGE_H - addressH + 9, { width: PAGE_W, align: "center", lineBreak: false });
  doc.restore();
}
