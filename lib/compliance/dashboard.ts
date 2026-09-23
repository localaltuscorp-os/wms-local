/**
 * WCC / MCC — THE DASHBOARD'S ARITHMETIC.
 *
 * PURE, and deliberately separate from the page that renders it. Everything
 * here is a fold over the SAME `ComplianceRow[]` the WCC and MCC tables are
 * built from (lib/compliance/rows.ts), so a figure on the dashboard and the
 * rows you land on when you click it cannot disagree — there is no second
 * query with a second opinion about what "done" means.
 *
 * That is the one rule this file exists to keep. The earlier DCC dashboard read
 * `dcc_entries.status` directly while the tables read the Doer Status, and the
 * two drifted the moment Abandoned was added (migration 0241).
 */

import { doerLabel, isClosed, DOER_STATUSES, type DoerStatus } from "./status";
import type { ComplianceRow } from "./rows";

/**
 * Is this row part of the window's workload at all?
 *
 * A compliance whose period has not begun is not yet anybody's obligation — it
 * is on the table so you can see it coming. Counting it as outstanding would
 * make every person look behind on work that is not due, and would make the
 * denominator of the compliance rate grow every time the window widened.
 */
export function isDue(row: ComplianceRow): boolean {
  return !row.notYetOpen;
}

/** Done means DONE. Abandoned is accounted for, but it is not an achievement. */
export function isDone(row: ComplianceRow): boolean {
  return row.doerStatus === "done";
}

/**
 * Filled late?
 *
 * `variance` is +/- days against the deadline, positive being late, and it is
 * null while a row is not yet due or has lapsed. A missing variance on a Done
 * row means it was closed without a measurable deadline gap, which is not
 * evidence of lateness — so it counts as on time rather than being silently
 * dropped from both sides and making the two numbers fail to add up.
 */
export function isLate(row: ComplianceRow): boolean {
  return isDone(row) && (row.variance ?? 0) > 0;
}

export interface ComplianceKpis {
  /** Rows that are actually due in the window. The denominator of everything. */
  due: number;
  done: number;
  onTime: number;
  late: number;
  /** The doer has not touched it. */
  notFilled: number;
  /** Past its deadline, not done, still open. */
  carried: number;
  /** Its time ran out without it being done. */
  lapsed: number;
  /** Given up, deliberately — not done, but not outstanding either. */
  abandoned: number;
  /** Done ÷ due, as a whole percentage. 0 when nothing is due. */
  ratePct: number;
  /** On time ÷ done, as a whole percentage. 0 when nothing is done. */
  onTimePct: number;
  /** WCC's Mins, summed over the rows in view. Null minutes count as zero. */
  minutes: number;
}

export function emptyKpis(): ComplianceKpis {
  return {
    due: 0, done: 0, onTime: 0, late: 0, notFilled: 0,
    carried: 0, lapsed: 0, abandoned: 0, ratePct: 0, onTimePct: 0, minutes: 0,
  };
}

/** Whole percent, and never NaN — a 0/0 rate reads as 0, not "—". */
function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

export function computeKpis(rows: readonly ComplianceRow[]): ComplianceKpis {
  const k = emptyKpis();
  for (const row of rows) {
    if (!isDue(row)) continue;
    k.due += 1;
    k.minutes += row.minutes ?? 0;
    if (isDone(row)) {
      k.done += 1;
      if (isLate(row)) k.late += 1;
      else k.onTime += 1;
    }
    if (row.doerStatus === "abandoned") k.abandoned += 1;
    if (row.doerStatus === null) k.notFilled += 1;
    // Carried and lapsed are states of the ROW, not of the status, and a row
    // can be un-filled AND carried at once — they are counted independently
    // and must not be treated as slices of one pie.
    if (row.carried) k.carried += 1;
    if (row.lapsed) k.lapsed += 1;
  }
  k.ratePct = pct(k.done, k.due);
  k.onTimePct = pct(k.onTime, k.done);
  return k;
}

export interface CompliancePersonRow extends ComplianceKpis {
  ownerId: string;
  ownerName: string;
}

/**
 * The same arithmetic, per person, for the leaderboard.
 *
 * Sorted by compliance rate descending, then by the bigger workload, then by
 * name — so a person who cleared 12 of 12 ranks above one who cleared 1 of 1,
 * and the order is stable rather than depending on which rows happened to load
 * first.
 */
