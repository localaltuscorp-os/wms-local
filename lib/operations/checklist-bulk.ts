/**
 * CHECKLIST — BULK UPLOAD from Excel (account holder, 2026-09-18: "give an
 * option of bulk task upload", on a checklist and on a master).
 *
 * The sheet carries the table's own columns, one task per row. Pure and
 * client-safe: the upload dialog reads the sheet with this and shows every row
 * with its problems BEFORE anything is saved; only clean rows go to
 * `bulkCreateChecklistRows`, which validates them again on the server.
 *
 * ── TWO TARGETS ─────────────────────────────────────────────────────────
 *   · a CHECKLIST (run) — the WMS Tasks columns: Client, Subject, Task, Doer,
 *     Initiator, Target Date, Frequency. On an event checklist a row's day can
 *     be given as a Target Date or as a Day counted from the event (-3, 0, +1).
 *   · a MASTER — its own columns: Task, Subject, Day (event-linked only), Doer,
 *     Backup, Instructions, File link. A master has no dates, only days.
 *
 * ── DATES ARE DAY-FIRST ─────────────────────────────────────────────────
 * 05/09/2026 is the 5th of September, as the business writes it. A real Excel
 * date cell arrives as its serial number and is read exactly; it is never
 * passed through a Date in local time, which in India would read midnight as
 * the day before.
 */

import { addDays, daysBetween, formatDMY, formatOffset, OFFSET_MAX, OFFSET_MIN, parseOffset } from "./checklist-dates";
import { FREQUENCY_LABEL, ruleForFrequency, type Frequency } from "./checklist-frequency";

export const CHECKLIST_BULK_MAX = 500;

export type ChecklistBulkTarget = "run" | "master";

export type ChecklistBulkField =
  | "client"
  | "subject"
  | "task"
  | "doer"
  | "initiator"
  | "backup"
  | "date"
  | "day"
  | "frequency"
  | "instructions"
  | "fileLink";

export interface ChecklistBulkColumn {
  field: ChecklistBulkField;
  header: string;
  aliases: string[];
  hint: string;
}

const COLUMNS: Record<ChecklistBulkField, ChecklistBulkColumn> = {
  client: { field: "client", header: "Client", aliases: ["client name", "customer"], hint: "Optional — as in Admin Panel → Clients" },
  subject: { field: "subject", header: "Subject", aliases: ["category", "area", "type"], hint: "As in Admin Panel → Subjects" },
  task: {
    field: "task",
    header: "Task",
    aliases: ["activity", "checklist task", "task name", "title", "work", "description", "job"],
    hint: "Required",
  },
  doer: { field: "doer", header: "Doer", aliases: ["done by", "owner", "responsible", "assigned to", "assignee"], hint: "Employee name" },
  initiator: { field: "initiator", header: "Initiator", aliases: ["initiated by", "raised by", "requested by"], hint: "Employee name — blank is you" },
  backup: { field: "backup", header: "Backup", aliases: ["backup doer", "stand in", "deputy"], hint: "Employee name — not the doer" },
  date: { field: "date", header: "Target Date", aliases: ["date", "due date", "deadline", "target"], hint: "DD/MM/YYYY" },
  day: {
    field: "day",
    header: "Day",
    aliases: ["offset", "day offset", "days from event", "event day", "days"],
    hint: "From the event: -3 before, 0 on the day, +1 after",
  },
  frequency: {
    field: "frequency",
    header: "Frequency",
    aliases: ["repeat", "recurrence", "how often", "schedule"],
    hint: "One-time · Daily · Weekly · Monthly · Quarterly · Yearly",
  },
  instructions: { field: "instructions", header: "Instructions", aliases: ["instruction", "how to", "notes", "note"], hint: "Optional" },
  fileLink: { field: "fileLink", header: "File link", aliases: ["file", "link", "url", "sop link", "file url"], hint: "https://…" },
};

