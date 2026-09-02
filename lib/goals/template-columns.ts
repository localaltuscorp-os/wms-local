/**
 * Goals bulk-Excel — the SINGLE typed column manifest.
 *
 * PURE (no DB, no `server-only`) so both the template generator
 * (`app/(app)/goals/template.xlsx/route.ts`) and the import parser
 * (`app/(app)/goals/import/actions.ts`) derive their column set from ONE place.
 * Adding a schema field to the template + importer is a one-line change here:
 * append a `GoalTemplateColumn` and both sides pick it up automatically.
 *
 * Each column names the `goals` schema field it maps to (audit trail), whether
 * the importer WRITES it (`writable`) and whether it lands in the DB
 * (`persisted` — false = informational, e.g. Priority which the goals engine
 * doesn't store yet), whether the Excel cell is locked (read-only), and which
 * master-data list drives its dropdown (`source`).
 */
import type { GoalPeriod } from "@/lib/goals/types";
import { GOAL_TYPES, GOAL_TYPE_LABELS, TASK_STATUSES, isDeprecatedStatus, type TaskStatus } from "@/db/enums";

/* ------------------------------------------------------------------ */
/* Master-data source keys — the lists that back dropdown validation.  */
/* Resolved to concrete option arrays at generation time by the route  */
/* (roster / lookups are dynamic; the rest are code constants below).  */
/* ------------------------------------------------------------------ */
export type ColumnSource =
  | "level"
  | "quarter"
  | "month"
  | "status"
  | "goalType"
  | "category"
  | "area"
  | "measure"
  | "owner"
  | "reviewer"
  | "department"
  | "visibility"
  | "assignmentType"
  | "priority"
  | "incentiveKind"
  | "yesno"
  | null;

