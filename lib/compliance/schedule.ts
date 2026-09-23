/**
 * WCC / MCC — WHICH COMPLIANCE IS DUE WHEN, AND BY WHAT DEADLINE.
 *
 * PURE and client-safe. Every date is a calendar day as `YYYY-MM-DD`; nothing
 * here goes through a time zone, so a deadline cannot slip a day on somebody
 * else's machine.
 *
 * ── THE TWO CHECKLISTS (account holder, 2026-09-18) ──────────────────────
 * Both are read from the compliances DCC already holds (dcc_kpi_items):
 *
 *   WCC — Weekly Compliance Checklist
 *     · 'scheduled' — due on each of its weekdays: Mon to Sat, Mon to Sun, or
 *       the days picked (account holder, 2026-09-19). One row per due day;
 *       the deadline is that day.
 *     · 'weekly'    — once a week, on any of its days. One row per week; the
 *       deadline is its last allowed day (Saturday when any day will do).
 *   MCC — Monthly Compliance Checklist
 *     · 'monthly'   — Monthly, 2 times/month, 3 times/month, Alternate Month,
 *       Quarterly, Half Yearly or Annually (lib/compliance/mcc-frequency.ts).
 *       One row per deadline in each month it is due; a day past a short
 *       month's end falls on its last day.
 *
 * Participant-list, ad-hoc and event compliances belong to neither — they
 * never had a deadline, and My Day never showed them either.
 *
 * ── A ROW IS AN "OCCURRENCE" ─────────────────────────────────────────────
 * One compliance, one deadline. Its fill is the dcc_entries row inside the
 * occurrence's PERIOD — the day for a daily one, the Monday–Sunday week for a
 * weekly one, the month (or the stretch of it, or the cycle) for an MCC one —
 * so a weekly compliance ticked on Tuesday satisfies that week's row, exactly
 * as DCC always counted it.
 *
 * ── CARRY FORWARD, AND LAPSE (account holder, 2026-09-19) ────────────────
 * A row may be filled from the day it OPENS (its period's start — never a day
 * that has not come) until the last day it is OPEN; after that it has LAPSED
 * and what was filled — Done, Need Info, or nothing — stays as it is.
 *   WCC daily (Mon to Sat, Mon to Sun)  its own day only: the next day it is
 *                                       due again, so nothing carries
 *   WCC on chosen days                  carried forward while not Done, to the
 *                                       day before the next chosen day — Tue &
 *                                       Fri: Tue's carries Wed and Thu, lapsing
 *                                       on Fri — and never past Saturday:
 *                                       everything lapses on Sunday (a Sunday
 *                                       row keeps its own day)
 *   WCC once a week (older)             the whole week, lapsing on Sunday
 *   MCC                                 carried to the day before its next
 *                                       deadline, the last of the month to
 *                                       month-end — 1st, 5th, 10th and 15th:
 *                                       1st–4th, 5th–9th, 10th–14th, 15th–end
 * Only the DCC past-entry editor (`dcc.edit_past_entries`) changes a row that
 * has lapsed, exactly as on DCC. The Approver Status is never locked — a Team
 * Lead rules on work after its day.
 */

import {
  MCC_FREQUENCY_LABEL,
  mccDeadlinesIn,
  mccDetail,
  mccPeriodFor,
  mccScheduleOf,
} from "./mcc-frequency";

export type ComplianceKind = "wcc" | "mcc";
export type OccurrenceMode = "day" | "week" | "month";

export interface ComplianceItem {
  id: string;
  ownerEmployeeId: string;
  title: string;
  section: string | null;
  code: string | null;
  frequency: string | null;
  weekdays: number | null;
  scheduleKind: string | null;
  monthDay: number | null;
  isParticipantList: boolean | null;
  sortOrder: number | null;
  createdById: string | null;
  /** First day the compliance can be due — its creation, or its first fill if
   *  that is earlier (imported history). Null = always. */
  activeFrom: string | null;
  /** Its own Target and unit (numeric as a string, the way Drizzle hands it
   *  across) — what makes it ask how many were done (lib/compliance/quantity). */
  targetNumber?: string | null;
  unit?: string | null;
  /** MCC's frequency (migration 0240; lib/compliance/mcc-frequency) — absent = Monthly. */
  mccFrequency?: string | null;
  mccDays?: number[] | null;
  mccStartMonth?: number | null;
  /** WCC's Mins — how many minutes it takes each time (migration 0242); absent = not set. */
  minutes?: number | null;
}

