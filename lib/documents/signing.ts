// Document signing — shared, CLIENT-SAFE types for the DigiLocker-verified
// e-signing flow (Letters, Agreements, Exit docs). NO server-only imports:
// this module is imported by both server actions/routes AND client components
// (the sign page). Keep it free of "server-only", db, node, or env access.
//
// ⚠ AADHAAR ACT: the only Aadhaar value that ever appears here is the MASKED
// last-4 (e.g. "XXXXXXXX1234"). A full 12-digit Aadhaar must never be stored,
// logged, typed, or transported through any of these shapes.

/** The three document families that can be DigiLocker-signed. */
export const DOC_KINDS = ["letter", "agreement", "exit_doc"] as const;
export type DocKind = (typeof DOC_KINDS)[number];

export function isDocKind(v: string): v is DocKind {
  return (DOC_KINDS as readonly string[]).includes(v);
}

/** Human labels for each doc kind (UI). */
export const DOC_KIND_LABELS: Record<DocKind, string> = {
  letter: "Letter",
  agreement: "Agreement",
  exit_doc: "Exit Document",
};

/**
 * Lifecycle of a signature row:
 *   pending  — created, awaiting DigiLocker identity verification
 *   verified — DigiLocker returned verified identity; awaiting the drawn/typed signature
 *   signed   — signed PDF rendered + archived
 */
export const SIGNATURE_STATUSES = ["pending", "verified", "signed"] as const;
export type SignatureStatus = (typeof SIGNATURE_STATUSES)[number];

/** How the signature mark was produced. */
export type SignatureKind = "drawn" | "typed";

/**
 * Verified identity as returned by DigiLocker's e-KYC — the display-back block.
 * `maskedAadhaar` is last-4 ONLY (e.g. "XXXXXXXX1234"); there is deliberately no
 * field for a full Aadhaar number.
 */
export interface VerifiedIdentity {
  name: string | null;
  dob: string | null;
  gender: string | null;
  address: string | null;
  maskedAadhaar: string | null;
  /** storage path of the DigiLocker photo in the documents bucket, or null */
  photoPath: string | null;
  /** provider txn/ref id */
  ref: string | null;
  verifiedAt: string | null;
}

/** The signature mark + archival artefacts, once signed. */
export interface SignatureMark {
  kind: SignatureKind | null;
  /** typed name, when kind === 'typed' */
  text: string | null;
  /** drawn signature PNG storage path, when kind === 'drawn' */
  imagePath: string | null;
  consentText: string | null;
  /** archived signed PDF storage path */
  signedPdfPath: string | null;
  signedAt: string | null;
}

/**
 * The full current state of a document's signature, as returned by
 * getSignatureState({ docKind, docId }) and consumed by the sign UI.
 * `exists` is false when no signature row has been created yet.
 */
export interface SignatureState {
  exists: boolean;
  signatureId: string | null;
  docKind: DocKind;
  docId: string;
  status: SignatureStatus;
  method: string;
  signerEmployeeId: string | null;
  identity: VerifiedIdentity;
  signature: SignatureMark;
  /** false when DIGILOCKER_* env is unset — the UI shows a calm "not configured" state */
  digilockerConfigured: boolean;
  /**
   * When digilockerConfigured is false, the exact required env var NAMES still
   * missing (never any values) — so an admin sees precisely what to set. Empty
   * when configured.
   */
  digilockerMissingEnv: string[];
}
