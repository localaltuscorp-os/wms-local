import { describe, it, expect } from "vitest";
import { isSuperAdmin, SUPER_ADMIN_EMAILS } from "@/lib/auth/super-admin";

describe("isSuperAdmin", () => {
  it("returns true for the two exact super-admin emails", () => {
    expect(isSuperAdmin("heteshvichare.altuscorp@gmail.com")).toBe(true);
    expect(isSuperAdmin("manan@unleashed.in")).toBe(true);
  });

  it("returns true regardless of case", () => {
    expect(isSuperAdmin("HETESHVICHARE.ALTUSCORP@GMAIL.COM")).toBe(true);
    expect(isSuperAdmin("Manan@Unleashed.In")).toBe(true);
  });

  it("returns true with surrounding whitespace", () => {
    expect(isSuperAdmin("  heteshvichare.altuscorp@gmail.com  ")).toBe(true);
    expect(isSuperAdmin("\tmanan@unleashed.in\n")).toBe(true);
  });

  it("returns false for any other email", () => {
    expect(isSuperAdmin("altus@carbideindia.com")).toBe(false);
    expect(isSuperAdmin("someone@example.com")).toBe(false);
    expect(isSuperAdmin("heteshvichare.altuscorp@gmail.co")).toBe(false);
  });

  it("returns false for null / undefined / empty", () => {
    expect(isSuperAdmin(null)).toBe(false);
    expect(isSuperAdmin(undefined)).toBe(false);
    expect(isSuperAdmin("")).toBe(false);
  });

  it("exposes exactly the two configured emails", () => {
    expect(SUPER_ADMIN_EMAILS).toHaveLength(2);
    expect([...SUPER_ADMIN_EMAILS]).toEqual([
      "heteshvichare.altuscorp@gmail.com",
      "manan@unleashed.in",
    ]);
  });
});
