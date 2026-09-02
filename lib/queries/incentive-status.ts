import "server-only";
import { and, desc, eq, gte, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  incentiveEntries,
  incentiveParticipants,
  incentiveProjects,
  incentiveTargets,
  type IncentiveParticipant,
} from "@/db/schema";
import { getIncentivePaidByPerson, nameKey, removedNameKeys } from "@/lib/queries/incentives";

/**
 * WS-6 — Incentive three-status reporting (Booked / Accrued / Paid) against
 * per-person Targets, across THIS MONTH · LAST 3 MONTHS · YTD.
 *
 * PAID is NEVER re-derived here — it is read from the canonical shared-key
 * contract `getIncentivePaidByPerson(month)` (the same producer PMS + Salary
 * read), so the PAID number can never drift between surfaces. Only Booked and
 * Accrued are aggregated locally, and they fold the team-split participant rows
 * exactly the way the paid producer does (participants REPLACE their parent's
 * own leg amounts — no double count).
 *
 * PMS consumes PAID ONLY. Booked/Accrued are client-payment progress signals
 * and must never feed a score.
 */

// Mirrors the operational-actor exclusion in lib/queries/incentives.ts. Kept in
// sync by hand — these names exist in the ledger for bookkeeping but must not
// roll into any aggregate.
const EXCLUDED = new Set<string>(["Manan Vasa", "Dattaram Kap", "Parvez Khan"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function num(v: string | null | undefined): number {
  if (!v) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function isExcluded(name: string | null | undefined): boolean {
  return name ? EXCLUDED.has(name.trim()) : false;
}
function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}
/** YYYY-MM of a first-of-month date string, or null. */
function monthKeyOf(d: string | null | undefined): string | null {
  return d ? d.slice(0, 7) : null;
}
/** First-of-NEXT-month YYYY-MM-DD for a "YYYY-MM" key (exclusive upper bound). */
function monthEndExclusive(month: string): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return `${ny}-${pad2(nm)}-01`;
}
/** The `count` trailing month keys ending at (and including) `refMonth`. */
function trailingMonths(refMonth: string, count: number): string[] {
  const [y, m] = refMonth.split("-").map(Number) as [number, number];
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    let yy = y;
    let mm = m - i;
    while (mm <= 0) {
      mm += 12;
      yy -= 1;
    }
    out.push(`${yy}-${pad2(mm)}`);
  }
  return out;
}
/** Jan..refMonth of the ref year (inclusive), as YYYY-MM keys. */
function ytdMonths(refMonth: string): string[] {
  const [y, m] = refMonth.split("-").map(Number) as [number, number];
  const out: string[] = [];
  for (let mm = 1; mm <= m; mm++) out.push(`${y}-${pad2(mm)}`);
  return out;
}

export interface StatusTotals {
  target: number;
  booked: number;
  accrued: number;
  paid: number;
}
export interface StatusPersonRow {
  key: string;
  name: string;
  target: number;
  booked: number;
  accrued: number;
  paid: number;
}
export interface StatusWindow {
  label: string;
  /** YYYY-MM month keys covered by this window. */
  months: string[];
  totals: StatusTotals;
}
export interface IncentiveStatusReport {
  /** The reference month (YYYY-MM) the windows are anchored on. */
  refMonth: string;
  thisMonth: StatusWindow;
  last3Months: StatusWindow;
  ytd: StatusWindow;
  /** Per-person YTD rows (default table basis), sorted by paid desc then accrued desc. */
  perPersonYtd: StatusPersonRow[];
}

type BA = { booked: number; accrued: number; name: string };

/**
 * Booked + Accrued per person for every month in [startMonth, endMonthKey]
 * (both YYYY-MM, inclusive). Returns `month -> (personKey -> {booked,accrued})`
 * plus a shared display-name registry. Folds participant rows the same way the
 * PAID producer does.
 */