export interface GoalTemplateColumn {
  /** Stable field key the importer + generator address the column by. */
  field: string;
  /** Human header rendered in the template + matched (fuzzily) on import. */
  header: string;
  /** The `goals` table column this maps to (audit). null → derived/not stored. */
  schemaField: string | null;
  /** The importer reads + writes this column. */
  writable: boolean;
  /** The value is persisted to the DB. false → informational only (blank + note). */
  persisted: boolean;
  /** Excel cell protection — true → locked (read-only identifier / auto / export). */
  locked: boolean;
  /** Which master-data list backs the dropdown, or null for free text/number. */
  source: ColumnSource;
  /** Column width (Excel chars). */
  width: number;
  /**
   * Position (1-based) in the LEAN bulk-ENTRY template — the sheet users
   * actually download to add new goals. Only columns with `entry` set are
   * rendered, in `entry` order, so the template matches the live board table
   * (and the UI's promise: Area · Goal · Measure · Actual · Target · Type).
   * The full manifest still backs the import PARSER (every alias is
   * accepted), so nothing that used to import stops importing. Omit → the
   * column is export/advanced-only and never shown on the entry sheet.
   */
  entry?: number;
  /** Levels the field is meaningful at (for notes / conditional rules). */
  levels?: GoalPeriod[];
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
  return code
    .split("_")
    .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/** Live (non-deprecated) task statuses used for goals — dropdown values. */
export const GOAL_STATUS_CODES: readonly TaskStatus[] = TASK_STATUSES.filter(
  (s) => !isDeprecatedStatus(s),
);
export const GOAL_STATUS_LABELS: readonly string[] = GOAL_STATUS_CODES.map(prettyStatus);

/** Map a free-text status cell (label OR code) → a canonical status code. */
export function statusToCode(raw: unknown): TaskStatus | null {
  const k = normKey(raw);
  if (!k) return null;
  for (const code of GOAL_STATUS_CODES) {
    if (normKey(code) === k || normKey(prettyStatus(code)) === k) return code;
  }
  return null;
}

/** Map a Goal Type cell (label OR code) → a canonical goal_type code. */
export function goalTypeToCode(raw: unknown): string | null {
  const k = normKey(raw);
  if (!k) return null;
  for (const code of GOAL_TYPES) {
    if (normKey(code) === k || normKey(GOAL_TYPE_LABELS[code]) === k) return code;
  }
  return null;
}

/** Incentive kind cell → stored code. */
export const INCENTIVE_KIND_LABELS: Record<string, string> = {
  one_time: "One-time",
  repetitive: "Repetitive",
  milestone: "Milestone",
};
export function incentiveKindToCode(raw: unknown): "one_time" | "repetitive" | "milestone" | null {
  const k = normKey(raw);
  if (!k) return null;
  for (const [code, label] of Object.entries(INCENTIVE_KIND_LABELS)) {
    if (normKey(code) === k || normKey(label) === k) return code as "one_time" | "repetitive" | "milestone";
  }
  return null;
}

/** Visibility cell → shareWithTeam boolean. "Shared with team" → true. */
export const VISIBILITY_LABELS = ["Private", "Shared with team"] as const;
export function visibilityToShare(raw: unknown): boolean {
  const k = normKey(raw);
  return k === "sharedwithteam" || k === "shared" || k === "team" || k === "yes" || k === "true";
}

/** Yes/No cell → boolean. */
export function yesNoToBool(raw: unknown): boolean {
  const k = normKey(raw);
  return k === "yes" || k === "true" || k === "y" || k === "1";
}

export const ASSIGNMENT_TYPE_LABELS = ["Self", "Assigned"] as const;
export const YES_NO_LABELS = ["Yes", "No"] as const;
export const LEVEL_LABELS = ["Year", "Quarter", "Month", "Week", "Day"] as const;
export const QUARTER_LABELS = ["Q1", "Q2", "Q3", "Q4"] as const;
export const MONTH_LABELS = [
  "01 Jan", "02 Feb", "03 Mar", "04 Apr", "05 May", "06 Jun",
  "07 Jul", "08 Aug", "09 Sep", "10 Oct", "11 Nov", "12 Dec",
] as const;

/** Priority labels — NOT stored by the goals engine (informational column). */
export const PRIORITY_LABELS_LIST = ["Critical", "Important", "Urgent", "Normal"] as const;

/* ------------------------------------------------------------------ */
/* THE MANIFEST — order = column order on the sheet. Identifier group   */
/* (Goal ID · Level · Title) sits first so freeze-left keeps them in    */
/* view. Add a schema field → append one row here.                      */
/* ------------------------------------------------------------------ */
export const GOAL_TEMPLATE_COLUMNS: readonly GoalTemplateColumn[] = [
  // ── Identifiers (frozen left) ──────────────────────────────────────
  {
    field: "goalId", header: "Goal ID", schemaField: "id",
    writable: false, persisted: true, locked: true, source: null, width: 20,
    aliases: ["id", "goalid", "uuid"],
    help: "System UUID. Read-only — leave blank for new goals; present on exports for reference.",
  },
  {
    field: "level", header: "Goal Level", schemaField: "period",
    writable: true, persisted: true, locked: false, source: "level", width: 12,
    aliases: ["level", "period", "goallevel"],
    examples: ["Quarter", "Month"],
    help: "Year / Quarter / Month. (Week & Day goals are managed from the Weekly board — those rows are skipped on import.)",
  },
  {
    field: "title", header: "Goal Title", schemaField: "title",
    writable: true, persisted: true, locked: false, source: null, width: 42, entry: 2,
    aliases: ["goal", "title", "objective", "goaltitle", "what"],
    examples: ["Close 12 enterprise deals", "Onboard 4 pilot clients"],
    help: "REQUIRED. The one-line goal statement.",
  },
  // ── Period composition ─────────────────────────────────────────────
  {
    field: "year", header: "Year", schemaField: "periodKey",
    writable: true, persisted: true, locked: false, source: null, width: 8,
    aliases: ["year", "fy", "fystartyear"],
    examples: ["2026", "2026"],
    help: "Financial-year start year (Apr–Mar). Combined with Level + Quarter/Month to build the period bucket.",
  },
  {
    field: "quarter", header: "Quarter", schemaField: "periodKey",
    writable: true, persisted: true, locked: false, source: "quarter", width: 10,
    levels: ["quarter"],
    aliases: ["quarter", "q"],
    examples: ["Q1", ""],
    help: "Quarter goals only — Q1 (Apr–Jun) … Q4 (Jan–Mar).",
  },
  {
    field: "month", header: "Month", schemaField: "periodKey",
    writable: true, persisted: true, locked: false, source: "month", width: 12,
    levels: ["month"],
    aliases: ["month", "mon"],
    examples: ["", "07 Jul"],
    help: "Month goals only — pick the calendar month.",
  },
  {
    field: "week", header: "Week (Mon date)", schemaField: null,
    writable: false, persisted: false, locked: false, source: null, width: 14,
    levels: ["week"],
    aliases: ["week", "weekstart", "weekof"],
    help: "Week goals live on the Weekly board (weekly_goals) — informational here; week rows are not imported through this file.",
  },
  // ── Descriptors ────────────────────────────────────────────────────
  {
    field: "notes", header: "Description / Notes", schemaField: "notes",
    writable: true, persisted: true, locked: false, source: null, width: 40,
    aliases: ["notes", "note", "description", "remarks", "comment", "details"],
    examples: ["North + West regions", "Kick-off first Monday"],
    help: "Free-text context / description for the goal.",
  },
  {
    field: "goalType", header: "Goal Type", schemaField: "goalType",
    writable: true, persisted: true, locked: false, source: "goalType", width: 14,
    aliases: ["goaltype", "type"],
    examples: ["KPI", "Operational"],
    help: "KPI · Branding · Strategic · Operational · Essential. Decides how the goal is scored in appraisal.",
  },
  {
    field: "category", header: "Type", schemaField: "category",
    writable: true, persisted: true, locked: false, source: "category", width: 16, entry: 6,
    aliases: ["category", "goalcategory", "tag", "kind"],
    examples: ["Target", "Operational"],
    help: "Kanban tag — Goal · Target · Milestone · Operational (plus any admin-added Types).",
  },
  {
    field: "area", header: "Area", schemaField: "area",
    writable: true, persisted: true, locked: false, source: "area", width: 16, entry: 1,
    aliases: ["area", "pillar", "function"],
    examples: ["Revenue", "Strategy"],
    help: "Focus area / pillar (admin-extensible list).",
  },
  {
    field: "uom", header: "Measure", schemaField: "uom",
    writable: true, persisted: true, locked: false, source: "measure", width: 14, entry: 3,
    aliases: ["uom", "unit", "measure", "unitofmeasure", "kpiunit", "kpiunituom"],
    examples: ["Nos.", "Nos."],
    help: "Unit of measure for the target/actual (Rs., Nos., Seats, Yes/No …).",
  },
  // ── Numbers ────────────────────────────────────────────────────────
  {
    field: "targetQty", header: "Target", schemaField: "targetQty",
    writable: true, persisted: true, locked: false, source: null, width: 12, entry: 5,
    aliases: ["target", "targetvalue", "targetqty", "tgt", "quantity", "qty"],
    examples: ["12", "4"],
    help: "Numeric target (quantity). % Done is auto-computed from Actual ÷ Target.",
  },
  {
    field: "targetAmount", header: "Target Amount (₹)", schemaField: "targetAmount",
    writable: true, persisted: true, locked: false, source: null, width: 14,
    aliases: ["targetamount", "tgtamt", "amount", "targetamt"],
    examples: ["", ""],
    help: "Money target in ₹ (numeric). Use for revenue/value goals.",
  },
  {
    field: "actualQty", header: "Actual", schemaField: "actualQty",
    writable: true, persisted: true, locked: false, source: null, width: 12, entry: 4,
    aliases: ["actual", "actualvalue", "actualqty", "achieved", "done"],
    examples: ["0", "0"],
    help: "Numeric actual achieved so far.",
  },
  {
    field: "actualAmount", header: "Actual Amount (₹)", schemaField: "actualAmount",
    writable: true, persisted: true, locked: false, source: null, width: 14,
    aliases: ["actualamount", "actualamt"],
    examples: ["", ""],
    help: "Money actual in ₹ (numeric).",
  },
  {
    field: "progress", header: "Progress %", schemaField: "pctDone",
    writable: false, persisted: true, locked: true, source: null, width: 11,
    aliases: ["progress", "pctdone", "percent", "pct", "done%"],
    help: "Auto-computed from Actual ÷ Target on import — read-only.",
  },
  {
    field: "targetDate", header: "Target Date", schemaField: "targetDate",
    writable: true, persisted: true, locked: false, source: null, width: 14,
    levels: ["month", "week"],
    aliases: ["targetdate", "deadline", "duedate", "due"],
    examples: ["", "2026-07-31"],
    help: "Deadline (YYYY-MM-DD) — MONTH goals only (year/quarter roll up from children).",
  },
  // ── People ─────────────────────────────────────────────────────────
  {
    field: "owner", header: "Goal Owner", schemaField: "employeeId",
    writable: true, persisted: true, locked: false, source: "owner", width: 22,
    aliases: ["owner", "employee", "person", "name", "assignee", "email"],
    examples: ["Ananya Rao", "Ananya Rao"],
    help: "Who owns the goal (name or email). Blank → the default owner picked in the import dialog.",
  },
  {
    field: "department", header: "Department", schemaField: null,
    writable: false, persisted: false, locked: false, source: "department", width: 16,
    aliases: ["department", "dept"],
    help: "Owner's department — reference/filter only (derived from the owner; not written).",
  },
  {
    field: "team", header: "Team Member(s)", schemaField: "teamInvolved",
    writable: true, persisted: true, locked: false, source: null, width: 24,
    aliases: ["team", "teammembers", "teaminvolved", "involved", "members", "collaborators"],
    examples: ["Rahul; Priya", ""],
    help: "Semicolon-separated collaborator names.",
  },
  {
    field: "dependency", header: "Dependency %", schemaField: "teamDependencyPct",
    writable: true, persisted: true, locked: false, source: null, width: 13,
    aliases: ["dependency", "dependencypct", "depend", "teamdependency"],
    examples: ["20", ""],
    help: "How much (0–100%) the goal depends on the team.",
  },
  {
    field: "reviewer", header: "Reviewer", schemaField: "reviewedById",
    writable: true, persisted: true, locked: false, source: "reviewer", width: 22,
    aliases: ["reviewer", "reviewedby", "manager", "approver"],
    examples: ["", ""],
    help: "Who reviews/rates the goal (name or email).",
  },
  {
    field: "assignmentType", header: "Assignment Type", schemaField: null,
    writable: false, persisted: false, locked: true, source: "assignmentType", width: 14,
    aliases: ["assignmenttype", "selfassigned"],
    help: "Self vs Assigned — DERIVED from creator vs owner. Read-only (export reference).",
  },
  {
    field: "assignedBy", header: "Assigned By", schemaField: "createdById",
    writable: false, persisted: true, locked: true, source: null, width: 20,
    aliases: ["assignedby"],
    help: "Who created/assigned the goal — set to the importer on new rows. Read-only.",
  },
  {
    field: "priority", header: "Priority", schemaField: null,
    writable: false, persisted: false, locked: false, source: "priority", width: 12,
    aliases: ["priority", "prio"],
    help: "NOT stored by the goals engine yet — informational placeholder; leave blank.",
  },
  {
    field: "status", header: "Status", schemaField: "status",
    writable: true, persisted: true, locked: false, source: "status", width: 14,
    aliases: ["status", "state"],
    examples: ["Not Started", "Not Started"],
    help: "Workflow status. Blank → auto (Not Started, or derived from Actual ÷ Target).",
  },
  {
    field: "shareWithTeam", header: "Visibility / Share", schemaField: "shareWithTeam",
    writable: true, persisted: true, locked: false, source: "visibility", width: 16,
    aliases: ["visibility", "share", "sharewithteam", "shared"],
    examples: ["Private", "Shared with team"],
    help: "Private (default) or Shared with team.",
  },
  // ── Incentive (retired in UI — kept for completeness) ───────────────
  {
    field: "incentiveEnabled", header: "Incentive?", schemaField: "incentiveEnabled",
    writable: true, persisted: true, locked: false, source: "yesno", width: 11,
    aliases: ["incentive", "incentiveenabled", "hasincentive"],
    help: "Yes/No — attach an incentive to the goal.",
  },
  {
    field: "incentiveAmount", header: "Incentive Amount (₹)", schemaField: "incentiveAmount",
    writable: true, persisted: true, locked: false, source: null, width: 15,
    aliases: ["incentiveamount", "incentiveamt"],
    help: "Incentive value in ₹ (numeric).",
  },
  {
    field: "incentiveKind", header: "Incentive Kind", schemaField: "incentiveKind",
    writable: true, persisted: true, locked: false, source: "incentiveKind", width: 14,
    aliases: ["incentivekind", "incentivetype"],
    help: "One-time · Repetitive · Milestone.",
  },
  // ── Advanced / export-only ─────────────────────────────────────────
  {
    field: "parentGoalId", header: "Parent Goal ID", schemaField: "parentGoalId",
    writable: true, persisted: true, locked: false, source: null, width: 20,
    aliases: ["parent", "parentgoalid", "parentid"],
    help: "Advanced — link this goal under a parent (paste the parent's Goal ID for the same owner).",
  },
  {
    field: "createdBy", header: "Created By", schemaField: "createdById",
    writable: false, persisted: true, locked: true, source: null, width: 20,
    aliases: ["createdby", "creator"],
    help: "Creator — set to the importer on new rows. Read-only.",
  },
  {
    field: "updatedBy", header: "Last Updated By", schemaField: "updatedById",
    writable: false, persisted: true, locked: true, source: null, width: 20,
    aliases: ["updatedby", "lastupdatedby", "modifiedby"],
    help: "Last editor — read-only.",
  },
] as const;

/** Fast header → column lookup (by header + every alias, normalised). */
const HEADER_INDEX: Map<string, GoalTemplateColumn> = (() => {
  const m = new Map<string, GoalTemplateColumn>();
  for (const col of GOAL_TEMPLATE_COLUMNS) {
    m.set(normKey(col.header), col);
    m.set(normKey(col.field), col);
    for (const a of col.aliases ?? []) m.set(normKey(a), col);
  }
  return m;
})();

/** Resolve a raw spreadsheet header to its manifest column (or null). */
export function columnForHeader(raw: unknown): GoalTemplateColumn | null {
  return HEADER_INDEX.get(normKey(raw)) ?? null;
}
