import "server-only";
import * as XLSX from "xlsx";
import { TASK_PRIORITIES, PRIORITY_LABELS, type TaskPriority } from "@/db/enums";

// Hard cap so a giant sheet can't blow up the request / DB.
export const MAX_IMPORT_ROWS = 500;

export interface RosterEntry {
  id: string;
  name: string;
  email: string | null;
}

export interface ImportPreviewRow {
  /** 1-based data row (spreadsheet row minus the header). */
  rowNumber: number;
  client: string;
  subject: string;
  doerName: string;
  doerId: string | null;
  initiatorName: string;
  initiatorId: string | null;
  priority: TaskPriority;
  priorityLabel: string;
  dueAt: string | null; // ISO (noon UTC) once parsed
  dueRaw: string;
  description: string;
  notes: string | null;
  tags: string[];
  errors: string[];
  ok: boolean;
}

export interface ImportPreview {
  rows: ImportPreviewRow[];
  totalRows: number;
  validCount: number;
  errorCount: number;
  /** Set when the file can't be read / has no rows / is missing columns. */
  fatal?: string;
}

const REQUIRED_FIELDS = [
  "client",
  "subject",
  "doer",
  "initiator",
  "due",
  "description",
] as const;

const FIELD_ALIASES: Record<string, string[]> = {
  client: ["client", "clientname", "customer", "customername"],
  subject: ["subject", "category"],
  doer: ["doer", "assignee", "assignedto", "owner", "responsible"],
  initiator: ["initiator", "createdby", "reporter", "manager"],
  priority: ["priority", "prio", "importance"],
  due: ["due", "duedate", "deadline", "targetdate", "date"],
  description: ["description", "task", "details", "work", "taskdescription"],
  notes: ["notes", "note", "remarks", "comment"],
  tags: ["tags", "tag", "labels"],
};

const norm = (s: unknown): string =>
  String(s ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");

// label ("Critical") and raw enum ("imp_urgent") → enum value.
const PRIORITY_LOOKUP: Record<string, TaskPriority> = (() => {
  const m: Record<string, TaskPriority> = {};
  for (const p of TASK_PRIORITIES) {
    m[norm(p)] = p;
    m[norm(PRIORITY_LABELS[p])] = p;
  }
  return m;
})();

function coerceDate(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(
      Date.UTC(value.getFullYear(), value.getMonth(), value.getDate(), 12),
    ).toISOString();
  }
  const s = String(value ?? "").trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/); // ISO yyyy-mm-dd
  if (m) return new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, 12)).toISOString();
  m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/); // dd/mm/yyyy (IST)
  if (m) {
    let yr = +m[3]!;
    if (yr < 100) yr += 2000;
    const dd = +m[1]!;
    const mm = +m[2]!;
    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
      return new Date(Date.UTC(yr, mm - 1, dd, 12)).toISOString();
    }
  }
  const t = Date.parse(s);
  if (!Number.isNaN(t)) {
    const d = new Date(t);
    return new Date(
      Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 12),
    ).toISOString();
  }
  return null;
}

/**
 * Parse a CSV/XLSX File and validate every row against the task model,
 * resolving Doer/Initiator names (or emails) to employee ids. Pure preview —
 * no DB writes. The same function backs both the preview and the commit so the
 * server never trusts client-side data.
 */
