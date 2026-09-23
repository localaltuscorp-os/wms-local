/**
 * EXECUTIVE MASTER CALENDAR — the time-grid engine (spec §2A, §4C).
 *
 * WHAT CHANGED FROM THE OLD MODULE, AND WHY IT MATTERS. The Monthly Events
 * Master hard-coded a full 24-hour grid (00:00→24:00, 48 rows) so that "every
 * hour is reachable by scrolling". For an executive master schedule that is the
 * wrong default twice over: two thirds of the rows are always empty, and the
 * density the brief asks for — a Google-Sheets-style planner where a quarter
 * fits on a screen — is impossible when 16 of 24 hours are dead space. Since
 * 2026-09-18 the calendar shows 06:30–23:00 for everyone (DEFAULT_GRID); the
 * per-person window picker was removed at the owner's request.
 *
 * Everything here takes the window as an argument instead of importing a
 * constant, which is what makes it configurable at all: a page can render the
 * default day, a print sheet can render 07:00–22:00 hourly, and a "full day"
 * toggle can widen to 24h, with one set of functions and no branching.
 *
 * DATES ARE PLAIN 'YYYY-MM-DD' STRINGS, deliberately. The rest of this codebase
 * learned the hard way that a Date crossing IST/UTC lands on the wrong day; the
 * calendar compares and sorts day strings, and only converts to Date for
 * weekday maths, always via UTC so the conversion cannot drift.
 *
 * PURE: no database, no React, no clock unless you pass one in.
 */

/* ── The window ──────────────────────────────────────────────────────────── */

export interface GridConfig {
  /** Minutes from midnight where the grid starts. Default 07:00. */
  startMin: number;
  /** Minutes from midnight where the grid ends. Default 22:00. */
  endMin: number;
  /** Row height in minutes: 60 for hourly, 30 for half-hourly (§2A). */
  slotMin: 30 | 60;
}

/** The calendar's window: 06:30 → 23:00 in half-hour rows (fixed, 2026-09-18). */
export const DEFAULT_GRID: GridConfig = { startMin: 6 * 60 + 30, endMin: 23 * 60, slotMin: 30 };

/** The escape hatch for a day with a 06:00 flight or a midnight deploy. */
export const FULL_DAY_GRID: GridConfig = { startMin: 0, endMin: 24 * 60, slotMin: 30 };

export function slotCount(cfg: GridConfig): number {
  return Math.max(0, Math.ceil((cfg.endMin - cfg.startMin) / cfg.slotMin));
}

/** Every row boundary in the window, as minutes from midnight. */
export function slotMinutes(cfg: GridConfig): number[] {
  const out: number[] = [];
  for (let m = cfg.startMin; m < cfg.endMin; m += cfg.slotMin) out.push(m);
  return out;
}

export function clampToWindow(min: number, cfg: GridConfig): number {
  return Math.max(cfg.startMin, Math.min(cfg.endMin, min));
}

export function snapToSlot(min: number, cfg: GridConfig): number {
  return Math.round(min / cfg.slotMin) * cfg.slotMin;
}

/** Pixel offset from the top of the grid, for a minutes-from-midnight value. */
export function minToTop(min: number, cfg: GridConfig, slotHeight: number): number {
  return ((clampToWindow(min, cfg) - cfg.startMin) / cfg.slotMin) * slotHeight;
}

/** The inverse — a drag position back to a snapped minute. */
export function topToMin(top: number, cfg: GridConfig, slotHeight: number): number {
  const raw = cfg.startMin + (top / slotHeight) * cfg.slotMin;
  return clampToWindow(snapToSlot(raw, cfg), cfg);
}

export function gridHeight(cfg: GridConfig, slotHeight: number): number {
  return slotCount(cfg) * slotHeight;
}

