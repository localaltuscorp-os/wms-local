import "server-only";
import { existsSync } from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import { format } from "date-fns";
import { getCurrentEmployee, isCandidateAccount } from "@/lib/auth/current";
import { getAgreement } from "@/lib/agreements/queries";
import { renderAgreement, type AgreementInput } from "@/lib/agreements/templates";
import { signatoryForEntity } from "@/lib/salary/signatories";
import { COLORS, SIG_DIR } from "@/lib/salary/pdf-house-style";
import { formatDate } from "@/lib/format";

/**
 * GET /agreements/pdf/[id]
 *
 * Renders one HR agreement (Appointment / Employment / NDA / CTC) as an A4 PDF
 * in the salary payslip house style (brand stripe · embedded Altus logo · faint
 * watermark · full-page border · Entity signatory block). The layout mirrors
 * components/agreements/agreement-preview.tsx from the SAME renderAgreement()
 * source: masthead → date → recipient → subject → salutation → body →
 * particulars table → numbered clauses → Authorised Signatory (+ employee
 * acceptance stamp once signed).
 *
 * Access: readable by an admin OR the owning employee; 404 if the agreement
 * doesn't exist. If the signature PNG is missing/placeholder the block degrades
 * to a ruled line + typed name rather than a forged image.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LOGO_PATH = path.join(process.cwd(), "public", "logo.png");
const MARK_PATH = path.join(process.cwd(), "public", "logo-mark.png");

function fmtLongDate(d: Date): string {
  return formatDate(d);
}

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;

  const me = await getCurrentEmployee();
  if (!me || !me.isActive || isCandidateAccount(me)) return new Response("Forbidden", { status: 403 });

  const found = await getAgreement(id);
  if (!found) return new Response("Not found", { status: 404 });

  const { agreement, employeeName } = found;
  if (!me.isAdmin && me.id !== agreement.employeeId) {
    return new Response("Forbidden", { status: 403 });
  }

  const input: AgreementInput = {
    type: agreement.type,
    employeeName,
    entity: agreement.entity ?? "",
    ...agreement.fieldValues,
  };
  const rendered = renderAgreement(input);
  const signatory = signatoryForEntity(agreement.entity);
  const entity = (agreement.entity ?? "").trim() || "Altus Corp";

  const doc = new PDFDocument({
    size: "A4",
    layout: "portrait",
    margin: 56,
    info: {
      Title: `${rendered.title} — ${employeeName}`,
      Author: "Altus Corp Dashboard",
      Subject: rendered.title,
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

  // ── Masthead: logo (left) + entity + title (right), mirroring the preview ──
  const headerTop = doc.page.margins.top + 2;
  const LOGO_H = 44;
  if (existsSync(LOGO_PATH)) {
    try {
      doc.image(LOGO_PATH, left, headerTop, { height: LOGO_H });
    } catch {
      /* text-only masthead */
    }
  }
  doc
    .font("Helvetica-Bold")
    .fontSize(15)
    .fillColor(COLORS.ink)
    .text(entity.toUpperCase(), left, headerTop + 2, {
      width,
      align: "right",
      characterSpacing: 0.4,
      lineBreak: false,
    });
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor(COLORS.inkSoft)
    .text(rendered.title.toUpperCase(), left, headerTop + 22, {
      width,
      align: "right",
      characterSpacing: 1.4,
      lineBreak: false,
    });
  const mastheadBottom = headerTop + Math.max(LOGO_H, 34) + 8;
  doc
    .save()
    .strokeColor(COLORS.hairline)
    .lineWidth(0.6)
    .moveTo(left, mastheadBottom)
    .lineTo(right, mastheadBottom)
    .stroke()
    .restore();
  doc.y = mastheadBottom + 14;

  // ── Ref (optional) + date line (right) ──
  const metaY = doc.y;
  if (rendered.refLine) {
    doc
      .font("Helvetica")
      .fontSize(9.5)
      .fillColor(COLORS.inkMuted)
      .text(rendered.refLine, left, metaY, { lineBreak: false });
  }
  doc
    .font("Helvetica")
    .fontSize(10)
    .fillColor(COLORS.inkSoft)
    .text(rendered.dateLine, left, metaY, { width, align: "right", lineBreak: false });
  doc.y = metaY + 18;

  // ── Recipient block ──
  rendered.recipientBlock.forEach((line, i) => {
    if (i === 0) doc.font("Helvetica-Bold").fontSize(10.5).fillColor(COLORS.ink);
    else doc.font("Helvetica").fontSize(10).fillColor(COLORS.inkMuted);
    doc.text(line, left, doc.y, { width, lineBreak: false });
    doc.y += 14;
  });
  doc.y += 8;

  // ── Subject (bold) ──
  doc
    .font("Helvetica-Bold")
    .fontSize(10.5)
    .fillColor(COLORS.ink)
    .text(rendered.subject, left, doc.y, { width });
  doc.y += 10;

  // ── Salutation ──
  doc
    .font("Helvetica")
    .fontSize(10.5)
    .fillColor(COLORS.inkMuted)
    .text(rendered.salutation, left, doc.y, { width });
  doc.y += 8;

  // ── Body paragraphs (justified, blank-line separated) ──
  for (const para of rendered.body) {
    doc
      .font("Helvetica")
      .fontSize(10.5)
      .fillColor(COLORS.inkMuted)
      .text(para, left, doc.y, { width, align: "justify", lineGap: 2 });
    doc.y += 10;
  }

  // ── Particulars table (2-col label / value) ──
  if (rendered.particulars && rendered.particulars.length > 0) {
    doc.y += 2;
    const rowH = 20;
    const valX = right - 220;
    doc
      .save()
      .strokeColor(COLORS.hairlineStrong)
      .lineWidth(0.8)
      .rect(left, doc.y, width, rowH * rendered.particulars.length + 8)
      .stroke()
      .restore();
    let ry = doc.y + 8;
    for (const p of rendered.particulars) {
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

  // ── Numbered clauses ──
  if (rendered.clauses.length > 0) {
    doc.y += 2;
    rendered.clauses.forEach((clause, i) => {
      const numW = 20;
      const clauseX = left + numW;
      const clauseW = width - numW;
      const startY = doc.y;
      doc
        .font("Helvetica-Bold")
        .fontSize(10.5)
        .fillColor(COLORS.inkMuted)
        .text(`${i + 1}.`, left, startY, { width: numW, lineBreak: false });
      doc
        .font("Helvetica")
        .fontSize(10.5)
        .fillColor(COLORS.inkMuted)
        .text(clause, clauseX, startY, { width: clauseW, align: "justify", lineGap: 2 });
      doc.y += 6;
    });
    doc.y += 6;
  }

  // ── Signatory + (optional) employee acceptance ──
  doc.y += 10;
  const blockTop = doc.y;
  const blockW = 220;

  // Authorised Signatory (left)
  drawAuthorisedSignatory(doc, {
    x: left,
    y: blockTop,
    blockW,
    closing: rendered.closing,
    signatoryName: signatory.name,
    assetPath: path.join(SIG_DIR, signatory.assetFile),
  });

  // Employee acceptance (right)
  if (rendered.needsEmployeeAcceptance) {
    const signed =
      agreement.status === "signed" && agreement.signedName
        ? {
            name: agreement.signedName,
            at: agreement.signedAt ? fmtLongDate(agreement.signedAt) : "",
          }
        : null;
    drawEmployeeAcceptance(doc, {
      x: right - blockW,
      y: blockTop,
      blockW,
      signed,
    });
  }

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
      `${rendered.title} · ${employeeName} · Generated ${format(new Date(), "EEE, MMM d, yyyy · HH:mm")}`,
      left,
      footerY,
      { width, lineBreak: false },
    );

  doc.end();
  const buf = await done;

  const slug = agreement.type;
  const safeName = employeeName.replace(/\s+/g, "");
  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${slug}-${safeName}.pdf"`,
      "cache-control": "no-store",
    },
  });
}

