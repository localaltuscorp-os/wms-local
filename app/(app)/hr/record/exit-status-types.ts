/** Types for the HR-Record per-person Exit & Handover summary (plain module —
 *  the "use server" loader may only export async functions). */

export interface ExitSummary {
  /** True when the record's person maps to an employee account. */
  matched: boolean;
  /** ISO timestamp the exit interview was last saved, or null if none on file. */
  interviewUpdatedAt: string | null;
  /** ISO timestamp the handover checklist was last saved, or null if none. */
  handoverUpdatedAt: string | null;
  /** Handover clearance items ticked / total. */
  handoverCleared: number;
  handoverTotal: number;
}