/** 930 → "3:30 PM". The sheet reads in 12-hour time, so the app does too. */
export function minToLabel(min: number): string {
  const m = ((min % 1440) + 1440) % 1440;
  const h24 = Math.floor(m / 60);
  const mm = m % 60;
  const ampm = h24 < 12 ? "AM" : "PM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(mm).padStart(2, "0")} ${ampm}`;
}

/** "3:30 PM – 8:00 PM", the start/end indicator a merged block carries (§4C). */
export function rangeLabel(startMin: number, endMin: number): string {
  return `${minToLabel(startMin)} – ${minToLabel(endMin)}`;
}

/** 330 → "5h 30m". Durations read as hours in the analytics panel. */
export function durationLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/* ── Days and ISO weeks ──────────────────────────────────────────────────── */

/** Parse 'YYYY-MM-DD' as a UTC date — never local, so no timezone drift. */
export function parseDay(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
}

export function formatDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(ymd: string, n: number): string {
  const d = parseDay(ymd);
  d.setUTCDate(d.getUTCDate() + n);
  return formatDay(d);
}

/** 0 = Monday … 6 = Sunday. The sheet's week starts on Monday (§2A). */
export function weekdayIndex(ymd: string): number {
  return (parseDay(ymd).getUTCDay() + 6) % 7;
}

/** The Monday of the week containing `ymd`. */
export function weekStart(ymd: string): string {
  return addDays(ymd, -weekdayIndex(ymd));
}

/** Monday → Sunday, as day strings. */
export function weekDays(mondayYmd: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(mondayYmd, i));
}

/**
 * ISO-8601 week number (§2A: "Week No 11", "Week No 12").
 *
 * The rule that catches people out: the week belongs to the year containing its
 * THURSDAY, so 1 January can be week 52 of the previous year and 31 December
 * can be week 1 of the next. Computed rather than approximated, because the
 * master sheet numbers every row and an off-by-one at the year boundary makes
 * two rows disagree about which week they are.
 */
export function isoWeek(ymd: string): { week: number; year: number } {
  const d = parseDay(ymd);
  // Move to the Thursday of this week.
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) + 3);
  const isoYear = d.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  firstThursday.setUTCDate(firstThursday.getUTCDate() - ((firstThursday.getUTCDay() + 6) % 7) + 3);
  const week = 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 86400000));
  return { week, year: isoYear };
}

/** "Week No 38" — the label down the left of the sheet. */
export function isoWeekLabel(ymd: string): string {
  return `Week No ${isoWeek(ymd).week}`;
}

/* ── Months, for the dual-month view ─────────────────────────────────────── */

/** The 1st of the month containing `ymd`. */
export function monthStart(ymd: string): string {
  return `${ymd.slice(0, 7)}-01`;
}

export function addMonths(ymd: string, n: number): string {
  const d = parseDay(monthStart(ymd));
  d.setUTCMonth(d.getUTCMonth() + n);
  return formatDay(d);
}

export function daysInMonth(ymd: string): string[] {
  const first = monthStart(ymd);
  const d = parseDay(first);
  const month = d.getUTCMonth();
  const out: string[] = [];
  for (let cur = first; parseDay(cur).getUTCMonth() === month; cur = addDays(cur, 1)) out.push(cur);
  return out;
}

/**
 * A month laid out as whole Monday→Sunday weeks, each carrying its ISO number —
 * the shape the dual-month "signature sheet" view draws, and the reason that
 * view can put two months side by side without their rows disagreeing.
 * Leading/trailing days from the neighbouring months are included so every row
 * has seven cells; `inMonth` says which are real.
 */
export interface MonthWeek {
  week: number;
  label: string;
  days: { ymd: string; inMonth: boolean }[];
}

