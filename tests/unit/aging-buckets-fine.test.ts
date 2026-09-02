import { describe, it, expect } from "vitest";
import {
  FINE_AGING_BUCKETS,
  FINE_BUCKET_SLUGS,
  FINE_BUCKET_BY_SLUG,
  FINE_BUCKET_OFFSETS,
  bucketForOffset,
} from "@/lib/transforms/aging-buckets-fine";

describe("fine bucket slug + offset maps", () => {
  it("covers every bucket, with unique slugs", () => {
    expect(Object.keys(FINE_BUCKET_SLUGS)).toHaveLength(FINE_AGING_BUCKETS.length);
    expect(Object.keys(FINE_BUCKET_OFFSETS)).toHaveLength(FINE_AGING_BUCKETS.length);
    const slugs = Object.values(FINE_BUCKET_SLUGS);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("round-trips key -> slug -> key", () => {
    for (const key of FINE_AGING_BUCKETS) {
      expect(FINE_BUCKET_BY_SLUG[FINE_BUCKET_SLUGS[key]]).toBe(key);
    }
  });

  // The real risk: the offset windows drifting from bucketForOffset, so a
  // drill-through selects a different set of tasks than the bar clicked on.
  it("agrees with bucketForOffset across the whole range", () => {
    for (let offset = -60; offset <= 60; offset++) {
      const expected = bucketForOffset(offset);
      const matches = FINE_AGING_BUCKETS.filter((k) => {
        const { min, max } = FINE_BUCKET_OFFSETS[k];
        return (min === null || offset >= min) && (max === null || offset <= max);
      });
      // exactly one bucket claims each offset, and it is the same one
      expect(matches).toEqual([expected]);
    }
  });
});
