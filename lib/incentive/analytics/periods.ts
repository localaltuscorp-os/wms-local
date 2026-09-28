import { istYmd } from "@/lib/weekly-goals/week";

/**
 * INCENTIVE DASHBOARD — PERIODS.
 *
 * Pure and client-safe. Every dashboard figure (earnings, % of CTC, grade, rank,
 * status totals, target vs actual) is computed over one of these, and the server
 * resolves it — the browser only sends `{ kind, month }`.
 *
 * ── CONVENTIONS, TAKEN FROM THE EXISTING MODULE ────────────────────────────
 *  · MONTH GRANULARITY. Every incentive reader in this codebase buckets by
 *    month (`period_month`, first-of-month) — the dashboard, the Booked/Accrued/
 *    Paid status report and the canonical PAID producer all do. A period is a
 *    list of whole months, so a record is in or out by its month and there is no
 *    partial-day boundary to get wrong.
 *  · CALENDAR-YEAR YTD. The Incentive module's year is January–December: the
 *    page's year picker, `yearBounds` in lib/queries/incentives.ts and
 *    `ytdMonths` in lib/queries/incentive-status.ts. (The April financial year
 *    belongs to the salary earnings document and Accounts, not to this module.)
 *  · IST "NOW". Which month is current is decided in Asia/Kolkata on the server
 *    (`istYmd`), never from the viewer's browser clock.
 *  · "Last 3 / 6 months" INCLUDE the current month, as the status report's
 *    `trailingMonths(ref, 3)` already does.
 */

export const PERIOD_KINDS = [
  "current_month",
  "month",
  "quarter",
  "year",
  "last_3",
  "last_6",
  "ytd",
] as const;
export type PeriodKind = (typeof PERIOD_KINDS)[number];

export const PERIOD_LABELS: Record<PeriodKind, string> = {
  current_month: "Current Month",
  month: "Specific Month",
  quarter: "Specific Quarter",
  year: "Specific Year",
  last_3: "Last 3 Months",
  last_6: "Last 6 Months",
  ytd: "YTD",
};

/** The earliest month the picker offers and the server accepts. */
export const EARLIEST_MONTH = "2020-01";

/**
 * The earliest YEAR the picker offers and the server accepts.
 *
 * Derived from `EARLIEST_MONTH` rather than typed again, so moving the floor
 * moves both granularities — a year picker offering 2019 while the month picker
 * refuses 2019-06 would be two answers to one question.
 */
export const EARLIEST_YEAR = EARLIEST_MONTH.slice(0, 4);

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;
const QUARTER_RE = /^(\d{4})-Q([1-4])$/;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export interface PeriodSelection {
  kind: PeriodKind;
  /** "YYYY-MM" — only for kind "month". */
  month?: string | null;
  /** "YYYY-QN" — only for kind "quarter". */
  quarter?: string | null;
  /** "YYYY" — only for kind "year". */
  year?: string | null;
}

export interface ResolvedPeriod {
  kind: PeriodKind;
  /** e.g. "Sep 2026",
   *  "Q3 2026", "Jul – Sep 2026", "Jan – Sep 2026". */
  label: string;
  /** Ascending "YYYY-MM" keys. */
  months: string[];
  /** "YYYY-MM-01" of the first month. */
  start: string;
  /** "YYYY-MM-01" of the month after the last — exclusive. */
  endExclusive: string;
  /** The window ranks are compared against, or null when there is none. */
  previous: { months: string[]; label: string } | null;
  /**
   * For kind "quarter" only: the "YYYY-MM-01" the quarter's own TARGET row is
   * anchored on (its first month). A quarterly target is stored once, here, and
   * is deliberately NOT one of `months`' monthly targets — see migration 0250.
   */
  quarterStart?: string;
}

export function isMonthKey(v: unknown): v is string {
  return typeof v === "string" && MONTH_RE.test(v);
}

export function isQuarterKey(v: unknown): v is string {
  return typeof v === "string" && QUARTER_RE.test(v);
}

/** The three "YYYY-MM" keys of a "YYYY-QN", ascending. */
export function quarterMonths(quarter: string): string[] {
  const m = quarter.match(QUARTER_RE);
  if (!m) return [];
  const year = Number(m[1]);
  const first = (Number(m[2]) - 1) * 3 + 1;
  return [0, 1, 2].map((i) => `${year}-${pad2(first + i)}`);
}

