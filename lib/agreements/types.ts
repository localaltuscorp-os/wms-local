import type { AgreementType, AgreementStatus } from "@/db/enums";

/** An active employee + the fields we auto-fill an agreement from. */
export interface AgreementEmployee {
  id: string;
  name: string;
  designation: string | null;
  department: string | null;
  entity: string | null;
  joiningDate: string | null; // ISO yyyy-mm-dd
  annualCtc: string | null; // numeric string
}

/** Slim agreement row for the tracker + employee list (no heavy field_values). */
export interface AgreementRow {
  id: string;
  employeeId: string;
  employeeName: string;
  type: AgreementType;
  status: AgreementStatus;
  title: string;
  signToken: string;
  signedName: string | null;
  signedAt: string | null; // ISO
  sentAt: string | null;
  createdAt: string; // ISO
}
