/**
 * FIRST + LAST → THE ONE NAME THE REST OF THE APP READS.
 *
 * `candidate_intake.full_name` is a single column: the letters print it, the
 * candidate list shows it, and the merge dialog compares against it. Three
 * different entry points collect a name (the invite dialog, the quick-add dialog
 * on the evaluation form, and the candidate's own form), and two of them ask for
 * first and last separately.
 *
 * So the join lives here rather than in each caller. It is three lines, which is
 * exactly why it would otherwise be written three times slightly differently —
 * and a stray double space or a trailing one is not a cosmetic difference when
 * the value is matched against a number-keyed record and printed on a letter.
 *
 * PURE and client-safe: the quick-add dialog is a client component.
 */
export function joinCandidateName(first: string, last: string): string {
  return `${first} ${last}`.replace(/\s+/g, " ").trim();
}

/**
 * The inverse, for pre-filling an edit form.
 *
 * Splits on the LAST space, so "Priya Anjali Sharma" gives first "Priya Anjali"
 * and last "Sharma" — the least surprising reading for Indian names, where the
 * given name is frequently two words and the surname is one.
 */
export function splitCandidateName(full: string | null | undefined): {
  first: string;
  last: string;
} {
  const parts = (full ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "", last: "" };
  if (parts.length === 1) return { first: parts[0]!, last: "" };
  return { first: parts.slice(0, -1).join(" "), last: parts[parts.length - 1]! };
}
