// HR Letters — client-safe taxonomy (no server imports). Per-employee letters
// (offer / confirmation / increment / experience / …). Rows reuse the dossier
// `employee_documents` table with letter-scoped docTypes (prefix `letter_`) so
// no new migration is needed — see lib/hr/sections.ts.

export type LetterType =
  | "letter_offer"
  | "letter_confirmation"
  | "letter_increment"
  | "letter_appreciation"
  | "letter_warning"
  | "letter_experience"
  | "letter_relieving"
  | "letter_other";

export interface LetterTypeMeta {
  key: LetterType;
  label: string;
  hint: string;
  accent: string;
}

export const LETTER_TYPES: LetterTypeMeta[] = [
  { key: "letter_offer", label: "Offer Letter", hint: "The initial offer of employment.", accent: "#4f46e5" },
  { key: "letter_confirmation", label: "Confirmation Letter", hint: "Confirmation after probation.", accent: "#0891b2" },
  { key: "letter_increment", label: "Increment / Revision", hint: "Salary revision or increment letter.", accent: "#16a34a" },
  { key: "letter_appreciation", label: "Appreciation", hint: "Recognition & appreciation letter.", accent: "#d97706" },
  { key: "letter_warning", label: "Warning / Notice", hint: "Disciplinary warning or notice.", accent: "#E10600" },
  { key: "letter_experience", label: "Experience Letter", hint: "Experience / service certificate.", accent: "#7c3aed" },
  { key: "letter_relieving", label: "Relieving Letter", hint: "Relieving letter on exit.", accent: "#be123c" },
  { key: "letter_other", label: "Other Letter", hint: "Any other HR letter.", accent: "#475569" },
];

const BY_KEY = new Map<string, LetterTypeMeta>(LETTER_TYPES.map((l) => [l.key, l]));

export function letterTypeMeta(key: string): LetterTypeMeta {
  return BY_KEY.get(key) ?? LETTER_TYPES[LETTER_TYPES.length - 1]!;
}

export function isLetterType(v: string): v is LetterType {
  return BY_KEY.has(v);
}

export const LETTER_TYPE_KEYS: LetterType[] = LETTER_TYPES.map((l) => l.key);

/** The SQL LIKE prefix that scopes employee_documents rows to letters. */
export const LETTER_DOCTYPE_PREFIX = "letter_";
