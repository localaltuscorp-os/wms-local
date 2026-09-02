/**
 * Tasks bulk-Excel — the SINGLE typed column manifest.
 *
 * PURE (no DB, no `server-only`) so both the template generator
 * (`app/(app)/tasks/template.xlsx/route.ts`) and the import parser
 * (`lib/import/task-import.ts`) derive their column set from ONE place. Mirrors
 * the Goals manifest (lib/goals/template-columns) so the two bulk-upload flows
 * stay symmetric. Adding a task field to the template + importer is a one-line
 * change here: append a `TaskTemplateColumn` and both sides pick it up.
 *
 * Every column names the `tasks` schema field it maps to (audit), whether the
 * importer WRITES it (`writable`) and whether it lands in the DB (`persisted`),
 * whether the Excel cell is locked (read-only identifier / auto / export), and
 * which master-data list drives its dropdown (`source`).
 */
import {
  TASK_PRIORITIES,
  PRIORITY_LABELS,
  USER_TASK_STATUSES,
  type TaskPriority,
  type TaskStatus,
} from "@/db/enums";

/* ------------------------------------------------------------------ */
/* Master-data source keys — the lists that back dropdown validation.  */
/* Roster lists are dynamic (resolved at generation time); the rest    */
/* are the code constants below.                                       */
/* ------------------------------------------------------------------ */
export type TaskColumnSource =
  | "priority"
  | "status"
  | "doer"
  | "initiator"
  | "recurrence"
  | "yesno"
  // The Subject roster, filtered by the retire/pin policy in
  // lib/tasks/subject-options.ts — so the template offers exactly what the
  // New Task form offers, and the two can never drift.
  | "subject"
  | null;

export interface TaskTemplateColumn {
  /** Stable field key the importer + generator address the column by. */
  field: string;
  /** Human header rendered in the template + matched (fuzzily) on import. */
  header: string;
  /** The `tasks` table column this maps to (audit). null → derived/not stored. */
  schemaField: string | null;
  /** The importer reads + writes this column. */
  writable: boolean;
  /** The value is persisted to the DB. false → informational only. */
  persisted: boolean;
  /** Excel cell protection — true → locked (read-only identifier / auto / export). */
  locked: boolean;
  /** Which master-data list backs the dropdown, or null for free text/number/date. */
  source: TaskColumnSource;
  /** Column width (Excel chars). */
  width: number;
  /** Extra header spellings accepted on import (normalised). */
  aliases?: string[];
  /** Two example values shown on the Examples sheet. */
  examples?: [string, string];
  /** One-line glossary shown on the "How to use" sheet. */
  help: string;
}

