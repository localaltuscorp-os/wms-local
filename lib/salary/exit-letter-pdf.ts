import "server-only";
import { existsSync } from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import { format } from "date-fns";
import { formatDate } from "@/lib/format";
import { renderExitLetter, type ExitLetterInput } from "@/lib/salary/exit-letters";
import { signatoryForEntity } from "@/lib/salary/signatories";

/**
 * WS-5 — Exit letter → A4 PDF, rendered with pdfkit to match the payslip house
 * style (/salary/payslip/[runId]): brand stripe, embedded Altus logo, faint
 * centered watermark, full-page border, red section accents, system footer.
 *
 * Each letter closes with the Entity signatory block: `For <Entity>` +
 * signature image + "Authorised Signatory" + Date + Place. NO rubber stamp.
 * If the signature asset is missing, we draw a ruled line + the typed name
 * (placeholder) so the PDF never breaks on a pending asset.
 */

const COLORS = {
  ink: "#0A0A0A",
  inkMuted: "#404040",
  inkSoft: "#525252",
  inkFaint: "#A3A3A3",
  hairline: "#E5E5E5",
  hairlineStrong: "#D4D4D4",
  brand: "#E10600",
  brandDeep: "#A80400",
} as const;

const LOGO_PATH = path.join(process.cwd(), "public", "logo.png");
const MARK_PATH = path.join(process.cwd(), "public", "logo-mark.png");
const SIG_DIR = path.join(process.cwd(), "public", "signatures");

function fmtDate(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return formatDate(d);
}

