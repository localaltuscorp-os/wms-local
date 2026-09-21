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

export const PERIOD_KINDS = ["current_month", "month", "last_3", "last_6", "ytd"] as const;
export type PeriodKind = (typeof PERIOD_KINDS)[number];

export const PERIOD_LABELS: Record<PeriodKind, string> = {
  current_month: "Current Month",
  month: "Specific Month",
  last_3: "Last 3 Months",
  last_6: "Last 6 Months",
  ytd: "YTD",
};

/** The earliest month the picker offers and the server accepts. */
export const EARLIEST_MONTH = "2020-01";

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export interface PeriodSelection {
  kind: PeriodKind;
  /** "YYYY-MM" — only for kind "month". */
  month?: string | null;
}

export interface ResolvedPeriod {
  kind: PeriodKind;
  /** e.g. "Sep 2026", "Jul – Sep 2026", "Jan – Sep 2026". */
  label: string;
  /** Ascending "YYYY-MM" keys. */
  months: string[];
  /** "YYYY-MM-01" of the first month. */
  start: string;
  /** "YYYY-MM-01" of the month after the last — exclusive. */
  endExclusive: string;
  /** The window ranks are compared against, or null when there is none. */
  previous: { months: string[]; label: string } | null;
}

export function isMonthKey(v: unknown): v is string {
  return typeof v === "string" && MONTH_RE.test(v);
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

/**
 * Resolve a selection into concrete months, or null when it is not valid.
 *
 * A specific month must be a real "YYYY-MM" between EARLIEST_MONTH and the
 * current month: a future month has no incentives to analyse, and refusing it
 * here means a crafted request cannot ask for one.
 *
 * PREVIOUS WINDOW (for rank movement) — the same-length window immediately
 * before: the month before, or the 3 / 6 months before. For YTD it is YTD as of
 * the end of last month, so the movement reads "since last month"; in January
 * there is no earlier YTD in the year, so there is no previous window and rank
 * movement shows as not applicable rather than as an invented value.
 */
export function resolvePeriod(sel: PeriodSelection, now: Date = new Date()): ResolvedPeriod | null {
  if (!isPeriodKind(sel.kind)) return null;
  const cur = currentMonthKey(now);

  let months: string[];
  let previous: string[] | null;
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
    label: formatMonthSpan(months),
    months,
    start: `${first}-01`,
    endExclusive: `${addMonths(last, 1)}-01`,
    previous: previous && previous.length > 0 ? { months: previous, label: formatMonthSpan(previous) } : null,
  };
}