export function computePeople(rows: readonly ComplianceRow[]): CompliancePersonRow[] {
  const byPerson = new Map<string, ComplianceRow[]>();
  for (const row of rows) {
    const list = byPerson.get(row.ownerId);
    if (list) list.push(row);
    else byPerson.set(row.ownerId, [row]);
  }
  const out: CompliancePersonRow[] = [];
  for (const [ownerId, personRows] of byPerson) {
    const kpis = computeKpis(personRows);
    // Somebody with nothing due in the window is not a zero-percent performer,
    // they simply are not in this window. Showing them at 0% would put an
    // unfair red row on the board and drag the eye to a non-event.
    if (kpis.due === 0) continue;
    out.push({ ...kpis, ownerId, ownerName: personRows[0]?.ownerName ?? "—" });
  }
  out.sort(
    (a, b) =>
      b.ratePct - a.ratePct || b.due - a.due || a.ownerName.localeCompare(b.ownerName),
  );
  return out;
}

/** Both checklists, folded together and kept apart, plus every section's data. */
export interface ComplianceDashboardData {
  wcc: ComplianceKpis;
  mcc: ComplianceKpis;
  combined: ComplianceKpis;
  people: CompliancePersonRow[];
  status: StatusSlice[];
  mostMissed: MissedCompliance[];
  minutesLoad: MinutesLoad[];
  byFrequency: FrequencyRow[];
}

/**
 * ONE PASS OVER THE ROWS, one object for the page.
 *
 * Every section folds the SAME combined array rather than re-querying, so no
 * two sections of this dashboard can be describing different data — and the
 * page stays a pure render of one value.
 */
export function computeComplianceDashboard(
  wccRows: readonly ComplianceRow[],
  mccRows: readonly ComplianceRow[],
): ComplianceDashboardData {
  const all = [...wccRows, ...mccRows];
  return {
    wcc: computeKpis(wccRows),
    mcc: computeKpis(mccRows),
    combined: computeKpis(all),
    // One leaderboard over BOTH checklists: a person's compliance is their
    // compliance, and splitting it in two would let somebody look diligent on
    // the weekly board while quietly never filling a monthly one.
    people: computePeople(all),
    status: statusBreakdown(all),
    mostMissed: mostMissed(all),
    // WCC only — Mins is a WCC column, and MCC rows carry none. Folding them in
    // would add a pile of zeroes and make the weekly load look lighter.
    minutesLoad: minutesLoad(wccRows),
    byFrequency: byFrequency(all),
  };
}

/** Re-exported so the view can label a status without importing the whole module. */
export type { DoerStatus };
export { isClosed };


/* ────────────────────────────────────────────────────────────────────────────
 * THE SECTION BREAKDOWNS.
 *
 * Each of these answers ONE question and is shaped by that question, not by
 * what happens to be easy to plot. All four are single-series magnitude — the
 * form is a ranked horizontal bar, which needs no legend because every bar
 * carries its own label.
 * ──────────────────────────────────────────────────────────────────────────── */

export interface StatusSlice {
  status: DoerStatus | "unfilled";
  label: string;
  count: number;
}

/**
 * WHAT STATE IS EVERYTHING IN — the Doer Status column, counted.
 *
 * "Not filled" leads and is its own slice rather than being folded into Not
 * Read: an untouched row and a row somebody opened and marked Not Read are
 * different facts about a person, and the reminder at 10 pm only chases the
 * first. Zero-count statuses are DROPPED — a bar chart of mostly-empty
 * categories reads as noise and buries the three that matter.
 */
export function statusBreakdown(rows: readonly ComplianceRow[]): StatusSlice[] {
  const counts = new Map<string, number>();
  let unfilled = 0;
  for (const row of rows) {
    if (!isDue(row)) continue;
    if (row.doerStatus === null) unfilled += 1;
    else counts.set(row.doerStatus, (counts.get(row.doerStatus) ?? 0) + 1);
  }
  const out: StatusSlice[] = [];
  if (unfilled > 0) out.push({ status: "unfilled", label: "Not Filled", count: unfilled });
  for (const st of DOER_STATUSES) {
    const n = counts.get(st) ?? 0;
    if (n > 0) out.push({ status: st, label: doerLabel(st), count: n });
  }
  return out;
}

export interface MissedCompliance {
  title: string;
  /** Times it came due and was not done. */
  missed: number;
  due: number;
  ratePct: number;
}

/**
 * WHAT KEEPS BREAKING — by compliance, not by person.
 *
 * Grouped on the TITLE rather than the item id on purpose: the same compliance
 * given to nine people through a position master is nine ids, and counting them
 * separately would bury a thing the whole team is failing under nine small
 * numbers. Ranked by how often it was missed, then by how bad the rate is, so a
 * compliance missed 6 of 6 outranks one missed 6 of 40.
 */
