/**
 * Types for HR Record's Letters & Policies table. Kept in a PLAIN module (not the
 * "use server" action file, which may only export async functions) so both the
 * server action and the client table can import these shapes.
 */

/** letter = composed in the HR letter composer · uploaded = a PDF filed on their dossier · policy = a firm policy they sign. */
export type LetterKind = "letter" | "uploaded" | "policy";

export type LetterStatus = "draft" | "sent" | "acknowledged" | "signed" | "issued" | "pending";

export type SignatureState = "none" | "pending" | "signed";

export interface LetterTableRow {
  /** document_instances.id, employee_documents.id, or `policy:<key>` for a policy never opened. */
  id: string;
  kind: LetterKind;
  title: string;
  category: string;
  status: LetterStatus;
  signature: SignatureState;
  issuedAt: string | null;
  signedAt: string | null;
  issuedBy: string | null;
  /** Signed storage URL — the signed copy when there is one, else the issued PDF. */
  openUrl: string | null;
  /** Registry key, when the letter can be composed again from /hr/letters/<key>. */
  composeKey: string | null;
}

export interface PersonLetters {
  /** False when the person maps to no employee account — nothing can be issued or signed yet. */
  matched: boolean;
  rows: LetterTableRow[];
}

export const EMPTY_PERSON_LETTERS: PersonLetters = { matched: false, rows: [] };
