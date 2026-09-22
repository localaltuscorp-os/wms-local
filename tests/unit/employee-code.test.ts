import { describe, it, expect } from "vitest";
import {
  confirmedPrefix,
  FIRST_SEQ,
  formatEmployeeCode,
  internPrefix,
  isInternPrefix,
  looksLikeInternDesignation,
  nextSeq,
  normalizePrefix,
  parseEmployeeCode,
  suggestPrefix,
} from "@/lib/employees/employee-code";

/**
 * THE EMPLOYEE CODE SCHEME, as dictated rather than inferred.
 *
 * The examples in this file are the account holder's own (2026-09-12), used
 * verbatim as fixtures. Two of the rules are easy to state and easy to break
 * silently, so each has a describe block of its own:
 *
 *   · a number is NEVER reused, even after the holder leaves;
 *   · confirmation from intern MOVES SERIES, it does not rename in place.
 */

describe("prefixes", () => {
  it("takes the five entity letters", () => {
    for (const p of ["A", "U", "K", "M", "J"]) expect(normalizePrefix(p)).toBe(p);
  });

  it("normalises case and whitespace", () => {
    expect(normalizePrefix("  a ")).toBe("A");
    expect(normalizePrefix("ui")).toBe("UI");
  });

  it("refuses anything that is not one or two letters", () => {
    for (const bad of ["", "   ", "AB", "A1", "1", "A-", "ABC", "IA", null, undefined]) {
      // "AB" and "IA" are refused because the intern marker is a SUFFIX: only
      // <letter> and <letter>I are prefixes.
      expect(normalizePrefix(bad as string), String(bad)).toBeNull();
    }
  });

  it("tells an intern series from an entity series", () => {
    expect(isInternPrefix("UI")).toBe(true);
    expect(isInternPrefix("AI")).toBe(true);
    expect(isInternPrefix("U")).toBe(false);
    expect(isInternPrefix("I")).toBe(false); // a bare I is the entity letter I
  });

  it("derives the intern series, idempotently", () => {
    expect(internPrefix("U")).toBe("UI");
    expect(internPrefix("K")).toBe("KI");
    expect(internPrefix("M")).toBe("MI");
    expect(internPrefix("J")).toBe("JI");
    expect(internPrefix("A")).toBe("AI");
    // Calling it twice must not produce "UII".
    expect(internPrefix("UI")).toBe("UI");
  });

  it("derives the series an intern confirms into, idempotently", () => {
    expect(confirmedPrefix("UI")).toBe("U");
    expect(confirmedPrefix("AI")).toBe("A");
    // Already confirmed → unchanged, which is what makes a retry safe.
    expect(confirmedPrefix("U")).toBe("U");
  });
});

