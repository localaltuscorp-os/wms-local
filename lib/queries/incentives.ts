import "server-only";
import { and, asc, desc, eq, gte, lt, or } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  incentiveCatalog,
  incentiveEntries,
  incentiveParticipants,
  incentiveProjects,
  incentiveTargets,
  employees,
  type IncentiveCatalog,
  type IncentiveEntry,
  type IncentiveParticipant,
  type IncentiveProject,
  type IncentiveTarget,
} from "@/db/schema";

/**
 * Read queries for the Incentive MIS module (migration 0064 / native rebuild
 * of the "Altus Eco System MIS" incentive tabs). All money is numeric(14,2)
 * stored — Drizzle returns it as strings; we parse to numbers only inside the
 * dashboard aggregator and keep raw strings on the list rows. `unpaid` is
 * always DERIVED (approved − paid); it is never stored.
 *
 * These three named people are operational/admin actors whose incentive rows
 * exist in the sheet for bookkeeping but must NOT count toward dashboard
 * aggregates or the leaderboard.
 */
const EXCLUDED = new Set<string>(["Manan Vasa", "Dattaram Kap", "Parvez Khan"]);

function num(v: string | null | undefined): number {
  if (!v) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function isExcluded(name: string | null | undefined): boolean {
  return name ? EXCLUDED.has(name.trim()) : false;
}

/**
 * Name-keys of REMOVED (inactive) employees — their incentive rows are dropped
 * from the dashboard so a left-out person no longer shows. Names that match NO
 * employee (aliases) are kept, so only truly-removed people are filtered.
 */
export async function removedNameKeys(): Promise<Set<string>> {
  const rows = await db
    .select({ name: employees.name })
    .from(employees)
    .where(eq(employees.isActive, false));
  return new Set(rows.map((r) => nameKey(r.name)).filter(Boolean));
}

/** [start, end) date bounds for a calendar year, as YYYY-MM-DD strings. */
function yearBounds(year: number): { start: string; end: string } {
  return { start: `${year}-01-01`, end: `${year + 1}-01-01` };
}

/** Two-digit zero-pad. */
function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** First-of-month YYYY-MM-DD for a (year, 1-based month). */
function monthStart(year: number, month1: number): string {
  return `${year}-${pad2(month1)}-01`;
}

/** First-of-NEXT-month YYYY-MM-DD for a "YYYY-MM" key (exclusive upper bound). */
function monthEndExclusive(month: string): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return `${ny}-${pad2(nm)}-01`;
}

/** A normalised key for matching ledger names to employee names. */
function nameKey(name: string | null | undefined): string {
  return (name ?? "").trim().toLowerCase();
}

// --- list queries ----------------------------------------------------------

/** The incentive chart / catalog, active first then by sort order. */
export async function listIncentiveCatalog(): Promise<IncentiveCatalog[]> {
  return db
    .select()
    .from(incentiveCatalog)
    .orderBy(asc(incentiveCatalog.sortOrder), asc(incentiveCatalog.name));
}

/** Permanent-incentive ledger rows, newest period first. Optional year filter. */
export async function listIncentiveEntries(
  opts: { year?: number } = {},
): Promise<IncentiveEntry[]> {
  const where =
    opts.year != null
      ? and(
          gte(incentiveEntries.periodMonth, yearBounds(opts.year).start),
          lt(incentiveEntries.periodMonth, yearBounds(opts.year).end),
        )
      : undefined;
  return db
    .select()
    .from(incentiveEntries)
    .where(where)
    .orderBy(desc(incentiveEntries.periodMonth), desc(incentiveEntries.srcSrNo));
}

/** Project-based incentive rows, newest period first. Optional year filter. */
export async function listIncentiveProjects(
  opts: { year?: number } = {},
): Promise<IncentiveProject[]> {
  const where =
    opts.year != null
      ? and(
          gte(incentiveProjects.periodMonth, yearBounds(opts.year).start),
          lt(incentiveProjects.periodMonth, yearBounds(opts.year).end),
        )
      : undefined;
  return db
    .select()
    .from(incentiveProjects)
    .where(where)
    .orderBy(desc(incentiveProjects.periodMonth), desc(incentiveProjects.srcSrNo));
}

