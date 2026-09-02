import { describe, expect, it } from "vitest";
import { compareRows, type SortableFormRow } from "@/lib/hr/forms/sort";

/**
 * The bug this guards: the "oldest" branch used to fire its undated-sinks rule
 * whenever EITHER side was undated, returning 1 for (a,b) and 1 for (b,a). That
 * is a comparator-contract violation, and on the Drafts tab — where every row is
 * undated — it governed the entire list.
 */

const row = (submittedTs: number, employeeName?: string): SortableFormRow => ({
  submittedTs,
  ...(employeeName === undefined ? {} : { employeeName }),
});

/**
 * A comparator must be antisymmetric: cmp(a,b) and cmp(b,a) must cancel out.
 * Summed rather than negated-and-compared because `-Math.sign(0)` is `-0`, and
 * `toBe` uses Object.is, which considers -0 and +0 distinct.
 */
function assertAntisymmetric(rows: SortableFormRow[], cmp: (a: SortableFormRow, b: SortableFormRow) => number) {
  for (const a of rows) {
    for (const b of rows) {
      expect(Math.sign(cmp(a, b)) + Math.sign(cmp(b, a))).toBe(0);
    }
  }
}

describe("compareRows", () => {
  describe("oldest", () => {
    const cmp = compareRows("oldest");

    it("treats two undated drafts as equal rather than each greater than the other", () => {
      // The exact regression: both sides undated.
      expect(cmp(row(0), row(0))).toBe(0);
    });

    it("holds the comparator contract across an all-drafts list", () => {
      assertAntisymmetric([row(0), row(0), row(0)], cmp);
    });

    it("holds the comparator contract across a mixed list", () => {
      assertAntisymmetric([row(0), row(100), row(500), row(0), row(300)], cmp);
    });

    it("sinks undated drafts below everything dated", () => {
      const sorted = [row(0), row(300), row(100)].sort(cmp);
      expect(sorted.map((r) => r.submittedTs)).toEqual([100, 300, 0]);
    });

    it("orders dated rows ascending", () => {
      const sorted = [row(300), row(100), row(200)].sort(cmp);
      expect(sorted.map((r) => r.submittedTs)).toEqual([100, 200, 300]);
    });
  });

  describe("newest", () => {
    const cmp = compareRows("newest");

    it("orders dated rows descending, drafts last", () => {
      const sorted = [row(100), row(0), row(300)].sort(cmp);
      expect(sorted.map((r) => r.submittedTs)).toEqual([300, 100, 0]);
    });

    it("holds the comparator contract", () => {
      assertAntisymmetric([row(0), row(0), row(100), row(300)], cmp);
    });
  });

  describe("employee", () => {
    const cmp = compareRows("employee");

    it("orders by name, breaking ties with the newest submission", () => {
      const sorted = [
        row(100, "Priya"),
        row(500, "Amit"),
        row(900, "Priya"),
      ].sort(cmp);
      expect(sorted.map((r) => [r.employeeName, r.submittedTs])).toEqual([
        ["Amit", 500],
        ["Priya", 900],
        ["Priya", 100],
      ]);
    });

    it("treats a missing employee name as empty rather than throwing", () => {
      expect(() => [row(100), row(200, "Amit")].sort(cmp)).not.toThrow();
    });
  });
});