export async function buildImportPreview(
  file: File,
  roster: RosterEntry[],
): Promise<ImportPreview> {
  let raw: Record<string, unknown>[];
  try {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { cellDates: true });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) return empty("The file has no sheets.");
    const sheet = wb.Sheets[sheetName]!;
    raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  } catch {
    return empty("Couldn't read the file. Upload a .csv or .xlsx.");
  }

  if (raw.length === 0) return empty("No data rows found.");
  if (raw.length > MAX_IMPORT_ROWS)
    return empty(`Too many rows (${raw.length}). Max ${MAX_IMPORT_ROWS} per import.`);

  // Map the sheet's actual headers → our canonical fields.
  const headerKeys = Object.keys(raw[0]!);
  const fieldToHeader: Record<string, string> = {};
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    const aliasSet = new Set(aliases.map(norm));
    const match = headerKeys.find((h) => aliasSet.has(norm(h)));
    if (match) fieldToHeader[field] = match;
  }
  const missing = REQUIRED_FIELDS.filter((f) => !fieldToHeader[f]);
  if (missing.length > 0) {
    return empty(
      `Missing required column(s): ${missing.join(", ")}. ` +
        `Expected headers like: Client, Subject, Doer, Initiator, Due Date, Description.`,
    );
  }

  // Resolution maps. Duplicate names collapse to "AMBIGUOUS".
  const byName = new Map<string, string | "AMBIGUOUS">();
  const byEmail = new Map<string, string>();
  for (const e of roster) {
    const n = norm(e.name);
    if (n) byName.set(n, byName.has(n) ? "AMBIGUOUS" : e.id);
    if (e.email) byEmail.set(e.email.trim().toLowerCase(), e.id);
  }
  function resolvePerson(value: string): { id: string | null; error?: string } {
    const v = value.trim();
    if (!v) return { id: null, error: "missing" };
    if (v.includes("@")) {
      const id = byEmail.get(v.toLowerCase());
      return id ? { id } : { id: null, error: `no employee with email "${v}"` };
    }
    const hit = byName.get(norm(v));
    if (!hit) return { id: null, error: `no employee named "${v}"` };
    if (hit === "AMBIGUOUS")
      return { id: null, error: `more than one employee named "${v}" — use their email` };
    return { id: hit };
  }

  const get = (row: Record<string, unknown>, field: string): string => {
    const header = fieldToHeader[field];
    if (!header) return "";
    const cell = row[header];
    return cell instanceof Date ? cell.toISOString() : String(cell ?? "").trim();
  };

  const rows: ImportPreviewRow[] = [];
  let rowNumber = 0;
  for (const r of raw) {
    rowNumber += 1;
    // Skip blank trailing rows (every mapped cell empty).
    const allBlank = Object.values(FIELD_ALIASES).every((_, i) => {
      const field = Object.keys(FIELD_ALIASES)[i]!;
      return get(r, field) === "";
    });
    if (allBlank) {
      rowNumber -= 1;
      continue;
    }

    const errors: string[] = [];
    const client = get(r, "client");
    const subject = get(r, "subject");
    const description = get(r, "description");
    const doerName = get(r, "doer");
    const initiatorName = get(r, "initiator");
    const dueRaw = get(r, "due");
    const notesRaw = get(r, "notes");
    const tagsRaw = get(r, "tags");
    const priorityRaw = get(r, "priority");

    if (!client) errors.push("Client is required");
    if (!subject) errors.push("Subject is required");
    if (!description) errors.push("Description is required");

    const doer = resolvePerson(doerName);
    if (!doerName) errors.push("Doer is required");
    else if (doer.error) errors.push(`Doer: ${doer.error}`);

    const initiator = resolvePerson(initiatorName);
    if (!initiatorName) errors.push("Initiator is required");
    else if (initiator.error) errors.push(`Initiator: ${initiator.error}`);

    const dueAt = coerceDate(dueRaw);
    if (!dueRaw) errors.push("Due date is required");
    else if (!dueAt) errors.push(`Due date "${dueRaw}" is not a valid date`);

    let priority: TaskPriority = "not_imp_not_urgent";
    let priorityLabel = PRIORITY_LABELS[priority];
    if (priorityRaw) {
      const hit = PRIORITY_LOOKUP[norm(priorityRaw)];
      if (hit) {
        priority = hit;
        priorityLabel = PRIORITY_LABELS[hit];
      } else {
        errors.push(`Priority "${priorityRaw}" not recognised (use Critical/Important/Urgent/Normal)`);
      }
    }

    const tags = tagsRaw
      ? tagsRaw.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 20)
      : [];

    rows.push({
      rowNumber,
      client,
      subject,
      doerName,
      doerId: doer.id,
      initiatorName,
      initiatorId: initiator.id,
      priority,
      priorityLabel,
      dueAt,
      dueRaw,
      description,
      notes: notesRaw || null,
      tags,
      errors,
      ok: errors.length === 0,
    });
  }

  if (rows.length === 0) return empty("No data rows found.");

  const validCount = rows.filter((r) => r.ok).length;
  return {
    rows,
    totalRows: rows.length,
    validCount,
    errorCount: rows.length - validCount,
  };
}

function empty(fatal: string): ImportPreview {
  return { rows: [], totalRows: 0, validCount: 0, errorCount: 0, fatal };
}
