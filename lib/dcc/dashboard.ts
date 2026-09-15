/**
 * DCC DASHBOARD — every number on /dcc/dashboard, as pure functions.
 *
 * Client-safe (no DB import) so the rules can be unit-tested without a
 * database, and so a section that re-slices the result in the browser — a
 * function tab, a search — reads the same definitions the server used.
 *
 * ── THE RULES ARE THE DCC PAGE'S, ON PURPOSE ─────────────────────────────
 * The fill board (components/dcc/dcc-board.tsx) is what every employee looks
 * at, so a manager's dashboard that counted differently would be arguing with
 * the screen the employee is holding. Three rules come straight from it:
 *
 *   DUE        — a `scheduled`, non-participant KPI whose weekday mask includes
 *                the day (`scheduledDueOn`). Weekly, monthly, adhoc and event
 *                KPIs live in trays and never make a day "due".
 *   COMPLIANCE — done ÷ due. "NA" is not done.
 *   FILLED     — the entry carries a status, a value or a note.
 *
 * ── TODAY IS OPEN, NOT MISSED ─────────────────────────────────────────────
 * An unfilled KPI on a past day is a miss. The same KPI at 11am today is just
 * not filled YET, so today's gaps are reported as "open" and the streak does
 * not break on a day that has not ended.
 */
import { scheduledDueOn } from "./util";

/* ── Inputs ─────────────────────────────────────────────────────────────── */

export interface DashboardPerson {
  id: string;
  name: string;
  avatarUrl: string | null;
  /** Every department the person holds — what the function tabs match on. */
  departments: string[];
}

export interface DashboardItem {
  id: string;
  ownerEmployeeId: string;
  section: string | null;
  code: string | null;
  title: string;
  weekdays: number | null;
  scheduleKind: string | null;
  isParticipantList: boolean | null;
  /**
   * The first day this KPI can be due: the earlier of the day it was created
   * and its first entry. Without it a KPI added in June counts as missed every
   * day since January, and "This Year" reads as 90% blank. Null = no floor.
   */
  activeFrom: string | null;
}

export interface DashboardEntry {
  itemId: string;
  entryDate: string;
  status: string | null;
  valueNumber: string | null;
  note: string | null;
  subjectId: string | null;
}

export interface DashboardReview {
  ownerEmployeeId: string;
  reviewDate: string;
  status: string | null;
}

/* ── Outcomes and tallies ───────────────────────────────────────────────── */

/**
 * What happened to one due KPI on one day.
 *
 * `noted` is a value or a note with no status — filled, but not a yes or a no.
 * `unfilled` covers both a past miss and today's still-open slot; the caller
 * knows which day it is looking at.
 */
export type SlotOutcome = "done" | "notDone" | "na" | "pending" | "noted" | "unfilled";

export function outcomeOf(e: DashboardEntry | undefined): SlotOutcome {
  if (!e) return "unfilled";
  const s = (e.status ?? "").trim().toLowerCase();
  if (s === "done") return "done";
  if (s === "not done") return "notDone";
  if (s === "na" || s === "not applicable") return "na";
  if (s === "pending") return "pending";
  const hasValue = e.valueNumber != null && String(e.valueNumber).trim() !== "";
  if (s || hasValue || (e.note ?? "").trim()) return "noted";
  return "unfilled";
}

export interface Tally {
  due: number;
  done: number;
  notDone: number;
  na: number;
  pending: number;
  noted: number;
  unfilled: number;
}

export function emptyTally(): Tally {
  return { due: 0, done: 0, notDone: 0, na: 0, pending: 0, noted: 0, unfilled: 0 };
}

function addOutcome(t: Tally, o: SlotOutcome): void {
  t.due++;
  t[o]++;
}

export function addTallies(into: Tally, from: Tally): Tally {
  into.due += from.due;
  into.done += from.done;
  into.notDone += from.notDone;
  into.na += from.na;
  into.pending += from.pending;
  into.noted += from.noted;
  into.unfilled += from.unfilled;
  return into;
}

export function filledOf(t: Tally): number {
  return t.due - t.unfilled;
}

/** A whole percentage, or null when there is nothing to divide by. */
export function pct(n: number, d: number): number | null {
  return d > 0 ? Math.round((n / d) * 100) : null;
}

export const compliancePct = (t: Tally): number | null => pct(t.done, t.due);
export const filledPct = (t: Tally): number | null => pct(filledOf(t), t.due);