/** The columns a sheet for this table carries, in template order. */
export function checklistBulkColumns(target: ChecklistBulkTarget, isEvent: boolean): ChecklistBulkColumn[] {
  const fields: ChecklistBulkField[] =
    target === "run"
      ? ["client", "subject", "task", "doer", "initiator", "date", ...(isEvent ? (["day"] as const) : []), "frequency"]
      : ["task", "subject", ...(isEvent ? (["day"] as const) : []), "doer", "backup", "instructions", "fileLink"];
  return fields.map((f) => COLUMNS[f]);
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function mapHeader(cell: string, allowed: readonly ChecklistBulkColumn[]): ChecklistBulkField | null {
  const n = norm(cell);
  if (!n) return null;
  for (const c of allowed) {
    if (norm(c.header) === n || c.aliases.some((a) => norm(a) === n)) return c.field;
  }
  return null;
}

/* ── Cells ──────────────────────────────────────────────────────────────── */

const pad = (n: number) => String(n).padStart(2, "0");

function validYmd(y: number, m: number, d: number): string | null {
  if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null; // 31/02 is not a date
  return `${y}-${pad(m)}-${pad(d)}`;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/**
 * A Target Date cell → YYYY-MM-DD, or null when it cannot be read.
 * Excel serials, 2026-09-18, 18/09/2026, 18-09-2026, 18.09.2026, 18-Sep-2026,
 * 18 Sep 2026.
 */
export function parseSheetDate(v: unknown): string | null {
  if (typeof v === "number" && Number.isFinite(v)) {
    // Excel's day 1 is 1900-01-01, counted with its phantom 29 Feb 1900 —
    // hence the epoch of 1899-12-30. Whole days only: the time is not a date.
    if (v < 61 || v > 110000) return null;
    const dt = new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86_400_000);
    return dt.toISOString().slice(0, 10);
  }
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    // Read in local time: a Date built from a sheet is local midnight.
    return validYmd(v.getFullYear(), v.getMonth() + 1, v.getDate());
  }
  const t = String(v ?? "").trim().toLowerCase();
  if (!t) return null;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (m) return validYmd(+m[1]!, +m[2]!, +m[3]!);
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t);
  if (m) return validYmd(+m[3]!, +m[2]!, +m[1]!);
  m = /^(\d{1,2})[\s/.-]*([a-z]{3,9})[\s/.,-]*(\d{4})$/.exec(t);
  if (m) {
    const mi = MONTHS.indexOf(m[2]!.slice(0, 3));
    if (mi >= 0) return validYmd(+m[3]!, mi + 1, +m[1]!);
  }
  return null;
}

/** A Frequency cell → the WMS word. Blank is One-time. */
export function parseFrequencyWord(raw: string): Frequency | null {
  const t = norm(raw);
  if (!t || /^(once|one time|onetime|one off|does not repeat|no repeat|none|no)$/.test(t)) return "once";
  if (/^(daily|every day|everyday|each day)$/.test(t)) return "daily";
  if (/^(weekly|every week|each week)$/.test(t)) return "weekly";
  if (/^(monthly|every month|each month)$/.test(t)) return "monthly";
  if (/^(quarterly|every quarter|every 3 months|every three months)$/.test(t)) return "quarterly";
  if (/^(yearly|annually|annual|every year|each year)$/.test(t)) return "yearly";
  return null;
}

function cellText(v: unknown): string {
  if (typeof v === "number") return String(v);
  if (v instanceof Date && !Number.isNaN(v.getTime())) return parseSheetDate(v) ?? "";
  return String(v ?? "").trim();
}

/* ── Rows ───────────────────────────────────────────────────────────────── */

export interface ChecklistBulkContext {
  target: ChecklistBulkTarget;
  isEvent: boolean;
  /** An event checklist's event date — a Target Date is stored as days from it. */
  eventDate: string | null;
  /** The Day a row with none gets — the phase the upload was opened from. */
  defaultOffset: number | null;
  /** Today (YYYY-MM-DD). */
  today: string;
  people: ReadonlyArray<{ id: string; name: string }>;
  /** The WMS Tasks rosters — a match takes the roster's own spelling. */
  subjects: readonly string[];
  clients: readonly string[];
}

export interface ChecklistBulkRow {
  /** The sheet's row number, as Excel shows it. */
  line: number;
  title: string;
  client: string | null;
  category: string | null;
  doerId: string | null;
  doerName: string | null;
  initiatorId: string | null;
  initiatorName: string | null;
  backupId: string | null;
  backupName: string | null;
  /** A standing checklist's date. */
  targetDate: string | null;
  /** An event checklist's or a master's day from the event. */
  offsetDays: number | null;
  /** When it falls, in words — for the preview. */
  when: string;
  recurrenceRule: string | null;
  frequency: string;
  instructions: string | null;
  fileLink: string | null;
  /** A row with any error is not uploaded. */
  errors: string[];
  warnings: string[];
}

function relative(offset: number | null): string {
  if (offset === null) return "No day";
  if (offset === 0) return "Event day";
  const n = Math.abs(offset);
  return `${n} day${n === 1 ? "" : "s"} ${offset < 0 ? "before" : "after"} the event`;
}

