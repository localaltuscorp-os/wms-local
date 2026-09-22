/**
 * JOB DESCRIPTION — BULK UPLOAD from Excel (account holder, 2026-09-15).
 *
 * "All tasks in one go as per columns": the sheet carries the JD Bank's own
 * columns, one task per row. Each row belongs to a POSITION (the Master JD) or
 * to a PERSON (their personal JD) — never both.
 *
 * Pure and client-safe. The upload dialog reads the sheet with this, shows every
 * row with its problems BEFORE anything is saved, and sends only clean rows to
 * `bulkCreateJdEntries`, which validates again on the server.
 */
import type { Recurrence, Weekday } from "./recurrence";
import { JD_FUNCTION_OPTIONS } from "./functions";

export const JD_BULK_MAX = 500;

export type JdBulkField =
  | "position"
  | "person"
  | "function"
  | "client"
  | "category"
  | "task"
  | "frequency"
  | "minutes"
  | "video"
  | "guidelines"
  | "template"
  | "notes"
  | "dcc"
  | "wms"
  | "event"
  | "assignTo";

export interface JdBulkColumn {
  field: JdBulkField;
  header: string;
  aliases: string[];
  hint: string;
}

/** Every column, in template order — the JD Bank's columns. */
export const JD_BULK_COLUMNS: JdBulkColumn[] = [
  { field: "position", header: "Position", aliases: ["seat", "role", "position title", "master jd", "general jd"], hint: "For a Master JD — the position's title" },
  { field: "person", header: "Person", aliases: ["employee", "specific person", "for person", "personal jd"], hint: "For a personal JD — the employee's name" },
  { field: "function", header: "Function", aliases: ["department", "dept", "department function"], hint: "Only needed for a personal JD" },
  { field: "client", header: "Client", aliases: ["client name", "customer"], hint: "Optional — as in Admin Panel → Clients" },
  /* "Subject" since 2026-09-18 — the WMS Tasks roster. A sheet made from the
     old template still says "Category", which reads the same column. */
  { field: "category", header: "Subject", aliases: ["category", "area", "type"], hint: "As in Admin Panel → Subjects" },
  { field: "task", header: "Task", aliases: ["job description", "jd", "description", "activity", "work", "task job description"], hint: "Required" },
  { field: "frequency", header: "Frequency", aliases: ["how often", "schedule", "repeat", "recurrence"], hint: "Daily · Weekly on Saturday · 2nd Saturday of month · Every 15 days" },
  { field: "minutes", header: "Time (mins)", aliases: ["time", "time estimated", "estimated time", "minutes", "mins", "duration"], hint: "Minutes, or 1h 30m" },
  { field: "video", header: "Video URL", aliases: ["video", "video link"], hint: "https://…" },
  { field: "guidelines", header: "Guidelines URL", aliases: ["guidelines", "guideline", "guidelines link", "rules"], hint: "https://…" },
  { field: "template", header: "Template URL", aliases: ["template", "templates", "template link"], hint: "https://…" },
  { field: "notes", header: "Notes", aliases: ["note", "context", "remarks"], hint: "Optional" },
  { field: "dcc", header: "Add to DCC", aliases: ["dcc"], hint: "Yes / No" },
  { field: "wms", header: "Add to WMS", aliases: ["wms"], hint: "Yes / No" },
  { field: "event", header: "Add to Event", aliases: ["event", "event checklist"], hint: "Yes / No" },
  { field: "assignTo", header: "Assign To", aliases: ["assigned to", "add to person", "assignees", "people"], hint: "Names, comma-separated" },
];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function mapHeader(cell: string): JdBulkField | null {
  const n = norm(cell);
  if (!n) return null;
  for (const c of JD_BULK_COLUMNS) {
    if (norm(c.header) === n || c.aliases.some((a) => norm(a) === n)) return c.field;
  }
  return null;
}

/* ── Frequency in plain words ───────────────────────────────────────────── */