// --- dashboard --------------------------------------------------------------

export interface IncentiveTotals {
  /** Approved-amount basis (what was earned/owed). */
  approved: number;
  /** Booked = client made a PARTIAL payment (WS-4 Phase B). Zero for legacy rows. */
  booked: number;
  /** Accrued = client paid in FULL (backfilled from approved). Earnings basis. */
  accrued: number;
  paid: number;
  unpaid: number;
}

export interface IncentivePersonRow {
  name: string;
  permanent: number; // approved permanent incentives
  project: number; // approved project incentives (emp + intern share, as applicable)
  total: number;
  paid: number;
  unpaid: number;
}

export interface IncentiveNameRow {
  name: string;
  count: number;
  approved: number;
  paid: number;
  unpaid: number;
}

export interface IncentiveMonthRow {
  /** First-of-month YYYY-MM-DD. */
  month: string;
  permanent: number;
  project: number;
  total: number;
  paid: number;
  unpaid: number;
}

export interface IncentiveDashboard {
  year: number;
  /** Consolidated YTD totals across permanent + project. */
  consolidated: IncentiveTotals;
  /** Permanent (entries) YTD totals only. */
  permanent: IncentiveTotals;
  /** Project YTD totals only. */
  project: IncentiveTotals;
  /** Per-employee YTD (permanent + project, paid/unpaid), sorted desc by total. */
  perEmployee: IncentivePersonRow[];
  /** Per-incentive-name YTD (permanent ledger), sorted desc by approved. */
  perIncentiveName: IncentiveNameRow[];
  /** Monthly series (Jan→Dec rows that have data), ascending by month. */
  monthly: IncentiveMonthRow[];
  /** Leaderboard = top earners by approved total (same shape as perEmployee). */
  leaderboard: IncentivePersonRow[];
}

/**
 * Consolidated YTD incentive dashboard for the given calendar `year`.
 * Aggregates the (small) permanent-entry and project ledgers in memory.
 * Excluded operational actors (see EXCLUDED) are dropped from every roll-up.
 */
