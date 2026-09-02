/**
 * DAILY GOALS DASHBOARD — the pure scoring + period core.
 *
 * PURE + CLIENT-SAFE by design (no `server-only`, no db, no I/O), so the server
 * assembler and the client view compute percentages from the SAME functions and
 * can never disagree about what a score means. Same discipline as
 * lib/goals/scoring.ts.
 *
 * ── WHAT THE DAILY SCORE IS ────────────────────────────────────────────────
 * A day's score is `done / planned` over the commitments that were on that day,
 * split into three streams — Goals, WMS Tasks, Commitments — that sum to the
 * overall figure. "8 / 10 · 80%".
 *
 * ── THE ONE RULE: TRANSFERRING NEVER CHANGES A SCORE ────────────────────────
 * A day's PLANNED set is every row currently sitting on that day PLUS every row
 * that was planned on that day and has since been moved off it
 * (`moved_from_date` = the day). A day's DONE set is only rows still sitting on
 * the day and ticked.
 *
 * That definition makes the act of transferring score-neutral, which is the
 * requirement:
 *
 *     leave it unticked on Monday  -> planned 1, done 0  -> 0/1
 *     push it to Tuesday instead   -> planned 1, done 0  -> 0/1   (identical)
 *
 * So unfinished and transferred work are reported as their own accountability
 * numbers, never as a second deduction on top of the miss that is already
 * priced in by "not in the numerator".
 *
 * A period (week / MTD / custom range) is the plain sum of its days, so a
 * drill-down always adds back up to the roll-up above it.
 */

/** The three streams a planned item can belong to. Mirrors how the planner
 *  itself classifies a `daily_checklist` row (see goals/plan/payload.ts):
 *  `task_id` => a WMS task, a goal link (or `origin = 'goal_related'`) => a
 *  goal, anything else => a typed commitment. */
export type ScoreStream = "goals" | "wms" | "commitments";

export const STREAM_LABELS: Record<ScoreStream, string> = {
  goals: "Goals",
  wms: "WMS Tasks",
  commitments: "Commitments",
};

/** `done` out of `planned` for one stream (or for the whole day). */
export interface ScoreBucket {
  done: number;
  planned: number;
}

/** A scored window — one day, one week, or a custom range. */
export interface Scorecard {
  overall: ScoreBucket;
  goals: ScoreBucket;
  wms: ScoreBucket;
  commitments: ScoreBucket;
  /** Planned, still sitting on the day, not ticked. Informational only. */
  unfinished: number;
  /** Planned on the day, since moved to another date. Informational only. */
  transferred: number;
}

export const emptyBucket = (): ScoreBucket => ({ done: 0, planned: 0 });

export function emptyScorecard(): Scorecard {
  return {
    overall: emptyBucket(),
    goals: emptyBucket(),
    wms: emptyBucket(),
    commitments: emptyBucket(),
    unfinished: 0,
    transferred: 0,
  };
}

/**
 * A bucket as a whole percentage, 0-100.
 *
 * An EMPTY bucket is 0, not 100: nothing planned is not a perfect day, and a
 * "100%" against 0/0 would quietly float everyone who never plans to the top of
 * the leaderboard. Callers that need to hide un-planned people use
 * {@link hasSignal} instead of reading the percentage.
 */
export function pct(b: ScoreBucket): number {
  if (!b || b.planned <= 0) return 0;
  return Math.round((b.done / b.planned) * 100);
}

/** Did this person plan anything at all in the window? Guards every ranking and
 *  threshold list, so "planned nothing" never reads as "scored 0%". */
export function hasSignal(b: ScoreBucket): boolean {
  return (b?.planned ?? 0) > 0;
}

/** `3 / 5` — the score as the spec writes it. */
export function scoreLabel(b: ScoreBucket): string {
  return `${b.done} / ${b.planned}`;
}

export function addBucket(into: ScoreBucket, from: ScoreBucket): void {
  into.done += from.done;
  into.planned += from.planned;
}

/** Fold `from` into `into` in place — how a period sums its days and how a team
 *  sums its people. */
export function addScorecard(into: Scorecard, from: Scorecard): void {
  addBucket(into.overall, from.overall);
  addBucket(into.goals, from.goals);
  addBucket(into.wms, from.wms);
  addBucket(into.commitments, from.commitments);
  into.unfinished += from.unfinished;
  into.transferred += from.transferred;
}

export function sumScorecards(cards: Scorecard[]): Scorecard {
  const out = emptyScorecard();
  for (const c of cards) addScorecard(out, c);
  return out;
}

/* ----------------------------------------------------------------------- */
/* Periods                                                                  */
/* ----------------------------------------------------------------------- */

/** The four windows the header offers. `custom` reads `?from=` / `?to=`. */
export type DashPeriod = "day" | "week" | "mtd" | "custom";

export const DASH_PERIODS: readonly DashPeriod[] = ["day", "week", "mtd", "custom"] as const;

export const PERIOD_LABELS: Record<DashPeriod, string> = {
  day: "Daily",
  week: "This Week",
  mtd: "Month to Date",
  custom: "Custom Range",
};

export function parsePeriod(raw: unknown): DashPeriod {
  const v = String(raw ?? "")
    .trim()
    .toLowerCase();
  return (DASH_PERIODS as readonly string[]).includes(v) ? (v as DashPeriod) : "day";
}

/** A yyyy-mm-dd, or null when the input is not one. Also rejects the shapes
 *  that parse as a Date but are not a real calendar day (2026-02-31). */
