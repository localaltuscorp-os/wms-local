import "server-only";
import PDFDocument from "pdfkit";
import type { DayLine, AttnTotals } from "@/lib/email/report-emails";

/**
 * ONE EMPLOYEE's monthly attendance statement, as a PDF.
 *
 * Deliberately separate from `app/(app)/attendance/export.pdf/route.ts`: that
 * one renders the COMPANY sheet (every employee, one row each) and is admin-only
 * behind `isFinanceViewer`. Reusing it for the employee mail-out would have put
 * the whole company's attendance in each person's inbox — the exact thing this
 * report must never do.
 *
 * The input is whatever `monthReportFor(employeeId, …)` already produced for the
 * email body, so the PDF and the email can never disagree, and rendering costs
 * no extra query.
 *
 * Returns a Buffer ready to hand to Resend as an attachment. Sizing/typography
 * mirrors the other pdfkit reports (A4 portrait, brand stripe, stat band, then
 * the day table) so it reads as part of the same family.
 */

const BRAND = "#E10600";
const INK = "#0f172a";
const MUTED = "#64748b";
const HAIRLINE = "#e2e8f0";

/** Percentage of gradeable days actually attended. Half-days count as a half. */
function attendancePct(t: AttnTotals): number {
  const graded = t.presentDays + t.halfDays + t.absentDays;
  if (graded <= 0) return 0;
  return Math.round(((t.presentDays + t.halfDays * 0.5) / graded) * 100);
}

export interface AttendanceStatementPdfInput {
  employeeName: string;
  monthLabel: string;
  totals: AttnTotals;
  days: DayLine[];
  /** Printed as the "raise queries by" line, matching the email's wording. */
  freezeDateLabel?: string;
}

export async function renderAttendanceStatementPdf(
  input: AttendanceStatementPdfInput,
): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: 40, bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });

  const left = 40;
  const width = doc.page.width - 80;

  // ── Masthead ──
  doc.rect(0, 0, doc.page.width, 4).fill(BRAND);
  doc.fillColor(BRAND).fontSize(9).font("Helvetica-Bold").text("ALTUS CORP", left, 26, {
    characterSpacing: 2,
  });
  doc.fillColor(INK).fontSize(19).font("Helvetica-Bold").text("Attendance Statement", left, 40);
  doc
    .fillColor(MUTED)
    .fontSize(11)
    .font("Helvetica")
    .text(`${input.employeeName} · ${input.monthLabel}`, left, 64);

  doc.moveTo(left, 86).lineTo(left + width, 86).strokeColor(HAIRLINE).lineWidth(1).stroke();

  // ── Stat band — the numbers people actually open this for ──
  const t = input.totals;
  const stats: [string, string][] = [
    ["Present", String(t.presentDays)],
    ["Half day", String(t.halfDays)],
    ["Absent", String(t.absentDays)],
    ["Late", String(t.lateDays)],
    ["Early out", String(t.earlyDays)],
    ["Attendance", `${attendancePct(t)}%`],
  ];
  const colW = width / stats.length;
  let y = 100;
  stats.forEach(([label, value], i) => {
    const x = left + i * colW;
    doc.fillColor(MUTED).fontSize(7.5).font("Helvetica-Bold").text(label.toUpperCase(), x, y, {
      width: colW - 6,
      characterSpacing: 0.8,
    });
    doc.fillColor(INK).fontSize(15).font("Helvetica-Bold").text(value, x, y + 11, { width: colW - 6 });
  });
  y += 38;

  doc
    .fillColor(MUTED)
    .fontSize(9)
    .font("Helvetica")
    .text(`Hours worked: ${t.workedHours.toFixed(1)}`, left, y);
  y += 18;

  // ── Day table ──
  const cols: [string, number][] = [
    ["Date", 150],
    ["In", 90],
    ["Out", 90],
    ["Status", 70],
    ["Flags", width - 400],
  ];
  const header = () => {
    doc.fillColor(MUTED).fontSize(8).font("Helvetica-Bold");
    let x = left;
    for (const [label, w] of cols) {
      doc.text(label.toUpperCase(), x, y, { width: w, characterSpacing: 0.6 });
      x += w;
    }
    y += 13;
    doc.moveTo(left, y).lineTo(left + width, y).strokeColor(HAIRLINE).lineWidth(0.6).stroke();
    y += 5;
  };
  header();

  for (const d of input.days) {
    // New page before the row rather than after, so a page never ends with a
    // header and no rows under it.
    if (y > doc.page.height - 70) {
      doc.addPage();
      y = 50;
      header();
    }
    const flags = [d.late ? "Late" : null, d.leftEarly ? "Left early" : null]
      .filter(Boolean)
      .join(" · ");
    const cells = [d.date, d.inAt ?? "—", d.outAt ?? "—", d.code, flags || "—"];
    let x = left;
    doc.fontSize(9).font("Helvetica").fillColor(INK);
    cells.forEach((cell, i) => {
      const w = cols[i]![1];
      // Absences read in brand red; everything else stays neutral so the eye
      // lands on the days that need explaining.
      doc.fillColor(i === 3 && d.code === "A" ? BRAND : INK).text(cell, x, y, { width: w - 6 });
      x += w;
    });
    y += 15;
  }

  if (input.freezeDateLabel) {
    if (y > doc.page.height - 90) {
      doc.addPage();
      y = 50;
    }
    y += 10;
    doc
      .fillColor(MUTED)
      .fontSize(8.5)
      .font("Helvetica-Oblique")
      .text(
        `Raise any queries on this statement by ${input.freezeDateLabel}. After that the month is frozen and can no longer be edited.`,
        left,
        y,
        { width },
      );
  }

  doc.end();
  return done;
}