export async function getIncentiveDashboard(year: number): Promise<IncentiveDashboard> {
  const [entries, projects, removed] = await Promise.all([
    listIncentiveEntries({ year }),
    listIncentiveProjects({ year }),
    removedNameKeys(),
  ]);
  const dropped = (name: string | null | undefined) => isExcluded(name) || removed.has(nameKey(name));

  const zero = (): IncentiveTotals => ({ approved: 0, booked: 0, accrued: 0, paid: 0, unpaid: 0 });
  const permanent = zero();
  const project = zero();

  const people = new Map<string, IncentivePersonRow>();
  const names = new Map<string, IncentiveNameRow>();
  const months = new Map<string, IncentiveMonthRow>();

  function person(name: string): IncentivePersonRow {
    let p = people.get(name);
    if (!p) {
      p = { name, permanent: 0, project: 0, total: 0, paid: 0, unpaid: 0 };
      people.set(name, p);
    }
    return p;
  }
  function month(m: string): IncentiveMonthRow {
    let row = months.get(m);
    if (!row) {
      row = { month: m, permanent: 0, project: 0, total: 0, paid: 0, unpaid: 0 };
      months.set(m, row);
    }
    return row;
  }

  // Permanent entries — name resolved from the raw emp_name column.
  for (const e of entries) {
    if (dropped(e.empName)) continue;
    const approved = num(e.approvedAmt);
    const paid = num(e.paidAmt);
    const unpaid = Math.max(0, approved - paid);

    permanent.approved += approved;
    permanent.booked += num(e.bookedAmt);
    permanent.accrued += num(e.accruedAmt);
    permanent.paid += paid;
    permanent.unpaid += unpaid;

    const p = person(e.empName.trim());
    p.permanent += approved;
    p.total += approved;
    p.paid += paid;
    p.unpaid += unpaid;

    const nm = e.incentiveName.trim();
    let n = names.get(nm);
    if (!n) {
      n = { name: nm, count: 0, approved: 0, paid: 0, unpaid: 0 };
      names.set(nm, n);
    }
    n.count += 1;
    n.approved += approved;
    n.paid += paid;
    n.unpaid += unpaid;

    if (e.periodMonth) {
      const mo = month(e.periodMonth);
      mo.permanent += approved;
      mo.total += approved;
      mo.paid += paid;
      mo.unpaid += unpaid;
    }
  }

  // Project incentives — supervisor (emp share) + intern (intern share) legs.
  for (const pr of projects) {
    const legs: Array<{ name: string | null; approved: number; booked: number; accrued: number; paid: number }> = [
      {
        name: pr.supervisorName,
        approved: num(pr.empApprovedAmt),
        booked: num(pr.empBookedAmt),
        accrued: num(pr.empAccruedAmt),
        paid: num(pr.empPaidAmt),
      },
      {
        name: pr.internName,
        approved: num(pr.internApprovedAmt),
        booked: num(pr.internBookedAmt),
        accrued: num(pr.internAccruedAmt),
        paid: num(pr.internPaidAmt),
      },
    ];
    for (const leg of legs) {
      if (!leg.name || dropped(leg.name) || leg.name.trim().toLowerCase() === "none") {
        continue;
      }
      const approved = leg.approved;
      const paid = leg.paid;
      const unpaid = Math.max(0, approved - paid);
      if (approved === 0 && paid === 0) continue;

      project.approved += approved;
      project.booked += leg.booked;
      project.accrued += leg.accrued;
      project.paid += paid;
      project.unpaid += unpaid;

      const p = person(leg.name.trim());
      p.project += approved;
      p.total += approved;
      p.paid += paid;
      p.unpaid += unpaid;

      if (pr.periodMonth) {
        const mo = month(pr.periodMonth);
        mo.project += approved;
        mo.total += approved;
        mo.paid += paid;
        mo.unpaid += unpaid;
      }
    }
  }

  const consolidated: IncentiveTotals = {
    approved: permanent.approved + project.approved,
    booked: permanent.booked + project.booked,
    accrued: permanent.accrued + project.accrued,
    paid: permanent.paid + project.paid,
    unpaid: permanent.unpaid + project.unpaid,
  };

  const perEmployee = [...people.values()].sort((a, b) => b.total - a.total);
  const perIncentiveName = [...names.values()].sort((a, b) => b.approved - a.approved);
  const monthly = [...months.values()].sort((a, b) => a.month.localeCompare(b.month));
  const leaderboard = perEmployee.slice(0, 10);

  return {
    year,
    consolidated,
    permanent,
    project,
    perEmployee,
    perIncentiveName,
    monthly,
    leaderboard,
  };
}

// --- shared-key contract: incentive PAID by person (WS-4 owns) --------------

/**
 * CANONICAL incentive-PAID producer — the single source PMS (grade bands) and
 * Salary (combined earnings doc) both READ. Sums money actually PAID OUT to each
 * person for the "YYYY-MM" `month`: permanent `paid_amt` + project paid legs
 * (Permanent + Ad-hoc combined once ad-hoc lands), excluding operational actors.
 * PAID only — never booked/accrued/approved.
 *
 * Returns a Map keyed BOTH by normalised name AND by employeeId (when known),
 * each pointing at that person's FULL paid total, so a caller can look up by
 * whichever identity it holds. Salary's / attendance's paid-lookups must ALIAS
 * this function, not re-implement it, so the number never drifts.
 */
