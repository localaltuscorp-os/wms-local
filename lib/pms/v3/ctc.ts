/**
 * PMS v3 (WS-2) — monthly-CTC provider for the incentive grade band.
 *
 * SHARED-KEY CONTRACT (docs/ALTUS-MEGA-SPEC.md): the salary slice (WS-5) owns the
 * canonical `getMonthlyCtcByPerson(month)` in `lib/queries/salary-ctc.ts` — keyed
 * by BOTH normalised name AND employeeId, mirroring `getIncentivePaidByPerson`.
 * We RE-EXPORT it here (never re-derive) so the incentive grade band and salary
 * divide/read the exact same CTC number. (Reconciled at integration 2026-07-09.)
 */
export { getMonthlyCtcByPerson } from "@/lib/queries/salary-ctc";
