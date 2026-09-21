/**
 * EXECUTIVE MASTER CALENDAR — importing the sheet.
 *
 * Ten years of the master schedule live in a spreadsheet, and nobody is going
 * to retype them. This parses what you get when you SELECT A BLOCK OF THAT
 * SHEET AND COPY IT: tab-separated rows, a time label down the first column,
 * dates across the top, and a title in each cell.
 *
 * ── THE ONE THING THAT MAKES IT WORK ──────────────────────────────────────
 * In the sheet a long block is not one cell — it is the SAME TEXT REPEATED
 * down every row it covers. "Manan Sir Break" appears in fifteen consecutive
 * 07:00→21:00 cells because that is how a spreadsheet draws a block. So the
 * parser collapses runs of identical text in the same column into ONE event
 * spanning from the first row's time to the end of the last, which is what the
 * human reading the sheet sees. Without that, importing one week produces
 * hundreds of one-hour fragments.
 *
 * Categories come from `guessCategory`, which is why it was written; anything
 * it cannot place is returned with `categoryKey: null` for the user to set
 * rather than being dropped or silently filed as Operations.
 *
 * PURE: no database, no clock. The caller supplies the year, because the sheet
 * writes "1 Jul" and a bare day-month is ambiguous without one.
 */

import { guessCategory, type ExecCategoryKey } from "./taxonomy";

export interface ImportedBlock {
  day: string;
  startMin: number;
  endMin: number;
  title: string;
  categoryKey: ExecCategoryKey | null;
}

export interface ImportResult {
  blocks: ImportedBlock[];
  /** Human-readable notes: columns skipped, times not understood, and why. */
  warnings: string[];
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/**
 * "7:00 AM", "07:00", "4:30 pm", "16:30" → minutes from midnight.
 * Returns null for anything else, including the sheet's own "Week No 11".
 */
export function parseClock(raw: string): number | null {
  const t = raw.trim().toLowerCase().replace(/\./g, "");
  const m = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/.exec(t);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  const ampm = m[3];
  if (h > 23 || min > 59) return null;
  if (ampm === "pm" && h < 12) h += 12;
  if (ampm === "am" && h === 12) h = 0;
  // A bare "7" with no am/pm in a 07:00–22:00 planner means 7am, not 7pm; the
  // sheet always carries AM/PM, so this only covers a hand-typed column.
  return h * 60 + min;
}

/**
 * "1 Jul", "14 Sep 2026", "2026-09-14", "14/09/2026" → 'YYYY-MM-DD'.
 * `fallbackYear` fills in the year the sheet leaves out.
 */
export function parseSheetDate(raw: string, fallbackYear: number): string | null {
  const t = raw.trim();
  if (!t) return null;

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (iso) return t;

  const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(t);
  if (dmy) return `${dmy[3]}-${dmy[2]!.padStart(2, "0")}-${dmy[1]!.padStart(2, "0")}`;

  // "1 Jul", "1 Jul 2026", "Jul 1"
  const words = t.toLowerCase().replace(/,/g, " ").split(/\s+/).filter(Boolean);
  let day: number | null = null;
  let month: number | null = null;
  let year: number | null = null;
  for (const w of words) {
    const asNum = Number(w);
    if (Number.isInteger(asNum)) {
      if (w.length === 4) year = asNum;
      else if (day === null) day = asNum;
      continue;
    }
    const mo = MONTHS[w.slice(0, 3)];
    if (mo) month = mo;
  }
  if (day === null || month === null) return null;
  if (day < 1 || day > 31) return null;
  const y = year ?? fallbackYear;
  return `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Split a pasted block into a grid of cells, tab-separated as Sheets copies. */
function toGrid(text: string): string[][] {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => line.split("\t").map((c) => c.trim()));
}

/**
 * Parse a copied block of the master sheet.
 *
 * `slotMin` is how long one ROW of the sheet represents — 60 in the master
 * sheet, whose rows are hourly. It is what turns "the last row this block
 * covers" into an end time, and getting it wrong is the difference between a
 * 5-hour cohort and a 5-row one.
 */
export function parseSheetPaste(
  text: string,
  opts: { year: number; slotMin?: number },
): ImportResult {
  const slotMin = opts.slotMin ?? 60;
  const grid = toGrid(text);
  const warnings: string[] = [];
  if (grid.length < 2) return { blocks: [], warnings: ["Nothing that looks like a grid — paste the time column and at least one day."] };

  // The header is the first row that yields two or more parseable dates. Rows
  // above it (the sheet's month title, "Week No 11") are skipped rather than
  // treated as data.
  let headerIdx = -1;
  let dates: (string | null)[] = [];
  for (let i = 0; i < Math.min(grid.length, 6); i++) {
    const row = grid[i]!;
    const parsed = row.map((c, idx) => (idx === 0 ? null : parseSheetDate(c, opts.year)));
    if (parsed.filter(Boolean).length >= 2) {
      headerIdx = i;
      dates = parsed;
      break;
    }
  }
  if (headerIdx === -1) {
    return { blocks: [], warnings: ["No date row found. The first row should hold the dates, e.g. `1 Jul`, `2 Jul`."] };
  }

  const body = grid.slice(headerIdx + 1);
  const times = body.map((r) => parseClock(r[0] ?? ""));
  if (times.filter((t) => t !== null).length === 0) {
    return { blocks: [], warnings: ["No time column found. The first column should hold times, e.g. `7:00 AM`."] };
  }

  const blocks: ImportedBlock[] = [];
  const columns = Math.max(...body.map((r) => r.length), dates.length);

  for (let col = 1; col < columns; col++) {
    const day = dates[col];
    if (!day) {
      if (body.some((r) => (r[col] ?? "").length > 0)) {
        warnings.push(`Column ${col + 1} has entries but no date in the header — skipped.`);
      }
      continue;
    }

    // Walk down the column, collapsing runs of identical text (see the header
    // comment: that is how the sheet draws a multi-hour block).
    let runStart = -1;
    let runText = "";
    const flush = (endRow: number) => {
      if (runStart === -1 || !runText) return;
      const startMin = times[runStart];
      if (startMin === null || startMin === undefined) return;
      // The block ends one row-length after the LAST row it occupies, so a
      // single row is one slot long rather than zero.
      const lastStart = times[endRow] ?? startMin;
      blocks.push({
        day,
        startMin,
        endMin: Math.min(1440, lastStart + slotMin),
        title: runText,
        categoryKey: guessCategory(runText),
      });
    };

    for (let row = 0; row < body.length; row++) {
      const cell = (body[row]![col] ?? "").trim();
      if (cell === runText) continue;
      flush(row - 1);
      runStart = cell ? row : -1;
      runText = cell;
    }
    flush(body.length - 1);
  }

  const unplaced = blocks.filter((b) => b.categoryKey === null).length;
  if (unplaced > 0) {
    warnings.push(`${unplaced} block${unplaced === 1 ? "" : "s"} could not be categorised — set them before importing.`);
  }

  blocks.sort((a, b) => a.day.localeCompare(b.day) || a.startMin - b.startMin);
  return { blocks, warnings };
}