export async function getIncentivePaidByPerson(month: string): Promise<Map<string, number>> {
  const start = `${month}-01`;
  const end = monthEndExclusive(month);
  const [entries, projects, participants] = await Promise.all([
    db
      .select()
      .from(incentiveEntries)
      .where(and(gte(incentiveEntries.periodMonth, start), lt(incentiveEntries.periodMonth, end))),
    db
      .select()
      .from(incentiveProjects)
      .where(and(gte(incentiveProjects.periodMonth, start), lt(incentiveProjects.periodMonth, end))),
    db
      .select()
      .from(incentiveParticipants)
      .where(and(gte(incentiveParticipants.periodMonth, start), lt(incentiveParticipants.periodMonth, end))),
  ]);

  // Group participant rows by their parent (entry XOR project). When a parent
  // has participants, they REPLACE its own leg amounts (no double-count).
  const partByEntry = new Map<string, IncentiveParticipant[]>();
  const partByProject = new Map<string, IncentiveParticipant[]>();
  for (const p of participants) {
    if (p.entryId) {
      const arr = partByEntry.get(p.entryId) ?? [];
      arr.push(p);
      partByEntry.set(p.entryId, arr);
    } else if (p.projectId) {
      const arr = partByProject.get(p.projectId) ?? [];
      arr.push(p);
      partByProject.set(p.projectId, arr);
    }
  }

  // Accumulate per normalised name, remembering the first employeeId we see.
  const byName = new Map<string, { id: string | null; paid: number }>();
  const bump = (name: string | null | undefined, id: string | null | undefined, paid: number) => {
    if (!name || paid === 0 || isExcluded(name) || name.trim().toLowerCase() === "none") return;
    const key = nameKey(name);
    if (!key) return;
    const cur = byName.get(key) ?? { id: null, paid: 0 };
    cur.paid += paid;
    if (id && !cur.id) cur.id = id;
    byName.set(key, cur);
  };

  for (const e of entries) {
    const parts = partByEntry.get(e.id);
    if (parts && parts.length) for (const p of parts) bump(p.empName, p.employeeId, num(p.paidAmt));
    else bump(e.empName, e.employeeId, num(e.paidAmt));
  }
  for (const pr of projects) {
    const parts = partByProject.get(pr.id);
    if (parts && parts.length) {
      for (const p of parts) bump(p.empName, p.employeeId, num(p.paidAmt));
    } else {
      bump(pr.supervisorName, pr.supervisorId, num(pr.empPaidAmt));
      bump(pr.internName, pr.internId, num(pr.internPaidAmt));
    }
  }

  // Emit both keys → the same full total, so lookup by name OR id works.
  const out = new Map<string, number>();
  for (const [key, v] of byName) {
    out.set(key, v.paid);
    if (v.id) out.set(v.id, v.paid);
  }
  return out;
}

// --- monthly digest ---------------------------------------------------------

/** One recent ledger line for the per-employee monthly digest. */
export interface IncentiveDigestEntryRow {
  label: string;
  periodMonth: string | null;
  approved: number;
  paid: boolean;
}

/** A single recipient's incentive roll-up for a [start, end) period. */
export interface IncentivePeriodSummary {
  /** Normalised name key this summary is bucketed under. */
  nameKey: string;
  /** Display name (from the most recent matching ledger row). */
  displayName: string;
  approved: number;
  paid: number;
  unpaid: number;
  entryCount: number;
  /** Newest-first recent lines (capped). */
  recent: IncentiveDigestEntryRow[];
}

const RECENT_LIMIT = 6;

/**
 * Per-EMPLOYEE incentive summaries for the [start, end) month window — used by
 * the monthly-digest cron. Mirrors the dashboard aggregator (same EXCLUDED set,
 * same permanent + project legs, derived unpaid) but:
 *   - filters by an arbitrary period range instead of a calendar year, and
 *   - keys rows by NORMALISED NAME (the ledger stores names, not always a FK),
 *     so the cron can match each active employee to their rows by name.
 *
 * `start`/`end` are YYYY-MM-DD strings; the window is [start, end).
 * The returned map is keyed by `nameKey` (lower-cased, trimmed name).
 */
