import "server-only";
import PDFDocument from "pdfkit";
import { existsSync } from "node:fs";
import path from "node:path";
import { format } from "date-fns";
import { formatDate } from "@/lib/format";
import type { WeeklyGoal } from "@/db/schema";
import type { GoalsDashboard } from "./queries";
import { weekNoOf } from "./fy-calendar";
import { formatWeekLabel } from "@/lib/weekly-goals/week";
import { effectivePct, weeklyScore } from "@/lib/weekly-goals/effective";

/**
 * Weekly goals report PDF — **1 person = 1 file, 2 sheets** (last week's progress
 * + next week's committed goals) plus a dashboard analytics band (last-week /
 * this-week / this-month / YTD scores). Rendered with pdfkit (same stack + branding
 * as app/(app)/salary/payslip/[runId]/route.ts; `runtime="nodejs"`). Downloaded
 * in-app (`/goals/report.pdf`) AND sent on WhatsApp (`lib/goals/whatsapp-dispatch`).
 *
 * Pure rendering: takes already-loaded data, returns the assembled Buffer. All
 * DB reads live in `whatsapp-dispatch.ts` (`buildGoalsReportData`).
 */

const COLORS = {
  ink: "#0A0A0A",
  inkMuted: "#525252",
  inkSoft: "#737373",
  inkFaint: "#A3A3A3",
  hairline: "#E5E5E5",
  hairlineStrong: "#D4D4D4",
  brand: "#E10600",
  brandDeep: "#A80400",
  zebra: "#FAFAFA",
  headFill: "#F4F4F5",
  green: "#15803D",
  greenTint: "#EAF6EE",
  amber: "#B45309",
  amberTint: "#FBF3E6",
  red: "#B91C1C",
  redTint: "#FBEBEA",
} as const;

const LOGO_PATH = path.join(process.cwd(), "public", "logo.png");
const MARK_PATH = path.join(process.cwd(), "public", "logo-mark.png");

export interface WeeklyGoalsPdfSheet {
  /** Monday `yyyy-mm-dd`. */
  weekStart: string;
  goals: WeeklyGoal[];
}

export interface WeeklyGoalsPdfInput {
  employee: { id: string; name: string | null };
  /** Last week = the week whose progress was just filled. */
  lastWeek: WeeklyGoalsPdfSheet;
  /** Next week = the committed/frozen upcoming week. */
  nextWeek: WeeklyGoalsPdfSheet;
  /** Headline rollups; may carry the extra last-week / this-month scores. */
  dashboard: GoalsDashboard & { lastWeekScore?: number; monthAvg?: number | null };
}

