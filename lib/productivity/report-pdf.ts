import "server-only";
import PDFDocument from "pdfkit";
import { formatHours, formatPct, type Grade } from "./calc";
import {
  GOALS_THEME,
  GRADE_OUTLINE,
  KPI_THEME,
  MANAGER_THEME,
  TASKS_THEME,
  TRAINING_THEME,
  gradeColor,
  gradeOnColor,
} from "./theme";
import type { ProductivitySnapshot } from "./data";

/**
 * The Productivity Report as a downloadable PDF — the SAME snapshot the screen
 * renders, laid out for print.
 *
 * It takes an already-loaded `ProductivitySnapshot` and computes nothing: every
 * percentage and grade on the page was derived by `lib/productivity/calc` before
 * this function was called, and the section colours come from the shared
 * `theme` module. That is what stops a downloaded report from ever disagreeing
 * with the dashboard it was downloaded from.
 *
 * Built-in Helvetica only — no font files to ship or resolve at runtime, which
 * keeps this working on serverless without a font asset step (same choice as
 * the HR form renderer).
 */

const MARGIN = 50;
const INK = "#0f172a";
const INK_MUTED = "#475569";
const INK_SUBTLE = "#64748b";
const RULE = "#e2e8f0";

/**
 * Money for PRINT. The screen uses "₹", but pdfkit's built-in Helvetica is
 * WinAnsi-encoded and has no glyph for U+20B9 — it would drop or mangle the
 * symbol. "Rs." is the unambiguous document convention and renders everywhere.
 */
function inr(n: number): string {
  return `Rs. ${Math.round(Number.isFinite(n) ? n : 0).toLocaleString("en-IN")}`;
}

