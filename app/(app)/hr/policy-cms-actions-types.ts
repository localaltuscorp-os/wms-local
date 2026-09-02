/** Return-shape types for the Policy-CMS actions (plain module — the "use server"
 *  file may only export async functions). */

export interface PolicyVersionMeta {
  version: number;
  title: string;
  publishedAt: string;
}

export interface PolicyComplianceCounts {
  total: number;
  signed: number;
  pending: number;
}

export interface PolicyEditorData {
  key: string;
  title: string;
  summary: string;
  docCode: string;
  effectiveDate: string;
  /** The current version's declarative PolicyDoc.sections. */
  sections: unknown[];
  currentVersion: number;
  status: string;
  versions: PolicyVersionMeta[];
  compliance: PolicyComplianceCounts;
}

export interface PublishPolicyInput {
  key: string;
  title: string;
  summary: string;
  effectiveDate: string;
  sections: unknown[];
  /** The secondary Admin PIN. */
  pin: string;
}