describe("formatting and parsing", () => {
  it("renders the codes from the brief", () => {
    expect(formatEmployeeCode("A", 101)).toBe("A-101");
    expect(formatEmployeeCode("A", 106)).toBe("A-106");
    expect(formatEmployeeCode("U", 101)).toBe("U-101");
    expect(formatEmployeeCode("M", 101)).toBe("M-101");
    expect(formatEmployeeCode("UI", 101)).toBe("UI-101");
  });

  it("round-trips, and canonicalises case on the way", () => {
    const p = parseEmployeeCode(" a-101 ");
    expect(p).toEqual({ prefix: "A", seq: 101, code: "A-101" });
    expect(formatEmployeeCode(p!.prefix, p!.seq)).toBe("A-101");
  });

  it("refuses things that are not codes", () => {
    for (const bad of ["A101", "A-", "-101", "A-1O1", "", "AB-101", "A-101-2", null]) {
      expect(parseEmployeeCode(bad as string), String(bad)).toBeNull();
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   RULE 1 — A NUMBER IS NEVER REUSED
   ══════════════════════════════════════════════════════════════════════════ */

describe("a retired number is never reissued", () => {
  it("starts a fresh series at 101", () => {
    expect(nextSeq([])).toBe(101);
    expect(FIRST_SEQ).toBe(101);
  });

  it("continues from the highest ever issued", () => {
    expect(nextSeq([101, 102, 103, 104, 105, 106])).toBe(107);
  });

  /**
   * THE WHOLE POINT. A gap in the series is somebody who LEFT, and handing
   * their number to the next joiner is the one thing the rule forbids.
   *
   * `nextSeq` is therefore given every seq ever issued — retired included — and
   * returns max + 1 rather than hunting for the first free slot. A "helpful"
   * gap-filling implementation would pass every other test in this file and
   * break the only rule that matters.
   */
  it("does NOT fill the gap left by a leaver", () => {
    // A-103 retired when its holder left. The next joiner must be A-107.
    const everIssued = [101, 102, 104, 105, 106];
    expect(nextSeq(everIssued)).toBe(107);
    expect(nextSeq(everIssued)).not.toBe(103);
  });

  it("does not reuse the highest number when its holder leaves", () => {
    // A-106 was the last issued and its holder has now left. 107 is next, and
    // 106 is gone for good.
    expect(nextSeq([101, 102, 103, 104, 105, 106])).toBe(107);
  });

  it("keeps the intern and entity series independent", () => {
    // U-101..U-103 issued, UI-101..UI-102 issued. They do not interact.
    expect(nextSeq([101, 102, 103])).toBe(104); // next U
    expect(nextSeq([101, 102])).toBe(103); // next UI
  });

  it("is not dragged backwards by a legacy number below 101", () => {
    expect(nextSeq([7, 12])).toBe(101);
  });

  it("ignores junk rather than producing NaN", () => {
    expect(nextSeq([101, Number.NaN, Infinity, 103])).toBe(104);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   RULE 2 — CONFIRMATION MOVES SERIES
   ══════════════════════════════════════════════════════════════════════════ */

describe("intern confirmed into a job", () => {
  /**
   * "UI will become U — UI will be retired permanently."
   *
   * Read carefully, that is a MOVE, not a rename: the person joins the entity's
   * own series at its next free number, and their intern code is retired. It is
   * emphatically NOT "UI-101 becomes U-101" — U-101 is Parvez Khan.
   */
  it("issues the next free number in the entity series, not the same number", () => {
    const internCode = parseEmployeeCode("UI-101")!;
    const target = confirmedPrefix(internCode.prefix)!;
    expect(target).toBe("U");

    // U-101, U-102, U-103 are already held by other people.
    const next = nextSeq([101, 102, 103]);
    expect(formatEmployeeCode(target, next)).toBe("U-104");
    // The number is NOT carried across from the intern series.
    expect(formatEmployeeCode(target, next)).not.toBe("U-101");
  });

  it("retires the intern number rather than freeing it", () => {
    // After UI-101 is retired, the next intern is UI-102 — never UI-101 again.
    expect(formatEmployeeCode("UI", nextSeq([101]))).toBe("UI-102");
  });
});

describe("suggested prefix", () => {
  it("comes from the entity letter", () => {
    expect(suggestPrefix({ entityCodePrefix: "A", isIntern: false })).toBe("A");
    expect(suggestPrefix({ entityCodePrefix: "U", isIntern: true })).toBe("UI");
  });

  it("is null when the entity has no letter — the honest answer, not a guess", () => {
    // 24 of 28 employees had no paying entity when this shipped, and two
    // entities carry a Khushboo name. Guessing would put people in the wrong
    // series, and a code cannot be un-issued.
    expect(suggestPrefix({ entityCodePrefix: null, isIntern: false })).toBeNull();
    expect(suggestPrefix({ entityCodePrefix: "", isIntern: true })).toBeNull();
  });

  it("survives an entity mistakenly configured with an intern prefix", () => {
    expect(suggestPrefix({ entityCodePrefix: "UI", isIntern: false })).toBe("U");
    expect(suggestPrefix({ entityCodePrefix: "UI", isIntern: true })).toBe("UI");
  });
});

describe("intern designation heuristic", () => {
  it("recognises the words the roster actually uses", () => {
    for (const d of ["Intern", "intern", "Sales Intern", "Trainee", "Apprentice"]) {
      expect(looksLikeInternDesignation(d), d).toBe(true);
    }
  });

  it("does not match a word that merely contains one", () => {
    for (const d of ["Internal Auditor", "International Manager", "Interim CFO"]) {
      expect(looksLikeInternDesignation(d), d).toBe(false);
    }
  });

  it("handles absence", () => {
    expect(looksLikeInternDesignation(null)).toBe(false);
    expect(looksLikeInternDesignation("")).toBe(false);
  });
});