/** "Q3 2026". */
export function formatQuarterKey(quarter: string): string {
  const m = quarter.match(QUARTER_RE);
  return m ? `Q${m[2]} ${m[1]}` : quarter;
}

/** The current quarter in IST, e.g. "2026-Q3". */
export function currentQuarterKey(now: Date = new Date()): string {
  const cur = currentMonthKey(now);
  const [y, m] = cur.split("-").map(Number) as [number, number];
  return `${y}-Q${Math.floor((m - 1) / 3) + 1}`;
}

/** The quarter `delta` quarters away from `quarter`. */
export function addQuarters(quarter: string, delta: number): string {
  const m = quarter.match(QUARTER_RE);
  if (!m) return quarter;
  const idx = Number(m[1]) * 4 + (Number(m[2]) - 1) + delta;
  const y = Math.floor(idx / 4);
  return `${y}-Q${(idx - y * 4) + 1}`;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function isPeriodKind(v: unknown): v is PeriodKind {
  return typeof v === "string" && (PERIOD_KINDS as readonly string[]).includes(v);
}

/** Add `delta` months to a "YYYY-MM" key. */
export function addMonths(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const total = y * 12 + (m - 1) + delta;
  const ny = Math.floor(total / 12);
  const nm = total - ny * 12 + 1;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

/** Inclusive ascending range of "YYYY-MM" keys; empty when from > to. */
export function monthRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let m = from; m <= to; m = addMonths(m, 1)) out.push(m);
  return out;
}

/** "Sep 2026". */
export function formatMonthKey(month: string): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return `${MONTHS[m - 1] ?? "?"} ${y}`;
}

/** "Jul – Sep 2026" or "Nov 2025 – Jan 2026"; a single month reads "Sep 2026". */
export function formatMonthSpan(months: readonly string[]): string {
  const first = months[0];
  const last = months[months.length - 1];
  if (!first || !last) return "";
  if (first === last) return formatMonthKey(first);
  const [fy, fm] = first.split("-").map(Number) as [number, number];
  const [ly] = last.split("-").map(Number) as [number, number];
  return fy === ly
    ? `${MONTHS[fm - 1]} – ${formatMonthKey(last)}`
    : `${formatMonthKey(first)} – ${formatMonthKey(last)}`;
}

/** The current month in IST. */
export function currentMonthKey(now: Date = new Date()): string {
  return istYmd(now).slice(0, 7);
}

/** The month a "YYYY-MM-DD" (or longer ISO) string falls in, or null. */
export function monthKeyOf(ymd: string | null | undefined): string | null {
  if (!ymd) return null;
  const key = ymd.slice(0, 7);
  return isMonthKey(key) ? key : null;
}

/** Selectable months for the "Specific Month" picker, newest first. */
export function selectableMonths(now: Date = new Date(), count = 24): string[] {
  const cur = currentMonthKey(now);
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const m = addMonths(cur, -i);
    if (m < EARLIEST_MONTH) break;
    out.push(m);
  }
  return out;
}

/** Selectable quarters for the "Specific Quarter" picker, newest first. */
export function selectableQuarters(now: Date = new Date(), count = 12): string[] {
  const cur = currentQuarterKey(now);
  const floor = `${EARLIEST_MONTH.slice(0, 4)}-Q1`;
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const q = addQuarters(cur, -i);
    if (q < floor) break;
    out.push(q);
  }
  return out;
}

/** Selectable years for the "Specific Year" picker, newest first. */
export function selectableYears(now: Date = new Date(), count = 8): string[] {
  const cur = Number(currentMonthKey(now).slice(0, 4));
  const floor = Number(EARLIEST_YEAR);
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const y = cur - i;
    if (y < floor) break;
    out.push(String(y));
  }
  return out;
}

/** Is this a year the picker offers and the server accepts? */
export function isSelectableYear(v: unknown, now: Date = new Date()): v is string {
  if (typeof v !== "string" || !/^\d{4}$/.test(v)) return false;
  const y = Number(v);
  return y >= Number(EARLIEST_YEAR) && y <= Number(currentMonthKey(now).slice(0, 4));
}