/** Normalise a header/value for tolerant matching (lowercase alphanumerics). */
export function normKey(s: unknown): string {
  return String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/* ------------------------------------------------------------------ */
/* Status label round-trip — codes are stored, friendly labels shown.  */
/* ------------------------------------------------------------------ */

/** Title-case a status code for display: "not_started" → "Not Started". */
export function prettyStatus(code: string): string {
  if (code === "dont_know") return "Not Assessed";
  return code
    .split("_")
    .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/** Live task statuses offered in the template dropdown (excludes deprecated). */
export const TASK_STATUS_CODES: readonly TaskStatus[] = USER_TASK_STATUSES;
export const TASK_STATUS_LABELS: readonly string[] = TASK_STATUS_CODES.map(prettyStatus);

/** Map a free-text status cell (label OR code) → a canonical status code. */
export function statusToCode(raw: unknown): TaskStatus | null {
  const k = normKey(raw);
  if (!k) return null;
  for (const code of TASK_STATUS_CODES) {
    if (normKey(code) === k || normKey(prettyStatus(code)) === k) return code;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Priority round-trip — labels shown (Critical…), enum stored.        */
/* ------------------------------------------------------------------ */
export const PRIORITY_LABELS_LIST: readonly string[] = TASK_PRIORITIES.map((p) => PRIORITY_LABELS[p]);

/** Map a priority cell (label OR enum) → a canonical priority code, or null. */
export function priorityToCode(raw: unknown): TaskPriority | null {
  const k = normKey(raw);
  if (!k) return null;
  for (const code of TASK_PRIORITIES) {
    if (normKey(code) === k || normKey(PRIORITY_LABELS[code]) === k) return code;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Recurrence round-trip.                                              */
/* ------------------------------------------------------------------ */
export const RECURRENCE_CODES = ["none", "daily", "weekly", "monthly", "yearly"] as const;
export type RecurrenceCode = (typeof RECURRENCE_CODES)[number];
export const RECURRENCE_LABELS: readonly string[] = ["None", "Daily", "Weekly", "Monthly", "Yearly"];

/** Recurrence cell → stored code (null → treated as "none"). */
export function recurrenceToCode(raw: unknown): RecurrenceCode | null {
  const k = normKey(raw);
  if (!k) return null;
  for (const code of RECURRENCE_CODES) {
    if (normKey(code) === k) return code;
  }
  return null;
}

/** Yes/No cell → boolean. */
export const YES_NO_LABELS = ["Yes", "No"] as const;
export function yesNoToBool(raw: unknown): boolean {
  const k = normKey(raw);
  return k === "yes" || k === "true" || k === "y" || k === "1";
}

/* ------------------------------------------------------------------ */
/* THE MANIFEST — order = column order on the sheet. Identifier group   */
/* (Task ID · Task No · Client · Subject) sits first so freeze-left     */
/* keeps them in view. Add a schema field → append one row here.        */
/* ------------------------------------------------------------------ */
export const TASK_TEMPLATE_COLUMNS: readonly TaskTemplateColumn[] = [
  // ── Identifiers (frozen left) ──────────────────────────────────────
  {
    field: "taskId", header: "Task ID", schemaField: "id",
    writable: false, persisted: false, locked: true, source: null, width: 20,
    aliases: ["id", "taskid", "uuid"],
    help: "System UUID. Read-only — leave blank for new tasks; present on exports for reference.",
  },
  {
    field: "taskNo", header: "Task No.", schemaField: "taskNo",
    writable: false, persisted: false, locked: true, source: null, width: 10,
    aliases: ["taskno", "no", "number", "ref"],
    help: "Friendly sequential number (#1042). Auto-assigned by the system — read-only.",
  },
  {
    field: "client", header: "Client", schemaField: "client",
    writable: true, persisted: true, locked: false, source: null, width: 24,
    aliases: ["client", "clientname", "customer", "customername", "account"],
    examples: ["Acme Corp", "Globex"],
    help: "REQUIRED. The client/account this task belongs to. Also seeds the task title.",
  },
  {
    field: "subject", header: "Subject / Category", schemaField: "subject",
    writable: true, persisted: true, locked: false, source: "subject", width: 22,
    aliases: ["subject", "category", "type", "workstream"],
    examples: ["Altus Ecosystem", "Audit"],
    // A DROPDOWN now, not free text: the column used to accept anything typed,
    // which is how retired spellings kept re-entering through bulk upload.
    // Validation stays permissive (`showErrorMessage: false`, as every other
    // source-backed column here) — a value off-list is flagged on import rather
    // than blocked during entry, so an existing sheet still pastes in.
    help: "REQUIRED. Short subject/category grouping for the task. Pick from the dropdown.",
  },
  // ── The work ───────────────────────────────────────────────────────
  {
    field: "description", header: "Task Description", schemaField: "description",
    writable: true, persisted: true, locked: false, source: null, width: 44,
    aliases: ["description", "task", "details", "work", "taskdescription", "what"],
    examples: ["File Q1 GST return", "Complete statutory audit"],
    help: "REQUIRED. What needs to be done — the task statement.",
  },
  {
    field: "notes", header: "Notes", schemaField: "notes",
    writable: true, persisted: true, locked: false, source: null, width: 34,
    aliases: ["notes", "note", "remarks", "comment", "comments"],
    examples: ["Await client docs", ""],
    help: "Free-text notes / context for the task.",
  },
  // ── People ─────────────────────────────────────────────────────────
  {
    field: "doer", header: "Doer (Assignee)", schemaField: "doerId",
    writable: true, persisted: true, locked: false, source: "doer", width: 22,
    aliases: ["doer", "assignee", "assignedto", "owner", "responsible", "who"],
    examples: ["Ananya Rao", "Rahul Shah"],
    help: "REQUIRED. Who does the task (name or email). Must match an active employee.",
  },
  {
    field: "initiator", header: "Initiator", schemaField: "initiatorId",
    writable: true, persisted: true, locked: false, source: "initiator", width: 22,
    aliases: ["initiator", "createdby", "reporter", "manager", "raisedby"],
    examples: ["Priya Nair", "Priya Nair"],
    help: "Who raised/owns accountability (name or email). Blank → the importer.",
  },
  // ── Scheduling ─────────────────────────────────────────────────────
  {
    field: "priority", header: "Priority", schemaField: "priority",
    writable: true, persisted: true, locked: false, source: "priority", width: 13,
    aliases: ["priority", "prio", "importance"],
    examples: ["Critical", "Normal"],
    help: "Critical · Important · Urgent · Normal. Blank → Normal.",
  },
  {
    field: "status", header: "Status", schemaField: "status",
    writable: true, persisted: true, locked: false, source: "status", width: 15,
    aliases: ["status", "state", "stage"],
    examples: ["Not Started", "Initiated"],
    help: "Workflow status. Blank → Not Assessed (lands in the 'Not Read' bucket like the form).",
  },
  {
    field: "dueDate", header: "Due Date", schemaField: "dueAt",
    writable: true, persisted: true, locked: false, source: null, width: 14,
    aliases: ["due", "duedate", "deadline", "targetdate", "date", "dueat"],
    examples: ["2026-08-15", "2026-08-20"],
    help: "REQUIRED. Deadline — ISO YYYY-MM-DD or dd/mm/yyyy. This is the ORIGINAL commitment (permanent).",
  },
  {
    field: "revisedTargetDate", header: "Revised Due Date", schemaField: "revisedTargetDate",
    writable: true, persisted: true, locked: false, source: null, width: 15,
    aliases: ["reviseddue", "reviseddate", "revisedtargetdate", "newduedate"],
    examples: ["", "2026-08-27"],
    help: "Optional revised deadline. Coexists with Due Date so the original isn't lost; overdue is measured from this when set.",
  },
  {
    field: "startsAt", header: "Starts At", schemaField: "startsAt",
    writable: true, persisted: true, locked: false, source: null, width: 16,
    aliases: ["startsat", "start", "startdate", "starttime", "from"],
    examples: ["", "2026-08-18 10:00"],
    help: "Optional calendar start (YYYY-MM-DD or YYYY-MM-DD HH:mm). When work is scheduled to begin.",
  },
  {
    field: "endsAt", header: "Ends At", schemaField: "endsAt",
    writable: true, persisted: true, locked: false, source: null, width: 16,
    aliases: ["endsat", "end", "enddate", "endtime", "to"],
    examples: ["", "2026-08-18 11:00"],
    help: "Optional calendar end (YYYY-MM-DD or YYYY-MM-DD HH:mm).",
  },
  {
    field: "allDay", header: "All Day?", schemaField: "allDay",
    writable: true, persisted: true, locked: false, source: "yesno", width: 10,
    aliases: ["allday", "fullday"],
    help: "Yes/No — when Yes, the Starts/Ends times are decorative (shown as 'All day').",
  },
  {
    field: "recurrence", header: "Recurrence", schemaField: "recurrence",
    writable: true, persisted: true, locked: false, source: "recurrence", width: 13,
    aliases: ["recurrence", "repeat", "recurring", "frequency"],
    examples: ["None", "Weekly"],
    help: "None · Daily · Weekly · Monthly · Yearly. Blank → None (a one-off task).",
  },
  {
    field: "tags", header: "Tags", schemaField: "tags",
    writable: true, persisted: true, locked: false, source: null, width: 22,
    aliases: ["tags", "tag", "labels", "label"],
    examples: ["urgent; billing", ""],
    help: "Semicolon- or comma-separated labels (max 20).",
  },
  // ── Advanced / export-only ─────────────────────────────────────────
  {
    field: "createdBy", header: "Created By", schemaField: "createdById",
    writable: false, persisted: true, locked: true, source: null, width: 20,
    aliases: ["createdby", "creator", "importedby"],
    help: "Creator — set to the importer on new rows. Read-only.",
  },
] as const;

/** Fast header → column lookup (by header + every alias, normalised). */
const HEADER_INDEX: Map<string, TaskTemplateColumn> = (() => {
  const m = new Map<string, TaskTemplateColumn>();
  for (const col of TASK_TEMPLATE_COLUMNS) {
    m.set(normKey(col.header), col);
    m.set(normKey(col.field), col);
    for (const a of col.aliases ?? []) m.set(normKey(a), col);
  }
  return m;
})();

/** Resolve a raw spreadsheet header to its manifest column (or null). */
export function columnForHeader(raw: unknown): TaskTemplateColumn | null {
  return HEADER_INDEX.get(normKey(raw)) ?? null;
}