export function mostMissed(
  rows: readonly ComplianceRow[],
  limit = 8,
): MissedCompliance[] {
  const byTitle = new Map<string, { missed: number; due: number }>();
  for (const row of rows) {
    if (!isDue(row)) continue;
    const at = byTitle.get(row.title) ?? { missed: 0, due: 0 };
    at.due += 1;
    // Abandoned is a decision, not a miss — it was accounted for deliberately.
    if (!isDone(row) && row.doerStatus !== "abandoned") at.missed += 1;
    byTitle.set(row.title, at);
  }
  return [...byTitle.entries()]
    .map(([title, v]) => ({ title, ...v, ratePct: pct(v.due - v.missed, v.due) }))
    .filter((r) => r.missed > 0)
    .sort((a, b) => b.missed - a.missed || a.ratePct - b.ratePct || a.title.localeCompare(b.title))
    .slice(0, limit);
}

export interface MinutesLoad {
  ownerId: string;
  ownerName: string;
  minutes: number;
}

/**
 * HOW MUCH TIME THE CHECKLISTS ACTUALLY DEMAND — the Mins column, per person.
 *
 * This is a WORKLOAD figure, not a performance one: a person at the top of it
 * is carrying the most compliance time, which is a fact about what was assigned
 * to them and not about how well they did it. People with no Mins recorded fall
 * out entirely rather than sitting at zero and implying they do nothing.
 */
export function minutesLoad(rows: readonly ComplianceRow[]): MinutesLoad[] {
  const by = new Map<string, MinutesLoad>();
  for (const row of rows) {
    if (!isDue(row) || !row.minutes) continue;
    const at = by.get(row.ownerId) ?? { ownerId: row.ownerId, ownerName: row.ownerName, minutes: 0 };
    at.minutes += row.minutes;
    by.set(row.ownerId, at);
  }
  return [...by.values()].sort((a, b) => b.minutes - a.minutes || a.ownerName.localeCompare(b.ownerName));
}

export interface FrequencyRow {
  schedule: string;
  due: number;
  done: number;
  ratePct: number;
}

/**
 * DOES COMPLIANCE DEPEND ON HOW OFTEN A THING IS ASKED FOR — the Frequency
 * column, counted.
 *
 * Sorted by rate ASCENDING, worst first, because the only reason to open this
 * section is to find the cadence people cannot keep up with. Ordering it by
 * volume would put "Mon to Sat" on top every time and say nothing.
 */
export function byFrequency(rows: readonly ComplianceRow[]): FrequencyRow[] {
  const by = new Map<string, { due: number; done: number }>();
  for (const row of rows) {
    if (!isDue(row)) continue;
    const key = row.schedule || "—";
    const at = by.get(key) ?? { due: 0, done: 0 };
    at.due += 1;
    if (isDone(row)) at.done += 1;
    by.set(key, at);
  }
  return [...by.entries()]
    .map(([schedule, v]) => ({ schedule, ...v, ratePct: pct(v.done, v.due) }))
    .sort((a, b) => a.ratePct - b.ratePct || b.due - a.due || a.schedule.localeCompare(b.schedule));
}


/* ────────────────────────────────────────────────────────────────────────────
 * DRILL-THROUGH — the link behind a figure.
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The status chip a KPI tile corresponds to, or null when the tile is not a
 * filter at all.
 *
 * "On Time" is deliberately null. There IS no on-time chip on the board — the
 * chips filter on Doer Status, carried and lapsed — so linking it to `done`
 * would land the reader on 450 rows after clicking a tile that said 389, and a
 * dashboard that does that once is not trusted again.
 */
export type KpiDrill = "all" | "none" | "carried" | "lapsed" | "done" | null;

/**
 * Where a tile's link goes: the WCC board, filtered.
 *
 * WCC rather than MCC because that is where the volume is (641 weekly against
 * 23 monthly in a typical window), and because there is no combined board to
 * send anyone to. The tile names both counts in its own sub-line, so what the
 * click will show is stated before it is clicked.
 */
export function drillHref(drill: KpiDrill, who: string | undefined): string | null {
  if (drill === null) return null;
  const params = new URLSearchParams();
  // "all" is the whole board — a destination, just not a filtered one.
  if (drill !== "all") params.set("status", drill);
  if (who && who !== "me") params.set("who", who);
  const qs = params.toString();
  return qs ? `/dcc/wcc?${qs}` : "/dcc/wcc";
}