export interface Occurrence {
  /** `${itemId}|${deadline}` — unique within a result. */
  key: string;
  itemId: string;
  ownerId: string;
  kind: ComplianceKind;
  mode: OccurrenceMode;
  /** The deadline, `YYYY-MM-DD`. */
  deadline: string;
  /** The span a fill counts in, inclusive. It also OPENS on periodStart. */
  periodStart: string;
  periodEnd: string;
  /** The last day it may be filled or changed — carried forward to here; it lapses the day after. */
  openUntil: string;
}

/** Which checklist a compliance is on, or null for neither. */
export function kindOf(item: Pick<ComplianceItem, "scheduleKind" | "isParticipantList">): ComplianceKind | null {
  if (item.isParticipantList) return null;
  const k = item.scheduleKind ?? "scheduled";
  if (k === "scheduled" || k === "weekly") return "wcc";
  if (k === "monthly") return "mcc";
  return null;
}

/* ── Calendar arithmetic, in UTC purely as a device ──────────────────────── */

const DAY = 86_400_000;
const utc = (ymd: string) => Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10));
const fmt = (t: number) => new Date(t).toISOString().slice(0, 10);

export function addDays(ymd: string, n: number): string {
  return fmt(utc(ymd) + n * DAY);
}

/** Monday = 0 … Sunday = 6, matching the DCC weekday mask. */
export function weekdayIndex(ymd: string): number {
  const g = new Date(utc(ymd)).getUTCDay();
  return g === 0 ? 6 : g - 1;
}

export function mondayOf(ymd: string): string {
  return addDays(ymd, -weekdayIndex(ymd));
}

export function daysInMonthOf(ymd: string): number {
  return new Date(Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7), 0)).getUTCDate();
}

export function monthStart(monthKey: string): string {
  return `${monthKey}-01`;
}

export function monthEnd(monthKey: string): string {
  return `${monthKey}-${String(daysInMonthOf(`${monthKey}-01`)).padStart(2, "0")}`;
}

/** Every date from `from` to `to`, inclusive. */
export function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let t = utc(from); t <= utc(to); t += DAY) out.push(fmt(t));
  return out;
}

const WORKING_WEEK = 0b0111111;

/** The bits of a weekday mask, lowest first. An empty mask means any day. */
function bitsOf(mask: number): number[] {
  const out: number[] = [];
  for (let b = 0; b < 7; b++) if (mask & (1 << b)) out.push(b);
  return out;
}

/** Mon to Sat, Mon to Sun (or no days set — every day): due again the very next day. */
export function isDailyMask(mask: number | null | undefined): boolean {
  const m = mask ?? 0;
  return m === 0 || m === WORKING_WEEK || m === 0b1111111;
}

/**
 * The last day a WCC row stays open (see CARRY FORWARD above): its own day
 * when daily; else up to the day before its next chosen day, but no later than
 * Saturday — it lapses on Sunday — unless it is itself due on Sunday.
 */
export function wccOpenUntil(scheduleKind: string | null | undefined, mask: number | null | undefined, deadline: string): string {
  const saturday = addDays(mondayOf(deadline), 5);
  if ((scheduleKind ?? "scheduled") === "weekly") return deadline > saturday ? deadline : saturday;
  if (isDailyMask(mask)) return deadline;
  let until = deadline;
  for (let d = addDays(deadline, 1); d <= saturday; d = addDays(d, 1)) {
    if ((mask ?? 0) & (1 << weekdayIndex(d))) break;
    until = d;
  }
  return until;
}

/** The MCC deadline for a month: its day, clamped to the month's length. */
export function mccDeadline(monthKey: string, monthDay: number | null): string {
  const last = daysInMonthOf(`${monthKey}-01`);
  const day = monthDay && monthDay >= 1 ? Math.min(monthDay, last) : last;
  return `${monthKey}-${String(day).padStart(2, "0")}`;
}

/* ── Occurrences ─────────────────────────────────────────────────────────── */

