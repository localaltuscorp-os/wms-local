import { createHash } from "node:crypto";

export interface LegacyKeyInput {
  doerEmail: string;
  initiatorEmail: string;
  assignDate: string;
  dueDate: string;
  status: string; // already-mapped enum value, e.g. "done"
  subject: string;
}

/**
 * Deterministic 32-char hex key that uniquely identifies a row in the
 * legacy sheet, used by tasks.legacy_import_key for idempotent re-runs.
 * Normalises: lowercase emails, lowercase status, trimmed + collapsed
 * whitespace + lowercased subject.
 */
export function computeLegacyImportKey(input: LegacyKeyInput): string {
  const normalize = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
  const parts = [
    input.doerEmail.trim().toLowerCase(),
    input.initiatorEmail.trim().toLowerCase(),
    input.assignDate,
    input.dueDate,
    input.status.toLowerCase(),
    normalize(input.subject),
  ];
  return createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 32);
}
