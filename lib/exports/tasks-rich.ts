import { format } from "date-fns";
import { STATUS_LABELS_FALLBACK } from "@/lib/format";
import { PRIORITY_LABELS, type ApprovalStatus } from "@/db/enums";
import type { TaskExportRow } from "@/lib/queries/tasks";

/**
 * Rich-export columns shared between XLSX and PDF task exports.
 *
 * Both routes display human-readable labels (status, priority, approval)
 * and date-fns-formatted dates rather than raw enum values + ISO strings.
 * The CSV export at /tasks/export keeps its raw enum-based payload so
 * downstream automations (Zapier, scripts) aren't broken — these two
 * formats are designed for humans.
 */

export const RICH_EXPORT_HEADERS = [
  "Client Name",
  "Subject",
  "Status",
  "Approval Status",
  "Priority",
  "Doer",
  "Initiator",
  "Due Date",
  "Revised Target Date",
  "Created At",
  "Tags",
] as const;

const APPROVAL_LABEL: Record<ApprovalStatus, string> = {
  approved: "Approved",
  not_approved: "Not Approved",
  cancelled: "Cancelled",
  transferred: "Transferred",
};

const fmtDate = (d: Date | null | undefined): string =>
  d ? format(d, "MMM d, yyyy") : "";

export interface RichRow {
  clientName: string;
  subject: string;
  status: string;
  approvalStatus: string;
  priority: string;
  doer: string;
  initiator: string;
  dueDate: string;
  revisedTargetDate: string;
  createdAt: string;
  tags: string;
}

export function toRichRow(t: TaskExportRow): RichRow {
  return {
    clientName: t.title,
    subject: t.subject ?? "",
    status: STATUS_LABELS_FALLBACK[t.status] ?? t.status,
    approvalStatus: t.approvalStatus ? APPROVAL_LABEL[t.approvalStatus] : "—",
    priority: PRIORITY_LABELS[t.priority] ?? t.priority,
    doer: t.doerName ?? "",
    initiator: t.initiatorName ?? "",
    dueDate: fmtDate(t.dueAt),
    revisedTargetDate: fmtDate(t.revisedTargetDate),
    createdAt: fmtDate(t.createdAt),
    tags: t.tags && t.tags.length > 0 ? t.tags.join(", ") : "",
  };
}

/** Positional array variant — preserves the RICH_EXPORT_HEADERS order. */
export function toRichRowArray(t: TaskExportRow): string[] {
  const r = toRichRow(t);
  return [
    r.clientName,
    r.subject,
    r.status,
    r.approvalStatus,
    r.priority,
    r.doer,
    r.initiator,
    r.dueDate,
    r.revisedTargetDate,
    r.createdAt,
    r.tags,
  ];
}

export function richExportFilename(
  ext: "xlsx" | "pdf",
  date: Date = new Date(),
): string {
  const iso = date.toISOString().slice(0, 10);
  return `altus-corp-tasks-${iso}.${ext}`;
}
