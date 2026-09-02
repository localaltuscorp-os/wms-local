import { describe, it, expect } from "vitest";
import { vasaCellState, vasaExpected, vasaDelta } from "@/lib/accounts/vasa-match";
import { formatFullInr, formatPreciseInr } from "@/lib/accounts/inr-format";

/**
 * The matrix records one debt twice, from each side. These tests pin the rule
 * that decides whether the two sides agree — the whole reason the mirror is no
 * longer written automatically.
 */
describe("vasaExpected", () => {
  it("is the negation of the opposite cell", () => {
    expect(vasaExpected(2_619_630)).toBe(-2_619_630);
    expect(vasaExpected(-1_122_760.04)).toBe(1_122_760.04);
  });

  it("is null when the opposite cell is blank", () => {
    // An absent counterpart is not a claim that this cell should be zero.
    expect(vasaExpected(null)).toBeNull();
  });

  it("never produces negative zero", () => {
    expect(Object.is(vasaExpected(0), -0)).toBe(false);
    expect(vasaExpected(0)).toBe(0);
  });
});

describe("vasaCellState", () => {
  it("is empty when nothing is entered", () => {
    expect(vasaCellState(null, null)).toBe("empty");
    expect(vasaCellState(null, 5000)).toBe("empty");
  });

  it("is unpaired when only this side is entered", () => {
    expect(vasaCellState(5000, null)).toBe("unpaired");
  });

  it("is a match when the two sides negate each other", () => {
    expect(vasaCellState(2_619_630, -2_619_630)).toBe("match");
    expect(vasaCellState(-2_619_630, 2_619_630)).toBe("match");
    expect(vasaCellState(0, 0)).toBe("match");
  });

  it("is a mismatch when they do not", () => {
    // Production's real disagreement: 26,19,630.00 against 26,19,630.22.
    expect(vasaCellState(2_619_630.0, -2_619_630.22)).toBe("mismatch");
    expect(vasaCellState(1_122_760.74, -1_122_760.04)).toBe("mismatch");
  });

  it("catches a sign error, which is the mistake this is for", () => {
    // Both sides entered as positive: the sheet claims each owes the other.
    expect(vasaCellState(5000, 5000)).toBe("mismatch");
  });

  it("is exact to the paise the column stores", () => {
    expect(vasaCellState(100.01, -100.0)).toBe("mismatch");
    expect(vasaCellState(100.01, -100.01)).toBe("match");
  });

  it("is not fooled by binary-float error", () => {
    // 0.1 + 0.2 === 0.30000000000000004; a naive === would call this a mismatch.
    expect(vasaCellState(0.1 + 0.2, -0.3)).toBe("match");
  });
});

describe("vasaDelta", () => {
  it("reports how far apart the two sides are", () => {
    expect(vasaDelta(2_619_630.0, -2_619_630.22)).toBeCloseTo(-0.22, 10);
    expect(vasaDelta(1_122_760.74, -1_122_760.04)).toBeCloseTo(0.7, 10);
  });

  it("is zero on a match and null when there is nothing to compare", () => {
    expect(vasaDelta(5000, -5000)).toBe(0);
    expect(vasaDelta(5000, null)).toBeNull();
    expect(vasaDelta(null, 5000)).toBeNull();
  });

  /**
   * The reason the delta is surfaced at all: the cell prints whole rupees, so a
   * mismatched pair can render as two identical figures — one green, one red.
   * If that ever stops being true this test should be revisited, not deleted.
   */
  it("explains a mismatch the displayed figures cannot", () => {
    const mine = 2_619_630.0;
    const theirs = -2_619_630.22;
    expect(formatFullInr(mine)).toBe(formatFullInr(-theirs));
    expect(vasaCellState(mine, theirs)).toBe("mismatch");
    expect(vasaDelta(mine, theirs)).not.toBe(0);
  });
});

describe("formatFullInr — the display the brief asked for", () => {
  it("writes full figures in Indian grouping, not Lakh/Crore words", () => {
    expect(formatFullInr(3_025_000)).toBe("₹30,25,000");
    expect(formatFullInr(17_200_000)).toBe("₹1,72,00,000");
    expect(formatFullInr(5_522_000)).toBe("₹55,22,000");
  });

  it("keeps the sign outside the rupee symbol", () => {
    expect(formatFullInr(-3_025_000)).toBe("−₹30,25,000");
  });
});

describe("formatPreciseInr — what a mismatch tooltip quotes", () => {
  it("keeps the paise, which is where the disagreements actually are", () => {
    expect(formatPreciseInr(2_619_630.22)).toBe("₹26,19,630.22");
    expect(formatPreciseInr(0.22)).toBe("₹0.22");
    expect(formatPreciseInr(0.7)).toBe("₹0.70");
  });

  it("drops them when there are none, so a plain balance still reads as one", () => {
    expect(formatPreciseInr(2_619_630)).toBe("₹26,19,630");
  });

  it("would otherwise report a real difference as zero", () => {
    // The bug this formatter exists to prevent.
    expect(formatFullInr(0.22)).toBe("₹0");
    expect(formatPreciseInr(0.22)).not.toBe("₹0");
  });
});
