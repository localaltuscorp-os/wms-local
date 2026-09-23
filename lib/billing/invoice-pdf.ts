import "server-only";
import { documentNotes } from "@/lib/billing/notes";
import { existsSync } from "node:fs";
import path from "node:path";
import { COLORS, newDoc, entityLogoPath } from "@/lib/salary/pdf-house-style";
import type { BillingDocument, BillingDocumentLine } from "@/db/schema";
import { buildInvoiceViewModel, fmtMoney, type InvoiceViewModel } from "@/lib/billing/view-model";

/**
 * BILLING — the printed document.
 *
 * A4 portrait, pdfkit, built on the house style's primitives (`newDoc`, the
 * palette, `entityLogoPath`) but with its own layout, because an invoice is not
 * a payslip: the reference document the business already issues is a centred
 * title, a two-column party/meta header, one service table, a right-aligned
 * totals ladder, an identity block, a bank block and a signature.
 *
 * Every value comes from the document row or its snapshots. Nothing here is
 * hard-coded — no name, no PAN, no GSTIN, no bank, no SAC, no amount — and
 * every asset read is guarded, so a missing logo or signature file degrades to
 * type rather than 500-ing an invoice.
 */

const A4_MARGIN = 44;
const BRAND = COLORS.brand;

function publicAsset(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  // A remote URL can't be embedded synchronously; the caller falls back to type.
  if (/^https?:\/\//i.test(trimmed)) return null;
  const rel = trimmed.replace(/^\//, "");
  const p = path.join(process.cwd(), "public", rel);
  return existsSync(p) ? p : null;
}

/** The red masthead flash from the letterhead, drawn rather than imported. */
function drawBrandFlash(doc: PDFKit.PDFDocument, x: number, y: number, w: number): void {
  const h = 26;
  doc.save();
  doc
    .moveTo(x, y + h * 0.35)
    .lineTo(x + w, y)
    .lineTo(x + w, y + h)
    .lineTo(x + w * 0.12, y + h * 0.78)
    .closePath()
    .fill(BRAND);
  doc.restore();
}

function hr(doc: PDFKit.PDFDocument, y: number, strong = false): void {
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  doc
    .save()
    .strokeColor(strong ? COLORS.hairlineStrong : COLORS.hairline)
    .lineWidth(strong ? 0.9 : 0.6)
    .moveTo(left, y)
    .lineTo(right, y)
    .stroke()
    .restore();
}

/** A "Label : Value" row, with the colons in one column as on the reference. */
function labelledRow(
  doc: PDFKit.PDFDocument,
  o: {
    x: number;
    y: number;
    labelWidth: number;
    valueWidth: number;
    label: string;
    value: string;
    bold?: boolean;
    size?: number;
  },
): number {
  const size = o.size ?? 9.5;
  doc.font("Helvetica").fontSize(size).fillColor(COLORS.inkMuted);
  doc.text(o.label, o.x, o.y, { width: o.labelWidth, lineBreak: false });
  doc.text(":", o.x + o.labelWidth, o.y, { width: 8, lineBreak: false });
  doc
    .font(o.bold ? "Helvetica-Bold" : "Helvetica")
    .fontSize(size)
    .fillColor(COLORS.ink);
  doc.text(o.value, o.x + o.labelWidth + 10, o.y, { width: o.valueWidth });
  return Math.max(doc.y, o.y + size + 3);
}

function drawMasthead(doc: PDFKit.PDFDocument, vm: InvoiceViewModel): void {
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const top = doc.page.margins.top;

  const LOGO_H = 46;
  let logoW = 0;
  const logoPath = publicAsset(vm.seller.logoUrl) ?? entityLogoPath(vm.seller.entityId);
  if (logoPath && existsSync(logoPath)) {
    try {
      const img = (doc as unknown as { openImage: (p: string) => { width: number; height: number } }).openImage(logoPath);
      logoW = img?.width && img?.height ? Math.round((img.width / img.height) * LOGO_H) : LOGO_H;
      doc.image(logoPath, left, top, { height: LOGO_H });
    } catch {
      logoW = 0;
    }
  }
  if (!logoW) {
    doc
      .font("Helvetica-Bold")
      .fontSize(17)
      .fillColor(COLORS.ink)
      .text(vm.seller.legalName.toUpperCase(), left, top + 12, { characterSpacing: 0.6, lineBreak: false });
    logoW = doc.widthOfString(vm.seller.legalName.toUpperCase());
  }

  const flashX = left + logoW + 18;
  const flashW = right - flashX;
  if (flashW > 60) drawBrandFlash(doc, flashX, top + 8, flashW);

  doc.y = top + LOGO_H + 16;
}

function drawTitle(doc: PDFKit.PDFDocument, vm: InvoiceViewModel): void {
  const left = doc.page.margins.left;
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  doc
    .font("Helvetica-Bold")
    .fontSize(19)
    .fillColor(COLORS.ink)
    .text(vm.title, left, doc.y, { width, align: "center", characterSpacing: 1.1 });
  doc.y += 4;

  if (vm.status === "cancelled") {
    doc
      .font("Helvetica-Bold")
      .fontSize(10)
      .fillColor(BRAND)
      .text("CANCELLED", left, doc.y, { width, align: "center", characterSpacing: 1.4 });
    doc.y += 4;
  }
  doc.y += 10;
  hr(doc, doc.y, true);
  doc.y += 12;
}

function drawParties(doc: PDFKit.PDFDocument, vm: InvoiceViewModel): void {
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const midX = left + (right - left) * 0.58;

  const startY = doc.y;
  let y = startY;
  for (const row of vm.billTo) {
    y = labelledRow(doc, {
      x: left,
      y,
      labelWidth: 62,
      valueWidth: midX - left - 80,
      label: row.label,
      value: row.value,
      bold: row.label === "To",
    });
  }
  const leftBottom = y;

  y = startY;
  for (const row of vm.meta) {
    y = labelledRow(doc, {
      x: midX,
      y,
      labelWidth: 78,
      valueWidth: right - midX - 90,
      label: row.label,
      value: row.value,
    });
    y += 4;
  }

  doc.y = Math.max(leftBottom, y) + 12;
  hr(doc, doc.y, true);
  doc.y += 10;
}

function drawLineTable(doc: PDFKit.PDFDocument, vm: InvoiceViewModel): void {
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const amountW = 110;
  const amountX = right - amountW;

  if (vm.isSimpleService) {
    // The reference shape: one service description column, one amount column.
    // Both captions hang off ONE captured y: `doc.text` advances doc.y, so
    // reading it again for the second caption would stagger the pair.
    const headY = doc.y;
    doc.font("Helvetica").fontSize(9.5).fillColor(COLORS.inkSoft);
    doc.text(`${vm.descriptionNoun}\nDescription`, left + (amountX - left) / 2 - 60, headY, {
      width: 120,
      align: "center",
    });
    doc.text("Total\nAmount Due", amountX, headY, { width: amountW, align: "right" });
    doc.y = headY + 26;
    hr(doc, doc.y);
    doc.y += 8;

    if (vm.showServiceDescription && vm.serviceDescription) {
      doc.font("Helvetica").fontSize(10).fillColor(COLORS.ink);
      doc.text(vm.serviceDescription, left, doc.y, { width: amountX - left - 12 });
      doc.y += 2;
    }
    for (const line of vm.lines) {
      const rowY = doc.y;
      doc.font("Helvetica").fontSize(10).fillColor(COLORS.ink);
      const label = [line.name, line.description].filter(Boolean).join(" — ");
      doc.text(label, left, rowY, { width: amountX - left - 12 });
      const textBottom = doc.y;
      doc
        .font("Helvetica")
        .fontSize(10)
        .fillColor(COLORS.ink)
        .text(fmtMoney(line.amount), amountX, rowY, { width: amountW, align: "right" });
      doc.y = Math.max(textBottom, rowY + 14) + 4;
      ensureRoom(doc, vm, 120);
    }
    doc.y += 4;
    return;
  }

  // The full grid, for anything with quantities, units or discounts.
  const cols = {
    sr: { x: left, w: 22 },
    desc: { x: left + 22, w: right - left - 22 - 60 - 46 - 62 - 92 },
    sac: { x: 0, w: 60 },
    qty: { x: 0, w: 46 },
    rate: { x: 0, w: 62 },
    amount: { x: 0, w: 92 },
  };
  cols.sac.x = cols.desc.x + cols.desc.w;
  cols.qty.x = cols.sac.x + cols.sac.w;
  cols.rate.x = cols.qty.x + cols.qty.w;
  cols.amount.x = cols.rate.x + cols.rate.w;

  const header = () => {
    const y = doc.y;
    doc.font("Helvetica-Bold").fontSize(8.5).fillColor(COLORS.inkSoft);
    doc.text("#", cols.sr.x, y, { width: cols.sr.w, lineBreak: false });
    doc.text("DESCRIPTION", cols.desc.x, y, { width: cols.desc.w, lineBreak: false });
    doc.text("SAC", cols.sac.x, y, { width: cols.sac.w, lineBreak: false });
    doc.text("QTY", cols.qty.x, y, { width: cols.qty.w, align: "right", lineBreak: false });
    doc.text("RATE", cols.rate.x, y, { width: cols.rate.w, align: "right", lineBreak: false });
    doc.text("AMOUNT", cols.amount.x, y, { width: cols.amount.w, align: "right", lineBreak: false });
    doc.y = y + 13;
    hr(doc, doc.y);
    doc.y += 7;
  };

  header();
  if (vm.showServiceDescription && vm.serviceDescription) {
    doc
      .font("Helvetica-Oblique")
      .fontSize(9)
      .fillColor(COLORS.inkSoft)
      .text(vm.serviceDescription, left, doc.y, { width: right - left });
    doc.y += 5;
  }

  for (const line of vm.lines) {
    if (doc.y > doc.page.height - 260) {
      doc.addPage();
      drawMasthead(doc, vm);
      doc.y += 4;
      header();
    }
    const y = doc.y;
    doc.font("Helvetica").fontSize(9).fillColor(COLORS.ink);
    doc.text(String(line.index), cols.sr.x, y, { width: cols.sr.w, lineBreak: false });
    const label = [line.code ? `${line.code} · ${line.name}` : line.name, line.description]
      .filter(Boolean)
      .join("\n");
    doc.text(label, cols.desc.x, y, { width: cols.desc.w - 8 });
    const descBottom = doc.y;
    doc.font("Helvetica").fontSize(9).fillColor(COLORS.inkMuted);
    doc.text(line.sacCode ?? "", cols.sac.x, y, { width: cols.sac.w, lineBreak: false });
    doc.text(String(line.quantity), cols.qty.x, y, { width: cols.qty.w, align: "right", lineBreak: false });
    doc.text(fmtMoney(line.rate), cols.rate.x, y, { width: cols.rate.w, align: "right", lineBreak: false });
    doc.font("Helvetica").fontSize(9).fillColor(COLORS.ink);
    doc.text(fmtMoney(line.amount), cols.amount.x, y, {
      width: cols.amount.w,
      align: "right",
      lineBreak: false,
    });
    doc.y = Math.max(descBottom, y + 12) + 5;
  }
  doc.y += 2;
}

/** Push to a new page when the remaining blocks would not fit. */
function ensureRoom(doc: PDFKit.PDFDocument, vm: InvoiceViewModel, needed: number): void {
  if (doc.y > doc.page.height - doc.page.margins.bottom - needed) {
    doc.addPage();
    drawMasthead(doc, vm);
    doc.y += 6;
  }
}

function drawTotals(doc: PDFKit.PDFDocument, vm: InvoiceViewModel): void {
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const amountW = 110;
  const amountX = right - amountW;
  const labelX = amountX - 190;

  const row = (label: string, value: string, opts?: { bold?: boolean; size?: number }) => {
    const size = opts?.size ?? 9.5;
    // ONE baseline for the pair. `doc.text` advances doc.y, so reading doc.y
    // again for the value would print it a line below its own label.
    const y = doc.y;
    const font = opts?.bold ? "Helvetica-Bold" : "Helvetica";
    doc
      .font(font)
      .fontSize(size)
      .fillColor(opts?.bold ? COLORS.ink : COLORS.inkMuted)
      .text(label, labelX, y, { width: 186, align: "right", lineBreak: false });
    doc
      .font(font)
      .fontSize(size)
      .fillColor(COLORS.ink)
      .text(value, amountX, y, { width: amountW, align: "right", lineBreak: false });
    doc.y = y + size + 5;
  };

  // A hyphen, not U+2212: pdfkit's built-in Helvetica is WinAnsi-encoded and
  // renders a true minus sign as a stray quote mark (the same trap the house
  // style hit with the rupee glyph).
  if (vm.discountTotal > 0) row("Discount", `- ${fmtMoney(vm.discountTotal)}`);
  if (vm.taxRows.length > 0 || vm.discountTotal > 0) {
    row(vm.taxRows.length > 0 ? "Taxable Value" : "Subtotal", fmtMoney(vm.taxableValue));
  }
  for (const t of vm.taxRows) row(t.label, t.value);
  if (vm.roundOff !== 0) row("Round Off", fmtMoney(vm.roundOff));

  doc.y += 3;
  hr(doc, doc.y);
  doc.y += 7;
  row("Total Amount Payable", fmtMoney(vm.total), { bold: true, size: 11 });
  doc.y += 4;
  hr(doc, doc.y, true);
  doc.y += 10;

  if (vm.gstMode === "none") {
    doc
      .font("Helvetica-Oblique")
      .fontSize(8.5)
      .fillColor(COLORS.inkFaint)
      .text("GST is not applicable on this document.", left, doc.y, { width: right - left });
    doc.y += 12;
  }
}

function drawBlock(
  doc: PDFKit.PDFDocument,
  rows: { label: string; value: string }[],
  labelWidth: number,
): void {
  if (rows.length === 0) return;
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  let y = doc.y;
  for (const r of rows) {
    y = labelledRow(doc, {
      x: left,
      y,
      labelWidth,
      valueWidth: right - left - labelWidth - 14,
      label: r.label,
      value: r.value,
    });
    y += 1;
  }
  doc.y = y + 8;
}

function drawSignature(doc: PDFKit.PDFDocument, vm: InvoiceViewModel): void {
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  hr(doc, doc.y, true);
  doc.y += 12;

  const blockW = 220;
  let y = doc.y;
  doc
    .font("Helvetica-Bold")
    .fontSize(9)
    .fillColor(COLORS.ink)
    .text(`For ${vm.seller.legalName}`, left, y, { width: blockW, lineBreak: false });
  y += 16;

  const sigH = 44;
  const sigPath =
    publicAsset(vm.seller.signatureImageUrl) ??
    (() => {
      const guess = path.join(process.cwd(), "public", "signatures", `${vm.seller.entityId}.png`);
      return existsSync(guess) ? guess : null;
    })();
  let drawn = false;
  if (sigPath) {
    try {
      doc.image(sigPath, left, y, { fit: [blockW, sigH] });
      drawn = true;
    } catch {
      drawn = false;
    }
  }
  if (!drawn && vm.seller.signatoryName) {
    doc
      .font("Helvetica-Oblique")
      .fontSize(16)
      .fillColor(COLORS.inkSoft)
      .text(vm.seller.signatoryName, left, y + sigH - 22, { width: blockW, lineBreak: false });
  }
  y += sigH + 4;

  // Under the signature: the Admin Master's designation, else "Proprietor"
  // (Manan's reference template).
  doc
    .font("Helvetica-Bold")
    .fontSize(9)
    .fillColor(COLORS.ink)
    .text(vm.seller.signatoryDesignation || "Proprietor", left, y, { width: blockW, lineBreak: false });
  y += 13;
  doc.y = y;
  void right;
}

function drawFooterBar(doc: PDFKit.PDFDocument, vm: InvoiceViewModel): void {
  const pageW = doc.page.width;
  const barH = 15;
  const barY = doc.page.height - barH - 12;

  // The footer sits BELOW the bottom margin, and pdfkit auto-breaks to a new
  // page the moment text is written past that margin — which, from a pageAdded
  // handler, is an infinite recursion rather than a layout quirk. Lifting the
  // margin for the duration of the stamp is what makes the strip writable.
  const keepBottom = doc.page.margins.bottom;
  doc.page.margins.bottom = 0;

  if (vm.contactLine) {
    doc
      .font("Helvetica")
      .fontSize(7.5)
      .fillColor(COLORS.inkMuted)
      .text(vm.contactLine, 0, barY - 14, { width: pageW, align: "center", lineBreak: false });
  }
  doc.save().rect(0, barY, pageW, barH).fill(BRAND).restore();
  const address = vm.seller.addressLine ?? "";
  if (address) {
    doc
      .font("Helvetica")
      .fontSize(7.5)
      .fillColor("#FFFFFF")
      .text(address, 0, barY + 4, { width: pageW, align: "center", lineBreak: false });
  }

  doc.page.margins.bottom = keepBottom;
}

/** Render one billing document to a PDF buffer. */
export async function renderInvoicePdf(
  document: BillingDocument,
  lines: BillingDocumentLine[],
): Promise<Buffer> {
  const vm = buildInvoiceViewModel(document, lines);
  const { doc, done } = newDoc({
    title: `${vm.title} ${document.docNo ?? "draft"}`,
    subject: `${vm.title} for ${document.customerName}`,
    margin: A4_MARGIN,
  });

  // The footer bar belongs on EVERY page. pdfkit is a streaming writer — once a
  // page is flushed it cannot be revisited without `bufferPages` — so it is
  // stamped as each page is created, at absolute coordinates, with doc.y put
  // back afterwards so the body flow never notices.
  let stamping = false;
  const stampFooter = () => {
    // Belt and braces: even with the margin lifted, a stamp must never be able
    // to re-enter itself through a page break of its own making.
    if (stamping) return;
    stamping = true;
    const keepY = doc.y;
    try {
      drawFooterBar(doc, vm);
    } finally {
      doc.y = keepY;
      stamping = false;
    }
  };
  doc.on("pageAdded", stampFooter);
  stampFooter();


  drawMasthead(doc, vm);
  drawTitle(doc, vm);
  drawParties(doc, vm);
  drawLineTable(doc, vm);
  ensureRoom(doc, vm, 240);
  drawTotals(doc, vm);

  if (vm.lineage) {
    doc
      .font("Helvetica")
      .fontSize(8.5)
      .fillColor(COLORS.inkSoft)
      .text(vm.lineage, doc.page.margins.left, doc.y, {
        width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
      });
    doc.y += 8;
  }

  ensureRoom(doc, vm, 200);
  drawBlock(doc, vm.identityRows, 150);

  if (vm.paymentRows.length > 0 || vm.interestClause) {
    hr(doc, doc.y - 4);
    doc.y += 6;
    drawBlock(doc, vm.paymentRows, 190);
    if (vm.interestClause) {
      doc
        .font("Helvetica")
        .fontSize(8.5)
        .fillColor(COLORS.inkMuted)
        .text(vm.interestClause, doc.page.margins.left, doc.y, {
          width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
        });
      doc.y += 8;
    }
  }

  // "Note : <text>" — the label runs straight into the text, as on the
  // reference template, rather than sitting above it as a heading. Several
  // notes number themselves ("Note 1 :", "Note 2 :"), each on its own line, so
  // the PDF says exactly what the screen and the email say.
  for (const note of documentNotes(vm.remarks)) {
    ensureRoom(doc, vm, 140);
    doc
      .font("Helvetica-Bold")
      .fontSize(9)
      .fillColor(COLORS.ink)
      .text(`${note.label} : `, doc.page.margins.left, doc.y, {
        continued: true,
        width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
      })
      .font("Helvetica")
      .text(note.text);
    doc.y += 10;
  }
  ensureRoom(doc, vm, 100);
  drawSignature(doc, vm);

  if (vm.footerNote) {
    doc
      .font("Helvetica")
      .fontSize(7.5)
      .fillColor(COLORS.inkFaint)
      .text(vm.footerNote, doc.page.margins.left, doc.y + 4, {
        width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
      });
  }

  doc.end();
  return done;
}