/** Closing text → signature image (or ruled line) → name → Authorised Signatory. */
function drawAuthorisedSignatory(
  doc: PDFKit.PDFDocument,
  o: {
    x: number;
    y: number;
    blockW: number;
    closing: string;
    signatoryName: string;
    assetPath: string;
  },
): void {
  let y = o.y;
  doc
    .font("Helvetica")
    .fontSize(10)
    .fillColor(COLORS.inkMuted)
    .text(o.closing, o.x, y, { width: o.blockW, lineBreak: false });
  y += 30;

  const sigH = 40;
  let drawn = false;
  if (existsSync(o.assetPath)) {
    try {
      doc.image(o.assetPath, o.x, y, { fit: [160, sigH] });
      drawn = true;
    } catch {
      drawn = false;
    }
  }
  if (!drawn) {
    doc
      .font("Helvetica-Oblique")
      .fontSize(16)
      .fillColor(COLORS.inkSoft)
      .text(o.signatoryName, o.x, y + sigH - 22, { lineBreak: false });
  }
  y += sigH + 2;

  // Ruled signature line
  doc
    .save()
    .strokeColor(COLORS.ink)
    .lineWidth(0.8)
    .moveTo(o.x, y)
    .lineTo(o.x + 180, y)
    .stroke()
    .restore();
  y += 5;

  doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .fillColor(COLORS.ink)
    .text(o.signatoryName, o.x, y, { width: o.blockW, lineBreak: false });
  y += 14;
  doc
    .font("Helvetica")
    .fontSize(8.5)
    .fillColor(COLORS.inkSoft)
    .text("Authorised Signatory", o.x, y, { width: o.blockW, lineBreak: false });
}

