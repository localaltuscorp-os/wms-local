import { describe, expect, it } from "vitest";
import { canAddTaskRoster } from "@/lib/auth/roster-permission";

/**
 * The point of this rule is that `is_admin` (a DB column) and the super-admin
 * allow-list (code) are DIFFERENT SETS. Hetesh is a real case: super-admin in
 * code, `is_admin = false` on his employee row.
 */
describe("canAddTaskRoster", () => {
  it("allows an ordinary admin", () => {
    expect(canAddTaskRoster({ isAdmin: true, email: "someone@altuscorp.in" })).toBe(true);
  });

  it("allows a super-admin who is NOT flagged admin in the database", () => {
    expect(
      canAddTaskRoster({ isAdmin: false, email: "heteshvichare.altuscorp@gmail.com" }),
    ).toBe(true);
  });

  it("allows someone who is both", () => {
    expect(canAddTaskRoster({ isAdmin: true, email: "manan@unleashed.in" })).toBe(true);
  });

  it("refuses a normal employee", () => {
    expect(canAddTaskRoster({ isAdmin: false, email: "employee@altuscorp.in" })).toBe(false);
  });

  it("refuses when there is no email to match", () => {
    expect(canAddTaskRoster({ isAdmin: false, email: null })).toBe(false);
    expect(canAddTaskRoster({ isAdmin: false })).toBe(false);
  });

  it("matches the allow-list case- and whitespace-insensitively", () => {
    expect(canAddTaskRoster({ isAdmin: false, email: "  Manan@Unleashed.IN " })).toBe(true);
  });
});
