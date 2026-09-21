import { describe, expect, it } from "vitest";
import { formatRs, formatRsCompact, parseRs } from "@/lib/format";
import { num } from "@/lib/hr/ctc/model";

describe("formatRs", () => {
  it("uses Indian grouping with the Rs. prefix", () => {
    expect(formatRs(101211999)).toBe("Rs. 10,12,11,999");
    expect(formatRs(25000)).toBe("Rs. 25,000");
    expect(formatRs(0)).toBe("Rs. 0");
    expect(formatRs(-2500)).toBe("-Rs. 2,500");
  });
});

describe("formatRsCompact", () => {
  it("shows crores, lakhs, or the full figure", () => {
    expect(formatRsCompact(101211999)).toBe("Rs. 10.12 Cr");
    expect(formatRsCompact(450000)).toBe("Rs. 4.50 L");
    expect(formatRsCompact(99999)).toBe("Rs. 99,999");
    expect(formatRsCompact(9999999)).toBe("Rs. 1.00 Cr");
    expect(formatRsCompact(-450000)).toBe("-Rs. 4.50 L");
  });
});

describe("parseRs / num", () => {
  it("does not read the dot in 'Rs.' as a decimal point", () => {
    expect(parseRs("Rs. 4,50,000")).toBe(450000);
    expect(parseRs("₹1,23,456")).toBe(123456);
    expect(num("Rs. 4,50,000")).toBe(450000);
    expect(num("rs 12,500.50")).toBe(12500.5);
  });
});
