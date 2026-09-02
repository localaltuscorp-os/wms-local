// NOTE: pure xlsx parsing (no DB / secrets) — intentionally NOT `server-only`
// so a one-off seed script (plain tsx) can reuse the exact same parser.
import * as XLSX from "xlsx";

// Hard cap so a giant sheet can't blow up the request / DB.
export const MAX_IMPORT_ROWS = 1000;

/** One parsed Accounts Task row, already date-coerced to YYYY-MM-DD | null. */
export interface ParsedTask {
  srNo: number | null;
  area: string | null;
  taskDescription: string; // required — rows without it are skipped
  status: string | null;
  links: string | null;
  targetDate: string | null; // YYYY-MM-DD
  actualDate: string | null; // YYYY-MM-DD
  gear: string | null;
  notes: string | null;
}

/** One parsed "Screenshots to Post" row. */
export interface ParsedShot {
  srNo: number | null;
  projectName: string; // required — rows without it are skipped
  projectDetails: string | null;
  frequency: string | null;
  targetDate: string | null; // YYYY-MM-DD
  actualDate: string | null; // YYYY-MM-DD
  gear: string | null;
  notes: string | null;
}

export interface ParsedWorkbook {
  tasks: ParsedTask[];
  shots: ParsedShot[];
}

// ── Cell helpers ──────────────────────────────────────────────────────────────

const norm = (s: unknown): string =>
  String(s ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");

function cellText(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return String(value ?? "").trim();
}

function optText(value: unknown): string | null {
  const s = cellText(value);
  return s ? s.slice(0, 4000) : null;
}

function coerceSrNo(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : parseInt(String(value), 10);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

/**
 * Coerce a cell to YYYY-MM-DD or null. Tolerant of:
 *  - real Date objects (XLSX cellDates:true)
 *  - Excel serial numbers (e.g. 45901) — days since the 1900 epoch
 *  - ISO yyyy-mm-dd and dd/mm/yyyy strings (IST day, no TZ drift)
 *  - anything else Date.parse can handle
 * Never throws — a bad cell becomes null.
 */
export function coerceAccountsDate(value: unknown): string | null {
  try {
    if (value === null || value === undefined || value === "") return null;

    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return ymd(value.getFullYear(), value.getMonth() + 1, value.getDate());
    }

    // Excel serial number → JS Date. 25569 = days between 1899-12-30 and epoch.
    if (typeof value === "number" && Number.isFinite(value)) {
      // Plausible serial range (~1900..2100); avoid treating e.g. "5" as a date.
      if (value > 1 && value < 100000) {
        const d = new Date(Math.round((value - 25569) * 86400 * 1000));
        if (!Number.isNaN(d.getTime())) {
          // Read back in UTC — the serial→ms math is UTC-anchored.
          return ymd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
        }
      }
      return null;
    }

    const s = String(value).trim();
    if (!s) return null;

    // A numeric string that's actually an Excel serial.
    if (/^\d+(\.\d+)?$/.test(s)) {
      const n = Number(s);
      if (n > 1 && n < 100000) return coerceAccountsDate(n);
    }

    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); // ISO yyyy-mm-dd
    if (m) return clamp(+m[1]!, +m[2]!, +m[3]!);

    m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/); // dd/mm/yyyy (IST)
    if (m) {
      let yr = +m[3]!;
      if (yr < 100) yr += 2000;
      return clamp(yr, +m[2]!, +m[1]!);
    }

    const t = Date.parse(s);
    if (!Number.isNaN(t)) {
      const d = new Date(t);
      return ymd(d.getFullYear(), d.getMonth() + 1, d.getDate());
    }
  } catch {
    /* fall through */
  }
  return null;
}

