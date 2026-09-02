/**
 * Client-SAFE constants + row types for CA Handover. Lives OUTSIDE the queries
 * file so client components can import the labels/types without pulling the DB
 * layer (`@/lib/db`) into the browser bundle.
 */
export const CA_PORTAL_TYPES = [
  "income_tax",
  "gst",
  "tds",
  "professional_tax",
  "mlwf",
] as const;
export type CaPortalType = (typeof CA_PORTAL_TYPES)[number];

export const CA_PORTAL_LABELS: Record<string, string> = {
  income_tax: "Income Tax",
  gst: "GST",
  tds: "TDS",
  professional_tax: "Professional Tax",
  mlwf: "MLWF",
};

/** A credential row, scrubbed of plaintext — `hasPassword` replaces `passwordEnc`. */
export interface CaCredentialRow {
  id: string;
  portalType: string;
  entityName: string;
  username: string | null;
  hasPassword: boolean;
  phone: string | null;
  defaultEmail: string | null;
  websiteLink: string | null;
  emailUpdated: boolean;
  passwordReset: boolean;
  primaryPhoneUpdated: boolean;
  secondaryPhoneUpdated: boolean;
  note: string | null;
  sortOrder: number;
}

export interface CaCredentialGroup {
  portalType: string;
  label: string;
  rows: CaCredentialRow[];
}

export interface CaReturnRow {
  id: string;
  fy: string;
  entityName: string;
  itrV: string | null;
  filedComputation: string | null;
  filedItrForm: string | null;
  balanceSheet: string | null;
  pnl: string | null;
  taxAuditReport: string | null;
  selfAssessmentChallan: string | null;
  form26as: string | null;
  ais: string | null;
  assessmentOrder: string | null;
  refundAsPerReturn: string | null;
  refundReceived: string | null;
  gstr1: string | null;
  gstr3b: string | null;
  gstr2b: string | null;
  gstWorkingExcel: string | null;
  gstr9: string | null;
  note: string | null;
}