export async function renderProductivityReportPdf(snap: ProductivitySnapshot): Promise<Buffer> {
  const { employee, period, kpi, goals, tasks, training, manager } = snap;

  const doc = new PDFDocument({
    size: "A4",
    layout: "portrait",
    margin: MARGIN,
    info: {
      Title: `Productivity Report — ${employee.name} — ${period.label}`,
      Author: "Altus Corp Dashboard",
      Subject: `Productivity Dashboard · ${period.label}`,
    },
  });

  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const width = doc.page.width - MARGIN * 2;
  const right = MARGIN + width;
  const bottom = doc.page.height - MARGIN;
  let y = MARGIN;

  /** Start a new page when the next block would run off this one. */
  function ensure(height: number) {
    if (y + height > bottom) {
      doc.addPage();
      y = MARGIN;
    }
  }

  /* ── Masthead ─────────────────────────────────────────────────── */
  doc.font("Helvetica-Bold").fontSize(9).fillColor(INK_SUBTLE).text("PRODUCTIVITY REPORT", MARGIN, y, {
    width,
    characterSpacing: 1.6,
  });
  y = doc.y + 4;

  doc.font("Helvetica-Bold").fontSize(22).fillColor(INK).text(employee.name, MARGIN, y, { width });
  y = doc.y + 2;

  const role = [employee.designation, employee.department].filter(Boolean).join("  ·  ") || "—";
  doc.font("Helvetica").fontSize(10.5).fillColor(INK_MUTED).text(role, MARGIN, y, { width });
  y = doc.y + 1;

  if (employee.managerName) {
    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor(INK_SUBTLE)
      .text(`Reporting Manager: ${employee.managerName}`, MARGIN, y, { width });
    y = doc.y + 1;
  }

  doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .fillColor(INK_MUTED)
    .text(`Period: ${period.label}  (${period.monthStart} to ${period.monthEnd})`, MARGIN, y, { width });
  y = doc.y + 10;

  doc.moveTo(MARGIN, y).lineTo(right, y).lineWidth(1.4).strokeColor(KPI_THEME.accent).stroke();
  y += 18;

  /* ── Section + row primitives ─────────────────────────────────── */

  function section(title: string, accent: string) {
    ensure(34);
    // A short accent bar reads as a section marker without a coloured band —
    // the same "colour is an accent, not a surface" rule the screen follows.
    doc.rect(MARGIN, y, 3, 13).fill(accent);
    doc
      .font("Helvetica-Bold")
      .fontSize(11.5)
      .fillColor(INK)
      .text(title.toUpperCase(), MARGIN + 10, y + 1.5, { width: width - 10, characterSpacing: 1.1 });
    y += 22;
  }

  function row(label: string, value: string, opts: { color?: string; bold?: boolean } = {}) {
    ensure(20);
    doc.font("Helvetica").fontSize(10).fillColor(INK_MUTED).text(label, MARGIN, y, { width: width * 0.62 });
    doc
      .font("Helvetica-Bold")
      .fontSize(opts.bold ? 11.5 : 10.5)
      .fillColor(opts.color ?? INK)
      .text(value, MARGIN + width * 0.62, y - (opts.bold ? 1 : 0), { width: width * 0.38, align: "right" });
    y += 16;
    doc.moveTo(MARGIN, y - 4).lineTo(right, y - 4).lineWidth(0.5).strokeColor(RULE).stroke();
  }

  /**
   * The grade CHIP — the print form of the screen's `GradeBadge`, drawn as a
   * filled rounded rect in the grade's exact palette hex with the letter on top.
   *
   * A chip rather than coloured text for the same reason the screen uses one: a
   * mustard C printed as bare ink on white paper is barely visible, and darkening
   * it to fix that would have put a different yellow in the PDF than in the
   * browser. Filling the chip keeps the hex identical across both and moves the
   * contrast problem to the glyph, where `gradeOnColor` solves it.
   *
   * The thin black outline matters MORE on paper than on screen: the pastel
   * purple and sky blue are light enough that an unstroked chip reads as a smudge
   * on a printed page, and on a monochrome printer the ring is the only thing
   * left holding the chip's shape.
   *
   * Returns the chip's width so callers can lay text out beside it.
   */
  function gradeChip(grade: Grade, x: number, top: number, fontSize = 9.5): number {
    const padX = 5;
    const w = Math.max(20, doc.font("Helvetica-Bold").fontSize(fontSize).widthOfString(grade) + padX * 2);
    const h = fontSize + 5;
    doc.save();
    doc
      .roundedRect(x, top - 1.5, w, h, 3)
      .lineWidth(0.7)
      .fillAndStroke(gradeColor(grade), GRADE_OUTLINE);
    doc.restore();
    doc
      .font("Helvetica-Bold")
      .fontSize(fontSize)
      .fillColor(gradeOnColor(grade))
      .text(grade, x, top + 1, { width: w, align: "center" });
    return w;
  }

  /** A grade row. `null` is UNGRADED — printed as a dash in muted ink, never as
   *  an F, so a missing salary profile or an unplanned month cannot read as a
   *  failure in a document that leaves the building. */
  function gradeRow(label: string, grade: Grade | null) {
    if (!grade) {
      row(label, "—", { bold: true, color: INK_SUBTLE });
      return;
    }
    ensure(20);
    doc.font("Helvetica").fontSize(10).fillColor(INK_MUTED).text(label, MARGIN, y, { width: width * 0.62 });
    // Right-aligned like every other value column: measure the chip, then place
    // its left edge so its right edge lands on the same margin the numbers use.
    const w = Math.max(20, doc.font("Helvetica-Bold").fontSize(10).widthOfString(grade) + 10);
    gradeChip(grade, right - w, y - 1, 10);
    y += 16;
    doc.moveTo(MARGIN, y - 4).lineTo(right, y - 4).lineWidth(0.5).strokeColor(RULE).stroke();
  }

  function note(text: string) {
    ensure(30);
    doc.font("Helvetica").fontSize(8.5).fillColor(INK_SUBTLE).text(text, MARGIN, y + 2, { width, lineGap: 1 });
    y = doc.y + 16;
  }

  /* ── KPI ──────────────────────────────────────────────────────── */
  section("KPI", KPI_THEME.accent);
  row("Earned incentive", inr(kpi.incentiveAmount), { bold: true });
  row("Base salary (monthly)", kpi.baseSalary > 0 ? inr(kpi.baseSalary) : "Not on record", {
    color: kpi.baseSalary > 0 ? INK : INK_SUBTLE,
  });
  row("Incentive % of salary", formatPct(kpi.incentivePct), { bold: true });
  gradeRow("Incentive grade", kpi.grade);
  note(
    `Earned incentive is the amount APPROVED for ${period.label} — the figure signed off as this employee's, which does not lag behind a payroll run the way a disbursed amount does.` +
      (kpi.baseSalary > 0
        ? ""
        : " With no salary profile on record the percentage is unknown, so it reads as a dash rather than 0%."),
  );

  /* ── Goals ────────────────────────────────────────────────────── */
  section("Goals", GOALS_THEME.accent);
  row("Monthly goals completed", String(goals.monthly.completed), { bold: true });
  row("Monthly goals set", String(goals.monthly.target));
  row("Monthly completion", formatPct(goals.monthly.pct), { bold: true });
  gradeRow("Monthly grade", goals.monthly.grade);
  row("Weekly boards counted (MTD)", `${goals.mtd.weeks} week${goals.mtd.weeks === 1 ? "" : "s"}`);
  row("MTD completion", formatPct(goals.mtd.pct), { bold: true });
  gradeRow("MTD grade", goals.mtd.grade);
  note(
    "MTD sums every weekly board whose Monday falls inside the month — W1 + W2 + W3 + W4 (+ W5 where the month has one). The period therefore begins on the 1st, needs no special case for 28/29/30/31-day months, and starts a new period on its own when the calendar turns over. Nothing carries forward from last month.",
  );

  /* ── Tasks ────────────────────────────────────────────────────── */
  section("Tasks", TASKS_THEME.accent);
  row("Overdue more than 15 days", String(tasks.over15), { bold: true });
  row("Overdue 8-14 days", String(tasks.days8to14), { bold: true });
  row("Overdue 1-7 days", String(tasks.days1to7), { bold: true });
  row('Flagged "need help"', String(tasks.needHelp), { bold: true });
  note(
    "Open assigned work only — done, approved and cancelled tasks are excluded. Age is counted in whole calendar days against each task's effective due date.",
  );

  /* ── Training ─────────────────────────────────────────────────── */
  section("Training", TRAINING_THEME.accent);
  row("Training given (by manager)", `${formatHours(training.givenHours)} / ${training.targetHours} hrs`, { bold: true });
  row("Given - % of target", formatPct(training.givenPct));
  row("Training attended (by employee)", `${formatHours(training.attendedHours)} / ${training.targetHours} hrs`, { bold: true });
  row("Attended - % of target", formatPct(training.attendedPct));
  note(
    `Counted from completed sessions this month: hours GIVEN are sessions this person ran as trainer, hours ATTENDED are sessions they joined. The target is ${training.targetHours} hours a month.`,
  );

  /* ── Manager — only for someone who actually has reports ──────── */
  if (manager) {
    section("Manager", MANAGER_THEME.accent);
    row("Tasks delegated", String(manager.tasksDelegated), { bold: true });
    row("Goals delegated", String(manager.goalsDelegated), { bold: true });
    note(
      "Work handed to direct reports this month — tasks this person raised on a report's list, and weekly goals they created on a report's board.",
    );
  }

  /** One grading ladder as a labelled column. Advances `y`; callers reset it
   *  between columns so the two scales sit side by side. */
  function drawScale(heading: string, rows: readonly (readonly [Grade, string])[], x: number, w: number) {
    doc
      .font("Helvetica-Bold")
      .fontSize(8)
      .fillColor(INK_SUBTLE)
      .text(heading, x, y, { width: w, characterSpacing: 1 });
    y = doc.y + 5;
    for (const [grade, band] of rows) {
      gradeChip(grade, x, y);
      doc.font("Helvetica").fontSize(9.5).fillColor(INK_MUTED).text(band, x + 28, y, { width: w - 28, align: "right" });
      y += 15;
      doc.moveTo(x, y - 3.5).lineTo(x + w, y - 3.5).lineWidth(0.5).strokeColor(RULE).stroke();
    }
  }

  /* ── The two grading scales ───────────────────────────────────── */
  section("Grading", KPI_THEME.accent);
  ensure(130);
  const colWidth = (width - 24) / 2;
  const scaleTop = y;
  drawScale("COMPLETION - GOALS, MTD", COMPLETION_SCALE, MARGIN, colWidth);
  const leftEnd = y;
  y = scaleTop;
  drawScale("INCENTIVE - % OF BASE SALARY", INCENTIVE_SCALE, MARGIN + colWidth + 24, colWidth);
  y = Math.max(leftEnd, y) + 6;
  note(
    "Two deliberately different scales: an employee can legitimately hold a strong goal grade and a weak incentive grade, because they measure different things. No grade is stored — each is derived from the values above it.",
  );

  /* ── Footer ───────────────────────────────────────────────────── */
  ensure(26);
  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor(INK_SUBTLE)
    .text(
      `Generated ${snap.generatedAt.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" })} IST · every figure reads live from the tasks, goals, training, salary and incentive records — nothing is duplicated for this report.`,
      MARGIN,
      y + 4,
      { width },
    );

  doc.end();
  return done;
}

const COMPLETION_SCALE: readonly (readonly [Grade, string])[] = [
  ["O", "Above 100%"],
  ["A", "90% and above"],
  ["B", "80% and above"],
  ["C", "70% and above"],
  ["D", "60% and above"],
  ["F", "Below 60%"],
] as const;

const INCENTIVE_SCALE: readonly (readonly [Grade, string])[] = [
  ["O", "30% and above"],
  ["A", "20% and above"],
  ["B", "15% and above"],
  ["C", "10% and above"],
  ["D", "5% and above"],
  ["F", "Below 5%"],
] as const;

/** `Productivity-Report-Om-Jadhav-August-2026.pdf` — safe on every filesystem. */
export function reportFilename(employeeName: string, periodLabel: string): string {
  const slug = (s: string) => s.trim().replace(/[^\w]+/g, "-").replace(/^-|-$/g, "");
  return `Productivity-Report-${slug(employeeName)}-${slug(periodLabel)}.pdf`;
}