/**
 * Resolve a selection into concrete months, or null when it is not valid.
 *
 * A specific month must be a real "YYYY-MM" between EARLIEST_MONTH and the
 * current month: a future month has no incentives to analyse, and refusing it
 * here means a crafted request cannot ask for one.
 *
 * PREVIOUS WINDOW (for rank movement) — the same-length window immediately
 * before: the month before, the quarter before, the year before, or the 3 / 6
 * months before. For YTD it is YTD as of the end of last month, so the movement
 * reads "since last month"; in January there is no earlier YTD in the year, so
 * there is no previous window and rank movement shows as not applicable rather
 * than as an invented value.
 */
export function resolvePeriod(sel: PeriodSelection, now: Date = new Date()): ResolvedPeriod | null {
  if (!isPeriodKind(sel.kind)) return null;
  const cur = currentMonthKey(now);

  let months: string[];
  let previous: string[] | null;
  /** Set only by the quarter branch — the anchor of that quarter's own target. */
  let quarterStart: string | undefined;
  switch (sel.kind) {
    case "current_month":
      months = [cur];
      previous = [addMonths(cur, -1)];
      break;
    case "month": {
      const m = sel.month;
      if (!isMonthKey(m) || m < EARLIEST_MONTH || m > cur) return null;
      months = [m];
      previous = [addMonths(m, -1)];
      break;
    }
    case "quarter": {
      // Bounded like the month picker: a real "YYYY-QN" from 2020 up to the
      // CURRENT quarter. A future quarter has no incentives to analyse yet.
      const q = sel.quarter;
      if (!isQuarterKey(q)) return null;
      const [qy] = q.split("-") as [string];
      if (Number(qy) < Number(EARLIEST_MONTH.slice(0, 4)) || q > currentQuarterKey(now)) return null;
      const qMonths = quarterMonths(q);
      const bare = qMonths[0]!;
      if (bare < EARLIEST_MONTH) return null;
      months = qMonths;
      previous = quarterMonths(addQuarters(q, -1));
      quarterStart = `${bare}-01`;
      break;
    }
    case "year": {
      // Bounded like the quarter picker: a real four-digit year from the floor
      // up to the CURRENT year. A future year has no incentives to analyse yet,
      // and refusing it here is what stops a crafted request asking for one.
      //
      // THE WHOLE CALENDAR YEAR, all twelve months — that is what "Specific
      // Year" means, and it is deliberately not `ytd`. `ytd` is "January to
      // now", which is the running view; this is the year as a closed unit. For
      // the current year the months still to come simply hold no rows, so the
      // figures are the same ones YTD shows, over the same window the year
      // picker on the Targets / Status / Billing tabs has always used.
      const y = sel.year;
      if (!isSelectableYear(y, now)) return null;
      months = monthRange(`${y}-01`, `${y}-12`);
      previous = monthRange(`${Number(y) - 1}-01`, `${Number(y) - 1}-12`);
      break;
    }
    case "last_3":
    case "last_6": {
      const n = sel.kind === "last_3" ? 3 : 6;
      months = monthRange(addMonths(cur, -(n - 1)), cur);
      previous = monthRange(addMonths(cur, -(2 * n - 1)), addMonths(cur, -n));
      break;
    }
    case "ytd": {
      const year = cur.slice(0, 4);
      months = monthRange(`${year}-01`, cur);
      previous = cur.endsWith("-01") ? null : monthRange(`${year}-01`, addMonths(cur, -1));
      break;
    }
  }

  const first = months[0]!;
  const last = months[months.length - 1]!;
  return {
    kind: sel.kind,
    // A quarter reads as "Q3 2026" and a year as "2026" — never as the month
    // span they resolve to. The quarter/year IS the unit the user picked, and
    // "Jul – Sep 2026" would make them count months to check what they chose.
    label:
      sel.kind === "quarter" && isQuarterKey(sel.quarter)
        ? formatQuarterKey(sel.quarter)
        : sel.kind === "year" && typeof sel.year === "string" && /^\d{4}$/.test(sel.year)
          ? sel.year
          : formatMonthSpan(months),
    months,
    start: `${first}-01`,
    endExclusive: `${addMonths(last, 1)}-01`,
    previous: previous && previous.length > 0 ? { months: previous, label: formatMonthSpan(previous) } : null,
    ...(quarterStart ? { quarterStart } : {}),
  };
}