const occ = (
  item: ComplianceItem,
  kind: ComplianceKind,
  mode: OccurrenceMode,
  deadline: string,
  start: string,
  end: string,
  openUntil: string,
): Occurrence => ({
  key: `${item.id}|${deadline}`,
  itemId: item.id,
  ownerId: item.ownerEmployeeId,
  kind,
  mode,
  deadline,
  periodStart: start,
  periodEnd: end,
  openUntil,
});

/**
 * Every WCC row whose deadline falls in [from, to] — plus, for a weekly
 * compliance, a week still OPEN in the window (its first allowed day already
 * reached), so a weekly duty shows from the day it can be done, not only on its
 * last day.
 */
export function wccOccurrences(items: readonly ComplianceItem[], from: string, to: string): Occurrence[] {
  const out: Occurrence[] = [];
  for (const it of items) {
    if (kindOf(it) !== "wcc") continue;
    const active = it.activeFrom ?? "0000-00-00";
    if ((it.scheduleKind ?? "scheduled") === "weekly") {
      const bits = bitsOf(it.weekdays ?? 0);
      const first = bits.length ? bits[0]! : 0;
      const last = bits.length ? bits[bits.length - 1]! : 5; // any day → by Saturday
      for (let m = mondayOf(from); m <= to; m = addDays(m, 7)) {
        const open = addDays(m, first);
        const deadline = addDays(m, last);
        if (deadline < from || open > to || addDays(m, 6) < active) continue;
        out.push(occ(it, "wcc", "week", deadline, m, addDays(m, 6), wccOpenUntil("weekly", it.weekdays, deadline)));
      }
      continue;
    }
    const mask = it.weekdays ?? 0;
    for (const d of datesBetween(from, to)) {
      if (d < active) continue;
      if (mask !== 0 && (mask & (1 << weekdayIndex(d))) === 0) continue;
      out.push(occ(it, "wcc", "day", d, d, d, wccOpenUntil("scheduled", mask, d)));
    }
  }
  return out;
}

/**
 * Every MCC row for the given months ('YYYY-MM'): each deadline of each month a
 * compliance is due in — one for Monthly, two or three for 2 / 3 times a
 * month, and none in the months a Quarterly or an Annual one skips.
 */
export function mccOccurrences(items: readonly ComplianceItem[], monthKeys: readonly string[]): Occurrence[] {
  const out: Occurrence[] = [];
  for (const it of items) {
    if (kindOf(it) !== "mcc") continue;
    const active = it.activeFrom ?? "0000-00-00";
    const schedule = mccScheduleOf(it);
    for (const mk of monthKeys) {
      for (const d of mccDeadlinesIn(schedule, mk)) {
        if (d.periodEnd < active) continue;
        out.push(occ(it, "mcc", "month", d.deadline, d.periodStart, d.periodEnd, d.openUntil));
      }
    }
  }
  return out;
}

/* ── Fills ───────────────────────────────────────────────────────────────── */

export interface FillRow {
  itemId: string;
  entryDate: string;
}

/**
 * The fill for each occurrence — the entry on the day for a daily row, the
 * latest one inside the week or month otherwise.
 */
export function matchFills<E extends FillRow>(occurrences: readonly Occurrence[], entries: readonly E[]): Map<string, E> {
  const byItem = new Map<string, E[]>();
  for (const e of entries) {
    const list = byItem.get(e.itemId);
    if (list) list.push(e);
    else byItem.set(e.itemId, [e]);
  }
  const out = new Map<string, E>();
  for (const o of occurrences) {
    const list = byItem.get(o.itemId);
    if (!list) continue;
    let best: E | null = null;
    for (const e of list) {
      if (e.entryDate < o.periodStart || e.entryDate > o.periodEnd) continue;
      if (o.mode === "day" && e.entryDate !== o.deadline) continue;
      if (!best || e.entryDate > best.entryDate) best = e;
    }
    if (best) out.set(o.key, best);
  }
  return out;
}

/**
 * The period a fill for this compliance on this deadline counts in, and the
 * last day it is open — worked out on the SERVER from the compliance itself,
 * never trusted from the browser. Null when the date is not one of its
 * deadlines: a day it is not due on, a weekly one's other days, a date an MCC
 * compliance has no deadline on.
 */
