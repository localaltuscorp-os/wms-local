/**
 * SUBJECT / AREA OPTION POLICY — what the pickers OFFER, as distinct from what
 * existing records already hold.
 *
 * PURE + CLIENT-SAFE (no DB, no I/O), so the server list builders and any client
 * that needs to reason about the same rule read one definition.
 *
 * ── THE POINT: THIS CHANGES NO STORED DATA (Sir) ───────────────────────────
 * "WMS" and "WMS App" become "Altus Ecosystem" going FORWARD only. Every task,
 * goal and planned day that already carries "WMS" keeps carrying "WMS" — it
 * still displays, still filters, still reports, still exports exactly as it did.
 * Nothing is renamed in the database and nothing is deleted from it.
 *
 * All this file does is decide which options a NEW entry may be filed under:
 *   · RETIRED  — dropped from every picker, dropdown and template list.
 *   · PINNED   — always offered, whether or not a row exists for it.
 *
 * ── WHY IT IS CODE AND NOT A DATA MIGRATION ────────────────────────────────
 * Retiring a subject through the `subjects` table means flipping `is_active`,
 * which leaves a switched-off row sitting on the Subjects admin screen; adding
 * one means an INSERT. Both are production writes to fix what is really a
 * question of "what should the dropdown say". Doing it here needs no database
 * change at all, takes effect on deploy, and is undone by deleting a string from
 * the list below.
 *
 * ── EDITING THIS LIST ──────────────────────────────────────────────────────
 * Retiring a subject does NOT hide it from anything historical. It only stops
 * appearing as a CHOICE. If you need the old records renamed too, that is a
 * separate, deliberate data migration — not this file.
 */

/** Subjects/areas no longer offered as a CHOICE. Case- and space-insensitive:
 *  "wms", "WMS ", "Wms App" are all matched, because these were typed by hand
 *  over months and the spellings drifted. */
export const RETIRED_SUBJECTS: readonly string[] = ["WMS", "WMS App"];

/** Subjects/areas that must ALWAYS be on offer, in this spelling, whether or
 *  not the database has a row for them. */
export const PINNED_SUBJECTS: readonly string[] = ["Altus Ecosystem"];

const norm = (v: string) => v.trim().toLowerCase();

const RETIRED_SET = new Set(RETIRED_SUBJECTS.map(norm));
const PINNED_SET = new Set(PINNED_SUBJECTS.map(norm));

/** Is this value retired from the pickers? Existing records holding it are
 *  unaffected — see the note at the top of this file. */
export function isRetiredSubject(value: string | null | undefined): boolean {
  return value != null && RETIRED_SET.has(norm(value));
}

/**
 * Apply the policy to a list of option names: drop the retired ones, guarantee
 * the pinned ones, and de-duplicate case-insensitively.
 *
 * ORDER IS PRESERVED. The caller's list arrives already sorted the way its
 * surface wants it (alphabetical for the Subject picker, taxonomy order for
 * goal Areas), so a pinned value slots in at the position an existing row for it
 * already had, and is only appended when it was genuinely missing. Sorting here
 * would quietly reorder the goal Area list, whose order is deliberate.
 */
export function applySubjectPolicy(names: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  for (const name of names) {
    const k = norm(name);
    if (!k || RETIRED_SET.has(k) || seen.has(k)) continue;
    seen.add(k);
    out.push(name.trim());
  }

  // Anything pinned that the source list did not already provide. Appended
  // rather than sorted in, so the caller's ordering survives intact.
  for (const pinned of PINNED_SUBJECTS) {
    if (seen.has(norm(pinned))) continue;
    seen.add(norm(pinned));
    out.push(pinned);
  }

  return out;
}
