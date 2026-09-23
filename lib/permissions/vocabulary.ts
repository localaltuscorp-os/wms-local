/**
 * THE CONTROL PANEL ACTION + SCOPE VOCABULARY.
 *
 * The existing permission enforcement is `module_permissions` with three booleans
 * (show / view / edit). The Control Panel's Roles layer speaks a RICHER language
 * — fifteen actions and seven data scopes — because that is what an administrator
 * reasons about. This module keeps that language as DATA, and maps it onto the
 * existing three-boolean matrix so nothing new has to be enforced.
 *
 * PURE — no `server-only`, no DB, so the UI and the unit tests share it.
 */

export const PERMISSION_ACTIONS = [
  "view",
  "create",
  "edit",
  "delete",
  "approve",
  "reject",
  "export",
  "import",
  "upload",
  "download",
  "manage",
  "configure",
  "publish",
  "payment",
  "override",
] as const;

export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

export const PERMISSION_ACTION_LABELS: Record<PermissionAction, string> = {
  view: "View",
  create: "Create",
  edit: "Edit",
  delete: "Delete",
  approve: "Approve",
  reject: "Reject",
  export: "Export",
  import: "Import",
  upload: "Upload",
  download: "Download",
  manage: "Manage",
  configure: "Configure",
  publish: "Publish",
  payment: "Payment",
  override: "Override",
};

export function isPermissionAction(v: string): v is PermissionAction {
  return (PERMISSION_ACTIONS as readonly string[]).includes(v);
}

export const DATA_SCOPES = [
  "own",
  "team",
  "downline",
  "function",
  "department",
  "company",
  "selected_users",
] as const;

export type DataScope = (typeof DATA_SCOPES)[number];

export const DATA_SCOPE_LABELS: Record<DataScope, string> = {
  own: "Own",
  team: "Team",
  downline: "Downline",
  function: "Function",
  department: "Department",
  company: "Company",
  selected_users: "Selected Users",
};

export function isDataScope(v: string | null | undefined): v is DataScope {
  return !!v && (DATA_SCOPES as readonly string[]).includes(v);
}

/**
 * Map a rich action onto the existing three-boolean matrix. Read-class actions
 * need `can_view`; every mutating action needs `can_edit`. This is what lets the
 * richer vocabulary stay DATA while enforcement stays the existing matrix.
 */
export function actionToEnforcement(action: PermissionAction): "view" | "edit" {
  return action === "view" || action === "export" || action === "download"
    ? "view"
    : "edit";
}

/** Actions that are read-only (for "only show actions that make sense" filters). */
export const READ_ACTIONS = new Set<PermissionAction>(["view", "export", "download"]);
