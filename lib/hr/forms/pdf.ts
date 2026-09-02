import "server-only";
import PDFDocument from "pdfkit";
import type { HrFormResponse } from "./schema";

/**
 * Render a filled HR form to PDF — the COMPLETED responses, never a blank
 * template.
 *
 * WHY NOT `renderLetterPdf`: that renderer is built around a `LetterTemplate` —
 * a paying-entity letterhead, pronoun tokens, a signature block, a fixed body
 * layout. A form submission has none of those; it is a heading plus an ordered
 * list of question/answer pairs of unpredictable length. Reusing it would mean
 * fabricating a template to satisfy its signature, which is a worse coupling
 * than sharing the library. So this shares the INFRASTRUCTURE (pdfkit, the lazy
 * server-only import, Buffer→Response) and owns its own simple layout.
 *
 * Built-in Helvetica only: no font files to ship or resolve at runtime, which
 * keeps this working on serverless without a font asset step.
 */

const MARGIN = 54;
const INK = "#0f172a";
const MUTED = "#64748b";
const RULE = "#e2e8f0";
const ACCENT = "#E10600";

export interface FormPdfInput {
  formName: string;
  sectionLabel: string;
  employeeName: string;
  /** Pre-formatted, e.g. "11 AUG 2026", or a draft note. */
  submittedOn: string;
  status: "draft" | "submitted";
  responses: HrFormResponse[];
}

export async function renderHrFormPdf(input: FormPdfInput): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "A4",
    layout: "portrait",
    margin: MARGIN,
    info: {
      Title: `${input.formName} — ${input.employeeName}`,
      Author: "Altus Corp Dashboard",
      Subject: `${input.sectionLabel} · ${input.formName}`,
    },
  });

  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const width = doc.page.width - MARGIN * 2;

  // ── Header ──
  doc.font("Helvetica-Bold").fontSize(18).fillColor(INK).text(input.formName, { width });
  doc.moveDown(0.3);
  doc
    .font("Helvetica")
    .fontSize(10)
    .fillColor(MUTED)
    .text(`${input.sectionLabel}  ·  ${input.employeeName}`, { width });
  doc.text(
    input.status === "submitted" ? `Submitted ${input.submittedOn}` : `DRAFT — last saved ${input.submittedOn}`,
    { width },
  );

  doc.moveDown(0.6);
  const ruleY = doc.y;
  doc.moveTo(MARGIN, ruleY).lineTo(MARGIN + width, ruleY).lineWidth(1).strokeColor(ACCENT).stroke();
  doc.moveDown(0.9);

  if (input.responses.length === 0) {
    doc.font("Helvetica-Oblique").fontSize(11).fillColor(MUTED).text("No answers were recorded on this form.");
    doc.end();
    return done;
  }

  // ── Grouped question/answer pairs ──
  let lastGroup: string | null = null;
  for (const r of input.responses) {
    const group = r.group ?? "Responses";

    // Keep a group heading with at least its first question rather than letting
    // it strand at the foot of a page.
    if (group !== lastGroup) {
      ensureRoom(doc, 68);
      doc.moveDown(0.5);
      doc
        .font("Helvetica-Bold")
        .fontSize(9)
        .fillColor(MUTED)
        .text(group.toUpperCase(), { width, characterSpacing: 0.8 });
      doc.moveDown(0.35);
      lastGroup = group;
    }

    ensureRoom(doc, 46);
    doc.font("Helvetica").fontSize(9.5).fillColor(MUTED).text(r.question, { width });
    doc.moveDown(0.15);
    doc.font("Helvetica-Bold").fontSize(11).fillColor(INK).text(r.answer || "—", { width });
    doc.moveDown(0.15);

    const y = doc.y;
    doc.moveTo(MARGIN, y).lineTo(MARGIN + width, y).lineWidth(0.5).strokeColor(RULE).stroke();
    doc.moveDown(0.45);
  }

  doc.end();
  return done;
}

/** Page-break before writing a block that needs `needed` points of room, so a
 *  question never lands on one page with its answer on the next. */
function ensureRoom(doc: PDFKit.PDFDocument, needed: number): void {
  const bottom = doc.page.height - doc.page.margins.bottom;
  if (doc.y + needed > bottom) doc.addPage();
}