/** numeric(14,2) columns arrive as STRINGs — render compactly or a dash. */
function num(v: string | null): string {
  if (v == null || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function scorePalette(score: number): { fg: string; bg: string } {
  if (score >= 70) return { fg: COLORS.green, bg: COLORS.greenTint };
  if (score >= 40) return { fg: COLORS.amber, bg: COLORS.amberTint };
  return { fg: COLORS.red, bg: COLORS.redTint };
}

function weekTitle(weekStart: string): string {
  return `W${weekNoOf(weekStart)}  ·  ${formatWeekLabel(weekStart)}`;
}

export async function renderWeeklyGoalsPdf(input: WeeklyGoalsPdfInput): Promise<Buffer> {
  const { employee, lastWeek, nextWeek, dashboard } = input;
  const name = employee.name?.trim() || "Employee";

  const doc = new PDFDocument({
    size: "A4",
    layout: "landscape",
    margin: 32,
    info: {
      Title: `Weekly Goals — ${name}`,
      Author: "Altus Corp Dashboard",
      Subject: "Weekly Goals Report",
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

  const lastWeekScore =
    dashboard.lastWeekScore ??
    weeklyScore(
      lastWeek.goals.map((g) => ({ acceptPct: g.acceptPct, pctDone: g.pctDone, weight: g.weight })),
    );

  // ── Page 1 — masthead + analytics band + last-week sheet ──
  masthead(doc, left, right, width, name);
  analyticsBand(doc, left, width, {
    lastWeek: lastWeekScore,
    thisWeek: dashboard.weekScore,
    thisMonth: dashboard.monthAvg ?? null,
    ytd: dashboard.ytdWeeklyAvg,
  });
  sheet(doc, left, right, width, {
    heading: "Last Week — Progress",
    subheading: weekTitle(lastWeek.weekStart),
    goals: lastWeek.goals,
    showScores: true,
  });
  footer(doc, left, right, width);

  // ── Page 2 — masthead + next-week committed sheet ──
  doc.addPage();
  masthead(doc, left, right, width, name);
  sheet(doc, left, right, width, {
    heading: "Next Week — Committed",
    subheading: weekTitle(nextWeek.weekStart),
    goals: nextWeek.goals,
    showScores: false,
  });
  footer(doc, left, right, width);

  doc.end();
  return done;
}

type Doc = InstanceType<typeof PDFDocument>;

function masthead(doc: Doc, left: number, right: number, width: number, name: string): void {
  // Watermark
  if (existsSync(MARK_PATH)) {
    try {
      const wm = 300;
      doc.save();
      doc.opacity(0.05);
      doc.image(MARK_PATH, doc.page.width / 2 - wm / 2, doc.page.height / 2 - wm / 2, { width: wm });
      doc.opacity(1);
      doc.restore();
    } catch {
      /* missing/corrupt asset */
    }
  }

  // Brand stripe
  doc.save().rect(0, 0, doc.page.width, 5).fill(COLORS.brand).restore();
  doc.save().rect(0, 5, doc.page.width, 1.2).fill(COLORS.brandDeep).restore();

  const headerTop = doc.page.margins.top + 2;
  let textX = left;
  if (existsSync(LOGO_PATH)) {
    try {
      const logoW = 120;
      doc.image(LOGO_PATH, left, headerTop, { width: logoW });
      textX = left + logoW + 16;
    } catch {
      /* text-only masthead */
    }
  }
  doc
    .font("Helvetica-Bold")
    .fontSize(18)
    .fillColor(COLORS.ink)
    .text("WEEKLY GOALS REPORT", textX, headerTop + 2, { characterSpacing: 0.6, lineBreak: false });
  doc
    .font("Helvetica")
    .fontSize(10)
    .fillColor(COLORS.inkSoft)
    .text(`${name}  ·  Private & Confidential`, textX, doc.y + 2, { lineBreak: false });

  // Generated-on, right-aligned
  doc
    .font("Helvetica")
    .fontSize(8.5)
    .fillColor(COLORS.inkFaint)
    .text(`${formatDate(new Date())} · ${format(new Date(), "HH:mm")}`, left, headerTop + 4, {
      width,
      align: "right",
      lineBreak: false,
    });

  doc.y = Math.max(doc.y, headerTop + 46) + 8;
}

function analyticsBand(
  doc: Doc,
  left: number,
  width: number,
  scores: { lastWeek: number; thisWeek: number; thisMonth: number | null; ytd: number },
): void {
  const tiles: Array<{ label: string; value: number | null }> = [
    { label: "LAST WEEK", value: scores.lastWeek },
    { label: "THIS WEEK", value: scores.thisWeek },
    { label: "THIS MONTH", value: scores.thisMonth },
    { label: "YTD AVG", value: scores.ytd },
  ];
  const gap = 12;
  const tileW = (width - gap * (tiles.length - 1)) / tiles.length;
  const tileH = 52;
  const top = doc.y;
  tiles.forEach((t, i) => {
    const x = left + i * (tileW + gap);
    const pal = t.value == null ? { fg: COLORS.inkMuted, bg: COLORS.zebra } : scorePalette(t.value);
    doc.save().roundedRect(x, top, tileW, tileH, 6).fill(pal.bg).restore();
    doc
      .save()
      .roundedRect(x, top, tileW, tileH, 6)
      .strokeColor(COLORS.hairline)
      .lineWidth(0.8)
      .stroke()
      .restore();
    doc
      .font("Helvetica-Bold")
      .fontSize(8)
      .fillColor(COLORS.inkSoft)
      .text(t.label, x + 12, top + 10, { characterSpacing: 0.8, lineBreak: false });
    doc
      .font("Helvetica-Bold")
      .fontSize(22)
      .fillColor(pal.fg)
      .text(t.value == null ? "—" : `${t.value}%`, x + 12, top + 22, { lineBreak: false });
  });
  doc.y = top + tileH + 16;
}

interface SheetOpts {
  heading: string;
  subheading: string;
  goals: WeeklyGoal[];
  showScores: boolean;
}

function sheet(doc: Doc, left: number, right: number, width: number, opts: SheetOpts): void {
  // Section title band
  const titleY = doc.y;
  doc.save().rect(left, titleY, width, 26).fill(COLORS.brand).restore();
  doc
    .font("Helvetica-Bold")
    .fontSize(12)
    .fillColor("#FFFFFF")
    .text(opts.heading.toUpperCase(), left + 12, titleY + 7.5, {
      characterSpacing: 0.8,
      lineBreak: false,
    });
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor("#FFFFFF")
    .text(opts.subheading, left, titleY + 9, { width: width - 12, align: "right", lineBreak: false });
  doc.y = titleY + 26 + 8;

  // Column geometry (landscape A4 usable width ≈ 730pt).
  const cols = [
    { key: "sr", label: "#", w: 24, align: "left" as const },
    { key: "goal", label: "AREA / GOAL", w: 232, align: "left" as const },
    { key: "uom", label: "UOM", w: 52, align: "left" as const },
    { key: "tgt", label: "TARGET", w: 62, align: "right" as const },
    { key: "act", label: "ACTUAL", w: 62, align: "right" as const },
    { key: "amt", label: "TGT AMT", w: 74, align: "right" as const },
    { key: "self", label: "% SELF", w: 50, align: "right" as const },
    { key: "acc", label: "ACCEPT%", w: 58, align: "right" as const },
  ];
  const totalW = cols.reduce((s, c) => s + c.w, 0);
  const scale = width / totalW;
  for (const c of cols) c.w = c.w * scale;

  const xOf = (idx: number) => left + cols.slice(0, idx).reduce((s, c) => s + c.w, 0);

  const drawHeaderRow = () => {
    const hy = doc.y;
    doc.save().rect(left, hy, width, 20).fill(COLORS.headFill).restore();
    cols.forEach((c, i) => {
      doc
        .font("Helvetica-Bold")
        .fontSize(7.5)
        .fillColor(COLORS.inkSoft)
        .text(c.label, xOf(i) + 6, hy + 6.5, {
          width: c.w - 10,
          align: c.align,
          characterSpacing: 0.4,
          lineBreak: false,
        });
    });
    doc.y = hy + 20;
    doc
      .save()
      .strokeColor(COLORS.hairlineStrong)
      .lineWidth(0.8)
      .moveTo(left, doc.y)
      .lineTo(right, doc.y)
      .stroke()
      .restore();
  };

  drawHeaderRow();

  if (opts.goals.length === 0) {
    doc
      .font("Helvetica-Oblique")
      .fontSize(10)
      .fillColor(COLORS.inkFaint)
      .text("No goals recorded for this week.", left + 6, doc.y + 12, { lineBreak: false });
    doc.y += 32;
    return;
  }

  const sorted = [...opts.goals].sort((a, b) => a.position - b.position);
  const ROW_H = 22;
  const pageBottom = doc.page.height - doc.page.margins.bottom - 40;
  let z = 0;

  for (const g of sorted) {
    if (doc.y + ROW_H > pageBottom) {
      doc.addPage();
      masthead(doc, left, right, width, "");
      drawHeaderRow();
    }
    const y = doc.y;
    if (z % 2 === 1) {
      doc.save().rect(left, y, width, ROW_H).fill(COLORS.zebra).restore();
    }
    z++;

    const self = g.pctDone ?? 0;
    const eff = effectivePct({ acceptPct: g.acceptPct, pctDone: g.pctDone });
    const goalText = [g.area, g.subject || g.targetDone || "(untitled)"]
      .filter(Boolean)
      .join(" · ");

    const cell = (idx: number, text: string, bold = false, color: string = COLORS.inkMuted) => {
      const c = cols[idx];
      if (!c) return;
      doc
        .font(bold ? "Helvetica-Bold" : "Helvetica")
        .fontSize(8.5)
        .fillColor(color)
        .text(text, xOf(idx) + 6, y + 6, {
          width: c.w - 10,
          align: c.align,
          lineBreak: false,
          ellipsis: true,
        });
    };

    cell(0, String(g.position), false, COLORS.inkSoft);
    cell(1, goalText, true, COLORS.ink);
    cell(2, g.uom || "—");
    cell(3, num(g.targetQty));
    cell(4, num(g.actualQty));
    cell(5, num(g.targetAmount));
    if (opts.showScores) {
      cell(6, `${self}%`, true);
      cell(7, g.acceptPct == null ? "—" : `${g.acceptPct}%`, true, scorePalette(eff).fg);
    } else {
      cell(6, "—");
      cell(7, "—");
    }

    doc.y = y + ROW_H;
    doc
      .save()
      .strokeColor(COLORS.hairline)
      .lineWidth(0.4)
      .moveTo(left, doc.y)
      .lineTo(right, doc.y)
      .stroke()
      .restore();
  }
  doc.y += 8;
}

function footer(doc: Doc, left: number, right: number, width: number): void {
  const footerY = doc.page.height - doc.page.margins.bottom - 14;
  doc
    .save()
    .strokeColor(COLORS.hairline)
    .lineWidth(0.5)
    .moveTo(left, footerY - 8)
    .lineTo(right, footerY - 8)
    .stroke()
    .restore();
  doc
    .font("Helvetica")
    .fontSize(7.5)
    .fillColor(COLORS.inkSoft)
    .text(
      "Altus Corp · Goals Cascade · computer-generated weekly goals report — effective % = accepted % where reviewed, else self %.",
      left,
      footerY,
      { width, lineBreak: false },
    );
}
