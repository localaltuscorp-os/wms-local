import { describe, it, expect } from "vitest";
import { evaluateGeofence, FENCE_ACCURACY_MARGIN_M, FENCE_MAX_ACCURACY_M } from "@/lib/geo";

describe("evaluateGeofence", () => {
  it("accepts a precise fix well inside the radius", () => {
    expect(evaluateGeofence(40, 15, 100)).toEqual({ ok: true });
  });
  it("accepts when the accuracy circle reaches the fence (the false-outside fix)", () => {
    // 250m away, but ±200m accuracy → effective 250-150(capped)=100 ≤ 100
    expect(evaluateGeofence(250, 200, 100)).toEqual({ ok: true });
  });
  it("rejects 'outside' when even the accuracy circle can't reach", () => {
    const r = evaluateGeofence(400, 50, 100);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("outside");
      expect(r.effectiveDistanceM).toBe(350); // 400 - min(50,150)
    }
  });
  it("caps the accuracy margin (huge accuracy doesn't grant unlimited slack)", () => {
    // 1000m away, ±5000m accuracy → 5000 > MAX so too_imprecise first
    const r = evaluateGeofence(1000, 5000, 100);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("too_imprecise");
  });
  it("rejects 'too_imprecise' when accuracy is worse than the max", () => {
    const r = evaluateGeofence(50, FENCE_MAX_ACCURACY_M + 1, 100);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("too_imprecise");
  });
  it("accepts exactly on the effective boundary", () => {
    // radius 100, accuracy 80 → margin 80 → boundary 180; distance 180 accepted
    expect(evaluateGeofence(180, 80, 100)).toEqual({ ok: true });
  });
  it("exposes the margin + max constants", () => {
    expect(FENCE_ACCURACY_MARGIN_M).toBe(150);
    expect(FENCE_MAX_ACCURACY_M).toBe(250);
  });
});