export function periodFor(
  item: Pick<ComplianceItem, "scheduleKind"> &
    Partial<Pick<ComplianceItem, "weekdays" | "monthDay" | "mccFrequency" | "mccDays" | "mccStartMonth">>,
  deadline: string,
): { mode: OccurrenceMode; start: string; end: string; openUntil: string } | null {
  const k = item.scheduleKind ?? "scheduled";
  const mask = item.weekdays ?? 0;
  if (k === "weekly") {
    const m = mondayOf(deadline);
    const bits = bitsOf(mask);
    if (deadline !== addDays(m, bits.length ? bits[bits.length - 1]! : 5)) return null;
    return { mode: "week", start: m, end: addDays(m, 6), openUntil: wccOpenUntil("weekly", mask, deadline) };
  }
  if (k === "monthly") {
    const d = mccPeriodFor(mccScheduleOf(item), deadline);
    return d ? { mode: "month", start: d.periodStart, end: d.periodEnd, openUntil: d.openUntil } : null;
  }
  if (mask !== 0 && (mask & (1 << weekdayIndex(deadline))) === 0) return null;
  return { mode: "day", start: deadline, end: deadline, openUntil: wccOpenUntil("scheduled", mask, deadline) };
}

/**
 * May the doer's side of this row be written today? Never before it opens —
 * not even by the past-entry editor, as on DCC — and not after it lapses,
 * except by the past-entry editor.
 */
export function checkFillWindow(args: {
  /** The day it opens — its period's start. */
  opensOn: string;
  openUntil: string;
  /** Today in IST, YYYY-MM-DD. */
  today: string;
  /** Holds `dcc.edit_past_entries`. */
  canEditPast: boolean;
}): { ok: true } | { ok: false; error: string } {
  if (args.today < args.opensOn) {
    return { ok: false, error: `This one is not open yet — it can be filled from ${shortDay(args.opensOn)}.` };
  }
  if (args.today > args.openUntil && !args.canEditPast) {
    return {
      ok: false,
      error: `This one lapsed on ${shortDay(addDays(args.openUntil, 1))} — what was filled can no longer be changed.`,
    };
  }
  return { ok: true };
}

/* ── Words ───────────────────────────────────────────────────────────────── */

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WD = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** DD-MMM-YYYY — "18-Sep-2026", the deadline's format. */
export function formatDeadline(ymd: string | null | undefined): string {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return "—";
  return `${ymd.slice(8, 10)}-${MON[+ymd.slice(5, 7) - 1]}-${ymd.slice(0, 4)}`;
}

/** "Thu 18 Sep". */
export function shortDay(ymd: string): string {
  return `${WD[weekdayIndex(ymd)]} ${+ymd.slice(8, 10)} ${MON[+ymd.slice(5, 7) - 1]}`;
}

export function weekdayShort(ymd: string): string {
  return WD[weekdayIndex(ymd)]!;
}

type ScheduleFields = Pick<ComplianceItem, "scheduleKind" | "weekdays" | "monthDay" | "mccFrequency" | "mccDays" | "mccStartMonth">;

/**
 * How often, in words — WCC's "When": "Mon to Sat", "Mon to Sun", "Mon & Thu"
 * ("Weekly (any day)" for an older once-a-week one) — and on MCC the
 * frequency itself: "Monthly", "2 times/month", "Quarterly"…
 */
export function scheduleText(item: ScheduleFields): string {
  const k = item.scheduleKind ?? "scheduled";
  if (k === "monthly") return MCC_FREQUENCY_LABEL[mccScheduleOf(item).frequency];
  const mask = item.weekdays ?? 0;
  const days = bitsOf(mask).map((b) => WD[b]!);
  const list = days.length > 1 ? `${days.slice(0, -1).join(", ")} & ${days[days.length - 1]}` : (days[0] ?? "");
  if (k === "weekly") return mask ? `Weekly (${list})` : "Weekly (any day)";
  if (mask === 0 || mask === 0b1111111) return "Mon to Sun";
  if (mask === WORKING_WEEK) return "Mon to Sat";
  return list;
}

/** MCC: when, under the frequency — "by the 15th · Jun, Sep, Dec, Mar". Null on WCC. */
export function scheduleDetail(item: ScheduleFields): string | null {
  return (item.scheduleKind ?? "scheduled") === "monthly" ? mccDetail(mccScheduleOf(item)) : null;
}