export function monthWeeks(ymd: string, padTo = 0): MonthWeek[] {
  const first = monthStart(ymd);
  const month = parseDay(first).getUTCMonth();
  const last = daysInMonth(first).at(-1)!;
  const out: MonthWeek[] = [];
  // `padTo` adds trailing weeks (all outside the month) until there are that
  // many rows. The year view passes 6 so every month is the same height — a
  // month spans 4, 5 or 6 weeks, and twelve differently-sized boxes in a grid
  // looked ragged (2026-09-18).
  let lastMonday = weekStart(last);
  const minRows = Math.max(0, padTo);
  const natural = Math.round(
    (parseDay(lastMonday).getTime() - parseDay(weekStart(first)).getTime()) / (7 * 86400000),
  ) + 1;
  if (natural < minRows) lastMonday = addDays(lastMonday, 7 * (minRows - natural));
  for (let monday = weekStart(first); monday <= lastMonday; monday = addDays(monday, 7)) {
    const { week } = isoWeek(monday);
    out.push({
      week,
      label: `Week No ${week}`,
      days: weekDays(monday).map((d) => ({ ymd: d, inMonth: parseDay(d).getUTCMonth() === month })),
    });
  }
  return out;
}

/* ── Blocks: overlap layout for multi-hour spans (§4C) ───────────────────── */

export interface GridBlockInput {
  id: string;
  day: string;
  startMin: number;
  endMin: number;
}

export interface PositionedBlock<T extends GridBlockInput> {
  event: T;
  top: number;
  height: number;
  /** 0-based column the block starts in, and how many columns its cluster has. */
  column: number;
  columns: number;
  /** How many columns it spans from `column` (it widens into free ones). */
  span: number;
  /** Cascade level: 0 = its own column, 1+ = nested on an earlier block, drawn indented and on top. */
  depth: number;
  /** Paint order within the day - later-starting blocks sit on top. */
  z: number;
  /** Set when the block lies wholly outside the window and is pinned to its edge. */
  pinned?: "before" | "after";
}

/**
 * Two blocks starting less than this far apart sit SIDE BY SIDE; a block that
 * starts later than this into another one is NESTED on it instead - Google
 * Calendar's rule, and what keeps a long block readable when a short meeting
 * lands in its middle.
 */
export const SIDE_BY_SIDE_MIN = 30;

/** Shortest drawn span, so a pinned or 5-minute block is still clickable. */
const MIN_DRAWN_MIN = 15;

/**
 * Lay a day's events out the way Google Calendar does (asked 2026-09-18).
 *
 *   · Events that start within SIDE_BY_SIDE_MIN of an overlapping event get a
 *     column each, side by side.
 *   · An event that starts later than that into one already running is NESTED
 *     on the latest-starting of them: same column, one level deeper (the
 *     renderer indents it) and drawn on top, so the long block underneath
 *     stays visible and wide instead of being squeezed into a sliver.
 *   · Every block then widens to the right through the columns of its cluster
 *     until it meets one it must sit beside - a block that started at the same
 *     time or earlier. Blocks that start later overlay it, so they don't stop it.
 *
 * A continuous 15:00–20:00 block is still ONE block five hours tall (§4C).
 * An all-day block is passed in by the caller as the whole window and joins
 * the same cascade, so later blocks nest on top of it like Google's full-day
 * blocks. Blocks wholly outside the window are pinned to the nearest edge
 * rather than dropped, so a 05:00 alarm never silently vanishes.
 */