async function bookedAccruedByMonth(
  startMonth: string,
  endMonthInclusive: string,
): Promise<{ byMonth: Map<string, Map<string, BA>>; names: Map<string, string> }> {
  const start = `${startMonth}-01`;
  const end = monthEndExclusive(endMonthInclusive);

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
      .where(
        and(
          gte(incentiveParticipants.periodMonth, start),
          lt(incentiveParticipants.periodMonth, end),
        ),
      ),
  ]);

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

  const byMonth = new Map<string, Map<string, BA>>();
  const names = new Map<string, string>();
  // Removed (inactive) employees are dropped from the status matrix too.
  const removed = await removedNameKeys();

  const bump = (
    monthKey: string | null,
    name: string | null | undefined,
    booked: number,
    accrued: number,
  ) => {
    if (!monthKey || !name) return;
    if (isExcluded(name) || removed.has(nameKey(name)) || name.trim().toLowerCase() === "none") return;
    if (booked === 0 && accrued === 0) {
      // Still register the display name so a person with only paid appears.
      const key0 = nameKey(name);
      if (key0 && !names.has(key0)) names.set(key0, name.trim());
      return;
    }
    const key = nameKey(name);
    if (!key) return;
    if (!names.has(key)) names.set(key, name.trim());
    let m = byMonth.get(monthKey);
    if (!m) {
      m = new Map<string, BA>();
      byMonth.set(monthKey, m);
    }
    const cur = m.get(key) ?? { booked: 0, accrued: 0, name: name.trim() };
    cur.booked += booked;
    cur.accrued += accrued;
    m.set(key, cur);
  };

  for (const e of entries) {
    const parts = partByEntry.get(e.id);
    if (parts && parts.length) {
      for (const p of parts) {
        bump(monthKeyOf(p.periodMonth ?? e.periodMonth), p.empName, num(p.bookedAmt), num(p.accruedAmt));
      }
    } else {
      bump(monthKeyOf(e.periodMonth), e.empName, num(e.bookedAmt), num(e.accruedAmt));
    }
  }
  for (const pr of projects) {
    const parts = partByProject.get(pr.id);
    if (parts && parts.length) {
      for (const p of parts) {
        bump(monthKeyOf(p.periodMonth ?? pr.periodMonth), p.empName, num(p.bookedAmt), num(p.accruedAmt));
      }
    } else {
      bump(monthKeyOf(pr.periodMonth), pr.supervisorName, num(pr.empBookedAmt), num(pr.empAccruedAmt));
      bump(monthKeyOf(pr.periodMonth), pr.internName, num(pr.internBookedAmt), num(pr.internAccruedAmt));
    }
  }

  return { byMonth, names };
}

/** Per-person target for each month in the range, keyed by nameKey. */
async function targetsByMonth(
  startMonth: string,
  endMonthInclusive: string,
): Promise<{ byMonth: Map<string, Map<string, number>>; names: Map<string, string> }> {
  const start = `${startMonth}-01`;
  const end = monthEndExclusive(endMonthInclusive);
  const rows = await db
    .select()
    .from(incentiveTargets)
    .where(and(gte(incentiveTargets.periodMonth, start), lt(incentiveTargets.periodMonth, end)));

  const byMonth = new Map<string, Map<string, number>>();
  const names = new Map<string, string>();
  for (const t of rows) {
    if (isExcluded(t.empName)) continue;
    const mk = monthKeyOf(t.periodMonth);
    const key = nameKey(t.empName);
    if (!mk || !key) continue;
    if (!names.has(key)) names.set(key, t.empName.trim());
    let m = byMonth.get(mk);
    if (!m) {
      m = new Map<string, number>();
      byMonth.set(mk, m);
    }
    m.set(key, (m.get(key) ?? 0) + num(t.targetAmount));
  }
  return { byMonth, names };
}

/**
 * Full three-status report for `refMonth` (YYYY-MM, defaults to current month).
 * All three windows are built by summing the SAME per-month buckets, so the
 * numbers are internally consistent and PAID comes exclusively from the shared
 * contract.
 */
