import { describe, it, expect } from "vitest";
import {
  toRoman,
  toLetters,
  refFor,
  fullRefFor,
  LEVEL_STYLE,
  levelTextStyle,
  formatPlanDate,
  durationDays,
  parseDuration,
  formatDuration,
  combineDateTime,
  CHILD_KIND,
  PARENT_KIND,
  KIND_DEPTH,
  isExecutable,
  PLAN_KINDS,
  type PlanKind,
} from "@/lib/project-plan/levels";

describe("reference numbering — derived from sibling position, never stored", () => {
  it("toRoman still converts, for anywhere that wants numerals", () => {
    expect(["I", "II", "III", "IV", "V"]).toEqual([1, 2, 3, 4, 5].map(toRoman));
    expect(toRoman(9)).toBe("IX");
    expect(toRoman(14)).toBe("XIV");
    expect(toRoman(40)).toBe("XL");
  });

  it("results number in spreadsheet letters, past Z", () => {
    expect(toLetters(1)).toBe("A");
    expect(toLetters(4)).toBe("D");
    expect(toLetters(26)).toBe("Z");
    // The brief's own example: A, B, C, D … AA, AB.
    expect(toLetters(27)).toBe("AA");
    expect(toLetters(28)).toBe("AB");
    expect(toLetters(52)).toBe("AZ");
    expect(toLetters(53)).toBe("BA");
  });

  // The SHORT labels of brief §3 — P1, M1, RA, A1, SA3.1. Each is readable on
  // its own line in a tree that already makes the parent obvious.
  it("each level uses the brief's own alphabet", () => {
    expect(refFor("project", 1, null)).toBe("P1");
    expect(refFor("project", 3, null)).toBe("P3");
    expect(refFor("milestone", 3, "P3")).toBe("M3");
    expect(refFor("result", 4, "M3")).toBe("RD");
    expect(refFor("action", 5, "RD")).toBe("A5");
  });

  it("sub-levels carry the parent's ordinal — SA3.1, not a bare 1", () => {
    const action = refFor("action", 3, "RD");
    expect(action).toBe("A3");
    const sub = refFor("sub_action", 1, action);
    expect(sub).toBe("SA3.1");
    expect(refFor("sub_action", 2, action)).toBe("SA3.2");
    expect(refFor("sub_sub_action", 1, sub)).toBe("SSA3.1.1");
    expect(refFor("sub_sub_action", 35, sub)).toBe("SSA3.1.35");
  });

  it("falls back to a bare ordinal when the parent ref is gone", () => {
    // Only reachable when an ancestor was archived out from under the row —
    // it must still produce a label rather than "SA.1" or a crash.
    expect(refFor("sub_action", 2, null)).toBe("SA2");
  });

  it("renumbers on delete: removing a middle sibling shifts the ones after it", () => {
    const before = ["a", "b", "c", "d"].map((_, i) => refFor("action", i + 1, "RD"));
    expect(before).toEqual(["A1", "A2", "A3", "A4"]);
    // Delete the 2nd — the survivors are re-derived from their new positions,
    // with no write and no stored label left pointing at the wrong row.
    const after = ["a", "c", "d"].map((_, i) => refFor("action", i + 1, "RD"));
    expect(after).toEqual(["A1", "A2", "A3"]);
  });
});

// The brief's worked example, end to end: P3 → M3 → RD → A5 → SA1, whose full
// path is the P3M3RDA5SA1 quoted in §2.
describe("full ref — the traceability path", () => {
  it("concatenates every ancestor into one unique string", () => {
    const p = fullRefFor("project", 3, null);
    expect(p).toBe("P3");
    const m = fullRefFor("milestone", 3, p);
    expect(m).toBe("P3M3");
    const r = fullRefFor("result", 4, m);
    expect(r).toBe("P3M3RD");
    const a = fullRefFor("action", 5, r);
    expect(a).toBe("P3M3RDA5");
    expect(fullRefFor("sub_action", 1, a)).toBe("P3M3RDA5SA1");
    expect(fullRefFor("sub_action", 3, a)).toBe("P3M3RDA5SA3");
  });

  it("is a different string from the short ref at every level below the top", () => {
    // The two must not be confused: the short one is for the screen, the long
    // one for an export. Only a project's happen to coincide.
    expect(refFor("project", 3, null)).toBe(fullRefFor("project", 3, null));
    expect(refFor("milestone", 3, "P3")).not.toBe(fullRefFor("milestone", 3, "P3"));
  });
});