export function parseYmd(raw: unknown): string | null {
  const v = String(raw ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const y = Number(v.slice(0, 4));
  const m = Number(v.slice(5, 7));
  const d = Number(v.slice(8, 10));
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return v;
}

/** How many days a custom range may span. Four months is far past any review
 *  window anyone actually uses, and it stops a hand-typed `?from=1900-01-01`
 *  from asking the database for a decade of rows. */
export const MAX_RANGE_DAYS = 120;

export interface ResolvedRange {
  /** Inclusive yyyy-mm-dd bounds. */
  from: string;
  to: string;
  period: DashPeriod;
  /** Every day in [from, to], oldest -> newest. */
  days: string[];
}

function ymdToUtc(ymd: string): Date {
  return new Date(`${ymd}T00:00:00Z`);
}

function utcToYmd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function shiftYmd(ymd: string, n: number): string {
  const d = ymdToUtc(ymd);
  d.setUTCDate(d.getUTCDate() + n);
  return utcToYmd(d);
}

/** Whole days from `from` to `to`; positive when `to` is later. */
export function daysBetween(from: string, to: string): number {
  return Math.round((ymdToUtc(to).getTime() - ymdToUtc(from).getTime()) / 86_400_000);
}

/** Monday of the week containing `ymd` — the week runs Mon->Sun, matching
 *  lib/weekly-goals/week.ts so "This Week" means the same thing app-wide. */
export function mondayOfYmd(ymd: string): string {
  const dow = ymdToUtc(ymd).getUTCDay(); // 0 Sun … 6 Sat
  return shiftYmd(ymd, dow === 0 ? -6 : 1 - dow);
}

export function listDays(from: string, to: string): string[] {
  const out: string[] = [];
  const span = daysBetween(from, to);
  for (let i = 0; i <= span; i++) out.push(shiftYmd(from, i));
  return out;
}

/**
 * Turn the URL's `?period` / `?day` / `?from` / `?to` into one inclusive window.
 *
 * `today` is the caller's IST today — passed in rather than read here so this
 * module stays pure and the server and the client agree on which day it is.
 *
 * Every window is clamped to end no later than today (a score for tomorrow is
 * meaningless — nothing has been ticked yet) and to {@link MAX_RANGE_DAYS}.
 */
export function resolveRange(
  today: string,
  raw: { period?: unknown; day?: unknown; from?: unknown; to?: unknown },
): ResolvedRange {
  const period = parsePeriod(raw.period);

  const finish = (from: string, to: string, p: DashPeriod): ResolvedRange => {
    const end = to > today ? today : to;
    // Clamp the SPAN from the end, so a too-wide range keeps its most recent
    // days — those are the ones the reader came for.
    const start =
      daysBetween(from, end) >= MAX_RANGE_DAYS ? shiftYmd(end, -(MAX_RANGE_DAYS - 1)) : from;
    const lo = start > end ? end : start;
    return { from: lo, to: end, period: p, days: listDays(lo, end) };
  };

  if (period === "week") return finish(mondayOfYmd(today), today, period);
  if (period === "mtd") return finish(`${today.slice(0, 7)}-01`, today, period);
  if (period === "custom") {
    // A half-filled range is still usable: whichever end is missing falls back
    // to the other, so typing only "From" reads as that single day rather than
    // silently dropping back to Daily.
    const a = parseYmd(raw.from);
    const b = parseYmd(raw.to);
    if (!a && !b) return finish(today, today, "custom");
    let from = a ?? (b as string);
    let to = b ?? (a as string);
    if (from > to) [from, to] = [to, from];
    return finish(from, to, "custom");
  }

  // Daily — `?day=` picks which day, defaulting to today. Never in the future.
  const day = parseYmd(raw.day) ?? today;
  const pick = day > today ? today : day;
  return finish(pick, pick, "day");
}

/* ----------------------------------------------------------------------- */
/* Below-threshold                                                          */
/* ----------------------------------------------------------------------- */

/** The preset cut-offs the threshold dropdown offers, plus a free-typed value. */
export const THRESHOLD_CHOICES = [90, 80, 75, 70, 60] as const;
export const DEFAULT_THRESHOLD = 80;

/** 1-100, whole. Anything else falls back to the default cut-off. */
export function parseThreshold(raw: unknown): number {
  const n = Math.trunc(Number(raw));
  return Number.isFinite(n) && n >= 1 && n <= 100 ? n : DEFAULT_THRESHOLD;
}

/** How many rows the two leaderboards show. */
export const PERFORMER_ROWS = 5;

/* ----------------------------------------------------------------------- */
/* Labels                                                                   */
/* ----------------------------------------------------------------------- */

const MONTH_ABBR = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** "25-Aug" — the compact day label the transferred-work breakdown uses. */
export function shortDay(ymd: string): string {
  const [, m, d] = ymd.split("-");
  return `${d}-${MONTH_ABBR[Number(m) - 1] ?? m}`;
}

/** "Tomorrow", "Day After", else "25-Aug" — relative to the day the work moved
 *  off, which is how the planner itself names the next two days. */
export function relativeDay(ymd: string, anchor: string): string {
  const delta = daysBetween(anchor, ymd);
  if (delta === 0) return "Same day";
  if (delta === 1) return "Tomorrow";
  if (delta === 2) return "Day After";
  if (delta === -1) return "Yesterday";
  return shortDay(ymd);
}

/** "Mon 25 Aug 2026" / "01 Aug – 21 Aug 2026" — the window under the title. */
export function rangeLabel(range: ResolvedRange): string {
  if (range.from === range.to) return longDay(range.from);
  return `${shortDay(range.from)} – ${shortDay(range.to)} ${range.to.slice(0, 4)}`;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function longDay(ymd: string): string {
  const dt = ymdToUtc(ymd);
  return `${WEEKDAYS[dt.getUTCDay()]} ${shortDay(ymd)} ${ymd.slice(0, 4)}`;
}