export async function renderExitLetterPdf(
  input: ExitLetterInput,
  meta: { generatedBy: string },
): Promise<Buffer> {
  const letter = renderExitLetter(input);
  const signatory = signatoryForEntity(input.entity);
  const entity = input.entity.trim() || "Altus Corp";

  const doc = new PDFDocument({
    size: "A4",
    layout: "portrait",
    margin: 56,
    info: {
      Title: `${letter.title} — ${input.employeeName}`,
      Author: "Altus Corp Dashboard",
      Subject: letter.title,
    },
  });

  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });

  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const width = right - left;

  // ── Full-page border ──
  doc
    .save()
    .strokeColor(COLORS.hairlineStrong)
    .lineWidth(1)
    .rect(left - 16, 26, width + 32, doc.page.height - 52)
    .stroke()
    .restore();

  // ── Watermark ──
  if (existsSync(MARK_PATH)) {
    try {
      const wm = 360;
      doc.save();
      doc.opacity(0.05);
      doc.image(MARK_PATH, doc.page.width / 2 - wm / 2, doc.page.height / 2 - wm / 2, {
        width: wm,
      });
      doc.opacity(1);
      doc.restore();
    } catch {
      /* missing/corrupt asset → no watermark */
    }
  }

  // ── Brand stripe ──
  doc.save().rect(0, 0, doc.page.width, 5).fill(COLORS.brand).restore();
  doc.save().rect(0, 5, doc.page.width, 1.2).fill(COLORS.brandDeep).restore();

  // ── Masthead: logo + entity + confidential ──
  const headerTop = doc.page.margins.top + 2;
  let textX = left;
  if (existsSync(LOGO_PATH)) {
    try {
      const logoW = 120;
      doc.image(LOGO_PATH, left, headerTop, { width: logoW });
      textX = left + logoW + 16;
    } catch {
      /* fall back to text-only masthead */
    }
  }
  doc
    .font("Helvetica-Bold")
    .fontSize(18)
    .fillColor(COLORS.ink)
    .text(entity.toUpperCase(), textX, headerTop + 4, {
      characterSpacing: 0.6,
      lineBreak: false,
    });
  doc
    .font("Helvetica")
    .fontSize(8.5)
    .fillColor(COLORS.inkSoft)
    .text("Human Resources  ·  Private & Confidential", textX, doc.y + 3, {
      lineBreak: false,
    });

  doc.y = Math.max(doc.y, headerTop + 52) + 12;

  // ── Title band ──
  const titleY = doc.y;
  doc.save().rect(left, titleY, width, 28).fill(COLORS.brand).restore();
  doc
    .font("Helvetica-Bold")
    .fontSize(12.5)
    .fillColor("#FFFFFF")
    .text(letter.title.toUpperCase(), left + 12, titleY + 8, {
      characterSpacing: 0.8,
      lineBreak: false,
    });
  doc.y = titleY + 28 + 16;

  // ── Date + recipient ──
  doc
    .font("Helvetica")
    .fontSize(10)
    .fillColor(COLORS.inkSoft)
    .text(letter.dateLine, left, doc.y, { width, lineBreak: false });
  doc.y += 14;

  doc.font("Helvetica-Bold").fontSize(10).fillColor(COLORS.ink);
  doc.text("To,", left, doc.y, { lineBreak: false });
  doc.y += 14;
  for (const line of letter.recipientBlock) {
    doc.text(line, left, doc.y, { width, lineBreak: false });
    doc.y += 13;
  }
  doc.y += 8;

  // ── Subject ──
  doc
    .font("Helvetica-Bold")
    .fontSize(10.5)
    .fillColor(COLORS.ink)
    .text(letter.subject, left, doc.y, { width });
  doc.y += 8;

  // ── Salutation ──
  doc
    .font("Helvetica")
    .fontSize(10.5)
    .fillColor(COLORS.inkMuted)
    .text(letter.salutation, left, doc.y, { width });
  doc.y += 6;

  // ── Body paragraphs ──
  for (const para of letter.body) {
    doc
      .font("Helvetica")
      .fontSize(10.5)
      .fillColor(COLORS.inkMuted)
      .text(para, left, doc.y, { width, align: "left", lineGap: 2 });
    doc.y += 8;
  }

  // ── Particulars table (Full & Final breakup) ──
  if (letter.particulars && letter.particulars.length > 0) {
    doc.y += 2;
    const rowH = 20;
    const valX = right - 200;
    doc
      .save()
      .strokeColor(COLORS.hairlineStrong)
      .lineWidth(0.8)
      .rect(left, doc.y, width, rowH * letter.particulars.length + 8)
      .stroke()
      .restore();
    let ry = doc.y + 8;
    for (const p of letter.particulars) {
      doc
        .font("Helvetica")
        .fontSize(10)
        .fillColor(COLORS.inkMuted)
        .text(p.label, left + 12, ry, { width: valX - left - 24, lineBreak: false });
      doc
        .font("Helvetica-Bold")
        .fontSize(10)
        .fillColor(COLORS.ink)
        .text(p.value, valX, ry, { width: right - valX - 12, align: "right", lineBreak: false });
      ry += rowH;
    }
    doc.y = ry + 10;
  }

  doc.y += 6;

  // ── Closing line ──
  doc
    .font("Helvetica")
    .fontSize(10.5)
    .fillColor(COLORS.inkMuted)
    .text(letter.closing, left, doc.y, { lineBreak: false });
  doc.y += 24;

  // ── Signatory block (right-aligned) ──
  drawSignatoryBlock(doc, {
    x: right - 240,
    y: doc.y,
    entity,
    signatoryName: signatory.name,
    assetPath: path.join(SIG_DIR, signatory.assetFile),
    date: fmtDate(input.letterDate),
    place: input.place?.trim() || "",
  });

  // ── Footer ──
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
      `${letter.title} · Generated by ${meta.generatedBy} on ${formatDate(new Date())} · ${format(
        new Date(),
        "HH:mm",
      )}`,
      left,
      footerY,
      { width, lineBreak: false },
    );

  doc.end();
  return done;
}

/** `For <Entity>` / signature image (or placeholder line) / Authorised Signatory / Date / Place. */
function drawSignatoryBlock(
  doc: PDFKit.PDFDocument,
  o: {
    x: number;
    y: number;
    entity: string;
    signatoryName: string;
    assetPath: string;
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

  // Signature image or placeholder
  const sigH = 52;
  if (existsSync(o.assetPath)) {
    try {
      doc.image(o.assetPath, o.x, y, { fit: [blockW, sigH] });
    } catch {
      placeholderSignature(doc, o.x, y, sigH, o.signatoryName);
    }
  } else {
    placeholderSignature(doc, o.x, y, sigH, o.signatoryName);
  }
  y += sigH + 2;

  // Red baseline
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

function placeholderSignature(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  h: number,
  name: string,
): void {
  doc
    .font("Helvetica-Oblique")
    .fontSize(18)
    .fillColor(COLORS.inkSoft)
    .text(name, x, y + h - 26, { lineBreak: false });
  doc
    .font("Helvetica")
    .fontSize(7)
    .fillColor(COLORS.inkFaint)
    .text("(signature image pending)", x, y + h - 4, { lineBreak: false });
}