export async function getIncentivePeriodSummaries(
  start: string,
  end: string,
): Promise<Map<string, IncentivePeriodSummary>> {
  const [entries, projects] = await Promise.all([
    db
      .select()
      .from(incentiveEntries)
      .where(
        and(
          gte(incentiveEntries.periodMonth, start),
          lt(incentiveEntries.periodMonth, end),
        ),
      )
      .orderBy(desc(incentiveEntries.periodMonth), desc(incentiveEntries.srcSrNo)),
    db
      .select()
      .from(incentiveProjects)
      .where(
        and(
          gte(incentiveProjects.periodMonth, start),
          lt(incentiveProjects.periodMonth, end),
        ),
      )
      .orderBy(desc(incentiveProjects.periodMonth), desc(incentiveProjects.srcSrNo)),
  ]);

  const byName = new Map<string, IncentivePeriodSummary>();

  function bucket(name: string): IncentivePeriodSummary {
    const key = nameKey(name);
    let s = byName.get(key);
    if (!s) {
      s = {
        nameKey: key,
        displayName: name.trim(),
        approved: 0,
        paid: 0,
        unpaid: 0,
        entryCount: 0,
        recent: [],
      };
      byName.set(key, s);
    }
    return s;
  }

  function addRecent(s: IncentivePeriodSummary, row: IncentiveDigestEntryRow): void {
    if (s.recent.length < RECENT_LIMIT) s.recent.push(row);
  }

  // Permanent entries — already newest-first.
  for (const e of entries) {
    if (isExcluded(e.empName)) continue;
    const approved = num(e.approvedAmt);
    const paid = num(e.paidAmt);
    if (approved === 0 && paid === 0) continue;

    const s = bucket(e.empName);
    s.approved += approved;
    s.paid += paid;
    s.unpaid += Math.max(0, approved - paid);
    s.entryCount += 1;
    addRecent(s, {
      label: e.incentiveName.trim() || "Incentive",
      periodMonth: e.periodMonth,
      approved,
      paid: approved > 0 && paid >= approved,
    });
  }

  // Project incentives — supervisor + intern legs.
  for (const pr of projects) {
    const legs: Array<{ name: string | null; approved: number; paid: number }> = [
      { name: pr.supervisorName, approved: num(pr.empApprovedAmt), paid: num(pr.empPaidAmt) },
      { name: pr.internName, approved: num(pr.internApprovedAmt), paid: num(pr.internPaidAmt) },
    ];
    for (const leg of legs) {
      if (!leg.name || isExcluded(leg.name) || leg.name.trim().toLowerCase() === "none") {
        continue;
      }
      const approved = leg.approved;
      const paid = leg.paid;
      if (approved === 0 && paid === 0) continue;

      const s = bucket(leg.name);
      s.approved += approved;
      s.paid += paid;
      s.unpaid += Math.max(0, approved - paid);
      s.entryCount += 1;
      addRecent(s, {
        label: pr.projectName?.trim() || "Project incentive",
        periodMonth: pr.periodMonth,
        approved,
        paid: approved > 0 && paid >= approved,
      });
    }
  }

  return byName;
}

// --- target vs actual (slice C) --------------------------------------------

export interface IncentiveTargetVsActualRow {
  empName: string;
  target: number;
  /** Approved (earned) YTD — same basis as the dashboard's per-person `total`. */
  actual: number;
  /** actual / target × 100, or null when no target is set. */
  attainmentPct: number | null;
}

export interface IncentiveTargetVsActual {
  year: number;
  rows: IncentiveTargetVsActualRow[];
  totals: {
    target: number;
    actual: number;
    attainmentPct: number | null;
  };
}

/**
 * Per-person TARGET (sum of incentive_targets rows in `year`) vs ACTUAL earned
 * (the dashboard's approved per-person total for the same year). Same EXCLUDED
 * set as the dashboard. Includes people who have a target but no earnings yet
 * (and vice-versa). Sorted by actual desc, then target desc.
 */
