/**
 * Hidden operational roles assignable by a database-backed Super Admin.
 * The catalogue is code because every key must correspond to an enforced
 * server guard; holders live only in the database.
 */
export const SECURITY_ROLES = [
  "founder",
  "account_unlock",
  "device_exempt",
  "device_manage",
  "attendance_manage",
  "attendance_audit_view",
  "attendance_settings_manage",
  "remote_work_approve",
  "client_location_edit",
  "delegated_access_manage",
  "daily_start_exempt",
  "dcc_past_entry_edit",
  "dcc_protected_kpi_author",
  "task_roster_manage",
  "task_doer_reassign",
  "billing_entity_delete",
  "incentive_review",
  "incentive_scheme_edit",
  "incentive_eligibility_manage",
  "index_hub_delete",
  "hr_intake_operate",
  "hr_declaration_custodian",
  "hr_records_export",
  "module_backup_export_all",
  "handholding_roster_manage",
  "handholding_participant_delete",
  "handholding_admin_access",
  "external_dashboard_view",
] as const;

export type SecurityRole = (typeof SECURITY_ROLES)[number];
export type SecurityRoleCategory = "Security" | "Attendance" | "Work" | "Finance" | "HR" | "Operations";

export interface SecurityRoleDef {
  key: SecurityRole;
  label: string;
  blurb: string;
  caution: string;
  category: SecurityRoleCategory;
  /** False until every legacy runtime guard reads this database role. */
  enforced: boolean;
}

function role(
  key: SecurityRole,
  label: string,
  blurb: string,
  category: SecurityRoleCategory,
  enforced = false,
): SecurityRoleDef {
  return {
    key,
    label,
    blurb,
    category,
    enforced,
    caution: enforced
      ? "Changes take effect on the guarded feature immediately."
      : "Assignment is stored and audited, but the legacy feature guard still needs migration before this role controls access.",
  };
}

export const SECURITY_ROLE_DEFS: Record<SecurityRole, SecurityRoleDef> = {
  founder: role("founder", "Founder", "Founder-only reporting, approvals and organisation-root authority.", "Security", true),
  account_unlock: role("account_unlock", "Account Unlocker", "Release employee accounts locked after failed sign-ins.", "Security", true),
  device_exempt: role("device_exempt", "Device Restriction Exemption", "Use the system without registering the current device.", "Security"),
  device_manage: role("device_manage", "Device Manager", "Approve, register and revoke employee devices.", "Security"),
  attendance_manage: role("attendance_manage", "Attendance Manager", "Edit other employees' attendance and override locks.", "Attendance"),
  attendance_audit_view: role("attendance_audit_view", "Attendance Audit Viewer", "Read the attendance change history.", "Attendance"),
  attendance_settings_manage: role("attendance_settings_manage", "Attendance Settings Administrator", "Manage device, office IP and attendance settings.", "Attendance"),
  remote_work_approve: role("remote_work_approve", "Remote Work Approver", "Approve or reject remote-work requests.", "Attendance"),
  client_location_edit: role("client_location_edit", "Client Location Editor", "Add and maintain trusted client locations.", "Attendance"),
  delegated_access_manage: role("delegated_access_manage", "Delegated Access Administrator", "Grant temporary access to any employee account.", "Security"),
  daily_start_exempt: role("daily_start_exempt", "Daily Start Exemption", "Bypass Start My Day and compulsory planning gates.", "Work"),
  dcc_past_entry_edit: role("dcc_past_entry_edit", "Closed DCC Editor", "Edit DCC entries after the business day closes.", "Work"),
  dcc_protected_kpi_author: role("dcc_protected_kpi_author", "Protected KPI Author", "Prevent others from deleting KPIs created by the holder.", "Work"),
  task_roster_manage: role("task_roster_manage", "Task List Manager", "Manage shared Subject and Client lists.", "Work"),
  task_doer_reassign: role("task_doer_reassign", "Task Doer Reassigner", "Reassign task doers without a reporting relationship.", "Work"),
  billing_entity_delete: role("billing_entity_delete", "Billing Entity Deleter", "Delete Billing Master entities.", "Finance"),
  incentive_review: role("incentive_review", "Incentive Reviewer", "Approve or reject incentive requests.", "Finance"),
  incentive_scheme_edit: role("incentive_scheme_edit", "Incentive Scheme Editor", "Create, change and delete incentive schemes.", "Finance"),
  incentive_eligibility_manage: role("incentive_eligibility_manage", "Incentive Eligibility Manager", "Decide which employees are eligible for incentives.", "Finance"),
  index_hub_delete: role("index_hub_delete", "Index Hub Deleter", "Delete Index Hub sections and links.", "Operations"),
  hr_intake_operate: role("hr_intake_operate", "HR Intake Operator", "Complete onboarding forms and candidate evaluations without full HR access.", "HR"),
  hr_declaration_custodian: role("hr_declaration_custodian", "Declaration Custodian", "Manage and read all signed employee declarations.", "HR"),
  hr_records_export: role("hr_records_export", "HR Records Exporter", "Export complete HR records outside normal HR access.", "HR"),
  module_backup_export_all: role("module_backup_export_all", "Module Backup Exporter", "Export backups for all modules.", "Security"),
  handholding_roster_manage: role("handholding_roster_manage", "Handholding Roster Owner", "Maintain Handholding people and participant records.", "Operations"),
  handholding_participant_delete: role("handholding_participant_delete", "Handholding Participant Deleter", "Delete participants and related section entries.", "Operations"),
  handholding_admin_access: role("handholding_admin_access", "Handholding Admin Access", "Open the restricted Handholding administration area.", "Operations"),
  external_dashboard_view: role("external_dashboard_view", "External Dashboard Viewer", "Open the external operational dashboards.", "Operations"),
};

export const SECURITY_ROLE_LIST = SECURITY_ROLES.map((key) => SECURITY_ROLE_DEFS[key]);

export function isSecurityRole(value: string): value is SecurityRole {
  return (SECURITY_ROLES as readonly string[]).includes(value);
}
