import { describe, it, expect } from "vitest";
import { distanceMeters } from "@/lib/geo";

describe("distanceMeters", () => {
  it("is zero for the same point", () => {
    expect(distanceMeters(19.07609, 72.877426, 19.07609, 72.877426)).toBe(0);
  });

  it("measures ~111m per 0.001° of latitude", () => {
    const d = distanceMeters(19.0, 72.0, 19.001, 72.0);
    expect(d).toBeGreaterThan(105);
    expect(d).toBeLessThan(118);
  });

  it("known pair: Gateway of India → CST is ~2.4km", () => {
    // 18.921984, 72.834654  →  18.940061, 72.835335
    const d = distanceMeters(18.921984, 72.834654, 18.940061, 72.835335);
    expect(d).toBeGreaterThan(1900);
    expect(d).toBeLessThan(2300);
  });

  it("geofence boundary: ~80m offset is inside 100m, ~150m is not", () => {
    const lat = 19.07609;
    const lng = 72.877426;
    const inside = distanceMeters(lat, lng, lat + 0.0007, lng); // ≈78m
    const outside = distanceMeters(lat, lng, lat + 0.00135, lng); // ≈150m
    expect(inside).toBeLessThan(100);
    expect(outside).toBeGreaterThan(100);
  });
});