export async function getIncentiveTargetVsActual(
  year: number,
): Promise<IncentiveTargetVsActual> {
  const { start, end } = yearBounds(year);
  const [dashboard, targets, removed] = await Promise.all([
    getIncentiveDashboard(year),
    db
      .select()
      .from(incentiveTargets)
      .where(
        and(
          gte(incentiveTargets.periodMonth, start),
          lt(incentiveTargets.periodMonth, end),
        ),
      ),
    removedNameKeys(),
  ]);

  // Bucket targets by display name (keyed case-insensitively, mirroring the
  // ledger's name-based identity), summing across months. Removed (inactive)
  // employees are dropped so a left-out person never shows on the targets tab.
  const targetByKey = new Map<string, { name: string; target: number }>();
  for (const t of targets) {
    if (isExcluded(t.empName) || removed.has(nameKey(t.empName))) continue;
    const key = nameKey(t.empName);
    if (!key) continue;
    const cur = targetByKey.get(key);
    if (cur) cur.target += num(t.targetAmount);
    else targetByKey.set(key, { name: t.empName.trim(), target: num(t.targetAmount) });
  }

  // Actual earned per person from the dashboard roll-up.
  const actualByKey = new Map<string, { name: string; actual: number }>();
  for (const p of dashboard.perEmployee) {
    const key = nameKey(p.name);
    if (!key) continue;
    actualByKey.set(key, { name: p.name, actual: p.total });
  }

  const keys = new Set<string>([...targetByKey.keys(), ...actualByKey.keys()]);
  const rows: IncentiveTargetVsActualRow[] = [];
  for (const key of keys) {
    const tgt = targetByKey.get(key);
    const act = actualByKey.get(key);
    const target = tgt?.target ?? 0;
    const actual = act?.actual ?? 0;
    rows.push({
      empName: act?.name ?? tgt?.name ?? key,
      target,
      actual,
      attainmentPct: target > 0 ? (actual / target) * 100 : null,
    });
  }

  rows.sort((a, b) => b.actual - a.actual || b.target - a.target);

  const totalTarget = rows.reduce((s, r) => s + r.target, 0);
  const totalActual = rows.reduce((s, r) => s + r.actual, 0);

  return {
    year,
    rows,
    totals: {
      target: totalTarget,
      actual: totalActual,
      attainmentPct: totalTarget > 0 ? (totalActual / totalTarget) * 100 : null,
    },
  };
}

// --- admin entries list (slice C) ------------------------------------------

/** A flat, JSON-safe incentive-entry row for the admin Entries tab. Numeric
 *  money columns are returned as numbers (the table stores them as strings). */
export interface IncentiveEntryAdminRow {
  id: string;
  srcSrNo: number | null;
  entryDate: string | null;
  incentiveName: string;
  periodMonth: string | null;
  empName: string;
  employeeId: string | null;
  participantName: string | null;
  prospectGroupName: string | null;
  amount: number;
  approved: boolean;
  approvedAmt: number;
  paid: boolean;
  paidAmt: number;
  paidDate: string | null;
  note: string | null;
}

function toAdminRow(e: IncentiveEntry): IncentiveEntryAdminRow {
  return {
    id: e.id,
    srcSrNo: e.srcSrNo,
    entryDate: e.entryDate,
    incentiveName: e.incentiveName,
    periodMonth: e.periodMonth,
    empName: e.empName,
    employeeId: e.employeeId,
    participantName: e.participantName,
    prospectGroupName: e.prospectGroupName,
    amount: num(e.amount),
    approved: e.approved,
    approvedAmt: num(e.approvedAmt),
    paid: e.paid,
    paidAmt: num(e.paidAmt),
    paidDate: e.paidDate,
    note: e.note,
  };
}

/** Year-scoped incentive_entries for the admin Entries tab, newest period first. */
export async function listIncentiveEntriesAdmin(
  year: number,
): Promise<IncentiveEntryAdminRow[]> {
  const [rows, removed] = await Promise.all([
    listIncentiveEntries({ year }),
    removedNameKeys(),
  ]);
  // Drop entries belonging to removed (inactive) employees.
  return rows.map(toAdminRow).filter((r) => !removed.has(nameKey(r.empName)));
}

// --- drill-down (slice C) --------------------------------------------------

export interface IncentivePersonProjectRow {
  id: string;
  projectName: string | null;
  periodMonth: string | null;
  /** "supervisor" or "intern" — which leg this person played on the project. */
  role: "supervisor" | "intern";
  approved: number;
  paid: number;
  approvedFlag: boolean;
  paidFlag: boolean;
}

export interface IncentivePersonDetail {
  empName: string;
  year: number;
  entries: IncentiveEntryAdminRow[];
  projects: IncentivePersonProjectRow[];
  totals: {
    entriesApproved: number;
    projectsApproved: number;
    totalApproved: number;
    totalPaid: number;
    totalUnpaid: number;
  };
}

