import "server-only";

/**
 * The fixed set of bulk-import templates the Upload Master manages.
 *
 * A template key here is the address the rest of the app talks to — the download
 * routes resolve "override if present, else built-in" against it, and the
 * `template_files` table stores overrides by the same key. Adding a new bulk
 * import means adding a key here AND a `buildTemplate` case (lib/templates/
 * resolve.ts); nothing else needs to learn the list.
 */

export const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export interface TemplateDef {
  key: string;
  name: string;
  /** The built-in download filename (used when there is no override). */
  fileName: string;
  contentType: string;
  note: string;
}

export const TEMPLATE_REGISTRY: readonly TemplateDef[] = [
  {
    key: "tasks",
    name: "Tasks — Bulk Import",
    fileName: "Altus-Tasks-Template.xlsx",
    contentType: XLSX_CONTENT_TYPE,
    note: "Tasks bulk-import workbook (four sheets).",
  },
  {
    key: "goals",
    name: "Goals — Bulk Import",
    fileName: "Altus-Goals-Template.xlsx",
    contentType: XLSX_CONTENT_TYPE,
    note: "Goals bulk-import workbook, one template for every level.",
  },
  {
    key: "accounts-task-list",
    name: "Accounts — Task List",
    fileName: "Accounts-Task-List-Template.xlsx",
    contentType: XLSX_CONTENT_TYPE,
    note: "Accounts task-list and screenshots-to-post workbook.",
  },
];

export function templateDef(key: string): TemplateDef | undefined {
  return TEMPLATE_REGISTRY.find((t) => t.key === key);
}