export async function getIncentiveStatusReport(refMonth: string): Promise<IncentiveStatusReport> {
  const months = ytdMonths(refMonth); // Jan..refMonth
  const firstMonth = months[0] ?? refMonth;

  // Booked/Accrued (range) + Targets (range) — one query set each.
  const [ba, tg] = await Promise.all([
    bookedAccruedByMonth(firstMonth, refMonth),
    targetsByMonth(firstMonth, refMonth),
  ]);

  // PAID — reuse the canonical producer per month (never re-implemented). Each
  // distinct YTD month is fetched once; windows reuse these buckets.
  const paidByMonth = new Map<string, Map<string, number>>();
  await Promise.all(
    months.map(async (mk) => {
      const raw = await getIncentivePaidByPerson(mk);
      const clean = new Map<string, number>();
      for (const [k, v] of raw) {
        // The producer emits BOTH a name key and a uuid key → same total; drop
        // the uuid keys so we don't double-count when summing.
        if (UUID_RE.test(k)) continue;
        clean.set(k, (clean.get(k) ?? 0) + v);
      }
      paidByMonth.set(mk, clean);
    }),
  );

  // Display-name registry across all sources.
  const names = new Map<string, string>();
  for (const [k, v] of ba.names) if (!names.has(k)) names.set(k, v);
  for (const [k, v] of tg.names) if (!names.has(k)) names.set(k, v);

  const sumWindow = (label: string, keys: string[]): StatusWindow => {
    const totals: StatusTotals = { target: 0, booked: 0, accrued: 0, paid: 0 };
    for (const mk of keys) {
      const baM = ba.byMonth.get(mk);
      if (baM) for (const v of baM.values()) {
        totals.booked += v.booked;
        totals.accrued += v.accrued;
      }
      const tgM = tg.byMonth.get(mk);
      if (tgM) for (const v of tgM.values()) totals.target += v;
      const pdM = paidByMonth.get(mk);
      if (pdM) for (const v of pdM.values()) totals.paid += v;
    }
    return { label, months: keys, totals };
  };

  const thisMonth = sumWindow("This month", [refMonth]);
  const last3Months = sumWindow("Last 3 months", trailingMonths(refMonth, 3));
  const ytd = sumWindow("Year to date", months);

  // Per-person YTD rows.
  const rowMap = new Map<string, StatusPersonRow>();
  const row = (key: string): StatusPersonRow => {
    let r = rowMap.get(key);
    if (!r) {
      r = { key, name: names.get(key) ?? key, target: 0, booked: 0, accrued: 0, paid: 0 };
      rowMap.set(key, r);
    }
    return r;
  };
  for (const mk of months) {
    const baM = ba.byMonth.get(mk);
    if (baM) for (const [k, v] of baM) {
      const r = row(k);
      r.booked += v.booked;
      r.accrued += v.accrued;
    }
    const tgM = tg.byMonth.get(mk);
    if (tgM) for (const [k, v] of tgM) row(k).target += v;
    const pdM = paidByMonth.get(mk);
    if (pdM) for (const [k, v] of pdM) row(k).paid += v;
  }

  const perPersonYtd = [...rowMap.values()]
    .filter((r) => r.target || r.booked || r.accrued || r.paid)
    .sort((a, b) => b.paid - a.paid || b.accrued - a.accrued || b.booked - a.booked);

  return { refMonth, thisMonth, last3Months, ytd, perPersonYtd };
}

// --- entries-with-status list (admin status editor) ------------------------

export interface IncentiveEntryStatusRow {
  id: string;
  incentiveName: string;
  periodMonth: string | null;
  empName: string;
  employeeId: string | null;
  approvedAmt: number;
  booked: number;
  accrued: number;
  paid: number;
  /** How many team-split participants are attached (0 = solo). */
  participantCount: number;
}

/**
 * Year-scoped permanent incentive_entries with their three-status amounts and a
 * participant count, newest period first — the row source for the admin Status
 * editor + team-split launcher. Project-based incentives keep their split on the
 * two legs (supervisor/intern) and are handled by the existing Entries surface.
 */
export async function listIncentiveEntriesStatus(year: number): Promise<IncentiveEntryStatusRow[]> {
  const start = `${year}-01-01`;
  const end = `${year + 1}-01-01`;
  const [entries, participants, removed] = await Promise.all([
    db
      .select()
      .from(incentiveEntries)
      .where(and(gte(incentiveEntries.periodMonth, start), lt(incentiveEntries.periodMonth, end)))
      .orderBy(desc(incentiveEntries.periodMonth), desc(incentiveEntries.srcSrNo)),
    db.select().from(incentiveParticipants),
    removedNameKeys(),
  ]);
  const countByEntry = new Map<string, number>();
  for (const p of participants) {
    if (p.entryId) countByEntry.set(p.entryId, (countByEntry.get(p.entryId) ?? 0) + 1);
  }
  return entries
    .filter((e) => !removed.has(nameKey(e.empName)))
    .map((e) => ({
    id: e.id,
    incentiveName: e.incentiveName,
    periodMonth: e.periodMonth,
    empName: e.empName,
    employeeId: e.employeeId,
    approvedAmt: num(e.approvedAmt),
    booked: num(e.bookedAmt),
    accrued: num(e.accruedAmt),
    paid: num(e.paidAmt),
    participantCount: countByEntry.get(e.id) ?? 0,
  }));
}

// --- team-split (participants) read ----------------------------------------

export interface ParticipantRow {
  id: string;
  empName: string;
  employeeId: string | null;
  booked: number;
  accrued: number;
  paid: number;
  paidDate: string | null;
  note: string | null;
}

/** Participant split rows for one entry (parentKind="entry") or project. */
export async function listIncentiveParticipants(
  parentKind: "entry" | "project",
  parentId: string,
): Promise<ParticipantRow[]> {
  const rows = await db
    .select()
    .from(incentiveParticipants)
    .where(
      parentKind === "entry"
        ? eq(incentiveParticipants.entryId, parentId)
        : eq(incentiveParticipants.projectId, parentId),
    );
  return rows
    .map((p) => ({
      id: p.id,
      empName: p.empName,
      employeeId: p.employeeId,
      booked: num(p.bookedAmt),
      accrued: num(p.accruedAmt),
      paid: num(p.paidAmt),
      paidDate: p.paidDate,
      note: p.note,
    }))
    .sort((a, b) => a.empName.localeCompare(b.empName));
}
