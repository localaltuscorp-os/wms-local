import { describe, it, expect } from "vitest";
import { isSuperAdmin, SUPER_ADMIN_EMAILS } from "@/lib/auth/super-admin";

/**
 * THE SUPER-ADMIN ROSTER, as it stands after the 2026-09-04 incident.
 *
 * These assertions used to name three addresses — Hetesh, Manan and
 * `system.service.altus@gmail.com`. All three were changed deliberately, and
 * the reasons are recorded in `lib/auth/super-admin.ts`:
 *
 *   · the list was cut to a single holder during the unauthorized-access
 *     incident, and Manan was restored later the same day at the account
 *     holder's instruction;
 *   · `system.service.altus@gmail.com` was REMOVED as latent persistence — it
 *     had no employees row and no Firebase account, so anyone able to insert a
 *     row with that address would silently have held the highest privilege in
 *     the app, and no admin screen listed it.
 *
 * The test is aligned to the code rather than the other way round, on purpose:
 * re-adding an address to make a test pass would re-open exactly the hole that
 * change closed. If the roster is meant to grow, it grows in that file, in code
 * review, and this test is updated with it.
 */
describe("isSuperAdmin", () => {
  it("returns true for each configured super-admin", () => {
    for (const email of SUPER_ADMIN_EMAILS) {
      expect(isSuperAdmin(email)).toBe(true);
    }
  });

  it("returns true regardless of case", () => {
    for (const email of SUPER_ADMIN_EMAILS) {
      expect(isSuperAdmin(email.toUpperCase())).toBe(true);
    }
  });

  it("returns true with surrounding whitespace", () => {
    for (const email of SUPER_ADMIN_EMAILS) {
      expect(isSuperAdmin(`  ${email}  `)).toBe(true);
      expect(isSuperAdmin(`\t${email}\n`)).toBe(true);
    }
  });

  it("returns false for any other email", () => {
    expect(isSuperAdmin("altus@carbideindia.com")).toBe(false);
    expect(isSuperAdmin("someone@example.com")).toBe(false);
    // A near-miss on a real entry — the match is exact, never a prefix.
    expect(isSuperAdmin("manan@unleashed.i")).toBe(false);
    expect(isSuperAdmin("manan@unleashed.into")).toBe(false);
  });

  it("returns false for null / undefined / empty", () => {
    expect(isSuperAdmin(null)).toBe(false);
    expect(isSuperAdmin(undefined)).toBe(false);
    expect(isSuperAdmin("")).toBe(false);
  });

  it("holds exactly the two current addresses", () => {
    expect([...SUPER_ADMIN_EMAILS]).toEqual([
      "rohanchoudhary.altuscorp@gmail.com",
      "manan@unleashed.in",
    ]);
  });

  it("does NOT carry the retired service account", () => {
    // The specific regression this list was cut to prevent. Named explicitly so
    // re-adding it fails here rather than being noticed in production.
    expect(isSuperAdmin("system.service.altus@gmail.com")).toBe(false);
    expect([...SUPER_ADMIN_EMAILS]).not.toContain("system.service.altus@gmail.com");
  });

  it("is all-lowercase, since every comparison lowercases its input", () => {
    for (const email of SUPER_ADMIN_EMAILS) {
      expect(email).toBe(email.toLowerCase());
      expect(email.trim()).toBe(email);
    }
  });
});
