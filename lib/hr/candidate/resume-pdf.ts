import "server-only";

import { existsSync } from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import { format } from "date-fns";
import { formatDate } from "@/lib/format";
import { resumeHeader, resumeGroups } from "./resume-model";
import type { ResumeData, ResumeInstances, ResumeGroup, ResumeRow } from "./resume-model";

/**
 * Candidate Interview Form → print-ready "candidate profile / resume" PDF.
 *
 * Server-only (Node) renderer built with pdfkit, mirroring the proven pattern in
 * lib/hr/letters/pdf.ts: A4, guarded logo embed from public/logo.png, brand
 * palette (Altus red #E10600), default Helvetica / Helvetica-Bold fonts (no
 * custom font files — and Helvetica has no ₹ glyph, so any money is spelled
 * "Rs"). Every asset read + image embed is guarded so bad input never breaks
 * the PDF. Consumes the SHARED resume model (resumeHeader / resumeGroups) so the
 * export always matches the on-screen review.
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
  brandTint: "#FDECEA",
} as const;

const LOGO_PATH = path.join(process.cwd(), "public", "logo.png");
const COMPANY = "Altus Corp";
const SUBTITLE = "Candidate Interview Form";

function fmtStamp(d: Date): string {
  return `${formatDate(d)} · ${format(d, "HH:mm")}`;
}

interface RenderInput {
  data: ResumeData;
  instances: ResumeInstances;
  photo?: Buffer | null;
}

/** Render a filled Candidate Interview Form to a print-ready resume PDF Buffer. */
export async function renderCandidateResumePdf(input: RenderInput): Promise<Buffer> {
  const header = resumeHeader(input.data);
  const groups = resumeGroups(input.data, input.instances);

  const doc = new PDFDocument({
    size: "A4",
    layout: "portrait",
    margin: 48,
    info: {
      Title: `${header.name} — Candidate Profile`,
      Author: "Altus Corp Dashboard",
      Subject: `Altus Corp · ${SUBTITLE}`,
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

  // Brand stripe redrawn on every page.
  const drawStripe = (): void => {
    doc.save().rect(0, 0, doc.page.width, 5).fill(COLORS.brand).restore();
    doc.save().rect(0, 5, doc.page.width, 1.2).fill(COLORS.brandDeep).restore();
  };
  doc.on("pageAdded", () => {
    drawStripe();
    doc.y = doc.page.margins.top;
  });
  drawStripe();

  /* ---- Masthead: logo + Altus Corp + subtitle ---- */
  const headerTop = doc.page.margins.top + 2;
  const LOGO_H = 40;
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
    .text(COMPANY.toUpperCase(), left, headerTop + 2, {
      width,
      align: "right",
      characterSpacing: 0.4,
      lineBreak: false,
    });
  doc
    .font("Helvetica")
    .fontSize(8.5)
    .fillColor(COLORS.brandDeep)
    .text(SUBTITLE.toUpperCase(), left, headerTop + 22, {
      width,
      align: "right",
      characterSpacing: 1.2,
      lineBreak: false,
    });

  const mastheadBottom = headerTop + LOGO_H + 8;
  doc
    .save()
    .strokeColor(COLORS.hairline)
    .lineWidth(0.6)
    .moveTo(left, mastheadBottom)
    .lineTo(right, mastheadBottom)
    .stroke()
    .restore();
  doc.y = mastheadBottom + 18;

  /* ---- Candidate header block (name + role + contact) + optional photo ---- */
  const PHOTO_W = 90;
  const PHOTO_H = 110;
  const hasPhoto = Boolean(input.photo && input.photo.length > 0);
  const blockTop = doc.y;
  const textW = hasPhoto ? width - PHOTO_W - 18 : width;

  if (hasPhoto && input.photo) {
    const px = right - PHOTO_W;
    try {
      doc.image(input.photo, px, blockTop, {
        fit: [PHOTO_W, PHOTO_H],
        align: "center",
        valign: "center",
      });
      doc
        .save()
        .strokeColor(COLORS.hairlineStrong)
        .lineWidth(1)
        .rect(px, blockTop, PHOTO_W, PHOTO_H)
        .stroke()
        .restore();
    } catch {
      /* bad/corrupt image → skip photo, keep the PDF */
    }
  }

  // Name (large, bold).
  doc
    .font("Helvetica-Bold")
    .fontSize(24)
    .fillColor(COLORS.ink)
    .text(header.name, left, blockTop, { width: textW, lineGap: 1 });

  // Position · Department line.
  const roleParts = [header.position, header.department].filter((s) => s.trim());
  if (roleParts.length) {
    doc.y += 2;
    doc
      .font("Helvetica-Bold")
      .fontSize(11)
      .fillColor(COLORS.brandDeep)
      .text(roleParts.join("  ·  "), left, doc.y, { width: textW, lineGap: 1 });
  }

  doc.y += 6;

  // Contact line + DOB / Age line.
  const contactParts = [header.mobile, header.email, header.location].filter((s) => s.trim());
  if (contactParts.length) {
    doc
      .font("Helvetica")
      .fontSize(9.5)
      .fillColor(COLORS.ink)
      .text(contactParts.join("   ·   "), left, doc.y, { width: textW, lineGap: 2 });
    doc.y += 2;
  }
  const dobParts: string[] = [];
  if (header.dob.trim()) dobParts.push(`Date of Birth: ${header.dob}`);
  if (header.age.trim()) dobParts.push(`Age: ${header.age}`);
  if (dobParts.length) {
    doc
      .font("Helvetica")
      .fontSize(9.5)
      .fillColor(COLORS.ink)
      .text(dobParts.join("   ·   "), left, doc.y, { width: textW, lineBreak: false });
  }

  // Ensure we clear the photo before the first section.
  const afterBlock = hasPhoto ? Math.max(doc.y, blockTop + PHOTO_H) : doc.y;
  doc.y = afterBlock + 20;

  /* ---- Layout helpers ---- */
  const BOTTOM = (): number => doc.page.height - doc.page.margins.bottom - 34;

  const ensure = (need: number): void => {
    if (doc.y + need > BOTTOM()) doc.addPage();
  };

  const drawSectionHeading = (label: string): void => {
    ensure(34);
    const top = doc.y;
    const bandH = 22;
    // Premium: a soft brand-tint band with a solid red accent tab and the title
    // in deep red — sections read as distinct, branded blocks (not just a rule).
    doc.save().roundedRect(left, top, width, bandH, 3.5).fill(COLORS.brandTint).restore();
    doc.save().rect(left, top, 3.5, bandH).fill(COLORS.brand).restore();
    doc
      .font("Helvetica-Bold")
      .fontSize(10.5)
      .fillColor(COLORS.brandDeep)
      .text(label.toUpperCase(), left + 13, top + 6, { characterSpacing: 0.9, lineBreak: false });
    doc.y = top + bandH + 11;
  };

  // Two-column "Label:  value" grid. colX = left edge of a column pair.
  const LABEL_W = 118;
  const COL_GAP = 26;
  const colW = (width - COL_GAP) / 2;
  const valW = colW - LABEL_W - 6;

  const drawRow = (row: ResumeRow, colX: number, rowTop: number): number => {
    // Label — BLACK, small uppercase caption (letter-spaced) so it reads as a
    // field label yet stays fully legible (was faint grey).
    doc
      .font("Helvetica")
      .fontSize(7.5)
      .fillColor(COLORS.ink)
      .text(row.label.toUpperCase(), colX, rowTop + 1.5, {
        width: LABEL_W,
        lineBreak: false,
        ellipsis: true,
        characterSpacing: 0.4,
      });
    const h = doc.heightOfString(row.value, { width: valW, lineGap: 1.5 });
    // Value — BLACK, bold.
    doc
      .font("Helvetica-Bold")
      .fontSize(9.5)
      .fillColor(COLORS.ink)
      .text(row.value, colX + LABEL_W + 6, rowTop, { width: valW, lineGap: 1.5 });
    return Math.max(h, 12);
  };

  // Render a flat list of rows across two columns.
  const drawRowGrid = (rows: ResumeRow[]): void => {
    for (let i = 0; i < rows.length; i += 2) {
      const leftRow = rows[i];
      const rightRow = rows[i + 1];
      // Measure both cells to keep the pair aligned + page-break safe.
      const measure = (r: ResumeRow | undefined): number => {
        if (!r) return 0;
        return doc.heightOfString(r.value, { width: valW, lineGap: 1.5 });
      };
      const rowH = Math.max(measure(leftRow), measure(rightRow), 12) + 9;
      ensure(rowH);
      const rowTop = doc.y;
      if (leftRow) drawRow(leftRow, left, rowTop);
      if (rightRow) drawRow(rightRow, left + colW + COL_GAP, rowTop);
      doc.y = rowTop + rowH;
      // Hairline between row pairs — a light, even rhythm (not after the last).
      if (i + 2 < rows.length) {
        doc
          .save()
          .strokeColor(COLORS.hairline)
          .lineWidth(0.4)
          .moveTo(left, doc.y - 4)
          .lineTo(right, doc.y - 4)
          .stroke()
          .restore();
      }
    }
  };

  /* ---- Sections ---- */
  for (const group of groups as ResumeGroup[]) {
    drawSectionHeading(group.title);

    if (group.rows && group.rows.length) {
      drawRowGrid(group.rows);
    }

    if (group.items && group.items.length) {
      group.items.forEach((entry, idx) => {
        ensure(26);
        // "Entry N" label.
        const top = doc.y;
        doc
          .font("Helvetica-Bold")
          .fontSize(8.5)
          .fillColor(COLORS.brandDeep)
          .text(`ENTRY ${idx + 1}`, left, top, { characterSpacing: 0.8, lineBreak: false });
        doc.y = top + 14;
        // Indented rows for the entry.
        const indent = 12;
        for (const row of entry) {
          const rvalW = width - indent - LABEL_W - 6;
          const rowH =
            Math.max(doc.heightOfString(row.value, { width: rvalW, lineGap: 1.5 }), 12) + 7;
          ensure(rowH);
          const rowTop = doc.y;
          doc
            .font("Helvetica")
            .fontSize(7.5)
            .fillColor(COLORS.ink)
            .text(row.label.toUpperCase(), left + indent, rowTop + 1.5, {
              width: LABEL_W,
              lineBreak: false,
              ellipsis: true,
              characterSpacing: 0.4,
            });
          doc
            .font("Helvetica-Bold")
            .fontSize(9.5)
            .fillColor(COLORS.ink)
            .text(row.value, left + indent + LABEL_W + 6, rowTop, { width: rvalW, lineGap: 1.5 });
          doc.y = rowTop + rowH;
        }
        // Thin divider between entries (not after the last).
        if (idx < (group.items?.length ?? 0) - 1) {
          doc.y += 2;
          ensure(8);
          doc
            .save()
            .strokeColor(COLORS.hairline)
            .lineWidth(0.5)
            .dash(2, { space: 2 })
            .moveTo(left + 12, doc.y)
            .lineTo(right, doc.y)
            .stroke()
            .undash()
            .restore();
          doc.y += 8;
        }
      });
    }

    doc.y += 14;
  }

  /* ---- Footer on the last page ---- */
  const footerY = doc.page.height - doc.page.margins.bottom - 20;
  doc
    .save()
    .strokeColor(COLORS.hairline)
    .lineWidth(0.5)
    .moveTo(left, footerY - 9)
    .lineTo(right, footerY - 9)
    .stroke()
    .restore();
  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor(COLORS.inkMuted)
    .text(`Generated ${fmtStamp(new Date())} · ${COMPANY}`, left, footerY, {
      width,
      lineBreak: false,
    });

  doc.end();
  return done;
}
