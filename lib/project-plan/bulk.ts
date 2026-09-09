/**
 * Project Plan — BULK UPLOAD: the reading and checking half.
 *
 * Turns a pasted block, a CSV or an .xlsx sheet into rows the server action
 * will accept, and says per row what is wrong with it. Deliberately separate
 * from the dialog that renders it, for the same reason `register.ts` is
 * separate from the register: the rule is worth a unit test, the table is not.
 *
 * WHAT A ROW MAY CARRY. The same six things the create dialog collects and no
 * more — Name, Owner, Target Date, Start, End, Description. Not because more
 * would be hard, but because a bulk upload is for STRUCTURE: fifty actions
 * under a result, named and dated and pointed at a person. Priority, client,
 * tags, links and attachments are per-row judgements someone makes with the row
 * in front of them, and a spreadsheet column of them is a column nobody fills.
 *
 * ONLY THE NAME IS REQUIRED. An Action with an owner and a target date becomes
 * a real WMS task on import (`syncNodeTask`, exactly as the single-row path
 * does); one without them stays a plan row reading "Not scheduled" until
 * somebody fills them in. That is the module's existing lazy rule, so bulk
 * upload does not need — and must not invent — a second one.
 *
 * Client-SAFE: the dialog parses in the browser so the preview is instant and
 * nothing unreadable ever reaches the server.
 */

import { hasSchedule, KIND_LABEL, type PlanKind } from "./levels";

/**
 * The most rows one import may carry.
 *
 * A guard, not a target: the dialog refuses to preview more than this, and the
 * server action refuses to accept more, so a pasted ten-thousand-line sheet
 * fails at the paste box with a sentence rather than at the database with a
 * timeout. Lives here rather than beside the server action because a
 * "use server" file may only export async functions — and because the dialog
 * needs the same number to say no first.
 */
export const MAX_BULK_ROWS = 300;

// ── Columns ─────────────────────────────────────────────────────────────────

export type BulkField = "name" | "owner" | "targetDate" | "startsAt" | "endsAt" | "description";

export interface BulkColumn {
  field: BulkField;
  /** The template's header, and the label on the preview table. */
  header: string;
  /** Everything else a real spreadsheet calls it, normalised. */
  aliases: string[];
  /** One line of help under the template header. */
  hint: string;
}

/**
 * Every column, in template order. `columnsFor` narrows this per level — a
 * Project has no Start / End of its own (see SCHEDULED_KINDS: a container is
 * dated by the work underneath it), so offering the columns would invite
 * numbers the plan then refuses to store.
 */
export const BULK_COLUMNS: BulkColumn[] = [
  { field: "name", header: "Name", aliases: ["title", "item", "task", "activity", "description of work"], hint: "Required" },
  { field: "owner", header: "Owner", aliases: ["doer", "assignee", "assigned to", "responsible", "owner name"], hint: "Match a person by name or email" },
  { field: "targetDate", header: "Target Date", aliases: ["due", "due date", "target", "deadline", "end date target"], hint: "DD-MMM-YYYY or YYYY-MM-DD" },
  { field: "startsAt", header: "Start Date", aliases: ["start", "starts", "from", "planned start"], hint: "Optional" },
  { field: "endsAt", header: "End Date", aliases: ["end", "ends", "to", "finish", "planned end"], hint: "Optional" },
  { field: "description", header: "Description", aliases: ["details", "notes", "remarks", "scope"], hint: "Optional" },
];

/** The columns this level actually has somewhere to put. */
export function columnsFor(kind: PlanKind): BulkColumn[] {
  return hasSchedule(kind)
    ? BULK_COLUMNS
    : BULK_COLUMNS.filter((c) => c.field !== "startsAt" && c.field !== "endsAt");
}

