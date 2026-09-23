/**
 * WCC — MINS (account holder, 2026-09-19): "Insert Mins — I want to see total
 * Compliance Mins also of all Dailys + all Mondays + all Tuesdays etc."
 *
 * How many minutes a compliance takes each time it is due. It belongs to the
 * compliance (dcc_kpi_items.minutes, migration 0242) — set in the pop-up, the
 * Excel template or the Mins cell — so every day it is due carries the same
 * figure, and the checklist adds them up: each group (all the Dailys of a day,
 * all the Mondays…) and the whole view.
 *
 * PURE and client-safe.
 */

/** A whole day — no one compliance takes longer. */
export const MAX_MINUTES = 1440;

export const MINUTES_WORDS = `Mins is a whole number of minutes, 1 to ${MAX_MINUTES} — or leave it blank.`;

export type MinutesCheck = { ok: true; value: number | null } | { ok: false; error: string };

const inRange = (n: number): MinutesCheck =>
  Number.isInteger(n) && n >= 1 && n <= MAX_MINUTES ? { ok: true, value: n } : { ok: false, error: MINUTES_WORDS };

const MIN = "(?:m|min|mins|minute|minutes)";
const HOUR = "(?:h|hr|hrs|hour|hours)";

/**
 * What was typed, or read from a sheet → minutes, or blank (null).
 *   15 · "15" · "15 mins" · "15m" · "1 h" · "1.5 hours" · "1h 30m" · "1:30"
 * and an Excel time — 0:30 arrives as 0.0208…, the fraction of a day.
 */
export function parseMinutes(raw: unknown): MinutesCheck {
  if (raw === null || raw === undefined) return { ok: true, value: null };
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return { ok: false, error: MINUTES_WORDS };
    // A time typed into Excel is a fraction of a day.
    if (raw > 0 && raw < 1) return inRange(Math.round(raw * 1440));
    return inRange(raw);
  }
  const t = String(raw).trim().toLowerCase().replace(/\s+/g, " ");
  if (!t) return { ok: true, value: null };
  let m: RegExpExecArray | null;
  if ((m = /^(\d+)(?:\.0+)?$/.exec(t))) return inRange(+m[1]!);
  if ((m = new RegExp(`^(\\d+) ?${MIN}$`).exec(t))) return inRange(+m[1]!);
  if ((m = new RegExp(`^(\\d+(?:\\.\\d+)?) ?${HOUR}$`).exec(t))) return inRange(Math.round(+m[1]! * 60));
  if ((m = new RegExp(`^(\\d+) ?${HOUR},? ?(\\d+) ?${MIN}?$`).exec(t))) return inRange(+m[1]! * 60 + +m[2]!);
  if ((m = /^(\d{1,2}):([0-5]\d)$/.exec(t))) return inRange(+m[1]! * 60 + +m[2]!);
  return { ok: false, error: MINUTES_WORDS };
}

/** "45 m", "1 h 30 m", "3 h". */
export function hoursText(n: number): string {
  const h = Math.floor(n / 60);
  const m = n % 60;
  if (h === 0) return `${m} m`;
  return m ? `${h} h ${m} m` : `${h} h`;
}

/** "1 min", "45 mins", "90 mins (1 h 30 m)". */
export function minutesText(n: number): string {
  const words = `${n} min${n === 1 ? "" : "s"}`;
  return n >= 60 ? `${words} (${hoursText(n)})` : words;
}

export interface MinutesTotal {
  /** The rows' Mins added up. */
  total: number;
  /** How many rows have Mins, and how many do not yet. */
  timed: number;
  untimed: number;
}

export function totalMinutes(rows: readonly { minutes: number | null }[]): MinutesTotal {
  let total = 0;
  let timed = 0;
  for (const r of rows) {
    if (r.minutes === null) continue;
    total += r.minutes;
    timed += 1;
  }
  return { total, timed, untimed: rows.length - timed };
}
