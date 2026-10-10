export const APPROVAL_KINDS = ["attendance", "incentive", "reimbursement", "salary", "ctc"] as const;
export type ApprovalKind = (typeof APPROVAL_KINDS)[number];

/** CTC sign-off is an approval record, not an Accounts payment instruction. */
export const PAYABLE_APPROVAL_KINDS = ["attendance", "incentive", "reimbursement", "salary"] as const;
export type PayableApprovalKind = (typeof PAYABLE_APPROVAL_KINDS)[number];

export function isPayableApprovalKind(kind: ApprovalKind): kind is PayableApprovalKind {
  return (PAYABLE_APPROVAL_KINDS as readonly string[]).includes(kind);
}
