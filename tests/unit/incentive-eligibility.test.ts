import { describe, expect, it } from "vitest";
import {
  buildNameEligibility,
  isEligible,
  type EligibilityMap,
} from "@/lib/incentive/eligibility";

/**
 * Eligibility decides what an employee is SHOWN and what counts toward their
 * attainment, so both directions of every rule are worth pinning down: who is
 * let in, and — more importantly — who is kept out.
 */

const ALICE = "11111111-1111-1111-1111-111111111111";
const BOB = "22222222-2222-2222-2222-222222222222";
const OPEN = "aaaaaaaa-0000-0000-0000-000000000001";
const NARROW = "aaaaaaaa-0000-0000-0000-000000000002";

function map(): EligibilityMap {
  return {
    openToAll: new Set([OPEN]),
    picked: new Map([[NARROW, new Set([ALICE])]]),
  };
}

const CATALOG = [
  { id: OPEN, name: "Referral Bonus" },
  { id: NARROW, name: "PS Sold in 30 Days" },
];

describe("isEligible", () => {
  it("lets everyone at an incentive marked applies-to-all", () => {
    expect(isEligible(map(), OPEN, ALICE)).toBe(true);
    expect(isEligible(map(), OPEN, BOB)).toBe(true);
  });

  it("lets only the picked people at a narrowed one", () => {
    expect(isEligible(map(), NARROW, ALICE)).toBe(true);
    expect(isEligible(map(), NARROW, BOB)).toBe(false);
  });

  /**
   * An incentive that is neither open nor has anybody picked is closed. That is
   * the state a half-finished admin edit would leave behind, and the safe read
   * of it is "nobody", not "everybody".
   */
  it("treats an incentive with no rule at all as closed", () => {
    const empty: EligibilityMap = { openToAll: new Set(), picked: new Map() };
    expect(isEligible(empty, NARROW, ALICE)).toBe(false);
  });
});

describe("buildNameEligibility", () => {
  it("matches the ledger's free-text name to the catalog, case- and space-insensitively", () => {
    const ok = buildNameEligibility(map(), CATALOG);
    expect(ok("  ps sold IN 30 dayS ", ALICE)).toBe(true);
    expect(ok("  ps sold IN 30 dayS ", BOB)).toBe(false);
  });

  /**
   * THE IMPORTANT ONE. `incentive_entries.incentive_name` is free text imported
   * from the old sheet with no foreign key, so a typo or a retired incentive
   * produces a name the catalog has never heard of. Those count: the row is
   * unclassifiable, not forbidden, and quietly deleting someone's earnings
   * because of a spelling mistake in an import is the worse failure.
   */
  it("counts an entry whose incentive is not in the catalog", () => {
    const ok = buildNameEligibility(map(), CATALOG);
    expect(ok("Some Retired Scheme", BOB)).toBe(true);
    expect(ok("", BOB)).toBe(true);
  });

  /** A ledger row never linked to an employee cannot be excluded fairly. */
  it("counts an entry with no linked employee", () => {
    const ok = buildNameEligibility(map(), CATALOG);
    expect(ok("PS Sold in 30 Days", null)).toBe(true);
  });

  it("still lets an open incentive through for anyone", () => {
    const ok = buildNameEligibility(map(), CATALOG);
    expect(ok("Referral Bonus", BOB)).toBe(true);
  });
});

/**
 * The migration's safety property, asserted rather than assumed: with
 * `applies_to_all` defaulting to TRUE and no rows picked, every incentive is
 * visible to everybody — exactly as it was the second before 0216 ran.
 */
describe("the state migration 0216 leaves behind", () => {
  it("changes nothing for anybody", () => {
    const fresh: EligibilityMap = {
      openToAll: new Set([OPEN, NARROW]),
      picked: new Map(),
    };
    for (const inc of [OPEN, NARROW]) {
      for (const who of [ALICE, BOB]) {
        expect(isEligible(fresh, inc, who)).toBe(true);
      }
    }
    const ok = buildNameEligibility(fresh, CATALOG);
    expect(ok("PS Sold in 30 Days", BOB)).toBe(true);
  });
});