/** A sheet (rows of cells, header row included) → checked rows. */
export function readChecklistMatrix(
  matrix: unknown[][],
  ctx: ChecklistBulkContext,
): { rows: ChecklistBulkRow[]; error?: string } {
  const columns = checklistBulkColumns(ctx.target, ctx.isEvent);
  const headerIdx = matrix.findIndex((r) => (r ?? []).some((c) => mapHeader(cellText(c), columns) === "task"));
  const map: (ChecklistBulkField | null)[] =
    headerIdx >= 0 ? (matrix[headerIdx] ?? []).map((c) => mapHeader(cellText(c), columns)) : columns.map((c) => c.field);

  const personByName = new Map<string, { id: string; name: string } | null>();
  for (const p of ctx.people) {
    const k = norm(p.name);
    personByName.set(k, personByName.has(k) ? null : p); // two people, one name: ambiguous
  }
  const subjectByName = new Map(ctx.subjects.map((s) => [norm(s), s]));
  const clientByName = new Map(ctx.clients.map((s) => [norm(s), s]));

  const rows: ChecklistBulkRow[] = [];
  const seen = new Set<string>();
  for (let r = headerIdx + 1; r < matrix.length; r++) {
    const cells = matrix[r] ?? [];
    if (cells.every((c) => cellText(c) === "")) continue;
    // The template's hint row — every filled cell "(in brackets)" — is not a task.
    const filled = cells.map(cellText).filter(Boolean);
    if (filled.every((c) => c.startsWith("(") && c.endsWith(")"))) continue;

    const raw = (f: ChecklistBulkField): unknown => {
      const i = map.indexOf(f);
      return i >= 0 ? cells[i] : "";
    };
    const at = (f: ChecklistBulkField) => cellText(raw(f));
    const errors: string[] = [];
    const warnings: string[] = [];

    const title = at("task").slice(0, 500);
    if (!title) errors.push("Task is empty");

    const person = (f: "doer" | "initiator" | "backup", label: string) => {
      const text = at(f);
      if (!text) return null;
      const p = personByName.get(norm(text));
      if (p === null) errors.push(`More than one employee is called "${text}"`);
      else if (!p) errors.push(`${label}: no employee called "${text}"`);
      return p ?? null;
    };
    const doer = person("doer", "Doer");
    const initiator = ctx.target === "run" ? person("initiator", "Initiator") : null;
    const backup = ctx.target === "master" ? person("backup", "Backup") : null;
    if (doer && backup && doer.id === backup.id) errors.push("The backup must be someone other than the doer");

    const rostered = (f: "subject" | "client", roster: Map<string, string>, where: string) => {
      const text = at(f).slice(0, f === "subject" ? 120 : 200);
      if (!text) return null;
      const known = roster.get(norm(text));
      if (known) return known;
      warnings.push(`${f === "subject" ? "Subject" : "Client"} "${text}" is not in ${where} — kept as typed`);
      return text;
    };
    const category = rostered("subject", subjectByName, "Admin Panel → Subjects");
    const client = ctx.target === "run" ? rostered("client", clientByName, "Admin Panel → Clients") : null;

    /* ── When it falls ── */
    let targetDate: string | null = null;
    let offsetDays: number | null = null;
    let anchor: string | null = null;
    const dayText = ctx.isEvent ? at("day") : "";
    const dateCell = ctx.target === "run" ? raw("date") : "";
    const dateText = cellText(dateCell);
    const date = dateText ? parseSheetDate(dateCell) : null;
    if (dateText && !date) errors.push(`Target Date "${dateText}" is not a date — use DD/MM/YYYY`);

    if (ctx.isEvent) {
      const dayN = dayText ? parseOffset(dayText) : null;
      if (dayText && dayN === null) errors.push(`Day "${dayText}" must be a whole number from ${OFFSET_MIN} to ${OFFSET_MAX}`);
      let fromDate: number | null = null;
      if (date) {
        fromDate = ctx.eventDate ? daysBetween(ctx.eventDate, date) : null;
        if (fromDate === null) errors.push("This checklist has no event date — give a Day instead of a Target Date");
        else if (fromDate < OFFSET_MIN || fromDate > OFFSET_MAX) {
          errors.push("Target Date must be within a year either side of the event");
          fromDate = null;
        }
      }
      if (dayN !== null && fromDate !== null && dayN !== fromDate) {
        errors.push(`Day ${formatOffset(dayN)} and Target Date ${formatDMY(date)} disagree — fill one`);
      }
      offsetDays = dayN ?? fromDate ?? (dayText || dateText ? null : ctx.defaultOffset);
      anchor = ctx.target === "run" && ctx.eventDate && offsetDays !== null ? addDays(ctx.eventDate, offsetDays) : null;
    } else if (ctx.target === "run") {
      targetDate = date;
      anchor = date;
    }

    /* ── How often ── */
    let recurrenceRule: string | null = null;
    let frequency = FREQUENCY_LABEL.once;
    if (ctx.target === "run") {
      const fText = at("frequency");
      const f = parseFrequencyWord(fText);
      if (!f) errors.push(`Frequency "${fText}" — use One-time, Daily, Weekly, Monthly, Quarterly or Yearly`);
      else if (f !== "once") {
        if (!anchor && !ctx.isEvent && errors.length === 0) {
          // A repeat needs a first day; a standing row given none starts today.
          targetDate = ctx.today;
          anchor = ctx.today;
          warnings.push("No Target Date — set to today so the repeat has a start");
        }
        if (anchor) {
          recurrenceRule = ruleForFrequency(f, anchor);
          frequency = FREQUENCY_LABEL[f];
        } else if (ctx.isEvent) {
          errors.push("A repeating task needs a Day or a Target Date");
        }
      }
    }

    const fileLink = ctx.target === "master" ? at("fileLink").slice(0, 2000) || null : null;
    if (fileLink && !/^https?:\/\//i.test(fileLink)) errors.push("File link must start with http:// or https://");

    const key = norm(title);
    if (title && seen.has(key)) warnings.push("Same task appears earlier in this sheet");
    seen.add(key);

    rows.push({
      line: r + 1,
      title,
      client,
      category,
      doerId: doer?.id ?? null,
      doerName: doer?.name ?? null,
      initiatorId: initiator?.id ?? null,
      initiatorName: initiator?.name ?? null,
      backupId: backup?.id ?? null,
      backupName: backup?.name ?? null,
      targetDate,
      offsetDays,
      when: ctx.isEvent
        ? `${relative(offsetDays)}${anchor ? ` · ${formatDMY(anchor)}` : ""}`
        : ctx.target === "run"
          ? targetDate
            ? formatDMY(targetDate)
            : "No date"
          : "—",
      recurrenceRule,
      frequency,
      instructions: ctx.target === "master" ? at("instructions").slice(0, 4000) || null : null,
      fileLink,
      errors,
      warnings,
    });
  }

  if (headerIdx < 0 && rows.length > 0 && rows.every((r) => r.errors.length > 0)) {
    return { rows, error: 'No "Task" heading found — use the template, or keep its column order.' };
  }
  if (rows.length > CHECKLIST_BULK_MAX) {
    return { rows: rows.slice(0, CHECKLIST_BULK_MAX), error: `Only the first ${CHECKLIST_BULK_MAX} rows can be uploaded at once.` };
  }
  return { rows };
}

/** A clean row → what `bulkCreateChecklistRows` takes (a single row's own fields). */
export function checklistBulkPayload(row: ChecklistBulkRow, target: ChecklistBulkTarget) {
  return target === "run"
    ? {
        title: row.title,
        client: row.client,
        category: row.category,
        doerId: row.doerId,
        initiatorId: row.initiatorId,
        offsetDays: row.offsetDays,
        targetDate: row.targetDate,
        recurrenceRule: row.recurrenceRule,
      }
    : {
        title: row.title,
        category: row.category,
        offsetDays: row.offsetDays,
        doerId: row.doerId,
        backupId: row.backupId,
        instructions: row.instructions,
        fileLink: row.fileLink,
      };
}

/** The downloadable template: headers, a hint row, and two examples. */
export function checklistTemplateMatrix(target: ChecklistBulkTarget, isEvent: boolean): string[][] {
  const columns = checklistBulkColumns(target, isEvent);
  const example: Record<ChecklistBulkField, [string, string]> = {
    client: ["", "Sarvottam"],
    subject: ["Opening", "Reporting"],
    task: ["Unlock the office and switch on the lights", "Send the weekly MIS to Manan Sir"],
    doer: ["Employee Name", "Employee Name"],
    initiator: ["", ""],
    backup: ["", ""],
    date: isEvent ? ["", ""] : ["18/09/2026", "19/09/2026"],
    day: ["-3", "0"],
    frequency: ["Daily", "Weekly"],
    instructions: ["Keys are with the security desk", ""],
    fileLink: ["", "https://drive.google.com/…"],
  };
  return [
    columns.map((c) => c.header),
    columns.map((c) => `(${c.hint})`),
    columns.map((c) => example[c.field][0]),
    columns.map((c) => example[c.field][1]),
  ];
}
