/**
 * Which colour a toast gets — pure, so it can be tested without pulling in
 * sonner or a client boundary.
 *
 * An explicit `type` from the caller ALWAYS wins. The heuristic below only
 * decides for the hundreds of legacy `fireToast({ message })` calls that pass
 * none, and it exists to keep those from all being green.
 *
 * ── WHY IT GREW ─────────────────────────────────────────────────────────────
 * The original pattern only matched a short list of failure verbs (fail, error,
 * invalid, cannot…). Plenty of real failure messages are phrased as plain
 * negatives instead and slipped through as SUCCESS — the Aadhaar form's
 * "Aadhaar auto-fill isn't connected yet" showed a green tick next to a
 * statement that nothing had happened. Negative contractions, "not <past
 * participle>", timeouts and "no … found" are now covered.
 *
 * Deliberately NOT covered: a bare "no" or "not". "Marked not important" is a
 * success, and a heuristic that reddened it would be worse than the bug it
 * fixes. Anything ambiguous should pass `type` explicitly at the call site —
 * that is what the parameter is for.
 */
export type ToastKind = "success" | "error" | "info";

const FAILURE_PATTERNS: readonly RegExp[] = [
  // The original verbs.
  /\b(could ?n'?t|cannot|can'?t|fail(ed|ure)?|error|invalid|too many|denied|not allowed|no permission|unable|wrong|stale|forbidden)\b/i,
  // Negative contractions: isn't / doesn't / won't / hasn't / didn't …
  /\b(is|are|was|were|do|does|did|has|have|had|wo|would|should)n'?t\b/i,
  // …and the SPELLED-OUT form. The original pattern's `could ?n'?t` matched
  // "couldn't" but never "could not", so "Could not save the holiday." - a
  // message this app actually sends - was showing green all along.
  /\b(could|would|should|can|will|do|does|did|is|are|was|were|has|have|had)\s+not\b/i,
  // "not connected", "not yet configured", "not saved" …
  /\bnot (yet )?(connected|configured|available|enabled|supported|found|sent|saved|linked|issued|emailed)\b/i,
  // Timeouts.
  /\b(timed out|timeout|took too long)\b/i,
  // "No details found", "no matching records found" — but not a bare "no".
  /\bno [a-z ]{0,24}\b(found|match(es|ed)?|available)\b/i,
  // Single-word failure states.
  /\b(unavailable|unsupported|unexpected|missing|rejected|expired|refused|blocked)\b/i,
];

/** The colour a toast should use. `explicit` short-circuits the heuristic. */
export function toastKind(message: string, explicit?: ToastKind): ToastKind {
  if (explicit) return explicit;
  return FAILURE_PATTERNS.some((re) => re.test(message)) ? "error" : "success";
}
