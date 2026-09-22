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
 *     · 'scheduled' — due on each of its weekdays ("Daily" = Mon–Sat). One row
 *       per due day; the deadline is that day.
 *     · 'weekly'    — once a week, on any of its days. One row per week; the
 *       deadline is its last allowed day (Saturday when any day will do).
 *   MCC — Monthly Compliance Checklist
 *     · 'monthly'   — once a month. One row per month; the deadline is its
 *       `month_day`, or the month's last day when none is set, and a 31st in a
 *       30-day month falls on the 30th.
 *
 * Participant-list, ad-hoc and event compliances belong to neither — they
 * never had a deadline, and My Day never showed them either.
 *
 * ── A ROW IS AN "OCCURRENCE" ─────────────────────────────────────────────
 * One compliance, one deadline. Its fill is the dcc_entries row inside the
 * occurrence's PERIOD — the day for a daily one, the Monday–Sunday week for a
 * weekly one, the calendar month for a monthly one — so a weekly compliance
 * ticked on Tuesday satisfies that week's row, exactly as DCC always counted it.
 */

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
  /** The span a fill counts in, inclusive. */
  periodStart: string;
  periodEnd: string;
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

/** The MCC deadline for a month: its day, clamped to the month's length. */
export function mccDeadline(monthKey: string, monthDay: number | null): string {
  const last = daysInMonthOf(`${monthKey}-01`);
  const day = monthDay && monthDay >= 1 ? Math.min(monthDay, last) : last;
  return `${monthKey}-${String(day).padStart(2, "0")}`;
}

/* ── Occurrences ─────────────────────────────────────────────────────────── */

const occ = (item: ComplianceItem, kind: ComplianceKind, mode: OccurrenceMode, deadline: string, start: string, end: string): Occurrence => ({
  key: `${item.id}|${deadline}`,
  itemId: item.id,
  ownerId: item.ownerEmployeeId,
  kind,
  mode,
  deadline,
  periodStart: start,
  periodEnd: end,
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
        out.push(occ(it, "wcc", "week", deadline, m, addDays(m, 6)));
      }
      continue;
    }
    const mask = it.weekdays ?? 0;
    for (const d of datesBetween(from, to)) {
      if (d < active) continue;
      if (mask !== 0 && (mask & (1 << weekdayIndex(d))) === 0) continue;
      out.push(occ(it, "wcc", "day", d, d, d));
    }
  }
  return out;
}

/** Every MCC row for the given months ('YYYY-MM'). */
export function mccOccurrences(items: readonly ComplianceItem[], monthKeys: readonly string[]): Occurrence[] {
  const out: Occurrence[] = [];
  for (const it of items) {
    if (kindOf(it) !== "mcc") continue;
    const active = it.activeFrom ?? "0000-00-00";
    for (const mk of monthKeys) {
      if (monthEnd(mk) < active) continue;
      out.push(occ(it, "mcc", "month", mccDeadline(mk, it.monthDay), monthStart(mk), monthEnd(mk)));
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
 * The period a fill for this compliance on this deadline counts in — worked out
 * on the SERVER from the compliance itself, never trusted from the browser.
 */
export function periodFor(
  item: Pick<ComplianceItem, "scheduleKind">,
  deadline: string,
): { mode: OccurrenceMode; start: string; end: string } {
  const k = item.scheduleKind ?? "scheduled";
  if (k === "weekly") {
    const m = mondayOf(deadline);
    return { mode: "week", start: m, end: addDays(m, 6) };
  }
  if (k === "monthly") {
    const mk = deadline.slice(0, 7);
    return { mode: "month", start: monthStart(mk), end: monthEnd(mk) };
  }
  return { mode: "day", start: deadline, end: deadline };
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

function ordinal(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th");
  return `${n}${s}`;
}

/** How often, in words: "Daily", "Mon & Thu", "Weekly (any day)", "Monthly by the 7th". */
export function scheduleText(item: Pick<ComplianceItem, "scheduleKind" | "weekdays" | "monthDay">): string {
  const k = item.scheduleKind ?? "scheduled";
  if (k === "monthly") return item.monthDay ? `Monthly by the ${ordinal(item.monthDay)}` : "Monthly by month-end";
  const mask = item.weekdays ?? 0;
  const days = bitsOf(mask).map((b) => WD[b]!);
  const list = days.length > 1 ? `${days.slice(0, -1).join(", ")} & ${days[days.length - 1]}` : (days[0] ?? "");
  if (k === "weekly") return mask ? `Weekly (${list})` : "Weekly (any day)";
  if (mask === 0 || mask === 0b1111111) return "Every day";
  if (mask === WORKING_WEEK) return "Daily";
  return list;
}
