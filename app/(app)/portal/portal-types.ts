/**
 * Employee Self-Service Portal — shared types.
 *
 * Pure type module (no "use server", no runtime). Imported by the server
 * loaders (`./actions`), the page and the client `PortalScreen`. Everything is
 * PER-EMPLOYEE: these shapes only ever describe the signed-in person's own data.
 */

/** One monthly payslip, already reduced to what the slip UI renders. */
export interface PortalPayslip {
  id: string;
  /** Canonical "YYYY-MM" month key (newest-first ordering key). */
  month: string;
  /** Human label, e.g. "Apr 2026". */
  monthLabel: string;
  /** Financial-year label, e.g. "FY 26-27". */
  fy: string;
  companyName: string | null;
  designation: string | null;
  /** Monthly CTC (rupees) — the gross reference figure. */
  monthlyCtc: number;
  /** Annual CTC (rupees). */
  annualCtc: number;
  /** EFFECTIVE net take-home (base + condoned wave-off + pre-payout adjust). */
  net: number;
  paid: boolean;
  paidAt: string | null;
}

/** Per-FY-quarter net total (Apr–Jun / Jul–Sep / Oct–Dec / Jan–Mar). */
export interface PortalQuarterTotal {
  /** Stable sort/react key, e.g. "2026-Q1". */
  key: string;
  /** e.g. "Q1", the quarter within its FY. */
  quarter: string;
  /** Financial-year label, e.g. "FY 26-27". */
  fy: string;
  /** Sum of net across the quarter's paid+unpaid slips. */
  total: number;
  /** Number of slips folded into this quarter. */
  count: number;
}

/** Per-FY net total. */
export interface PortalAnnualTotal {
  fy: string;
  total: number;
  count: number;
}

export interface PortalPayslips {
  rows: PortalPayslip[];
  quarters: PortalQuarterTotal[];
  annual: PortalAnnualTotal[];
  /** Sum of net across every slip on file. */
  grandTotal: number;
}

/** One of the person's letters / correspondence documents. */
export interface PortalDocument {
  id: string;
  typeKey: string;
  title: string;
  /** 'draft' | 'sent' | 'acknowledged' | 'signed' (raw instance status). */
  status: string;
  issuedAt: string | null;
  /** Freshly-signed download URL when a signed archive exists, else null. */
  signedUrl: string | null;
}

export interface PortalDocuments {
  letters: PortalDocument[];
  correspondence: PortalDocument[];
}

/** One policy the person is (or should be) signatory to. */
export interface PortalPolicy {
  key: string;
  title: string;
  /** 'pending' | 'signed'. */
  status: string;
  signedAt: string | null;
}

export interface PortalPolicies {
  rows: PortalPolicy[];
}

/** typeKeys treated as "Correspondence" rather than formal "Letters". */
export const CORRESPONDENCE_TYPE_KEYS: ReadonlySet<string> = new Set([
  "birthday",
  "employee-of-the-month",
]);

/**
 * The data behind an in-app Salary Certificate — the signed-in employee's
 * current employment snapshot, distilled from their LATEST salary row plus the
 * earliest→latest month span for tenure. `null` when the person has no salary
 * rows on file (nothing to certify).
 */
export interface PortalSalaryCertificate {
  /** Full legal name of the employee (from requireUser). */
  employeeName: string;
  /** Current designation (latest salary row). */
  designation: string | null;
  /** Raw paying-entity name as stored on the salary row. */
  companyName: string | null;
  /** Resolved paying entity — display + legal name + slug for the letterhead. */
  entity: { id: string; displayName: string; legalName: string };
  /** Current annual CTC (rupees). */
  annualCtc: number;
  /** Current monthly CTC (rupees). */
  monthlyCtc: number;
  /** Earliest month on file ("YYYY-MM") + its human label — tenure start. */
  firstMonth: string;
  firstMonthLabel: string;
  /** Latest month on file ("YYYY-MM") + its human label. */
  latestMonth: string;
  latestMonthLabel: string;
  /** Number of monthly salary rows on file. */
  monthsCount: number;
}

/** One attachment on a submitted form — a read-only view for the employee. */
export interface PortalFormFile {
  fileName: string;
  /** Freshly-signed download URL (upload) or external link, else null. */
  signedUrl: string | null;
  /** true when the attachment is an external link, not an uploaded file. */
  isLink: boolean;
}

/**
 * The signed-in employee's OWN onboarding submission (the form THEY filled),
 * scoped to `me.id`. `exists` is false when they've never opened the form.
 */
export interface PortalOnboarding {
  exists: boolean;
  status: "draft" | "submitted" | null;
  submittedAt: string | null;
  /** Text/select answers keyed by the onboarding-schema field key. */
  fields: Record<string, string>;
  /** File/link answers keyed by the onboarding-schema field key. */
  files: Record<string, PortalFormFile>;
}
