import "server-only";
import * as XLSX from "xlsx";
import { PRIORITY_LABELS, type TaskPriority, type TaskStatus } from "@/db/enums";
import {
  columnForHeader,
  normKey,
  priorityToCode,
  statusToCode,
  recurrenceToCode,
  yesNoToBool,
} from "@/lib/tasks/template-columns";

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
  // ── All-columns (mig-free additive fields the manifest also covers) ──
  status: TaskStatus;
  revisedTargetDate: string | null;
  startsAt: string | null;
  endsAt: string | null;
  allDay: boolean;
  recurrence: string | null;
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

type Field = string; // a manifest column `field`

/** Map a raw spreadsheet header → a manifest field key (or null). */
function mapHeader(raw: unknown): Field | null {
  return columnForHeader(raw)?.field ?? null;
}

/** Find the header row (banner rows sit above it in the styled template). */
function findHeaderRow(matrix: unknown[][]): number {
  for (let r = 0; r < Math.min(matrix.length, 8); r++) {
    const mapped = (matrix[r] ?? []).map((c) => mapHeader(c)).filter(Boolean).length;
    if (mapped >= 2) return r;
  }
  return 0;
}

/** Date (no time) → ISO at noon UTC, tolerant of ISO + dd/mm/yyyy. */
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

/** Date+time → ISO, preserving the clock time when present ("YYYY-MM-DD HH:mm").
 *  Falls back to the date-only coercion (noon UTC) when no time is given. */
function coerceDateTime(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  const s = String(value ?? "").trim();
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2})/);
  if (m) {
    return new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!)).toISOString();
  }
  return coerceDate(s);
}

/**
 * Parse a CSV/XLSX File and validate every row against the FULL task column
 * manifest (lib/tasks/template-columns), resolving Doer/Initiator names (or
 * emails) to employee ids. Pure preview — no DB writes. The same function backs
 * both the preview and the commit so the server never trusts client-side data.
 * Round-trips with the exceljs template from GET /tasks/template.xlsx.
 */