/** "Accepted & agreed," → signed script name + date, or a blank signature line. */
function drawEmployeeAcceptance(
  doc: PDFKit.PDFDocument,
  o: {
    x: number;
    y: number;
    blockW: number;
    signed: { name: string; at: string } | null;
  },
): void {
  let y = o.y;
  doc
    .font("Helvetica")
    .fontSize(10)
    .fillColor(COLORS.inkMuted)
    .text("Accepted & agreed,", o.x, y, { width: o.blockW, lineBreak: false });
  y += 30;

  if (o.signed) {
    // Script-style signature of the accepted name
    doc
      .font("Helvetica-Oblique")
      .fontSize(16)
      .fillColor(COLORS.ink)
      .text(o.signed.name, o.x, y, { width: o.blockW, lineBreak: false });
    y += 42;
    doc
      .save()
      .strokeColor(COLORS.ink)
      .lineWidth(0.8)
      .moveTo(o.x, y)
      .lineTo(o.x + 180, y)
      .stroke()
      .restore();
    y += 5;
    doc
      .font("Helvetica-Bold")
      .fontSize(10)
      .fillColor(COLORS.ink)
      .text(o.signed.name, o.x, y, { width: o.blockW, lineBreak: false });
    y += 14;
    doc
      .font("Helvetica")
      .fontSize(8.5)
      .fillColor(COLORS.inkSoft)
      .text(`Signed on ${o.signed.at || "____________"}`, o.x, y, {
        width: o.blockW,
        lineBreak: false,
      });
  } else {
    y += 42;
    doc
      .save()
      .strokeColor(COLORS.inkSoft)
      .lineWidth(0.8)
      .dash(2, { space: 2 })
      .moveTo(o.x, y)
      .lineTo(o.x + 180, y)
      .stroke()
      .undash()
      .restore();
    y += 5;
    doc
      .font("Helvetica")
      .fontSize(9.5)
      .fillColor(COLORS.inkSoft)
      .text("Employee signature", o.x, y, { width: o.blockW, lineBreak: false });
    y += 14;
    doc
      .font("Helvetica")
      .fontSize(8.5)
      .fillColor(COLORS.inkSoft)
      .text("Date: ____________", o.x, y, { width: o.blockW, lineBreak: false });
  }
}
