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
  variants?: readonly TemplateVariant[];
}

export interface TemplateField {
  id: string;
  label: string;
}

export interface TemplateVariant {
  id: string;
  label: string;
  fields: readonly TemplateField[];
  defaultRequired: readonly string[];
}

export function templateFieldId(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function schema(id: string, label: string, required: readonly string[], fields: readonly string[], fieldIds?: readonly string[]): TemplateVariant {
  return {
    id,
    label,
    fields: fields.map((label, index) => ({ id: fieldIds?.[index] ?? templateFieldId(label), label })),
    defaultRequired: required.map((label) => {
      const index = fields.indexOf(label);
      return index >= 0 ? fieldIds?.[index] ?? templateFieldId(label) : templateFieldId(label);
    }),
  };
}

export const TEMPLATE_REGISTRY: readonly TemplateDef[] = [
  {
    key: TEMPLATE_KEYS.tasks,
    name: "Tasks — Bulk Import",
    module: "WMS",
    feature: "Tasks → Bulk Upload",
    fileName: "Altus-Tasks-Template.xlsx",
    contentType: XLSX_CONTENT_TYPE,
    variants: [schema("default", "Tasks", ["Client", "Subject", "Task Description", "Doer", "Due Date"], ["Task ID", "Task No.", "Client", "Subject / Category", "Task Description", "Notes", "Doer (Assignee)", "Initiator", "Priority", "Status", "Due Date", "Revised Due Date", "Starts At", "Ends At", "All Day?", "Recurrence", "Tags", "Created By"], ["taskId", "taskNo", "client", "subject", "description", "notes", "doer", "initiator", "priority", "status", "dueDate", "revisedTargetDate", "startsAt", "endsAt", "allDay", "recurrence", "tags", "createdBy"])],
    note: "Tasks bulk-import workbook (four sheets). Required columns: Client, Subject, Task Description, Doer, Due Date.",
  },
  {
    key: TEMPLATE_KEYS.goals,
    name: "Goals — Bulk Import",
    module: "Goals",
    feature: "Goals → Bulk Import (and the Week / Day board levels)",
    fileName: "Altus-Goals-Template.xlsx",
    contentType: XLSX_CONTENT_TYPE,
    variants: [schema("default", "Goals", ["Goal Title"], ["Goal Level", "Goal Title", "Year", "Quarter", "Month", "Area", "Client", "Measure", "Target", "Actual", "Type", "Weight", "Target Date", "Goal Owner"], ["level", "title", "year", "quarter", "month", "area", "client", "uom", "targetQty", "actualQty", "category", "weight", "targetDate", "owner"])],
    note: "Level-agnostic Goals workbook — the level is taken from the board at upload time. Serves the cascade importer and every board level without a template of its own.",
  },
  {
    key: TEMPLATE_KEYS.weeklyGoals,
    name: "Weekly Goals — Bulk Import",
    module: "Goals",
    feature: "Goals → Weekly Goals → Bulk Upload",
    fileName: "Weekly-Goals-Template.xlsx",
    contentType: XLSX_CONTENT_TYPE,
    variants: [schema("default", "Weekly Goals", ["Target"], ["Client", "Subject", "Priority", "Target Date", "Incentive", "KPI", "Target", "% Done", "Explanation", "Notes", "Link", "Employee"], ["client", "subject", "priority", "targetDate", "incentive", "kpi", "target", "percentDone", "explanation", "notes", "link", "employee"])],
    note: "Weekly Goals workbook. Columns: Client, Subject, Priority, Target Date, Incentive, KPI, Target, % Done, Explanation, Notes, Link, Employee.",
  },
  {
    key: TEMPLATE_KEYS.monthlyGoals,
    name: "Monthly Goals — Bulk Import",
    module: "Goals",
    feature: "Goals → Monthly Goals → Bulk Upload",
    fileName: "Altus-Goals-Template-Monthly.xlsx",
    contentType: XLSX_CONTENT_TYPE,
    variants: [schema("month", "Monthly Goals", ["Goal Title"], ["Goal Title", "Area", "Measure", "Target", "Actual", "Type", "Weight", "Target Date"], ["title", "area", "uom", "targetQty", "actualQty", "category", "weight", "targetDate"])],
    note: "The Monthly Goals board's workbook, pre-scoped to the month in view.",
  },
  {
    key: TEMPLATE_KEYS.quarterlyGoals,
    name: "Quarterly Goals — Bulk Import",
    module: "Goals",
    feature: "Goals → Quarterly Goals → Bulk Upload",
    fileName: "Altus-Goals-Template-Quarterly.xlsx",
    contentType: XLSX_CONTENT_TYPE,
    variants: [schema("quarter", "Quarterly Goals", ["Goal Title"], ["Goal Title", "Area", "Measure", "Target", "Actual", "Type", "Weight", "Target Date"], ["title", "area", "uom", "targetQty", "actualQty", "category", "weight", "targetDate"])],
    note: "The Quarterly Goals board's workbook, pre-scoped to the quarter in view.",
  },
  {
    key: TEMPLATE_KEYS.yearlyGoals,
    name: "Yearly Goals — Bulk Import",
    module: "Goals",
    feature: "Goals → Yearly Goals → Bulk Upload",
    fileName: "Altus-Goals-Template-Yearly.xlsx",
    contentType: XLSX_CONTENT_TYPE,
    variants: [schema("year", "Yearly Goals", ["Goal Title"], ["Goal Title", "Area", "Measure", "Target", "Actual", "Type", "Weight", "Target Date"], ["title", "area", "uom", "targetQty", "actualQty", "category", "weight", "targetDate"])],
    note: "The Yearly Goals board's workbook, pre-scoped to the financial year in view.",
  },
  {
    key: TEMPLATE_KEYS.projects,
    name: "Projects — Bulk Import",
    module: "Projects",
    feature: "Projects → Bulk Upload",
    fileName: "Project-Plan-Template.xlsx",
    contentType: XLSX_CONTENT_TYPE,
    variants: [schema("project", "Project", ["Name"], ["Name", "Owner", "Target Date", "Description"], ["name", "owner", "targetDate", "description"]), schema("milestone", "Milestone", ["Name"], ["Name", "Owner", "Target Date", "Description"], ["name", "owner", "targetDate", "description"]), schema("result", "Result", ["Name"], ["Name", "Owner", "Target Date", "Description"], ["name", "owner", "targetDate", "description"]), schema("action", "Action", ["Name"], ["Name", "Owner", "Target Date", "Start Date", "End Date", "Description"], ["name", "owner", "targetDate", "startsAt", "endsAt", "description"]), schema("sub_action", "Sub-action", ["Name"], ["Name", "Owner", "Target Date", "Start Date", "End Date", "Description"], ["name", "owner", "targetDate", "startsAt", "endsAt", "description"])],
    note: "Project Plan workbook — one column set per plan kind (Project, Milestone, Result, Action, Sub-action). Only the Name is required.",
  },
  {
    key: TEMPLATE_KEYS.accountsTaskList,
    name: "Accounts — Task List",
    module: "Accounts",
    feature: "Accounts → Task List → Bulk Upload",
    fileName: "Accounts-Task-List-Template.xlsx",
    contentType: XLSX_CONTENT_TYPE,
    variants: [schema("task_list", "Accounts Task List", ["Area", "Task Description"], ["Sr. No.", "Area", "Task Description", "Status", "Links", "Target Date", "Actual Date", "Gear", "Notes"]), schema("screenshots", "Screenshots to Post", ["Project Name", "Project Details"], ["Sr. No.", "Project Name", "Project Details", "Frequency", "Target Date", "Actual Date", "Gear", "Notes"])],
    note: "Accounts task-list and screenshots-to-post workbook (two sheets).",
  },
  {
    key: TEMPLATE_KEYS.wcc, name: "DCC — WCC Bulk Import", module: "DCC", feature: "WCC → Bulk Upload",
    fileName: "WCC-Compliance-Template.xlsx", contentType: XLSX_CONTENT_TYPE,
    variants: [schema("default", "WCC", ["Employee", "Compliance", "Frequency"], ["Employee", "Section", "Compliance", "Frequency", "Days", "Mins", "Target", "Unit"], ["employee", "section", "compliance", "frequency", "days", "mins", "target", "unit"])],
    note: "WCC compliance workbook generated by the existing compliance template builder.",
  },
  {
    key: TEMPLATE_KEYS.mcc, name: "DCC — MCC Bulk Import", module: "DCC", feature: "MCC → Bulk Upload",
    fileName: "MCC-Compliance-Template.xlsx", contentType: XLSX_CONTENT_TYPE,
    variants: [schema("default", "MCC", ["Employee", "Compliance", "Frequency", "Deadline Day"], ["Employee", "Section", "Compliance", "Frequency", "Deadline Day", "2nd Deadline Day", "3rd Deadline Day", "Due Month", "Target", "Unit"], ["employee", "section", "compliance", "frequency", "day1", "day2", "day3", "dueMonth", "target", "unit"])],
    note: "MCC compliance workbook generated by the existing compliance template builder.",
  },
  {
    key: TEMPLATE_KEYS.operationsChecklist, name: "Operations — Checklist Bulk Import", module: "Operations", feature: "Checklist → Bulk Upload",
    fileName: "Operations-Checklist-Template.xlsx", contentType: XLSX_CONTENT_TYPE,
    variants: [schema("run", "Checklist run", ["Task"], ["Client", "Subject", "Task", "Doer", "Initiator", "Target Date", "Frequency"], ["client", "subject", "task", "doer", "initiator", "date", "frequency"]), schema("run_event", "Event checklist run", ["Task"], ["Client", "Subject", "Task", "Doer", "Initiator", "Day", "Frequency"], ["client", "subject", "task", "doer", "initiator", "day", "frequency"]), schema("master", "Checklist master", ["Task"], ["Task", "Subject", "Doer", "Backup", "Instructions", "File link"], ["task", "subject", "doer", "backup", "instructions", "fileLink"]), schema("master_event", "Event checklist master", ["Task"], ["Task", "Subject", "Day", "Doer", "Backup", "Instructions", "File link"], ["task", "subject", "day", "doer", "backup", "instructions", "fileLink"])],
    note: "Contextual checklist workbook; target and event context select its schema.",
  },
  {
    key: TEMPLATE_KEYS.jobDescriptions, name: "Operations — Job Description Bulk Import", module: "Operations", feature: "Job Descriptions → Bulk Upload",
    fileName: "JD-Bulk-Template.xlsx", contentType: XLSX_CONTENT_TYPE,
    variants: [schema("generic", "Generic JD", ["Task"], ["Position", "Person", "Function", "Client", "Subject", "Task", "Frequency", "Time (mins)", "Video URL", "Guidelines URL", "Template URL", "Notes", "Add to DCC", "Add to WMS", "Add to Event", "Assign To"], ["position", "person", "function", "client", "category", "task", "frequency", "minutes", "video", "guidelines", "template", "notes", "dcc", "wms", "event", "assignTo"]), schema("person", "Person JD", ["Task"], ["Position", "Person", "Function", "Client", "Subject", "Task", "Frequency", "Time (mins)", "Video URL", "Guidelines URL", "Template URL", "Notes", "Add to DCC", "Add to WMS", "Add to Event", "Assign To"], ["position", "person", "function", "client", "category", "task", "frequency", "minutes", "video", "guidelines", "template", "notes", "dcc", "wms", "event", "assignTo"])],
    note: "Contextual Job Description workbook generated from existing JD columns.",
  },
  {
    key: TEMPLATE_KEYS.vendors, name: "Operations — Vendor Directory Bulk Import", module: "Operations", feature: "Vendor Directory → Bulk Entry",
    fileName: "Vendor-Directory-Template.xlsx", contentType: XLSX_CONTENT_TYPE,
    variants: [schema("default", "Vendor Directory", ["Category", "First Name", "Last Name", "Company Name", "Cell No", "WhatsApp Cell No"], ["Category", "First Name", "Last Name", "Company Name", "Cell No", "WhatsApp Cell No", "Email Address", "Address Line 1", "Address Line 2", "Address Line 3", "Address Line 4", "Nearby Landmark", "City", "State", "Pincode", "Website", "AMC", "Vendor Office Open Time", "Vendor Office End Time", "Additional Links", "Notes"], ["category", "firstName", "lastName", "companyName", "cellNo", "whatsappCellNo", "email", "addressLine1", "addressLine2", "addressLine3", "addressLine4", "landmark", "city", "state", "pincode", "website", "amc", "officeOpenTime", "officeEndTime", "additionalLinks", "notes"])],
    note: "Vendor workbook is dynamically generated from Vendor Category Master; its Category dropdown and importer use the same source.",
  },
  {
    key: TEMPLATE_KEYS.incentiveEntries, name: "Incentive — Entries Bulk Import", module: "Incentive", feature: "Incentive Entries → Import",
    fileName: "Incentive-Entries-Import-Template.xlsx", contentType: XLSX_CONTENT_TYPE,
    variants: [schema("default", "Incentive Entries", ["Employee ID", "Employee Name", "Incentive Product", "Period Month", "Amount", "Approved", "Paid"], ["Employee ID", "Employee Name", "Incentive Product", "Period Month", "Amount", "Approved", "Approved Amount", "Approved Date", "Paid", "Paid Amount", "Paid Date", "Note"], ["employeeId", "empName", "incentiveName", "periodMonth", "amount", "approved", "approvedAmt", "approvedDate", "paid", "paidAmt", "paidDate", "note"])],
    note: "Incentive entry workbook generated by existing template exporter.",
  },
  {
    key: TEMPLATE_KEYS.outstanding, name: "Billing — Outstanding Bulk Import", module: "Billing", feature: "Outstanding → Import",
    fileName: "Outstanding-Import-Template.xlsx", contentType: XLSX_CONTENT_TYPE,
    variants: [schema("default", "Outstanding", [], ["S. No.", "First Name", "Last Name", "Cell No", "Product", "Responsible Person", "Amount", "GST", "Total", "Paid Amt", "Balance", "Payment Cycle", "Due Date", "Retainer Start Date", "Retainer End Date", "Bill Date", "Start Date", "End Date", "No. of Subscription", "Subscription Start Date", "Frequency", "Entity", "Payment Mode", "PDC Received", "Other Comments", "Attachments"])],
    note: "Existing blank Outstanding import workbook.",
  },
  {
    key: TEMPLATE_KEYS.collections, name: "Billing — Collection Bulk Import", module: "Billing", feature: "Outstanding → Collection Import",
    fileName: "Collection-Import-Template.xlsx", contentType: XLSX_CONTENT_TYPE,
    variants: [schema("default", "Collection", [], ["S.No", "Name", "Amount", "Payment Mode", "Responsible Person", "Other Comments", "Attachments"])],
    note: "Existing blank Collection import workbook.",
  },
];

export function templateDef(key: string): TemplateDef | undefined {
  return TEMPLATE_REGISTRY.find((t) => t.key === key);
}
