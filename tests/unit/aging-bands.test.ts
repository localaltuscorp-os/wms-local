import { describe, it, expect } from "vitest";
import {
  DONE_AGING_BANDS, WAITING_AGING_BANDS, bucketSignedDays, bucketWaitingDays,
} from "@/lib/transforms/aging-bands";

describe("bucketSignedDays (+ early, - late)", () => {
  it("has 12 contiguous bands", () => {
    expect(DONE_AGING_BANDS.map((b) => b.id)).toEqual([
      "e7", "e4_6", "e2_3", "e1", "d0", "l1", "l2_3", "l4_5", "l6_7", "l8_10", "l11_15", "l16",
    ]);
  });
  it.each([
    [10, "e7"], [7, "e7"], [6, "e4_6"], [4, "e4_6"], [3, "e2_3"], [2, "e2_3"],
    [1, "e1"], [0, "d0"],
    [-1, "l1"], [-2, "l2_3"], [-3, "l2_3"], [-4, "l4_5"], [-5, "l4_5"],
    [-6, "l6_7"], [-7, "l6_7"], [-8, "l8_10"], [-10, "l8_10"],
    [-11, "l11_15"], [-15, "l11_15"], [-16, "l16"], [-99, "l16"],
  ])("signedDays %i → %s", (n, id) => {
    expect(bucketSignedDays(n)).toBe(id);
  });
});

describe("bucketWaitingDays (declined, days waiting)", () => {
  it("has 7 bands", () => {
    expect(WAITING_AGING_BANDS.map((b) => b.id)).toEqual([
      "w0", "w1", "w2_3", "w4_7", "w8_14", "w15_30", "w30",
    ]);
  });
  it.each([
    [0, "w0"], [1, "w1"], [2, "w2_3"], [3, "w2_3"], [4, "w4_7"], [7, "w4_7"],
    [8, "w8_14"], [14, "w8_14"], [15, "w15_30"], [30, "w15_30"], [31, "w30"], [120, "w30"],
  ])("waitingDays %i → %s", (n, id) => {
    expect(bucketWaitingDays(n)).toBe(id);
  });
});