/** Lower-cased, punctuation- and space-free — "Target Date" and "target_date". */
export function normKey(raw: string): string {
  return String(raw ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** A header cell → the field it feeds, or null when it is a column we ignore. */
export function mapHeader(raw: string, kind: PlanKind): BulkField | null {
  const k = normKey(raw);
  if (!k) return null;
  for (const col of columnsFor(kind)) {
    if (normKey(col.header) === k) return col.field;
    if (col.aliases.some((a) => normKey(a) === k)) return col.field;
  }
  return null;
}

/**
 * The header row's index.
 *
 * Scanned rather than assumed, because a filled-in template usually has a title
 * and a blank line above the grid, and people paste from halfway down a sheet.
 * Two recognised columns is the bar: one is a coincidence ("Name" is a common
 * first cell), two is a header.
 */
export function findHeaderRow(matrix: unknown[][], kind: PlanKind): number {
  for (let r = 0; r < Math.min(matrix.length, 10); r++) {
    const hits = (matrix[r] ?? []).filter((c) => mapHeader(String(c ?? ""), kind)).length;
    if (hits >= 2) return r;
  }
  // A single recognised cell still beats guessing row 0 blindly.
  for (let r = 0; r < Math.min(matrix.length, 10); r++) {
    if ((matrix[r] ?? []).some((c) => mapHeader(String(c ?? ""), kind))) return r;
  }
  return -1;
}

// ── Cell readers ────────────────────────────────────────────────────────────

function text(raw: unknown, max: number): string {
  if (raw instanceof Date) return "";
  const s = String(raw ?? "").trim();
  return s ? s.slice(0, max) : "";
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

const pad = (n: number) => String(n).padStart(2, "0");

/** A local Date → "YYYY-MM-DD". Local, never `toISOString` — that shifts the day. */
function ymd(y: number, m: number, d: number): string {
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** Is this a real calendar day? Rejects 31-Feb rather than rolling it forward. */
function validDay(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > 2200) return false;
  const probe = new Date(y, m - 1, d);
  return probe.getFullYear() === y && probe.getMonth() === m - 1 && probe.getDate() === d;
}

export interface CellDate {
  /** "YYYY-MM-DD", or null for a blank cell. */
  date: string | null;
  /** "HH:MM" when the cell carried one — Start / End keep it, Target drops it. */
  time: string | null;
  ok: boolean;
}

const BLANK: CellDate = { date: null, time: null, ok: true };

/**
 * Read a date cell in every shape a real sheet produces.
 *
 *   a JS Date         xlsx with `cellDates` — already the right day, locally
 *   a number          an unconverted Excel serial (45000 = 2023-03-15)
 *   "2026-06-12"      ISO, the template's own format
 *   "12-Jun-2026"     what the plan PRINTS, so what people paste back in
 *   "12/06/2026"      DAY FIRST — this is an Indian office, and 12/06 here
 *                     means 12 June. A US sheet is the exception, and the one
 *                     that has to be typed as ISO.
 *
 * Anything else fails the row rather than guessing: a date silently read as the
 * wrong day is a task that quietly comes due in the wrong month.
 */
export function parseDateCell(raw: unknown): CellDate {
  if (raw == null || raw === "") return BLANK;

  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) return { date: null, time: null, ok: false };
    const time = raw.getHours() || raw.getMinutes() ? `${pad(raw.getHours())}:${pad(raw.getMinutes())}` : null;
    return { date: ymd(raw.getFullYear(), raw.getMonth() + 1, raw.getDate()), time, ok: true };
  }

  // An Excel serial. Day 1 is 1900-01-01 and the sheet believes in a 29 Feb
  // 1900 that never happened, which is the 25569 / -2 dance below.
  if (typeof raw === "number" && Number.isFinite(raw)) {
    if (raw < 1 || raw > 100_000) return { date: null, time: null, ok: false };
    const days = Math.floor(raw);
    const ms = Math.round((raw - days) * 86_400_000);
    const utc = new Date(Date.UTC(1970, 0, 1) + (days - 25569) * 86_400_000);
    const mins = Math.round(ms / 60_000);
    return {
      date: ymd(utc.getUTCFullYear(), utc.getUTCMonth() + 1, utc.getUTCDate()),
      time: mins > 0 ? `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}` : null,
      ok: true,
    };
  }

  const s = String(raw).trim();
  if (!s) return BLANK;

  // Split a trailing time off before looking at the date half.
  const withTime = /^(.*?)[\s,]+(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?$/i.exec(s);
  let body = s;
  let time: string | null = null;
  if (withTime) {
    body = withTime[1]!.trim();
    let h = Number(withTime[2]);
    const mi = Number(withTime[3]);
    const mer = withTime[4]?.toLowerCase();
    if (mer === "pm" && h < 12) h += 12;
    if (mer === "am" && h === 12) h = 0;
    if (h > 23 || mi > 59) return { date: null, time: null, ok: false };
    time = `${pad(h)}:${pad(mi)}`;
  }

  // ISO — 2026-06-12.
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(body);
  if (iso) {
    const [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
    return validDay(y, m, d) ? { date: ymd(y, m, d), time, ok: true } : { date: null, time: null, ok: false };
  }

  // 12-Jun-2026 / 12 June 26 — the format the plan itself prints.
  const named = /^(\d{1,2})[-/\s]([a-z]{3,9})[-/\s](\d{2,4})$/i.exec(body);
  if (named) {
    const m = MONTHS[named[2]!.slice(0, 4).toLowerCase()] ?? MONTHS[named[2]!.slice(0, 3).toLowerCase()];
    const d = Number(named[1]);
    const y = expandYear(Number(named[3]));
    if (m && validDay(y, m, d)) return { date: ymd(y, m, d), time, ok: true };
    return { date: null, time: null, ok: false };
  }

  // 12/06/2026 — DAY first. See the note above.
  const numeric = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/.exec(body);
  if (numeric) {
    const d = Number(numeric[1]);
    const m = Number(numeric[2]);
    const y = expandYear(Number(numeric[3]));
    if (validDay(y, m, d)) return { date: ymd(y, m, d), time, ok: true };
    return { date: null, time: null, ok: false };
  }

  return { date: null, time: null, ok: false };
}

/** 26 → 2026, 99 → 1999, 2026 → 2026. */
function expandYear(y: number): number {
  if (y >= 1000) return y;
  return y <= 79 ? 2000 + y : 1900 + y;
}

/** "YYYY-MM-DD" + "HH:MM" → a LOCAL instant's ISO string, for the plan's timestamps. */
export function toInstant(date: string, time: string | null): string | null {
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return null;
  const [h, mi] = (time ?? "00:00").split(":").map(Number);
  const dt = new Date(y, m - 1, d, h || 0, mi || 0, 0, 0);
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
}

// ── Owner matching ──────────────────────────────────────────────────────────

export interface BulkPerson {
  id: string;
  name: string;
  email?: string | null;
}

/**
 * A typed name → one person, or null.
 *
 * Exact (normalised) name first, then email, then a unique prefix — "Manan"
 * finds Manan Vasa when he is the only Manan. AMBIGUITY NEVER GUESSES: two
 * Mananas leave the cell empty and the row says so, because the wrong doer on
 * forty imported actions is forty notifications to the wrong person.
 */
export function matchPerson(raw: string, roster: BulkPerson[]): { id: string; name: string } | null | "ambiguous" {
  const q = normKey(raw);
  if (!q) return null;

  const byName = roster.filter((p) => normKey(p.name) === q);
  if (byName.length === 1) return { id: byName[0]!.id, name: byName[0]!.name };
  if (byName.length > 1) return "ambiguous";

  const byEmail = roster.filter((p) => p.email && normKey(p.email) === q);
  if (byEmail.length === 1) return { id: byEmail[0]!.id, name: byEmail[0]!.name };

  const byPrefix = roster.filter((p) => normKey(p.name).startsWith(q));
  if (byPrefix.length === 1) return { id: byPrefix[0]!.id, name: byPrefix[0]!.name };
  if (byPrefix.length > 1) return "ambiguous";

  return null;
}

// ── Rows ────────────────────────────────────────────────────────────────────

export interface BulkRow {
  /** Stable across edits and re-evaluation — React keys and toggles hang off it. */
  key: number;
  /** 1-based row in the source, so an error can name the line it came from. */
  sourceRow: number;
  name: string;
  ownerId: string | null;
  ownerName: string;
  /** "YYYY-MM-DD" or "" */
  targetDate: string;
  startDate: string;
  startTime: string | null;
  endDate: string;
  endTime: string | null;
  description: string;
  /** Blocking problems — a row with any of these cannot be imported. */
  errors: string[];
  /** Worth saying, not worth blocking — an unmatched owner, mostly. */
  warnings: string[];
  /** Duplicate of a row already under this parent, or of an earlier row here. */
  duplicate: "existing" | "file" | null;
  /** Ticked for import. Off by default for anything broken or duplicated. */
  include: boolean;
}

export function emptyRow(key: number): BulkRow {
  return {
    key,
    sourceRow: key,
    name: "",
    ownerId: null,
    ownerName: "",
    targetDate: "",
    startDate: "",
    startTime: null,
    endDate: "",
    endTime: null,
    description: "",
    errors: [],
    warnings: [],
    duplicate: null,
    include: true,
  };
}

/**
 * Re-check the whole set — after a parse, and after every inline edit.
 *
 * WHOLE SET, not one row, because two of the three checks are about the set:
 * "this name is repeated" only means anything in the company of the rows around
 * it, and editing a name has to be able to CLEAR the duplicate flag on the row
 * that was clashing with it.
 *
 * `include` is recomputed only for rows that became invalid; a clean row keeps
 * whatever the user ticked. Otherwise typing in one name box would silently
 * re-tick forty rows somebody had just untucked.
 */
export function evaluateRows(rows: BulkRow[], kind: PlanKind, existingNames: string[]): BulkRow[] {
  const existing = new Set(existingNames.map(normKey));
  const seen = new Set<string>();
  const scheduled = hasSchedule(kind);

  return rows.map((r) => {
    const errors: string[] = [];
    const warnings: string[] = [];

    const name = r.name.trim();
    if (!name) errors.push("Name is required");
    else if (name.length > 160) errors.push("Name is over 160 characters");

    if (scheduled && r.startDate && r.endDate && r.endDate < r.startDate) {
      errors.push("End is before Start");
    }

    if (r.ownerName.trim() && !r.ownerId) {
      warnings.push(`No match for "${r.ownerName.trim()}"`);
    }
    // The lazy-task rule, said out loud rather than left as a surprise: these
    // two fields are what turn an executable row into a real WMS task.
    if (isTaskLevel(kind) && (!r.ownerId || !r.targetDate)) {
      warnings.push("No task yet — needs an owner and a target date");
    }

    const key = normKey(name);
    let duplicate: BulkRow["duplicate"] = null;
    if (key) {
      if (existing.has(key)) duplicate = "existing";
      else if (seen.has(key)) duplicate = "file";
      seen.add(key);
    }

    // A row that just BECAME broken or duplicated is untucked; one that was
    // already flagged keeps whatever the user decided about it, so ticking a
    // duplicate on purpose survives the next keystroke somewhere else.
    let include = r.include;
    if (errors.length > 0) include = false;
    else if (duplicate && duplicate !== r.duplicate) include = false;

    return { ...r, errors, warnings, duplicate, include };
  });
}

/** The three levels that become tasks — kept local so this file imports one thing. */
function isTaskLevel(kind: PlanKind): boolean {
  return kind === "action" || kind === "sub_action" || kind === "sub_sub_action";
}

export interface ParseResult {
  rows: BulkRow[];
  /** How many of the sheet's columns were recognised — 0 means "wrong file". */
  mappedColumns: number;
  /** Set when nothing usable came back, phrased for the dialog to show as-is. */
  error: string | null;
}

/**
 * A grid of cells → rows, for one level.
 *
 * Handles a headerless paste too: someone copying a column of names out of a
 * document has given us exactly what we need, and demanding they add a header
 * row first would be pedantry. One recognised header ⇒ read the headers; none
 * at all ⇒ treat the columns as the template's own order.
 */
export function parseMatrix(
  matrix: unknown[][],
  kind: PlanKind,
  roster: BulkPerson[],
  existingNames: string[],
): ParseResult {
  const cols = columnsFor(kind);
  const headerIdx = findHeaderRow(matrix, kind);
  const headerRow = headerIdx >= 0 ? matrix[headerIdx] ?? [] : [];
  const map: (BulkField | null)[] =
    headerIdx >= 0
      ? headerRow.map((c) => mapHeader(String(c ?? ""), kind))
      : cols.map((c) => c.field); // positional fallback — template order

  const mappedColumns = headerIdx >= 0 ? map.filter(Boolean).length : 0;
  if (headerIdx >= 0 && !map.includes("name")) {
    return {
      rows: [],
      mappedColumns,
      error: `No Name column found. The first column should be headed "Name" — the ${KIND_LABEL[kind].toLowerCase()}'s name.`,
    };
  }

  const rows: BulkRow[] = [];
  let key = 0;

  for (let r = headerIdx + 1; r < matrix.length; r++) {
    const cells = matrix[r] ?? [];
    if (cells.every((c) => String(c ?? "").trim() === "")) continue;

    const at = (f: BulkField): unknown => {
      const i = map.indexOf(f);
      return i === -1 ? "" : cells[i];
    };

    const row = emptyRow(++key);
    row.sourceRow = r + 1;
    row.name = text(at("name"), 160);
    row.description = text(at("description"), 20_000);

    const ownerRaw = text(at("owner"), 200);
    row.ownerName = ownerRaw;
    if (ownerRaw) {
      const hit = matchPerson(ownerRaw, roster);
      if (hit && hit !== "ambiguous") {
        row.ownerId = hit.id;
        row.ownerName = hit.name;
      }
    }

    const target = parseDateCell(at("targetDate"));
    if (!target.ok) row.errors.push("Target Date isn't a date");
    row.targetDate = target.date ?? "";

    if (hasSchedule(kind)) {
      const s = parseDateCell(at("startsAt"));
      const e = parseDateCell(at("endsAt"));
      if (!s.ok) row.errors.push("Start Date isn't a date");
      if (!e.ok) row.errors.push("End Date isn't a date");
      row.startDate = s.date ?? "";
      row.startTime = s.time;
      row.endDate = e.date ?? "";
      row.endTime = e.time;
    }

    rows.push(row);
  }

  if (rows.length === 0) {
    return {
      rows: [],
      mappedColumns,
      error: `No ${KIND_LABEL[kind].toLowerCase()} rows found — the file has headers but nothing under them.`,
    };
  }

  // Parse errors already on a row survive `evaluateRows`, which appends to them.
  const parseErrors = new Map(rows.map((r) => [r.key, r.errors] as const));
  const evaluated = evaluateRows(
    rows.map((r) => ({ ...r, errors: [] })),
    kind,
    existingNames,
  ).map((r) => ({ ...r, errors: [...(parseErrors.get(r.key) ?? []), ...r.errors] }));

  return {
    rows: evaluated.map((r) => (r.errors.length ? { ...r, include: false } : r)),
    mappedColumns,
    error: null,
  };
}

/**
 * A pasted block → the same rows.
 *
 * Tab-separated first (what a copy out of Excel or Sheets actually is), commas
 * only when no line has a tab — so a description containing a comma survives a
 * paste from a spreadsheet, which is the overwhelmingly common case.
 */
export function parseText(
  text_: string,
  kind: PlanKind,
  roster: BulkPerson[],
  existingNames: string[],
): ParseResult {
  const lines = text_.replace(/\r\n?/g, "\n").split("\n").filter((l) => l.trim() !== "");
  if (lines.length === 0) {
    return { rows: [], mappedColumns: 0, error: "Nothing to read — paste or type at least one row." };
  }
  const tabbed = lines.some((l) => l.includes("\t"));
  const matrix = lines.map((l) => (tabbed ? l.split("\t") : splitCsvLine(l)).map((c) => c.trim()));
  return parseMatrix(matrix, kind, roster, existingNames);
}

/** RFC-4180 enough: honours quotes and doubled quotes inside them. */
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else quoted = false;
      } else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

/** The rows the server should be sent — ticked, and with nothing broken on them. */
export function importable(rows: BulkRow[]): BulkRow[] {
  return rows.filter((r) => r.include && r.errors.length === 0);
}

/** One preview row → the server action's payload shape. */
export function toPayload(row: BulkRow, kind: PlanKind): {
  name: string;
  ownerId: string | null;
  targetDate: string | null;
  startsAt: string | null;
  endsAt: string | null;
  description: string | null;
} {
  const scheduled = hasSchedule(kind);
  return {
    name: row.name.trim(),
    ownerId: row.ownerId,
    targetDate: row.targetDate || null,
    startsAt: scheduled && row.startDate ? toInstant(row.startDate, row.startTime) : null,
    endsAt: scheduled && row.endDate ? toInstant(row.endDate, row.endTime) : null,
    description: row.description.trim() || null,
  };
}
