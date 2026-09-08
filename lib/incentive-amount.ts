import { INCENTIVE_TYPE_LABELS, type IncentiveType } from "@/db/enums";

/**
 * Default ₹ amount for a freshly-submitted incentive request, derived from the
 * scheme chart (3.Incentive Chart). Admins can override per row, so these are
 * just sensible starting values. Client-safe.
 */
export function defaultIncentiveAmount(
  type: IncentiveType,
  d: Record<string, string>,
): number {
  switch (type) {
    case "bss_conversion":
      if (d.conversion === "Direct") return 2000;
      if (d.conversion === "1st Attempt") return 1000;
      if (d.conversion === "2nd Attempt") return 500;
      return 0;
    case "sales_pitch":
      return 250; // Consulting Pitch
    case "group_intro":
      if (d.event_type === "Key Note") return 500;
      if (["Ascent Intro", "BNI Intro", "Jito Intro"].includes(d.event_type ?? "")) return 250;
      return 0;
    case "client_happiness":
      switch (d.happiness_type) {
        case "Interview": return 100;
        case "Case Study": return 200;
        case "Google Review": return 50;
        case "LinkedIn Testimonial": return 75;
        default: return 0;
      }
  }
}

/** Short display label for a request (the scheme it maps to). */
export function incentiveLabel(type: IncentiveType, d: Record<string, string>): string {
  switch (type) {
    case "bss_conversion": return `BSS Convert ${d.conversion ?? ""}`.trim();
    case "sales_pitch": return "Consulting Pitch";
    case "group_intro": return d.event_type || "Group Introduction";
    case "client_happiness": return d.happiness_type || "Client Happiness";
  }
}

export interface ConditionField {
  key: string;
  label: string;
  options: readonly string[];
}

/**
 * Per-scheme manual gating columns — the "to fill manually" columns that used
 * to live in the source sheets. Admin-only; shown on the entry's detail row.
 */
export const INCENTIVE_CONDITION_FIELDS: Record<IncentiveType, readonly ConditionField[]> = {
  bss_conversion: [
    { key: "money_received", label: "Money received in bank?", options: ["Yes", "No"] },
  ],
  sales_pitch: [
    { key: "pitched", label: "Pitched?", options: ["Yes", "No"] },
    { key: "sales_resolution", label: "Sales Resolution", options: ["Won", "Lost", "In Progress"] },
    { key: "money_received", label: "Money received?", options: ["Yes", "No"] },
  ],
  client_happiness: [
    { key: "internal_approval", label: "Internal Approval", options: ["Approved", "Pending", "Rejected"] },
    { key: "client_approval", label: "Client Approval", options: ["Approved", "Pending", "Rejected", "NA"] },
    { key: "uploaded_sales", label: "Uploaded to Sales team?", options: ["Yes", "No"] },
  ],
  group_intro: [
    { key: "event_done", label: "Event Done?", options: ["Yes", "No"] },
  ],
};

/** Unpaid only accrues once approved (matches the sheet's Approved-Amt − Paid). */
export function incentiveUnpaid(row: {
  status: string;
  amount: number;
  paidAmt: number;
}): number {
  if (row.status !== "approved") return 0;
  return Math.max(0, row.amount - row.paidAmt);
}

/** Friendly name for a ledger row — scheme label for forms, project name for projects. */
export function incentiveDisplayName(type: IncentiveType | "project" | "sheet" | "weekly_goal", label: string | null): string {
  if (type === "project") return label || "Project incentive";
  if (type === "sheet") return label || "Sheet incentive";
  if (type === "weekly_goal") return label || "Weekly Goal incentive";
  return INCENTIVE_TYPE_LABELS[type] ?? label ?? "Incentive";
}
