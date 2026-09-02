import "server-only";
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees } from "@/db/schema";
import { listSalaryProfiles } from "@/lib/queries/salary";
import { weekReportFor } from "@/lib/reports/attendance-report-data";
import { getDownlineIds } from "@/lib/weekly-goals/hierarchy";
import { businessEmailFor } from "@/lib/email/recipients";
import type { RosterRow } from "@/lib/email/report-emails";

/**
 * Sunday-morning ROLLUP data — who gets one weekly attendance + money-lost
 * email, and which people are in it.
 *
 * Two audiences, one computation:
 *   • every manager  → the people BELOW them (full transitive downline)
 *   • Manan (founder) → every active employee
 *
 * The week is graded ONCE per employee here and then fanned out, so a manager's
 * numbers, the founder's numbers and the employee's own Sunday report can never
 * disagree — they are literally the same `weekReportFor` result.
 *
 * Hierarchy comes from `getDownlineIds` (the same recursive CTE Weekly-Goals
 * uses), never a second walk of `manager_id`, so "below me" means one thing
 * everywhere in the app.
 */

/** One recipient's finished email payload. */
export interface RollupRecipient {
  employeeId: string | null;
  name: string;
  /** Work address. Never a personal mailbox — see `businessEmailFor`. */
  email: string;
  /** Sub-heading, e.g. "Priya Shah's team". */
  scopeLabel: string;
  /** Short subject-line scope. */
  subjectScope: string;
  rows: RosterRow[];
  totalLost: number;
}

export interface WeeklyRollup {
  weekStart: string;
  weekEnd: string;
  /** "14–20 Jul 2026" — empty when nobody had a working day. */
  weekLabel: string;
  /** Employees graded this week (skipping anyone with no working day). */
  graded: number;
  managers: RollupRecipient[];
  /** Null when the founder has no row / no work address on file. */
  founder: RollupRecipient | null;
}

const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-07-14" + "2026-07-20" → "14–20 Jul 2026". */
export function weekLabel(startYmd: string, endYmd: string): string {
  const [sy, sm, sd] = startYmd.split("-");
  const [, em, ed] = endYmd.split("-");
  const left = sm === em ? `${Number(sd)}` : `${Number(sd)} ${MONTH[Number(sm) - 1]}`;
  return `${left}–${Number(ed)} ${MONTH[Number(em) - 1]} ${sy}`;
}

function sumLost(rows: RosterRow[]): number {
  return rows.reduce((sum, r) => sum + r.totals.salaryReduced, 0);
}

/** Possessive that reads right for names already ending in s ("Ramesh Das' team"). */
function possessive(name: string): string {
  return name.endsWith("s") ? `${name}'` : `${name}'s`;
}

/**
 * Build every Sunday-morning rollup email for the just-ended week.
 *
 * `founderEmailLogin` is the founder's LOGIN address (the identity), used only
 * to find their employee row — the mail itself goes to that row's business
 * address.
 */
export async function buildWeeklyAttendanceRollup(args: {
  now?: Date;
  founderEmailLogin: string;
}): Promise<WeeklyRollup> {
  const now = args.now ?? new Date();
  const profiles = await listSalaryProfiles();

  // Grade the week once per employee. A person with no working day (all off /
  // no punches) is left out entirely rather than shown as an all-zero row.
  const byId = new Map<string, RosterRow>();
  let weekStart = "";
  let weekEnd = "";
  for (const p of profiles) {
    try {
      const report = await weekReportFor(
        p.employeeId,
        p.annualCtc > 0 ? p.annualCtc / 12 : 0,
        now,
      );
      weekStart = report.weekStart;
      weekEnd = report.weekEnd;
      if (report.days.length === 0) continue;
      byId.set(p.employeeId, { name: p.name, totals: report.totals });
    } catch (err) {
      // One unreadable employee must never cost every manager their report.
      console.error(`[weekly-attendance-rollup] grading failed for ${p.employeeId}`, err);
    }
  }

  const label = weekStart && weekEnd ? weekLabel(weekStart, weekEnd) : "";

  // Everyone who manages at least one ACTIVE person, with the address their
  // report goes to.
  const managerRows = await db
    .selectDistinct({ managerId: employees.managerId })
    .from(employees)
    .where(and(eq(employees.isActive, true), isNotNull(employees.managerId)));
  const managerIds = managerRows
    .map((m) => m.managerId)
    .filter((id): id is string => !!id);

  // `listSalaryProfiles` is already the active-employee roster, so a manager who
  // is no longer active simply isn't in it — no closed mailbox gets a report,
  // and no second per-manager round-trip is needed to find that out.
  const profileById = new Map(profiles.map((p) => [p.employeeId, p]));

  const [founderRow] = await db
    .select({
      id: employees.id,
      name: employees.name,
      email: employees.email,
      officialEmail: employees.officialEmail,
    })
    .from(employees)
    .where(eq(employees.email, args.founderEmailLogin))
    .limit(1);

  const managers: RollupRecipient[] = [];
  for (const managerId of managerIds) {
    // Manan sits at the top of the chart, so his "team" email would be a subset
    // of the org-wide one he already gets below. One email, not two.
    if (founderRow && managerId === founderRow.id) continue;
    const mgr = profileById.get(managerId);
    if (!mgr) continue;
    const to = businessEmailFor(mgr);
    if (!to) continue;

    // Full downline: reports, reports-of-reports, all the way down.
    const downline = await getDownlineIds(managerId);
    const rows = downline
      .map((id) => byId.get(id))
      .filter((r): r is RosterRow => !!r)
      .sort((a, b) => a.name.localeCompare(b.name));
    if (rows.length === 0) continue;

    managers.push({
      employeeId: managerId,
      name: mgr.name,
      email: to,
      scopeLabel: `${possessive(mgr.name)} team`,
      subjectScope: `${possessive(mgr.name)} team`,
      rows,
      totalLost: sumLost(rows),
    });
  }
  managers.sort((a, b) => a.name.localeCompare(b.name));

  // Manan — every active employee in one email.
  const allRows = [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  const founderTo = founderRow
    ? businessEmailFor(founderRow)
    : args.founderEmailLogin;
  const founder: RollupRecipient | null =
    founderTo && allRows.length > 0
      ? {
          employeeId: founderRow?.id ?? null,
          name: founderRow?.name ?? "Manan",
          email: founderTo,
          scopeLabel: "All employees",
          subjectScope: "all employees",
          rows: allRows,
          totalLost: sumLost(allRows),
        }
      : null;

  return {
    weekStart,
    weekEnd,
    weekLabel: label,
    graded: byId.size,
    managers,
    founder,
  };
}
