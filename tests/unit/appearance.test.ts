import { describe, it, expect } from "vitest";
import { accentVars, resolveAccent, DEFAULT_ACCENT } from "@/lib/appearance";

describe("accentVars", () => {
  it("reproduces the exact brand tokens for the default Altus red", () => {
    const v = accentVars("#E10600");
    expect(v["--user-accent"]).toBe("#e10600");
    expect(v["--color-altus-red"]).toBe("#e10600");
    expect(v["--color-altus-red-deep"]).toBe("#a80400");
    expect(v["--vp-cyan"]).toBe("225 6 0");
    expect(v["--vp-cyan-deep"]).toBe("168 4 0");
    expect(v["--vp-cyan-tint"]).toBe("rgba(225, 6, 0, 0.08)");
  });

  it("re-tints for a custom accent (green)", () => {
    const v = accentVars("#16A34A");
    expect(v["--color-altus-red"]).toBe("#16a34a");
    expect(v["--vp-cyan"]).toBe("22 163 74");
    // deep is a darker shade of the same hue
    expect(v["--vp-cyan-deep"]).toBe("16 122 55");
  });

  it("returns {} for invalid hex", () => {
    expect(accentVars("nope")).toEqual({});
    expect(accentVars("#FFF")).toEqual({});
  });
});

describe("resolveAccent", () => {
  it("falls back to default for null/invalid", () => {
    expect(resolveAccent(null)).toBe(DEFAULT_ACCENT);
    expect(resolveAccent("#ZZZ")).toBe(DEFAULT_ACCENT);
  });
  it("keeps a valid hex", () => {
    expect(resolveAccent("#2563EB")).toBe("#2563EB");
  });
});