/**
 * One person's incentive detail for `year` — their permanent ledger entries
 * (matched by emp_name, case-insensitive) plus every project leg they played
 * (supervisor or intern). Money returned as numbers; unpaid is derived.
 */
export async function getIncentivePersonDetail(
  empName: string,
  year: number,
): Promise<IncentivePersonDetail> {
  const target = nameKey(empName);
  const { start, end } = yearBounds(year);

  const [entryRows, projectRows] = await Promise.all([
    listIncentiveEntries({ year }),
    db
      .select()
      .from(incentiveProjects)
      .where(
        and(
          gte(incentiveProjects.periodMonth, start),
          lt(incentiveProjects.periodMonth, end),
        ),
      )
      .orderBy(desc(incentiveProjects.periodMonth), desc(incentiveProjects.srcSrNo)),
  ]);

  const entries = entryRows
    .filter((e) => nameKey(e.empName) === target)
    .map(toAdminRow);

  const projects: IncentivePersonProjectRow[] = [];
  for (const pr of projectRows) {
    if (nameKey(pr.supervisorName) === target) {
      projects.push({
        id: `${pr.id}:sup`,
        projectName: pr.projectName,
        periodMonth: pr.periodMonth,
        role: "supervisor",
        approved: num(pr.empApprovedAmt),
        paid: num(pr.empPaidAmt),
        approvedFlag: pr.approved,
        paidFlag: pr.paid,
      });
    }
    if (nameKey(pr.internName) === target) {
      projects.push({
        id: `${pr.id}:int`,
        projectName: pr.projectName,
        periodMonth: pr.periodMonth,
        role: "intern",
        approved: num(pr.internApprovedAmt),
        paid: num(pr.internPaidAmt),
        approvedFlag: pr.approved,
        paidFlag: pr.paid,
      });
    }
  }

  const entriesApproved = entries.reduce((s, e) => s + e.approvedAmt, 0);
  const entriesPaid = entries.reduce((s, e) => s + e.paidAmt, 0);
  const projectsApproved = projects.reduce((s, p) => s + p.approved, 0);
  const projectsPaid = projects.reduce((s, p) => s + p.paid, 0);
  const totalApproved = entriesApproved + projectsApproved;
  const totalPaid = entriesPaid + projectsPaid;

  return {
    empName: empName.trim(),
    year,
    entries,
    projects,
    totals: {
      entriesApproved,
      projectsApproved,
      totalApproved,
      totalPaid,
      totalUnpaid: Math.max(0, totalApproved - totalPaid),
    },
  };
}

/** Whether the given person-name belongs to the signed-in employee (used to
 *  gate the non-admin drill-down to themselves only). True on a case-insensitive
 *  name match, or if any of the employee's incentive rows (entry / project leg)
 *  carry that exact name. */
export async function isOwnIncentiveName(
  empName: string,
  employee: { id: string; name: string },
): Promise<boolean> {
  if (nameKey(empName) === nameKey(employee.name)) return true;

  const target = nameKey(empName);
  const [entryHit, projectHits] = await Promise.all([
    db
      .select({ empName: incentiveEntries.empName })
      .from(incentiveEntries)
      .where(eq(incentiveEntries.employeeId, employee.id)),
    db
      .select({
        supervisorName: incentiveProjects.supervisorName,
        internName: incentiveProjects.internName,
      })
      .from(incentiveProjects)
      .where(
        or(
          eq(incentiveProjects.supervisorId, employee.id),
          eq(incentiveProjects.internId, employee.id),
        ),
      ),
  ]);

  if (entryHit.some((r) => nameKey(r.empName) === target)) return true;
  if (
    projectHits.some(
      (r) => nameKey(r.supervisorName) === target || nameKey(r.internName) === target,
    )
  ) {
    return true;
  }
  return false;
}

/** Re-export the month helpers the cron uses to compute the trailing window. */
export { monthStart, nameKey };
export type { IncentiveTarget };