/** Green ≥80, amber ≥60, red below — the thresholds the fill board uses. */
export function rateTone(p: number | null): "green" | "amber" | "red" | "none" {
  if (p == null) return "none";
  if (p >= 80) return "green";
  if (p >= 60) return "amber";
  return "red";
}

/* ── Dates ──────────────────────────────────────────────────────────────── */

/** `ymd` plus `n` days. UTC arithmetic, so no daylight-saving edge. */
export function addDaysYmd(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Every day from `from` to `to`, inclusive. Empty when the range is inverted. */
export function daysInRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDaysYmd(d, 1)) out.push(d);
  return out;
}

/** The calendar day as a LOCAL Date — what `scheduledDueOn`'s weekday read expects. */
export function localDate(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1);
}

/** The window of the same length that ends the day before `from`. */
export function previousWindow(from: string, to: string): { from: string; to: string } {
  const len = daysInRange(from, to).length;
  return { from: addDaysYmd(from, -len), to: addDaysYmd(from, -1) };
}

/* ── Buckets: the heatmap's columns ─────────────────────────────────────── */

export interface DashboardBucket {
  key: string;
  /** Big line of the column heading: "15", or "8 Sep" for a week. */
  label: string;
  /** Small line: "Mon", or "week". */
  sub: string;
  from: string;
  to: string;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Up to this many days the heatmap shows one column per day; beyond it, per week. */
export const DAILY_BUCKET_LIMIT = 31;

/**
 * The heatmap's columns for a window.
 *
 * DAYS UP TO A MONTH, WEEKS BEYOND. A year of daily columns is 365 slivers
 * nobody can read or click; weeks keep "This Year" to ~52 columns while a
 * week or a month still shows each day, which is the view a manager chasing
 * yesterday's gaps needs. Weeks run Monday to Sunday, clipped to the window.
 */
export function bucketsFor(from: string, to: string): DashboardBucket[] {
  const days = daysInRange(from, to);
  if (days.length <= DAILY_BUCKET_LIMIT) {
    return days.map((d) => {
      const dt = new Date(`${d}T00:00:00Z`);
      return { key: d, label: String(dt.getUTCDate()), sub: WEEKDAYS[dt.getUTCDay()]!, from: d, to: d };
    });
  }
  const out: DashboardBucket[] = [];
  let start = from;
  while (start <= to) {
    const dow = new Date(`${start}T00:00:00Z`).getUTCDay(); // 0 = Sun
    const sunday = addDaysYmd(start, dow === 0 ? 0 : 7 - dow);
    const end = sunday < to ? sunday : to;
    const dt = new Date(`${start}T00:00:00Z`);
    out.push({
      key: start,
      label: `${dt.getUTCDate()} ${MONTHS[dt.getUTCMonth()]}`,
      sub: "week",
      from: start,
      to: end,
    });
    start = addDaysYmd(end, 1);
  }
  return out;
}

/* ── The result ─────────────────────────────────────────────────────────── */

export interface PersonStats {
  person: DashboardPerson;
  /** Active KPIs of every kind. */
  kpis: number;
  /** The subset that can ever be due on a day. */
  scheduledKpis: number;
  tally: Tally;
  prevTally: Tally;
  compliance: number | null;
  filled: number | null;
  prevCompliance: number | null;
  /** Consecutive fully-filled days ending at the window's last day. */
  streak: number;
  /** One tally per heatmap bucket, aligned with `result.buckets`. */
  buckets: Tally[];
  /** Today's due KPIs — all zero when the window does not include today. */
  today: Tally;
  /** The last day this person filled anything, from the loaded history. */
  lastFilled: string | null;
  /** Manager reviews in the window, against the past days that had KPIs due. */
  reviews: { approved: number; needsRework: number; reviewableDays: number };
  /** The ranking score: 80% compliance, 20% streak (capped at 30 days). */
  score: number | null;
}

export interface SectionStats {
  section: string;
  kpis: number;
  people: number;
  tally: Tally;
  compliance: number | null;
}

export interface ItemStats {
  item: DashboardItem;
  ownerName: string;
  tally: Tally;
  /** Missed or "Not done", over due. */
  missRate: number | null;
}

export interface DccDashboardResult {
  window: { from: string; to: string };
  prevWindow: { from: string; to: string };
  today: string;
  includesToday: boolean;
  buckets: DashboardBucket[];
  totals: Tally;
  prevTotals: Tally;
  daily: { date: string; tally: Tally }[];
  people: PersonStats[];
  sections: SectionStats[];
  items: ItemStats[];
  withoutKpis: DashboardPerson[];
  reviews: { approved: number; needsRework: number; reviewableDays: number };
}

/** How far back the streak may look, in days. */
export const STREAK_LOOKBACK_DAYS = 60;

/** The earliest entry date `computeDccDashboard` reads for a window. */
export function historyStartFor(from: string, to: string): string {
  const prev = previousWindow(from, to).from;
  const streakStart = addDaysYmd(to, -(STREAK_LOOKBACK_DAYS - 1));
  return prev < streakStart ? prev : streakStart;
}

/** The /dcc/ranking formula: 80% compliance, 20% streak capped at 30 days. */
export function rankingScore(compliance: number | null, streak: number): number | null {
  if (compliance == null) return null;
  return Math.round(0.8 * compliance + 0.2 * ((Math.min(streak, 30) / 30) * 100));
}

export function computeDccDashboard(input: {
  people: DashboardPerson[];
  items: DashboardItem[];
  entries: DashboardEntry[];
  reviews: DashboardReview[];
  from: string;
  to: string;
  today: string;
}): DccDashboardResult {
  const { people, items, entries, reviews, today } = input;
  const from = input.from;
  // A window can never run past today: tomorrow has no misses yet, and
  // counting its KPIs as due would drag every rate down.
  const to = input.to > today ? today : input.to;
  const prev = previousWindow(from, to);
  const windowDays = daysInRange(from, to);
  const prevDays = daysInRange(prev.from, prev.to);
  const buckets = bucketsFor(from, to);
  const includesToday = from <= today && today <= to;

  // Simple KPIs only — participant slots carry a subject and never make a day due.
  const entryByKey = new Map<string, DashboardEntry>();
  const lastFilledByItem = new Map<string, string>();
  for (const e of entries) {
    if (e.subjectId) continue;
    entryByKey.set(`${e.itemId}|${e.entryDate}`, e);
    if (outcomeOf(e) !== "unfilled") {
      const cur = lastFilledByItem.get(e.itemId);
      if (!cur || e.entryDate > cur) lastFilledByItem.set(e.itemId, e.entryDate);
    }
  }

  const itemsByOwner = new Map<string, DashboardItem[]>();
  for (const it of items) {
    const list = itemsByOwner.get(it.ownerEmployeeId);
    if (list) list.push(it);
    else itemsByOwner.set(it.ownerEmployeeId, [it]);
  }

  // Each day's weekday is read once, not once per KPI.
  const dateCache = new Map<string, Date>();
  const dateOf = (ymd: string) => {
    let d = dateCache.get(ymd);
    if (!d) dateCache.set(ymd, (d = localDate(ymd)));
    return d;
  };

  const tallyDay = (
    own: DashboardItem[],
    day: string,
    onItem?: (it: DashboardItem, o: SlotOutcome) => void,
  ): Tally => {
    const t = emptyTally();
    const d = dateOf(day);
    for (const it of own) {
      // Not due before the KPI existed — see DashboardItem.activeFrom.
      if (it.activeFrom && day < it.activeFrom) continue;
      if (!scheduledDueOn(it, d)) continue;
      const o = outcomeOf(entryByKey.get(`${it.id}|${day}`));
      addOutcome(t, o);
      onItem?.(it, o);
    }
    return t;
  };

  const personById = new Map(people.map((p) => [p.id, p]));
  const itemTally = new Map<string, Tally>();
  const dailyTotals = new Map<string, Tally>(windowDays.map((d) => [d, emptyTally()]));
  const totals = emptyTally();
  const prevTotals = emptyTally();
  const reviewTotals = { approved: 0, needsRework: 0, reviewableDays: 0 };

  const peopleStats: PersonStats[] = [];
  const withoutKpis: DashboardPerson[] = [];

  for (const person of people) {
    const own = itemsByOwner.get(person.id) ?? [];
    if (own.length === 0) {
      withoutKpis.push(person);
      continue;
    }

    const tally = emptyTally();
    const bucketTallies = buckets.map(() => emptyTally());
    const personReviews = { approved: 0, needsRework: 0, reviewableDays: 0 };
    let bucketIdx = 0;
    for (const day of windowDays) {
      while (bucketIdx < buckets.length - 1 && day > buckets[bucketIdx]!.to) bucketIdx++;
      const t = tallyDay(own, day, (it, o) => {
        const itTally = itemTally.get(it.id) ?? emptyTally();
        addOutcome(itTally, o);
        itemTally.set(it.id, itTally);
      });
      addTallies(tally, t);
      addTallies(bucketTallies[bucketIdx]!, t);
      addTallies(dailyTotals.get(day)!, t);
      // A day is reviewed after it ends, so today is never "unreviewed".
      if (day !== today && t.due > 0) personReviews.reviewableDays++;
    }

    const prevTally = emptyTally();
    for (const day of prevDays) addTallies(prevTally, tallyDay(own, day));

    // Streak: walk back from the window's last day. Days with nothing due are
    // skipped; today only counts once it is complete, and never breaks it.
    let streak = 0;
    for (let i = 0; i < STREAK_LOOKBACK_DAYS; i++) {
      const day = addDaysYmd(to, -i);
      const t = tallyDay(own, day);
      if (t.due === 0) continue;
      if (t.unfilled === 0) streak++;
      else if (day === today) continue;
      else break;
    }

    const todayTally = includesToday ? tallyDay(own, today) : emptyTally();

    let lastFilled: string | null = null;
    for (const it of own) {
      const d = lastFilledByItem.get(it.id);
      if (d && (!lastFilled || d > lastFilled)) lastFilled = d;
    }

    for (const r of reviews) {
      if (r.ownerEmployeeId !== person.id || r.reviewDate < from || r.reviewDate > to) continue;
      if (r.status === "approved") personReviews.approved++;
      else if (r.status === "needs_rework") personReviews.needsRework++;
    }
    reviewTotals.approved += personReviews.approved;
    reviewTotals.needsRework += personReviews.needsRework;
    reviewTotals.reviewableDays += personReviews.reviewableDays;

    addTallies(totals, tally);
    addTallies(prevTotals, prevTally);

    const compliance = compliancePct(tally);
    peopleStats.push({
      person,
      kpis: own.length,
      scheduledKpis: own.filter((it) => (it.scheduleKind ?? "scheduled") === "scheduled" && !it.isParticipantList).length,
      tally,
      prevTally,
      compliance,
      filled: filledPct(tally),
      prevCompliance: compliancePct(prevTally),
      streak,
      buckets: bucketTallies,
      today: todayTally,
      lastFilled,
      reviews: personReviews,
      score: rankingScore(compliance, streak),
    });
  }

  // Sections — a KPI with no section is filed under "Unsectioned" rather than dropped.
  const sectionMap = new Map<string, { kpis: number; people: Set<string>; tally: Tally }>();
  const itemStats: ItemStats[] = [];
  for (const it of items) {
    if (!personById.has(it.ownerEmployeeId)) continue;
    const name = (it.section ?? "").trim() || "Unsectioned";
    const s = sectionMap.get(name) ?? { kpis: 0, people: new Set<string>(), tally: emptyTally() };
    s.kpis++;
    s.people.add(it.ownerEmployeeId);
    const t = itemTally.get(it.id);
    if (t) {
      addTallies(s.tally, t);
      itemStats.push({
        item: it,
        ownerName: personById.get(it.ownerEmployeeId)!.name,
        tally: t,
        missRate: pct(t.unfilled + t.notDone, t.due),
      });
    }
    sectionMap.set(name, s);
  }

  const sections: SectionStats[] = [...sectionMap.entries()]
    .map(([section, s]) => ({
      section,
      kpis: s.kpis,
      people: s.people.size,
      tally: s.tally,
      compliance: compliancePct(s.tally),
    }))
    .sort((a, b) => b.tally.due - a.tally.due || a.section.localeCompare(b.section));

  // Most missed first; ties go to the KPI due more often, then by title.
  itemStats.sort(
    (a, b) =>
      b.tally.unfilled + b.tally.notDone - (a.tally.unfilled + a.tally.notDone) ||
      b.tally.due - a.tally.due ||
      a.item.title.localeCompare(b.item.title),
  );

  peopleStats.sort((a, b) => a.person.name.localeCompare(b.person.name));

  return {
    window: { from, to },
    prevWindow: prev,
    today,
    includesToday,
    buckets,
    totals,
    prevTotals,
    daily: windowDays.map((date) => ({ date, tally: dailyTotals.get(date)! })),
    people: peopleStats,
    sections,
    items: itemStats,
    withoutKpis,
    reviews: reviewTotals,
  };
}

/**
 * Change against the previous window, in percentage POINTS for a rate.
 * Null when either side had nothing due — a trend from nothing is not a trend.
 */
export function pointsChange(current: number | null, previous: number | null): number | null {
  if (current == null || previous == null) return null;
  return current - previous;
}
