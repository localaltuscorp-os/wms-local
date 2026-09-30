import { describe, expect, it } from "vitest";
import { decodeOtherPolicyCategory, encodeOtherPolicyCategory } from "@/lib/hr/policy-types";

describe("uploaded policy Other category metadata", () => {
  it("round-trips the user-facing category without exposing its storage marker", () => {
    const stored = encodeOtherPolicyCategory("Travel rules for field work", "Travel and Expense");
    expect(decodeOtherPolicyCategory(stored)).toEqual({
      categoryName: "Travel and Expense",
      description: "Travel rules for field work",
    });
  });

  it("keeps legacy descriptions unchanged", () => {
    expect(decodeOtherPolicyCategory("Existing policy note")).toEqual({
      categoryName: null,
      description: "Existing policy note",
    });
  });
});
