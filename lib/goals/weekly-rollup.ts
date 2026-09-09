import "server-only";
import PDFDocument from "pdfkit";
import { existsSync } from "node:fs";
import path from "node:path";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees, weeklyGoals } from "@/db/schema";
import { weeklyScore } from "@/lib/weekly-goals/effective";
import { nextWeekStart, formatWeekLabel } from "@/lib/weekly-goals/week";

/**
 * Sunday manager ROLLUP (Sir #27) — for a manager + their direct reports: last
 * week's % vs the number of goals committed for next week, and who wrote nothing
 * at all. Delivered to Manan on WhatsApp + email every Sunday 9 am.
 */

export interface RollupRow {
  id: string;
  name: string;
  lastPct: number; // weighted score of last week's goals
  lastCount: number;
  nextCount: number;
  wroteNothing: boolean; // no goals last week AND none committed for next week
}

export interface ManagerRollup {
  manager: { id: string; name: string };
  anchorWeek: string;
  nextWeek: string;
  weekLabel: string;
  rows: RollupRow[];
  notWritten: number;
  teamLastAvg: number;
}

/** Build the rollup for a manager + active direct reports, anchored on a week. */
export async function buildManagerRollup(
  managerId: string,
  anchorWeekStart: string,
): Promise<ManagerRollup> {
  const next = nextWeekStart(anchorWeekStart);

  const [mgrRow] = await db
    .select({ id: employees.id, name: employees.name })
    .from(employees)
    .where(eq(employees.id, managerId))
    .limit(1);
  const reports = await db
    .select({ id: employees.id, name: employees.name })
    .from(employees)
    .where(and(eq(employees.managerId, managerId), eq(employees.isActive, true)));

  const people = [
    ...(mgrRow ? [mgrRow] : []),
    ...reports.filter((r) => r.id !== managerId),
  ];
  const ids = people.map((p) => p.id);

  const goals = ids.length
    ? await db
        .select({
          employeeId: weeklyGoals.employeeId,
          weekStart: weeklyGoals.weekStart,
          acceptPct: weeklyGoals.acceptPct,
          pctDone: weeklyGoals.pctDone,
          weight: weeklyGoals.weight,
        })
        .from(weeklyGoals)
        .where(
          and(
            inArray(weeklyGoals.employeeId, ids),
            inArray(weeklyGoals.weekStart, [anchorWeekStart, next]),
            eq(weeklyGoals.archived, false),
          ),
        )
    : [];

  const rows: RollupRow[] = people.map((p) => {
    const last = goals.filter((g) => g.employeeId === p.id && g.weekStart === anchorWeekStart);
    const nextG = goals.filter((g) => g.employeeId === p.id && g.weekStart === next);
    return {
      id: p.id,
      name: p.name ?? "—",
      lastPct: last.length ? weeklyScore(last) : 0,
      lastCount: last.length,
      nextCount: nextG.length,
      wroteNothing: last.length === 0 && nextG.length === 0,
    };
  });

  const notWritten = rows.filter((r) => r.wroteNothing).length;
  const scored = rows.filter((r) => r.lastCount > 0);
  const teamLastAvg = scored.length ? Math.round(scored.reduce((s, r) => s + r.lastPct, 0) / scored.length) : 0;

  return {
    manager: mgrRow ?? { id: managerId, name: "Manager" },
    anchorWeek: anchorWeekStart,
    nextWeek: next,
    weekLabel: formatWeekLabel(anchorWeekStart),
    rows,
    notWritten,
    teamLastAvg,
  };
}

const RED = "#E10600";
const INK = "#0f172a";
const MUTE = "#64748b";

function pctColor(p: number): string {
  return p >= 70 ? "#15803d" : p >= 40 ? "#b45309" : "#b91c1c";
}

/** Render a one-page branded rollup PDF for a manager's team. */
export async function renderManagerRollupPdf(r: ManagerRollup): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: 44 });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  const logo = path.join(process.cwd(), "public", "logo.png");
  if (existsSync(logo)) {
    try {
      doc.image(logo, 44, 40, { height: 26 });
    } catch {
      /* ignore */
    }
  }
  doc.fillColor(RED).fontSize(11).font("Helvetica-Bold").text("ALTUS CORP · WEEKLY GOALS", 44, 72);
  doc.fillColor(INK).fontSize(20).font("Helvetica-Bold").text(`${r.manager.name} — team review`, 44, 88);
  doc
    .fillColor(MUTE)
    .fontSize(11)
    .font("Helvetica")
    .text(`Week of ${r.weekLabel} · last week vs next week · team avg ${r.teamLastAvg}%`, 44, 114);

  // Not-written banner
  doc
    .roundedRect(44, 138, 507, 30, 6)
    .fill(r.notWritten > 0 ? "#FEF2F2" : "#F0FDF4");
  doc
    .fillColor(r.notWritten > 0 ? "#b91c1c" : "#15803d")
    .fontSize(12)
    .font("Helvetica-Bold")
    .text(
      r.notWritten > 0
        ? `${r.notWritten} of ${r.rows.length} wrote NO goals at all`
        : `Everyone (${r.rows.length}) has written goals`,
      54,
      147,
    );

  // Table header
  let y = 190;
  const cols = { name: 44, last: 300, lastN: 390, nextN: 460, status: 500 };
  doc.fillColor(MUTE).fontSize(9).font("Helvetica-Bold");
  doc.text("PERSON", cols.name, y);
  doc.text("LAST %", cols.last, y);
  doc.text("LAST", cols.lastN, y);
  doc.text("NEXT", cols.nextN, y);
  doc.text("STATUS", cols.status, y);
  y += 16;
  doc.moveTo(44, y).lineTo(551, y).strokeColor("#e2e8f0").stroke();
  y += 8;

  for (const row of r.rows) {
    if (y > 780) {
      doc.addPage();
      y = 60;
    }
    doc.fillColor(INK).fontSize(11).font("Helvetica-Bold").text(row.name, cols.name, y, { width: 250, ellipsis: true });
    doc.fillColor(pctColor(row.lastPct)).font("Helvetica-Bold").text(`${row.lastPct}%`, cols.last, y);
    doc.fillColor(MUTE).font("Helvetica").text(String(row.lastCount), cols.lastN, y);
    doc.fillColor(MUTE).text(String(row.nextCount), cols.nextN, y);
    doc
      .fillColor(row.wroteNothing ? "#b91c1c" : "#15803d")
      .font("Helvetica-Bold")
      .fontSize(10)
      .text(row.wroteNothing ? "MISSING" : "OK", cols.status, y);
    y += 22;
  }

  doc
    .fillColor(MUTE)
    .fontSize(8)
    .font("Helvetica")
    .text("Generated by Altus Corp Dashboard · Sunday weekly goals report", 44, 812);

  doc.end();
  return done;
}
