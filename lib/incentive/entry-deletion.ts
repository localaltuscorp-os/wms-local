export interface IncentiveEntryDeletionState {
  approved: boolean;
  paid: boolean;
  approvedAmount: number;
  paidAmount: number;
  reversed: boolean;
  incentiveRequestId: string | null;
  payoutRunId: string | null;
}

/** Only uncommitted, unpaid, unlinked draft rows may be hard-deleted. */
export function canDeleteIncentiveEntry(
  entry: IncentiveEntryDeletionState,
  hasPaymentHistory: boolean,
  hasPayoutHistory: boolean,
): boolean {
  return !(
    entry.approved ||
    entry.paid ||
    entry.reversed ||
    entry.incentiveRequestId !== null ||
    entry.payoutRunId !== null ||
    entry.approvedAmount > 0 ||
    entry.paidAmount > 0 ||
    hasPaymentHistory ||
    hasPayoutHistory
  );
}
