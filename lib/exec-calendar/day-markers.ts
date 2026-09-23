import { addDays, parseDay } from "./grid";

/**
 * DAY MARKERS (asked 2026-09-18) — "what this day is": Final exam, Exam week,
 * Diwali. They replace the old all-day strip as the way a day is labelled; an
 * all-day BLOCK still exists, and is drawn in the timeline like any other.
 *
 * Three ways to enter one, all stored the same way - as the expanded list of
 * dates (table exec_calendar_day_markers, migration 0237):
 *
 *   day    one date
 *   range  every date from a start to an end ("exam week")
 *   dates  hand-picked, irregular dates (18 Sep, 21 Sep, 4 Oct, 15 Oct)
 *
 * PURE: shared by the editor, the server action and every view.
 */

export type MarkerMode = "day" | "range" | "dates";

export interface DayMarker {
  id: string;
  label: string;
  mode: MarkerMode;
  /** Sorted, unique 'YYYY-MM-DD'. */
  dates: string[];
}

/** A marker covers at most a year of days. */
export const MARKER_MAX_DAYS = 366;
export const MARKER_MAX_LABEL = 120;

/** The markers' own colour: dark chips with white text, like the sheet's banners. */
export const MARKER_BG = "#1A1A1A";
export const MARKER_FG = "#FFFFFF";

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export function isYmd(v: string): boolean {
  return YMD.test(v) && !Number.isNaN(parseDay(v).getTime()) && parseDay(v).toISOString().slice(0, 10) === v;
}

/** Every day from `from` to `to`, inclusive, in either order, capped at a year. */
export function expandRange(from: string, to: string): string[] {
  const [a, b] = from <= to ? [from, to] : [to, from];
  const out: string[] = [];
  for (let d = a; d <= b && out.length < MARKER_MAX_DAYS; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Valid, unique, sorted. Duplicates are dropped rather than rejected. */
export function normaliseDates(dates: readonly string[]): string[] {
  return [...new Set(dates.filter(isYmd))].sort();
}

/** day → the markers on it, for the views. */
export function markersByDay(markers: readonly DayMarker[]): Map<string, DayMarker[]> {
  const out = new Map<string, DayMarker[]>();
  for (const m of markers) {
    for (const d of m.dates) {
      const list = out.get(d) ?? [];
      list.push(m);
      out.set(d, list);
    }
  }
  return out;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "18 Sep 2026" — the chip text. */
export function chipDate(ymd: string): string {
  const d = parseDay(ymd);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** One line describing what a marker covers, e.g. "18 Sep 2026 – 24 Sep 2026" or "4 days". */
export function markerSpan(m: Pick<DayMarker, "mode" | "dates">): string {
  if (m.dates.length === 0) return "";
  if (m.dates.length === 1) return chipDate(m.dates[0]!);
  if (m.mode === "range") return `${chipDate(m.dates[0]!)} – ${chipDate(m.dates.at(-1)!)}`;
  return `${m.dates.length} days`;
}