const DAY_WORDS: Record<string, Weekday> = {
  mon: 0, monday: 0, tue: 1, tues: 1, tuesday: 1, wed: 2, wednesday: 2, thu: 3, thur: 3, thurs: 3, thursday: 3,
  fri: 4, friday: 4, sat: 5, saturday: 5, sun: 6, sunday: 6,
};
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const ORDINALS: Record<string, 1 | 2 | 3 | 4 | -1> = {
  first: 1, "1st": 1, second: 2, "2nd": 2, third: 3, "3rd": 3, fourth: 4, "4th": 4, last: -1,
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function monthIndex(word: string): number | null {
  const i = MONTHS.indexOf(word.slice(0, 3));
  return i >= 0 ? i + 1 : null;
}

/** "2026-10-01", "01/10/2026", "1 Oct 2026" → YYYY-MM-DD. */
function fullDate(t: string): string | null {
  let m = /(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  if (m) return `${m[1]}-${pad(+m[2]!)}-${pad(+m[3]!)}`;
  m = /(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/.exec(t);
  if (m) return `${m[3]}-${pad(+m[2]!)}-${pad(+m[1]!)}`;
  m = /(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3,9})\s+(\d{4})/.exec(t);
  if (m && monthIndex(m[2]!)) return `${m[3]}-${pad(monthIndex(m[2]!)!)}-${pad(+m[1]!)}`;
  return null;
}

/** "15 Aug", "Aug 15", "15/08" → month + day. */
function dayMonth(t: string): { month: number; day: number } | null {
  let m = /(\d{1,2})(?:st|nd|rd|th)?\s*(?:of\s+)?([a-z]{3,9})/.exec(t);
  if (m && monthIndex(m[2]!)) return { month: monthIndex(m[2]!)!, day: +m[1]! };
  m = /([a-z]{3,9})\s+(\d{1,2})/.exec(t);
  if (m && monthIndex(m[1]!)) return { month: monthIndex(m[1]!)!, day: +m[2]! };
  m = /(\d{1,2})[/.-](\d{1,2})(?![/.-]\d)/.exec(t);
  if (m) return { month: +m[2]!, day: +m[1]! };
  return null;
}

/**
 * A frequency typed in words → the structured recurrence the JD stores. Blank is
 * Daily. Anything not understood is kept as a Custom schedule with its words
 * (`understood: false`), so nothing typed is lost and the row says so.
 */
export function parseFrequencyText(raw: string, today: string): { recurrence: Recurrence; understood: boolean } {
  const t = raw.toLowerCase().replace(/\s+/g, " ").trim();
  if (!t || /^(daily|every ?day|each day|everyday)$/.test(t)) return { recurrence: { kind: "daily" }, understood: true };

  if (/week ?days?\b|mon(day)? ?(to|-|–|through) ?fri(day)?/.test(t)) {
    return { recurrence: { kind: "weekdays", days: [0, 1, 2, 3, 4] }, understood: true };
  }
  let m = /(?:once in|every|each)\s+(\d{1,3})\s+days?/.exec(t);
  if (m) return { recurrence: { kind: "interval", everyDays: Math.min(365, Math.max(1, +m[1]!)), anchor: today }, understood: true };
  if (/fortnight|every (2|two) weeks|bi-?weekly/.test(t)) {
    return { recurrence: { kind: "interval", everyDays: 14, anchor: today }, understood: true };
  }

  m = /\b(first|1st|second|2nd|third|3rd|fourth|4th|last)\s+([a-z]+)/.exec(t);
  if (m && DAY_WORDS[m[2]!] !== undefined && /month|monthly/.test(t)) {
    return { recurrence: { kind: "monthly_ordinal", ordinal: ORDINALS[m[1]!]!, weekday: DAY_WORDS[m[2]!]! }, understood: true };
  }

  if (/annual|yearly|every year|each year/.test(t)) {
    const dm = dayMonth(t);
    if (dm && dm.month >= 1 && dm.month <= 12 && dm.day >= 1 && dm.day <= 31) {
      return { recurrence: { kind: "yearly", month: dm.month, day: dm.day }, understood: true };
    }
  }

  const date = fullDate(t);
  if (date && (/once|one time|does not repeat|on\b/.test(t) || /^\S+$/.test(t))) {
    return { recurrence: { kind: "once", date }, understood: true };
  }

  const days = [...new Set(t.split(/[^a-z]+/).map((w) => DAY_WORDS[w]).filter((d): d is Weekday => d !== undefined))].sort();
  if (days.length > 0 && !/month/.test(t)) {
    return { recurrence: { kind: "weekdays", days }, understood: true };
  }

  return { recurrence: { kind: "custom", label: raw.trim().slice(0, 200) }, understood: false };
}

/* ── Cells ──────────────────────────────────────────────────────────────── */

function cellText(v: unknown): string {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  return String(v ?? "").trim();
}

/** "90", "1h 30m", "1.5 h", "30 min", "1:30" → minutes. Null when unreadable. */
export function parseMinutes(raw: string): number | null {
  const t = raw.toLowerCase().trim();
  if (!t) return null;
  let m = /^(\d+):(\d{1,2})$/.exec(t);
  if (m) return +m[1]! * 60 + +m[2]!;
  // Before the hours form, which would otherwise read "30 min" as 3 h + "0 min".
  m = /^(\d+)\s*(m|min|mins|minutes)$/.exec(t);
  if (m) return Number(m[1]);
  m = /^(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours)?\s*(?:(\d+)\s*(m|min|mins|minutes)?)?$/.exec(t);
  if (m) {
    const first = Number(m[1]);
    if (m[2]) return Math.round(first * 60 + (m[3] ? Number(m[3]) : 0));
    if (!m[3]) return Math.round(first);
  }
  return null;
}

export function parseYesNo(raw: string): boolean {
  return /^(y|yes|true|1|✓|✔|x|ok)$/i.test(raw.trim());
}

function functionFrom(raw: string): string | null {
  const n = norm(raw);
  if (!n) return null;
  for (const f of JD_FUNCTION_OPTIONS) {
    if (norm(f.key) === n || norm(f.label) === n || norm(f.label).split(" ")[0] === n) return f.key;
  }
  if (n === "it") return "apps";
  return null;
}

/* ── Rows ───────────────────────────────────────────────────────────────── */

export interface JdBulkContext {
  positions: ReadonlyArray<{ id: string; title: string; functionKey: string }>;
  people: ReadonlyArray<{ id: string; name: string }>;
  /** Uploading from one person's JD: rows with no Position or Person become theirs. */
  defaultPerson?: { id: string; name: string } | null;
  /** Today (YYYY-MM-DD) — the anchor for "every N days". */
  today: string;
}

export interface JdBulkRow {
  /** The sheet's row number, as Excel shows it. */
  line: number;
  task: string;
  positionId: string | null;
  ownerEmployeeId: string | null;
  /** "Operations · Executive" or "Personal · Neha Shah". */
  ownerLabel: string;
  functionKey: string | null;
  client: string | null;
  /** The Subject. */
  category: string | null;
  recurrence: Recurrence;
  estimatedMinutes: number;
  videoUrl: string | null;
  guidelinesUrl: string | null;
  templateUrl: string | null;
  notes: string | null;
  pushDcc: boolean;
  pushWms: boolean;
  pushEvent: boolean;
  assignIds: string[];
  assignNames: string[];
  /** A row with any error is not uploaded. */
  errors: string[];
  warnings: string[];
}

function urlOrError(raw: string, label: string, errors: string[]): string | null {
  if (!raw) return null;
  if (!/^https?:\/\//i.test(raw)) {
    errors.push(`${label} must start with http:// or https://`);
    return null;
  }
  return raw;
}

/** A sheet (rows of cells, header row included) → checked rows. */
export function readJdMatrix(matrix: unknown[][], ctx: JdBulkContext): { rows: JdBulkRow[]; error?: string } {
  const headerIdx = matrix.findIndex((r) => (r ?? []).some((c) => mapHeader(cellText(c)) === "task"));
  const map: (JdBulkField | null)[] =
    headerIdx >= 0 ? (matrix[headerIdx] ?? []).map((c) => mapHeader(cellText(c))) : JD_BULK_COLUMNS.map((c) => c.field);

  const positionByTitle = new Map(ctx.positions.map((p) => [norm(p.title), p]));
  const personByName = new Map<string, { id: string; name: string } | null>();
  for (const p of ctx.people) {
    const k = norm(p.name);
    personByName.set(k, personByName.has(k) ? null : p); // two people, one name: ambiguous
  }

  const rows: JdBulkRow[] = [];
  const seen = new Set<string>();
  for (let r = headerIdx + 1; r < matrix.length; r++) {
    const cells = matrix[r] ?? [];
    if (cells.every((c) => cellText(c) === "")) continue;
    // The template's hint row — every filled cell "(in brackets)" — is not a task.
    const filled = cells.map(cellText).filter(Boolean);
    if (filled.every((c) => c.startsWith("(") && c.endsWith(")"))) continue;
    const at = (f: JdBulkField) => {
      const i = map.indexOf(f);
      return i >= 0 ? cellText(cells[i]) : "";
    };
    const errors: string[] = [];
    const warnings: string[] = [];

    const task = at("task");
    if (!task) errors.push("Task is empty");

    // Owner: a position OR a person.
    let positionId: string | null = null;
    let ownerEmployeeId: string | null = null;
    let functionKey: string | null = null;
    let ownerLabel = "—";
    const positionText = at("position");
    const personText = at("person");
    if (positionText && personText) {
      errors.push("Fill Position or Person, not both");
    } else if (positionText) {
      const pos = positionByTitle.get(norm(positionText));
      if (pos) {
        positionId = pos.id;
        functionKey = pos.functionKey;
        ownerLabel = pos.title;
      } else {
        errors.push(`No position called "${positionText}"`);
      }
    } else {
      const person = personText ? personByName.get(norm(personText)) : ctx.defaultPerson ?? undefined;
      if (personText && person === null) errors.push(`More than one employee is called "${personText}"`);
      else if (personText && !person) errors.push(`No employee called "${personText}"`);
      else if (person) {
        ownerEmployeeId = person.id;
        ownerLabel = `Personal · ${person.name}`;
        const fnText = at("function");
        functionKey = functionFrom(fnText);
        if (!functionKey) errors.push(fnText ? `Unknown function "${fnText}"` : "Function is needed for a personal task");
      } else {
        errors.push("Fill Position (Master JD) or Person (personal JD)");
      }
    }

    const freqText = at("frequency");
    const { recurrence, understood } = parseFrequencyText(freqText, ctx.today);
    if (!understood) warnings.push(`Frequency "${freqText}" kept as a custom schedule`);

    const minutesText = at("minutes");
    let estimatedMinutes = 15;
    if (minutesText) {
      const n = parseMinutes(minutesText);
      if (n === null || n < 1 || n > 960) errors.push(`Time "${minutesText}" must be 1–960 minutes`);
      else estimatedMinutes = n;
    }

    const videoUrl = urlOrError(at("video"), "Video URL", errors);
    const guidelinesUrl = urlOrError(at("guidelines"), "Guidelines URL", errors);
    const templateUrl = urlOrError(at("template"), "Template URL", errors);

    const pushDcc = parseYesNo(at("dcc"));
    const pushWms = parseYesNo(at("wms"));
    const pushEvent = parseYesNo(at("event"));

    const assignIds: string[] = [];
    const assignNames: string[] = [];
    const assignText = at("assignTo");
    if (assignText) {
      for (const name of assignText.split(/[,;/]|\band\b/i).map((s) => s.trim()).filter(Boolean)) {
        const p = personByName.get(norm(name));
        if (p) {
          if (!assignIds.includes(p.id)) {
            assignIds.push(p.id);
            assignNames.push(p.name);
          }
        } else warnings.push(`Assign To: no single employee called "${name}"`);
      }
      if (assignIds.length > 0 && !pushDcc && !pushWms && !pushEvent) {
        warnings.push("Assign To only applies with Add to DCC, WMS or Event set to Yes");
      }
    }

    const category = at("category").slice(0, 120) || null;
    const client = at("client").slice(0, 200) || null;
    const key = `${norm(task)}|${positionId ?? ownerEmployeeId}`;
    if (task && seen.has(key)) warnings.push("Same task appears earlier in this sheet");
    seen.add(key);

    rows.push({
      line: r + 1,
      task: task.slice(0, 2000),
      positionId,
      ownerEmployeeId,
      ownerLabel,
      functionKey,
      client,
      category,
      recurrence,
      estimatedMinutes,
      videoUrl,
      guidelinesUrl,
      templateUrl,
      notes: at("notes") || null,
      pushDcc,
      pushWms,
      pushEvent,
      assignIds,
      assignNames,
      errors,
      warnings,
    });
  }

  if (headerIdx < 0 && rows.length > 0 && rows.every((r) => r.errors.length > 0)) {
    return { rows, error: 'No "Task" heading found — use the template, or keep its column order.' };
  }
  if (rows.length > JD_BULK_MAX) return { rows: rows.slice(0, JD_BULK_MAX), error: `Only the first ${JD_BULK_MAX} rows can be uploaded at once.` };
  return { rows };
}

/** A clean row → what `bulkCreateJdEntries` takes (the same shape as a single JD). */
export function jdBulkPayload(row: JdBulkRow) {
  return {
    ...(row.positionId ? { positionId: row.positionId } : {}),
    ...(row.ownerEmployeeId ? { ownerEmployeeId: row.ownerEmployeeId, functionKey: row.functionKey ?? undefined } : {}),
    task: row.task,
    category: row.category,
    client: row.client,
    notesHtml: row.notes,
    recurrence: row.recurrence,
    estimatedMinutes: row.estimatedMinutes,
    videoUrl: row.videoUrl ?? "",
    guidelinesUrl: row.guidelinesUrl ?? "",
    templateUrl: row.templateUrl ?? "",
    pushDcc: row.pushDcc,
    pushWms: row.pushWms,
    pushEvent: row.pushEvent,
    targetPeople: {
      dcc: row.pushDcc ? row.assignIds : [],
      wms: row.pushWms ? row.assignIds : [],
      event: row.pushEvent ? row.assignIds : [],
    },
  };
}

/** The downloadable template: headers, a hint row, and two examples. */
export function jdTemplateMatrix(personName?: string | null): string[][] {
  const header = JD_BULK_COLUMNS.map((c) => c.header);
  const hints = JD_BULK_COLUMNS.map((c) => `(${c.hint})`);
  const general = ["Operations · Executive", "", "", "", "Vendors", "Call vendors to confirm next day's deliveries", "Every weekday", "20", "", "", "", "", "Yes", "No", "No", ""];
  const personal = ["", personName ?? "Employee Name", "Operations", "", "Reporting", "Send the weekly MIS to Manan Sir", "Weekly on Saturday", "1h", "", "", "", "Before 6 pm", "No", "Yes", "No", ""];
  return [header, hints, general, personal];
}
