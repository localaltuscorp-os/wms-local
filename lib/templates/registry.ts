import "server-only";

import { TEMPLATE_KEYS, type TemplateKey } from "./keys";

/**
 * THE TEMPLATE REGISTRY — every bulk-import workbook the application serves.
 *
 * This is the single source of truth Admin Panel → Upload Master renders, and
 * the single mapping "bulk-upload feature → template". A template key here is
 * the address the rest of the app talks to: the download route resolves
 * "override if present, else built-in" against it (lib/templates/resolve.ts),
 * and `template_files` stores an administrator's replacement by the same key.
 *
 * ── HOW THIS LIST WAS BUILT ────────────────────────────────────────────────
 * By walking every import surface in the application, not by guessing: each
 * entry below is a `Download Template` / `Bulk Upload` a real page offers. If a
 * module grows one, it gets a key here AND a `buildTemplate` case
 * (lib/templates/resolve.ts) — nothing else needs to learn the list, because
 * the per-module download buttons build their URL from lib/templates/keys.ts.
 *
 * ── ONE ROW PER FEATURE, NOT PER SCREEN ────────────────────────────────────
 * A workbook that varies by a parameter (the Goals level, the Project Plan
 * kind) is ONE entry whose built-in takes that parameter, so an administrator
 * replaces one file and every caller of that feature gets it. Two entries for
 * one feature would give Upload Master two switches for one thing and no way
 * to know which won.
 */

export const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export interface TemplateDef {
  key: TemplateKey;
  /** What Upload Master lists and what the replace toast names. */
  name: string;
  /** The workspace the feature lives in (Upload Master groups by this). */
  module: string;
  /** The page path a person would take to reach the download button. */
  feature: string;
  /** The built-in download filename (used when there is no override). */
  fileName: string;
  contentType: string;
  /** What the workbook is, and — where it matters — what the importer expects. */
  note: string;
}

export const TEMPLATE_REGISTRY: readonly TemplateDef[] = [
  {
    key: TEMPLATE_KEYS.tasks,
    name: "Tasks — Bulk Import",
    module: "WMS",
    feature: "Tasks → Bulk Upload",
    fileName: "Altus-Tasks-Template.xlsx",
    contentType: XLSX_CONTENT_TYPE,
    note: "Tasks bulk-import workbook (four sheets). Required columns: Client, Subject, Task Description, Doer, Due Date.",
  },
  {
    key: TEMPLATE_KEYS.goals,
    name: "Goals — Bulk Import",
    module: "Goals",
    feature: "Goals → Bulk Import (and the Week / Day board levels)",
    fileName: "Altus-Goals-Template.xlsx",
    contentType: XLSX_CONTENT_TYPE,
    note: "Level-agnostic Goals workbook — the level is taken from the board at upload time. Serves the cascade importer and every board level without a template of its own.",
  },
  {
    key: TEMPLATE_KEYS.weeklyGoals,
    name: "Weekly Goals — Bulk Import",
    module: "Goals",
    feature: "Goals → Weekly Goals → Bulk Upload",
    fileName: "Weekly-Goals-Template.xlsx",
    contentType: XLSX_CONTENT_TYPE,
    note: "Weekly Goals workbook. Columns: Client, Subject, Priority, Target Date, Incentive, KPI, Target, % Done, Explanation, Notes, Link, Employee.",
  },
  {
    key: TEMPLATE_KEYS.monthlyGoals,
    name: "Monthly Goals — Bulk Import",
    module: "Goals",
    feature: "Goals → Monthly Goals → Bulk Upload",
    fileName: "Altus-Goals-Template-Monthly.xlsx",
    contentType: XLSX_CONTENT_TYPE,
    note: "The Monthly Goals board's workbook, pre-scoped to the month in view.",
  },
  {
    key: TEMPLATE_KEYS.quarterlyGoals,
    name: "Quarterly Goals — Bulk Import",
    module: "Goals",
    feature: "Goals → Quarterly Goals → Bulk Upload",
    fileName: "Altus-Goals-Template-Quarterly.xlsx",
    contentType: XLSX_CONTENT_TYPE,
    note: "The Quarterly Goals board's workbook, pre-scoped to the quarter in view.",
  },
  {
    key: TEMPLATE_KEYS.yearlyGoals,
    name: "Yearly Goals — Bulk Import",
    module: "Goals",
    feature: "Goals → Yearly Goals → Bulk Upload",
    fileName: "Altus-Goals-Template-Yearly.xlsx",
    contentType: XLSX_CONTENT_TYPE,
    note: "The Yearly Goals board's workbook, pre-scoped to the financial year in view.",
  },
  {
    key: TEMPLATE_KEYS.projects,
    name: "Projects — Bulk Import",
    module: "Projects",
    feature: "Projects → Bulk Upload",
    fileName: "Project-Plan-Template.xlsx",
    contentType: XLSX_CONTENT_TYPE,
    note: "Project Plan workbook — one column set per plan kind (Project, Milestone, Result, Action, Sub-action). Only the Name is required.",
  },
  {
    key: TEMPLATE_KEYS.accountsTaskList,
    name: "Accounts — Task List",
    module: "Accounts",
    feature: "Accounts → Task List → Bulk Upload",
    fileName: "Accounts-Task-List-Template.xlsx",
    contentType: XLSX_CONTENT_TYPE,
    note: "Accounts task-list and screenshots-to-post workbook (two sheets).",
  },
];

export function templateDef(key: string): TemplateDef | undefined {
  return TEMPLATE_REGISTRY.find((t) => t.key === key);
}