export function layoutDay<T extends GridBlockInput>(
  events: T[],
  cfg: GridConfig,
  slotHeight: number,
): PositionedBlock<T>[] {
  // `rs`/`re` are the REAL times and decide the cascade; `start`/`end` are what
  // is drawn (clamped to the window). Deciding on clamped times would make a
  // 04:00 and a 06:00 block both "start at 06:30" and sit side by side.
  type Item = { e: T; rs: number; re: number; start: number; end: number; pinned?: "before" | "after"; order: number };
  const items: Item[] = [];
  events.forEach((e, order) => {
    if (!(e.endMin > e.startMin)) return; // zero-length or reversed: nothing to draw
    let start = clampToWindow(e.startMin, cfg);
    let end = clampToWindow(e.endMin, cfg);
    let pinned: Item["pinned"];
    if (e.endMin <= cfg.startMin) {
      pinned = "before";
      start = cfg.startMin;
      end = cfg.startMin + MIN_DRAWN_MIN;
    } else if (e.startMin >= cfg.endMin) {
      pinned = "after";
      start = cfg.endMin - MIN_DRAWN_MIN;
      end = cfg.endMin;
    }
    // A pinned block has no real place in the window; it cascades where drawn.
    const rs = pinned ? start : e.startMin;
    const re = pinned ? end : e.endMin;
    items.push({ e, rs, re, start, end, pinned, order });
  });
  // Start first; on a tie the LONGER block first, so it takes the left and the
  // shorter one nests or sits beside it; then arrival order (the query makes
  // that creation order), so adding a block never reshuffles existing ones.
  items.sort((a, b) => a.rs - b.rs || b.re - a.re || a.order - b.order);

  type Placed = Item & { col: number; depth: number };
  const out: PositionedBlock<T>[] = [];
  let cluster: Placed[] = [];
  let clusterEnd = -Infinity;
  let z = 0;

  const flush = () => {
    if (!cluster.length) return;
    const columns = Math.max(...cluster.map((p) => p.col)) + 1;
    for (const p of cluster) {
      // Widen right until a column holds a block this one must sit beside.
      let span = 1;
      for (let c = p.col + 1; c < columns; c++) {
        const blocked = cluster.some(
          (q) => q !== p && q.col === c && q.rs < p.re && q.re > p.rs && q.rs - p.rs < SIDE_BY_SIDE_MIN,
        );
        if (blocked) break;
        span++;
      }
      const top = minToTop(p.start, cfg, slotHeight);
      out.push({
        event: p.e,
        top,
        height: Math.max(slotHeight / 2, minToTop(p.end, cfg, slotHeight) - top),
        column: p.col,
        columns,
        span,
        depth: p.depth,
        z: z++,
        ...(p.pinned ? { pinned: p.pinned } : {}),
      });
    }
    cluster = [];
  };

  for (const it of items) {
    if (it.rs >= clusterEnd) {
      flush();
      clusterEnd = -Infinity;
    }
    const running = cluster.filter((p) => p.re > it.rs);
    let col = 0;
    let depth = 0;
    if (running.length) {
      const near = running.filter((p) => it.rs - p.rs < SIDE_BY_SIDE_MIN);
      if (near.length === 0) {
        // Starts well into what's running: nest on the latest-started of them.
        const parent = running.reduce((a, b) => (b.rs > a.rs || (b.rs === a.rs && b.depth > a.depth) ? b : a));
        col = parent.col;
        depth = parent.depth + 1;
      } else {
        // Starts with something: take the first column nothing running is in.
        const taken = new Set(running.map((p) => p.col));
        while (taken.has(col)) col++;
      }
    }
    cluster.push({ ...it, col, depth });
    clusterEnd = Math.max(clusterEnd, it.re);
  }
  flush();
  return out;
}

/**
 * Which days a routine stamps (§4B).
 *
 * Pulled out of the server action so the rule is testable without a database:
 * the action was a loop over dates with the weekday filter inline, which is
 * exactly the kind of arithmetic that is wrong at a month boundary and that
 * nobody notices until a quarter is stamped one day short.
 *
 * `daysOfWeek` is 0=Mon … 6=Sun. EMPTY MEANS EVERY DAY, matching the column
 * default — "no days picked" reads as "no restriction", not "no days", because
 * a routine that silently stamps nothing is worse than one that stamps too much.
 */
export function routineDays(fromDay: string, toDay: string, daysOfWeek: number[]): string[] {
  if (toDay < fromDay) return [];
  const out: string[] = [];
  for (let d = fromDay; d <= toDay; d = addDays(d, 1)) {
    if (daysOfWeek.length === 0 || daysOfWeek.includes(weekdayIndex(d))) out.push(d);
  }
  return out;
}