function ymd(y: number, mo: number, d: number): string {
  return `${String(y).padStart(4, "0")}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function clamp(y: number, mo: number, d: number): string | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return ymd(y, mo, d);
}

// ── Header detection ──────────────────────────────────────────────────────────

/** Find which column index in a header row matches any of the given aliases. */
function findCol(headerRow: unknown[], aliases: string[]): number {
  const set = new Set(aliases.map(norm));
  for (let i = 0; i < headerRow.length; i++) {
    if (set.has(norm(headerRow[i]))) return i;
  }
  return -1;
}

/** True if any cell in the row matches any alias. */
function rowHas(row: unknown[], aliases: string[]): boolean {
  return findCol(row, aliases) !== -1;
}

const TASK_ALIASES = {
  srNo: ["srno", "sr no", "sr. no.", "s. no.", "s no", "serial", "#"],
  area: ["area"],
  taskDescription: [
    "thing to do",
    "thing to do (write in as much detail as you can)",
    "task description",
    "task",
    "description",
    "work",
    "details",
  ],
  status: ["status"],
  links: ["links", "link"],
  targetDate: ["target date", "targetdate", "target"],
  actualDate: ["actual date", "actualdate", "actual"],
  gear: ["gear"],
  notes: ["notes", "note", "remarks", "comment"],
} as const;

const SHOT_ALIASES = {
  srNo: ["srno", "sr no", "sr. no.", "s. no.", "s no", "serial", "#"],
  projectName: ["project name", "projectname", "project"],
  projectDetails: ["project details", "projectdetails", "details", "description"],
  frequency: ["frequency", "freq"],
  targetDate: ["target date", "targetdate", "target"],
  actualDate: ["actual date", "actualdate", "actual"],
  gear: ["gear"],
  notes: ["notes", "note", "remarks", "comment"],
} as const;

const SR_ALIASES = ["srno", "sr no", "sr. no.", "s. no.", "s no", "serial"];
const SECTION_TASK_TITLES = ["open task list", "task list", "accounts task list"];
const SECTION_SHOT_TITLES = ["screenshots to post", "screenshots", "screenshot"];

/** A row is a task-list HEADER if it has a Sr-No-ish cell AND a description-ish cell AND a Status cell. */
function isTaskHeader(row: unknown[]): boolean {
  return (
    rowHas(row, [...SR_ALIASES]) &&
    rowHas(row, [...TASK_ALIASES.taskDescription]) &&
    rowHas(row, [...TASK_ALIASES.status])
  );
}

/** A row is a screenshots HEADER if it has a Sr-No-ish cell AND a Project-Name-ish cell. */
function isShotHeader(row: unknown[]): boolean {
  return rowHas(row, [...SR_ALIASES]) && rowHas(row, [...SHOT_ALIASES.projectName]);
}

/** True if a section-title row (e.g. "Open Task List") appears — used as a break. */
function isSectionTitle(row: unknown[], titles: string[]): boolean {
  const set = new Set(titles.map(norm));
  return row.some((c) => set.has(norm(c)));
}

/** True if a data row is fully blank. */
function isBlankRow(row: unknown[]): boolean {
  return row.every((c) => cellText(c) === "");
}

// ── Workbook parsing ──────────────────────────────────────────────────────────

/**
 * Parse an Accounts task workbook (the real "accounts task list.xlsx" OR the
 * clean template) into structured tasks + screenshots. Tolerant of the messy
 * real file: a small Screenshots block near the top, a section title, then the
 * Open Task List header + rows. Columns are mapped by header name so it works
 * for both files. Never throws on a bad cell.
 *
 * Exported for reuse by import-actions AND a seed script.
 */
export function parseAccountsTaskWorkbook(buf: Buffer | ArrayBuffer): ParsedWorkbook {
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buf, { type: "buffer", cellDates: true });
  } catch {
    return { tasks: [], shots: [] };
  }

  const tasks: ParsedTask[] = [];
  const shots: ParsedShot[] = [];

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    // 2-D array of rows; raw:true keeps serial numbers as numbers, dates as Date.
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
      header: 1,
      defval: "",
      blankrows: true,
      raw: true,
    });

    parseSheetRows(rows, tasks, shots);
  }

  // Cap the combined output so an enormous file can't blow up the insert.
  return {
    tasks: tasks.slice(0, MAX_IMPORT_ROWS),
    shots: shots.slice(0, MAX_IMPORT_ROWS),
  };
}

function parseSheetRows(
  rows: unknown[][],
  tasks: ParsedTask[],
  shots: ParsedShot[],
): void {
  let i = 0;
  while (i < rows.length) {
    const row = rows[i] ?? [];

    if (isShotHeader(row)) {
      i = parseShotBlock(rows, i, shots);
      continue;
    }
    if (isTaskHeader(row)) {
      i = parseTaskBlock(rows, i, tasks);
      continue;
    }
    i++;
  }
}

/** Parse the task block starting at the header row `start`. Returns the next unprocessed index. */
function parseTaskBlock(rows: unknown[][], start: number, out: ParsedTask[]): number {
  const header = rows[start] ?? [];
  const col = {
    srNo: findCol(header, [...TASK_ALIASES.srNo]),
    area: findCol(header, [...TASK_ALIASES.area]),
    taskDescription: findCol(header, [...TASK_ALIASES.taskDescription]),
    status: findCol(header, [...TASK_ALIASES.status]),
    links: findCol(header, [...TASK_ALIASES.links]),
    targetDate: findCol(header, [...TASK_ALIASES.targetDate]),
    actualDate: findCol(header, [...TASK_ALIASES.actualDate]),
    gear: findCol(header, [...TASK_ALIASES.gear]),
    notes: findCol(header, [...TASK_ALIASES.notes]),
  };
  const at = (row: unknown[], idx: number): unknown => (idx >= 0 ? row[idx] : undefined);

  let i = start + 1;
  let blankRun = 0;
  for (; i < rows.length; i++) {
    const row = rows[i] ?? [];
    // Section break — a new known header or a section title row ends the block.
    if (isShotHeader(row) || isTaskHeader(row)) break;
    if (isSectionTitle(row, SECTION_SHOT_TITLES)) break;
    if (isBlankRow(row)) {
      // Tolerate a single stray blank line, but two in a row ends the block.
      blankRun++;
      if (blankRun >= 2) {
        i++;
        break;
      }
      continue;
    }
    blankRun = 0;
    // Ignore a lone section-title line for the task block itself.
    if (isSectionTitle(row, SECTION_TASK_TITLES) && cellText(at(row, col.taskDescription)) === "")
      continue;

    const taskDescription = cellText(at(row, col.taskDescription));
    if (!taskDescription) continue; // skip rows with no task description

    out.push({
      srNo: coerceSrNo(at(row, col.srNo)),
      area: optText(at(row, col.area)),
      taskDescription: taskDescription.slice(0, 4000),
      status: optText(at(row, col.status)),
      links: optText(at(row, col.links)),
      targetDate: coerceAccountsDate(at(row, col.targetDate)),
      actualDate: coerceAccountsDate(at(row, col.actualDate)),
      gear: optText(at(row, col.gear)),
      notes: optText(at(row, col.notes)),
    });
  }
  return i;
}

/** Parse the screenshots block starting at the header row `start`. Returns next unprocessed index. */
function parseShotBlock(rows: unknown[][], start: number, out: ParsedShot[]): number {
  const header = rows[start] ?? [];
  const col = {
    srNo: findCol(header, [...SHOT_ALIASES.srNo]),
    projectName: findCol(header, [...SHOT_ALIASES.projectName]),
    projectDetails: findCol(header, [...SHOT_ALIASES.projectDetails]),
    frequency: findCol(header, [...SHOT_ALIASES.frequency]),
    targetDate: findCol(header, [...SHOT_ALIASES.targetDate]),
    actualDate: findCol(header, [...SHOT_ALIASES.actualDate]),
    gear: findCol(header, [...SHOT_ALIASES.gear]),
    notes: findCol(header, [...SHOT_ALIASES.notes]),
  };
  const at = (row: unknown[], idx: number): unknown => (idx >= 0 ? row[idx] : undefined);

  let i = start + 1;
  let blankRun = 0;
  for (; i < rows.length; i++) {
    const row = rows[i] ?? [];
    if (isShotHeader(row) || isTaskHeader(row)) break;
    if (isSectionTitle(row, SECTION_TASK_TITLES)) break;
    if (isBlankRow(row)) {
      blankRun++;
      if (blankRun >= 2) {
        i++;
        break;
      }
      continue;
    }
    blankRun = 0;
    if (isSectionTitle(row, SECTION_SHOT_TITLES) && cellText(at(row, col.projectName)) === "")
      continue;

    const projectName = cellText(at(row, col.projectName));
    if (!projectName) continue; // skip rows with no project name

    out.push({
      srNo: coerceSrNo(at(row, col.srNo)),
      projectName: projectName.slice(0, 4000),
      projectDetails: optText(at(row, col.projectDetails)),
      frequency: optText(at(row, col.frequency)),
      targetDate: coerceAccountsDate(at(row, col.targetDate)),
      actualDate: coerceAccountsDate(at(row, col.actualDate)),
      gear: optText(at(row, col.gear)),
      notes: optText(at(row, col.notes)),
    });
  }
  return i;
}
