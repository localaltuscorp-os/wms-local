import { describe, it, expect } from "vitest";
import { overdueBucketFor } from "@/lib/outstanding/buckets";

describe("overdueBucketFor", () => {
  it("boundaries", () => {
    expect(overdueBucketFor(0)).toBe("0-3");
    expect(overdueBucketFor(3)).toBe("0-3");
    expect(overdueBucketFor(8)).toBe("8-15");
    expect(overdueBucketFor(16)).toBe("16-30");
    expect(overdueBucketFor(61)).toBe("60+");
    expect(overdueBucketFor(9999)).toBe("60+");
  });
});
