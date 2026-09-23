/**
 * THE TEMPLATE KEYS — the addresses the whole application shares.
 *
 * Pure and client-safe on purpose: the upload dialogs (client components) build
 * their download URL from here, and the registry (server-only) names the same
 * constants. There is exactly ONE place a key is written down, so a module
 * cannot ask Upload Master for a template nobody registered, and a key cannot
 * drift between the two halves of the app.
 *
 * ── WHY A KEY IS AN ADDRESS ────────────────────────────────────────────────
 * `template_files` stores an admin's replacement against a key. A download
 * route resolves "override if present, else built-in" for that key — so the key
 * is what connects a module's "Download Template" button to the file an
 * administrator replaced in Admin Panel → Upload Master. Renaming a key
 * therefore ORPHANS its override row; treat these strings as data.
 */

export const TEMPLATE_KEYS = {
  /** WMS → Tasks → Bulk Upload. */
  tasks: "tasks",
  /** Goals → Bulk Import (the cascade importer, level-agnostic). */
  goals: "goals",
  /** Goals → Weekly Goals → Bulk Upload. */
  weeklyGoals: "weekly_goals_bulk_import",
  /** Goals → Monthly Goals → Bulk Upload. */
  monthlyGoals: "monthly_goals_bulk_import",
  /** Goals → Quarterly Goals → Bulk Upload. */
  quarterlyGoals: "quarterly_goals_bulk_import",
  /** Goals → Yearly Goals → Bulk Upload. */
  yearlyGoals: "yearly_goals_bulk_import",
  /** Projects → Bulk Upload (one template per plan kind, see `kind`). */
  projects: "projects_bulk_import",
  /** Accounts → Task List (+ Screenshots to Post) → Bulk Upload. */
  accountsTaskList: "accounts-task-list",
} as const;

export type TemplateKey = (typeof TEMPLATE_KEYS)[keyof typeof TEMPLATE_KEYS];

/**
 * The GOALS BOARD's per-level template key.
 *
 * Each level page downloads its OWN template, so an administrator can replace
 * the Monthly template without touching the Yearly one. The levels with no
 * template of their own — `week`, `day` — fall back to the level-agnostic Goals
 * workbook, which is the schema every level of this board parses.
 *
 * NOT the same thing as `weeklyGoals`: that key belongs to the Weekly Goals
 * module's own importer (components/weekly-goals/weekly-goals-import.tsx),
 * whose columns are a different set. Mapping a level onto it would hand a level
 * of this board a workbook its parser cannot read — the exact mismatch the
 * registry exists to prevent.
 */
const GOAL_LEVEL_KEYS: Record<string, TemplateKey> = {
  month: TEMPLATE_KEYS.monthlyGoals,
  quarter: TEMPLATE_KEYS.quarterlyGoals,
  year: TEMPLATE_KEYS.yearlyGoals,
};

export function goalLevelTemplateKey(level: string | null | undefined): TemplateKey {
  return (level && GOAL_LEVEL_KEYS[level]) || TEMPLATE_KEYS.goals;
}

/** Everything a template download URL may carry beyond the key. */
export interface TemplateHrefOptions {
  /** Goals boards: the level the workbook is pre-scoped to (`month`, `year`…). */
  level?: string | null;
  /** Goals boards: the period bucket the workbook is titled for. */
  periodKey?: string | null;
  /** Project Plan: the plan kind (`project`, `milestone`, `action`…). */
  kind?: string | null;
}

/**
 * THE one download URL. Every "Download Template" button in the application
 * points here, whatever module it belongs to.
 */
export function templateHref(key: TemplateKey, opts: TemplateHrefOptions = {}): string {
  const q = new URLSearchParams();
  if (opts.level) q.set("level", opts.level);
  if (opts.periodKey) q.set("periodKey", opts.periodKey);
  if (opts.kind) q.set("kind", opts.kind);
  const qs = q.toString();
  return `/api/templates/${key}${qs ? `?${qs}` : ""}`;
}
