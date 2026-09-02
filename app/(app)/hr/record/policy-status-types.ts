/**
 * Types for the HR-Record policy-signing tracker. Kept in a PLAIN module (not the
 * "use server" action file, which may only export async functions) so both the
 * server action and the client component can import these shapes.
 */

export interface PolicySignRow {
  key: string;
  title: string;
  signed: boolean;
}

export interface PolicySignStatus {
  /** True when the person maps to an employee account (else signatures can't exist yet). */
  matched: boolean;
  /** Every published policy with this person's signed flag. */
  policies: PolicySignRow[];
}