describe("display typography — brief §5", () => {
  // The brief's WEIGHT / SLANT / CASE per level, unchanged. The sizes were
  // lifted two points across the board (12/12/10/10/9/8 → 14/14/12/12/11/10),
  // a point at a time, because the original scale was hard to read; the steps
  // between levels are the same, which is what the next test guards.
  it("sets each level exactly as the brief specifies", () => {
    expect(LEVEL_STYLE.project).toEqual({ fontSize: 14, bold: true, italic: true, caps: true });
    expect(LEVEL_STYLE.milestone).toEqual({ fontSize: 14, bold: true, italic: false, caps: true });
    expect(LEVEL_STYLE.result).toEqual({ fontSize: 12, bold: false, italic: true, caps: false });
    expect(LEVEL_STYLE.action).toEqual({ fontSize: 12, bold: false, italic: false, caps: false });
    expect(LEVEL_STYLE.sub_action).toEqual({ fontSize: 11, bold: false, italic: true, caps: false });
  });

  it("never grows as it descends", () => {
    const order: PlanKind[] = ["project", "milestone", "result", "action", "sub_action", "sub_sub_action"];
    for (let i = 1; i < order.length; i++) {
      expect(LEVEL_STYLE[order[i]!].fontSize).toBeLessThanOrEqual(LEVEL_STYLE[order[i - 1]!].fontSize);
    }
  });

  it("renders caps as a transform, so the stored name keeps its own case", () => {
    expect(levelTextStyle("project").textTransform).toBe("uppercase");
    expect(levelTextStyle("milestone").textTransform).toBe("uppercase");
    expect(levelTextStyle("sub_action").fontStyle).toBe("italic");
    expect(levelTextStyle("action").fontWeight).toBe(400);
  });
});

describe("dates — DD-MMM-YYYY, and days inclusive of both ends", () => {
  it("formats to the brief's format without a UTC round-trip", () => {
    // A bare YYYY-MM-DD must be read as a LOCAL day: `new Date("2026-06-12")`
    // is UTC midnight and renders as the 11th anywhere west of Greenwich.
    expect(formatPlanDate("2026-06-12")).toBe("12-Jun-2026");
    expect(formatPlanDate("2026-01-01")).toBe("01-Jan-2026");
    expect(formatPlanDate(new Date(2026, 11, 31))).toBe("31-Dec-2026");
    expect(formatPlanDate(null)).toBe("");
    expect(formatPlanDate("not a date")).toBe("");
  });

  it("counts both endpoints, so a same-day job lasts one day", () => {
    expect(durationDays("2026-06-12", "2026-06-12")).toBe(1);
    expect(durationDays("2026-06-01", "2026-06-10")).toBe(10);
    // Compared on calendar days, not instants: 18:00 to 09:00 two days later
    // is 3 days, not "2.6 rounded".
    expect(durationDays(new Date(2026, 5, 1, 18, 0), new Date(2026, 5, 3, 9, 0))).toBe(3);
    expect(durationDays(null, "2026-06-10")).toBeNull();
    expect(durationDays("2026-06-01", null)).toBeNull();
  });
});

describe("level model", () => {
  it("CHILD_KIND and PARENT_KIND are exact inverses", () => {
    for (const kind of PLAN_KINDS) {
      const child = CHILD_KIND[kind];
      if (child) expect(PARENT_KIND[child]).toBe(kind);
    }
    expect(CHILD_KIND.sub_sub_action).toBeNull();
    expect(PARENT_KIND.project).toBeNull();
  });

  it("depth increases by exactly one per level", () => {
    const order: PlanKind[] = ["project", "milestone", "result", "action", "sub_action", "sub_sub_action"];
    order.forEach((k, i) => expect(KIND_DEPTH[k]).toBe(i));
  });

  it("only the three work levels become WMS tasks — containers never do", () => {
    expect(isExecutable("action")).toBe(true);
    expect(isExecutable("sub_action")).toBe(true);
    expect(isExecutable("sub_sub_action")).toBe(true);
    expect(isExecutable("project")).toBe(false);
    expect(isExecutable("milestone")).toBe(false);
    expect(isExecutable("result")).toBe(false);
  });
});

describe("duration", () => {
  it("reads the formats a person actually types", () => {
    expect(parseDuration("2h 30m")).toBe(150);
    expect(parseDuration("2 h 30 m")).toBe(150);
    expect(parseDuration("2h")).toBe(120);
    expect(parseDuration("45m")).toBe(45);
    expect(parseDuration("2:30")).toBe(150);
    expect(parseDuration("1.5h")).toBe(90);
    expect(parseDuration("90")).toBe(90); // bare number = minutes
  });

  it("clears rather than guessing on blank or nonsense", () => {
    expect(parseDuration("")).toBeNull();
    expect(parseDuration(null)).toBeNull();
    expect(parseDuration("   ")).toBeNull();
    expect(parseDuration("later")).toBeNull();
    expect(parseDuration("0")).toBeNull();
  });

  it("round-trips through the display format", () => {
    for (const mins of [15, 45, 60, 90, 120, 150, 480]) {
      expect(parseDuration(formatDuration(mins))).toBe(mins);
    }
    expect(formatDuration(null)).toBe("");
    expect(formatDuration(0)).toBe("");
  });
});

describe("combineDateTime — local, never UTC-shifted", () => {
  it("builds the instant on the given local day", () => {
    const dt = combineDateTime("2026-03-09", "14:30");
    expect(dt).not.toBeNull();
    expect(dt!.getFullYear()).toBe(2026);
    expect(dt!.getMonth()).toBe(2); // March
    expect(dt!.getDate()).toBe(9); // the day typed, in local time
    expect(dt!.getHours()).toBe(14);
    expect(dt!.getMinutes()).toBe(30);
  });

  it("defaults a missing time to midnight, and refuses a missing date", () => {
    const dt = combineDateTime("2026-03-09", "");
    expect(dt!.getHours()).toBe(0);
    expect(combineDateTime("", "14:30")).toBeNull();
  });
});
