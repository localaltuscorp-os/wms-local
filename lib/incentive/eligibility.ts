/**
 * WHO AN INCENTIVE APPLIES TO — the rules, with no database attached.
 *
 * Deliberately free of `server-only` and of every import that would drag it in.
 * These two functions decide what an employee is SHOWN and what counts toward
 * their attainment, which makes them the part most worth testing directly; the
 * reads that feed them live in `lib/queries/incentive-eligibility.ts`.
 */

export interface EligibilityMap {
  /** Incentives open to everybody, by id (`incentive_catalog.applies_to_all`). */
  openToAll: Set<string>;
  /** For the rest: incentive id → the employee ids picked for it. */
  picked: Map<string, Set<string>>;
}

/**
 * Is this person eligible for this incentive?
 *
 * An incentive that is neither open nor has anyone picked is CLOSED. That is
 * the state a half-finished admin edit leaves behind, and the safe reading of
 * it is "nobody", not "everybody".
 */
export function isEligible(map: EligibilityMap, incentiveId: string, employeeId: string): boolean {
  if (map.openToAll.has(incentiveId)) return true;
  return map.picked.get(incentiveId)?.has(employeeId) ?? false;
}

/**
 * The same question keyed by incentive NAME, which is what the ledger carries.
 *
 * `incentive_entries.incentive_name` is free text imported from the old sheet —
 * there is no foreign key to the catalog — so matching is by name, trimmed and
 * case-folded.
 *
 * AN ENTRY NAMING AN INCENTIVE THE CATALOG HAS NEVER HEARD OF COUNTS. A typo or
 * a retired scheme makes a row unclassifiable, not forbidden, and quietly
 * dropping someone's earnings over a spelling mistake in an import is the worse
 * failure. Same for a ledger row that was never linked to an employee: it
 * cannot be excluded fairly, so it is not excluded at all.
 */
export function buildNameEligibility(
  map: EligibilityMap,
  catalog: { id: string; name: string }[],
): (incentiveName: string, employeeId: string | null) => boolean {
  const byName = new Map(catalog.map((c) => [c.name.trim().toLowerCase(), c.id]));
  return (incentiveName, employeeId) => {
    const id = byName.get((incentiveName ?? "").trim().toLowerCase());
    if (!id) return true; // not in the catalog at all — see the note above
    if (map.openToAll.has(id)) return true;
    if (!employeeId) return true; // unlinked ledger row
    return map.picked.get(id)?.has(employeeId) ?? false;
  };
}