export async function buildImportPreview(
  file: File,
  roster: RosterEntry[],
  meId?: string,
): Promise<ImportPreview> {
  let matrix: unknown[][];
  try {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { cellDates: true });
    if (wb.SheetNames.length === 0) return empty("The file has no sheets.");

    const toMatrix = (name: string) =>
      XLSX.utils.sheet_to_json(wb.Sheets[name]!, {
        header: 1,
        blankrows: false,
        defval: "",
      }) as unknown[][];

    // Pick the DATA sheet, not blindly the first one — the branded template ships
    // the hidden "Lists" validation sheet at index 0 with "Tasks" after it.
    //   1. a sheet literally named "Tasks";
    //   2. else the first sheet whose header row actually has Client/Description;
    //   3. else fall back to the first sheet (plain single-sheet CSV/xlsx).
    const named = wb.SheetNames.find((n) => n.trim().toLowerCase() === "tasks");
    const withHeaders = named
      ? undefined
      : wb.SheetNames.find((n) => {
          const m = toMatrix(n);
          const cols = (m[findHeaderRow(m)] ?? []).map((c) => mapHeader(c));
          return cols.includes("client") || cols.includes("description");
        });
    const chosen = named ?? withHeaders ?? wb.SheetNames[0]!;
    matrix = toMatrix(chosen);
  } catch {
    return empty("Couldn't read the file. Upload a .csv or .xlsx.");
  }

  if (matrix.length < 2) return empty("No data rows found.");

  const headerIdx = findHeaderRow(matrix);
  const headerRow = matrix[headerIdx] ?? [];
  const colMap: (Field | null)[] = headerRow.map((c) => mapHeader(c));
  const dataRowCount = matrix.length - 1 - headerIdx;
  if (dataRowCount > MAX_IMPORT_ROWS)
    return empty(`Too many rows (${dataRowCount}). Max ${MAX_IMPORT_ROWS} per import.`);

  const hasClient = colMap.includes("client");
  const hasDesc = colMap.includes("description");
  if (!hasClient && !hasDesc) {
    return empty(
      "Couldn't find the expected columns. Download the template and keep the header row " +
        "(Client, Subject, Task Description, Doer, Due Date, …).",
    );
  }

  // Resolution maps. Duplicate names collapse to "AMBIGUOUS".
  const byName = new Map<string, string | "AMBIGUOUS">();
  const byEmail = new Map<string, string>();
  for (const e of roster) {
    const n = normKey(e.name);
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
    const hit = byName.get(normKey(v));
    if (!hit) return { id: null, error: `no employee named "${v}"` };
    if (hit === "AMBIGUOUS")
      return { id: null, error: `more than one employee named "${v}" — use their email` };
    return { id: hit };
  }

  const rows: ImportPreviewRow[] = [];
  let rowNumber = 0;
  for (let r = headerIdx + 1; r < matrix.length; r++) {
    const raw = matrix[r] ?? [];
    const get = (field: Field): string => {
      const idx = colMap.indexOf(field);
      if (idx === -1) return "";
      const cell = raw[idx];
      return cell instanceof Date ? cell.toISOString() : String(cell ?? "").trim();
    };
    const getRaw = (field: Field): unknown => {
      const idx = colMap.indexOf(field);
      return idx === -1 ? "" : raw[idx];
    };

    rowNumber += 1;

    const client = get("client");
    const subject = get("subject");
    const description = get("description");
    const doerName = get("doer");
    const initiatorName = get("initiator");
    const dueRaw = get("dueDate");
    const notesRaw = get("notes");
    const tagsRaw = get("tags");
    const priorityRaw = get("priority");
    const statusRaw = get("status");
    const recurrenceRaw = get("recurrence");
    const allDayRaw = get("allDay");

    // Fully-blank row → skip silently (don't count it).
    if (!client && !subject && !description && !doerName && !dueRaw && !notesRaw && !tagsRaw) {
      rowNumber -= 1;
      continue;
    }

    const errors: string[] = [];
    if (!client) errors.push("Client is required");
    if (!subject) errors.push("Subject is required");
    if (!description) errors.push("Description is required");

    const doer = resolvePerson(doerName);
    if (!doerName) errors.push("Doer is required");
    else if (doer.error) errors.push(`Doer: ${doer.error}`);

    // Initiator is optional — blank defaults to the importer.
    let initiatorId: string | null = meId ?? null;
    if (initiatorName) {
      const init = resolvePerson(initiatorName);
      if (init.error) errors.push(`Initiator: ${init.error}`);
      else initiatorId = init.id;
    }

    const dueAt = coerceDate(getRaw("dueDate"));
    if (!dueRaw) errors.push("Due date is required");
    else if (!dueAt) errors.push(`Due date "${dueRaw}" is not a valid date`);

    let priority: TaskPriority = "not_imp_not_urgent";
    if (priorityRaw) {
      const hit = priorityToCode(priorityRaw);
      if (hit) priority = hit;
      else errors.push(`Priority "${priorityRaw}" not recognised (use Critical/Important/Urgent/Normal)`);
    }

    // Status — blank → "dont_know" (matches the form's "Not Assessed" default).
    const status: TaskStatus = statusToCode(statusRaw) ?? "dont_know";

    const revisedTargetDate = coerceDate(getRaw("revisedTargetDate"));
    const startsAt = coerceDateTime(getRaw("startsAt"));
    const endsAt = coerceDateTime(getRaw("endsAt"));
    const allDay = allDayRaw ? yesNoToBool(allDayRaw) : false;
    const recurrence = recurrenceRaw ? recurrenceToCode(recurrenceRaw) : null;

    const tags = tagsRaw
      ? tagsRaw.split(/[;,]/).map((t) => t.trim()).filter(Boolean).slice(0, 20)
      : [];

    rows.push({
      rowNumber,
      client,
      subject,
      doerName,
      doerId: doer.id,
      initiatorName,
      initiatorId,
      priority,
      priorityLabel: PRIORITY_LABELS[priority],
      dueAt,
      dueRaw,
      description,
      notes: notesRaw || null,
      tags,
      status,
      revisedTargetDate,
      startsAt,
      endsAt,
      allDay,
      recurrence: recurrence && recurrence !== "none" ? recurrence : null,
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
