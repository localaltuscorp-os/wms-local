/**
 * EVENT CHECKLIST — the date arithmetic.
 *
 * PURE, and deliberately free of `server-only`: the grid computes target dates
 * as you type an offset, and the server computes them again on save. One
 * implementation, so the two can never disagree about what "-3" means.
 *
 * ── NO TIMEZONE CONVERSION HAPPENS HERE ──────────────────────────────────────
 * `event_date` and `target_date` are Postgres `date` columns — calendar days
 * with no instant attached — so every function below works on the YYYY-MM-DD
 * string directly. Routing these through a JS `Date` is how a 14/03 event
 * becomes 13/03 for anyone running west of IST, and the bug only appears on
 * someone else's machine. The one real timestamp in the feature is `done_at`,
 * and it is formatted, never arithmetic'd.
 */

/** The three phases a row can sit in, plus the one for rows nobody has dated. */
export type ChecklistPhase = "before" | "during" | "after" | "undated";

export const PHASE_ORDER: readonly ChecklistPhase[] = [
  "before",
  "during",
  "after",
  "undated",
] as const;

export const PHASE_LABELS: Record<ChecklistPhase, string> = {
  before: "Before Event",
  during: "During Event",
  after: "After Event",
  undated: "Undated",
};

/** Offsets outside this are a typo, not a plan. Mirrored by a CHECK constraint. */
export const OFFSET_MIN = -365;
export const OFFSET_MAX = 365;

const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parse YYYY-MM-DD into its three numbers, or null if it is not that shape. */
function parseYmd(ymd: string): { y: number; m: number; d: number } | null {
  const m = YMD.exec(ymd.trim());
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

/**
 * Add days to a YYYY-MM-DD string, staying in calendar space.
 *
 * UTC is used purely as an arithmetic device — `Date.UTC` gives correct month
 * and leap-year rollover with no local-timezone component to shift the answer.
 * The value never leaves as a Date, so no instant is ever implied.
 */
export function addDays(ymd: string, days: number): string {
  const p = parseYmd(ymd);
  if (!p) return ymd;
  const dt = new Date(Date.UTC(p.y, p.m - 1, p.d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/** Whole days between two calendar dates: `to - from`. */
export function daysBetween(from: string, to: string): number | null {
  const a = parseYmd(from);
  const b = parseYmd(to);
  if (!a || !b) return null;
  const ms =
    Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d);
  return Math.round(ms / 86_400_000);
}

/**
 * THE TARGET DATE. Event date + offset, in calendar days.
 *
 * Calendar days, not working days: "-3" from a Monday event lands on the Friday
 * before. For "print the badges" the difference between that Friday and the
 * Wednesday a working-day count would give is the whole point, so the rule is
 * stated rather than inferred — and a target landing on a Sunday or a holiday
 * is BADGED in the grid, never silently moved.
 */
export function targetDate(eventDate: string | null, offsetDays: number | null): string | null {
  if (!eventDate || offsetDays === null || offsetDays === undefined) return null;
  return addDays(eventDate, offsetDays);
}

/**
 * Which phase an offset falls in.
 *
 * Null is `undated`, NOT `during`. An imported row nobody has scheduled has to
 * be visibly unscheduled — defaulting it to 0 would quietly claim it happens on
 * event day, which is the sort of wrong that is only discovered on the day.
 */
export function phaseFor(offsetDays: number | null | undefined): ChecklistPhase {
  if (offsetDays === null || offsetDays === undefined) return "undated";
  if (offsetDays < 0) return "before";
  if (offsetDays === 0) return "during";
  return "after";
}

/**
 * VARIANCE, in whole days: `actual - target`. POSITIVE MEANS LATE.
 *
 * The sign convention is fixed here once so no caller has to guess. A task
 * finished two days early reads -2; colour carries the meaning in the UI so the
 * sign never has to be puzzled out at all.
 *
 * An OPEN row whose target has passed reports its running lateness against
 * `today` rather than nothing. A blank there would mean a task three days
 * overdue looked identical to one not yet due, which is exactly backwards: the
 * whole reason to track variance is to see slippage before it is final.
 */
export function variance(
  target: string | null,
  actual: string | null,
  today: string | null = null,
): number | null {
  if (!target) return null;
  if (actual) return daysBetween(target, actual);
  if (!today) return null;
  const late = daysBetween(target, today);
  return late !== null && late > 0 ? late : null;
}

/** Is a computed variance still running (task open) rather than final? */
export function isRunningVariance(actual: string | null): boolean {
  return !actual;
}

/**
 * Coerce whatever the offset input produced into a stored value.
 * Accepts "-3", "3", "+3" and blank. Blank is null — undated — not zero.
 */
export function parseOffset(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (s === "") return null;
  const n = Number(s.replace(/^\+/, ""));
  if (!Number.isFinite(n) || !Number.isInteger(n)) return null;
  if (n < OFFSET_MIN || n > OFFSET_MAX) return null;
  return n;
}

/** Render an offset the way the grid shows it: signed, and "—" when undated. */
export function formatOffset(offsetDays: number | null | undefined): string {
  if (offsetDays === null || offsetDays === undefined) return "—";
  if (offsetDays === 0) return "0";
  return offsetDays > 0 ? `+${offsetDays}` : String(offsetDays);
}

/** DD/MM/YYYY — the format the business writes dates in. */
export function formatDMY(ymd: string | null | undefined): string {
  if (!ymd) return "—";
  const p = parseYmd(ymd);
  if (!p) return "—";
  const dd = String(p.d).padStart(2, "0");
  const mm = String(p.m).padStart(2, "0");
  return `${dd}/${mm}/${p.y}`;
}

/** Sunday is the default weekly off, so a target landing there gets badged. */
export function isSunday(ymd: string | null | undefined): boolean {
  if (!ymd) return false;
  const p = parseYmd(ymd);
  if (!p) return false;
  return new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay() === 0;
}

/**
 * Sort comparator for rows within a phase: by offset, then by the manual
 * sort order, then by title so the result is stable when both are equal.
 */
export function compareRows(
  a: { offsetDays: number | null; sortOrder: number; title: string },
  b: { offsetDays: number | null; sortOrder: number; title: string },
): number {
  const ao = a.offsetDays ?? Number.MAX_SAFE_INTEGER;
  const bo = b.offsetDays ?? Number.MAX_SAFE_INTEGER;
  if (ao !== bo) return ao - bo;
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  return a.title.localeCompare(b.title);
}
