import { describe, expect, it } from "vitest";
import { HOLIDAY_ADMIN_EMAILS, canManageHolidays } from "@/lib/hr/holiday-admins";
import { SUPER_ADMIN_EMAILS } from "@/lib/auth/super-admin";
import { HR_INTAKE_EMAILS } from "@/lib/hr/intake-grantees";
import { TEAM_ROSTER } from "@/lib/teams/roster";

/**
 * This list decides who can give the entire company a paid day off - a holiday
 * row is read straight back by attendance. So the tests are about the ways the
 * wrong person could slip in, not about the happy path.
 */
describe("who may change the holiday calendar", () => {
  it("is exactly Ruchita and Rutvisha", () => {
    expect([...HOLIDAY_ADMIN_EMAILS]).toEqual([
      "ruchitaambre.altuscorp@gmail.com",
      "rutvishamehta.altuscorp@gmail.com",
    ]);
    expect(HOLIDAY_ADMIN_EMAILS).toHaveLength(2);
  });

  it("matches them case- and whitespace-insensitively", () => {
    for (const e of HOLIDAY_ADMIN_EMAILS) {
      expect(canManageHolidays(e)).toBe(true);
      expect(canManageHolidays(e.toUpperCase())).toBe(true);
      expect(canManageHolidays(`  ${e} `)).toBe(true);
    }
  });

  it("refuses absent, empty and near-miss addresses", () => {
    expect(canManageHolidays(null)).toBe(false);
    expect(canManageHolidays(undefined)).toBe(false);
    expect(canManageHolidays("")).toBe(false);
    expect(canManageHolidays("   ")).toBe(false);
    expect(canManageHolidays("ruchita@altuscorp.com")).toBe(false);
    expect(canManageHolidays("ruchitaambre.altuscorp@gmail.com.evil.test")).toBe(false);
  });

  it("refuses SUPER-ADMINS — 'nobody else' includes them", () => {
    // Deliberate: there is no silent break-glass. If one is ever wanted it goes
    // in holiday-admins.ts where it can be seen, and this test changes with it.
    for (const e of SUPER_ADMIN_EMAILS) expect(canManageHolidays(e)).toBe(false);
  });

  it("refuses the HR-intake grantees — the two grants are unrelated", () => {
    // Jeevan/Rohan/Mitul can fill onboarding + evaluation. That must never have
    // implied the holiday calendar.
    for (const e of HR_INTAKE_EMAILS) expect(canManageHolidays(e)).toBe(false);
  });

  it("refuses every other manager on the roster", () => {
    const allowed = new Set<string>(HOLIDAY_ADMIN_EMAILS);
    for (const t of TEAM_ROSTER) {
      const e = t.managerEmail.toLowerCase();
      if (!allowed.has(e)) expect(canManageHolidays(e)).toBe(false);
    }
  });

  it("uses addresses that exist on the roster, so a grant can't point at nobody", () => {
    const roster = new Set(TEAM_ROSTER.map((t) => t.managerEmail.toLowerCase()));
    for (const e of HOLIDAY_ADMIN_EMAILS) expect(roster.has(e)).toBe(true);
  });
});
