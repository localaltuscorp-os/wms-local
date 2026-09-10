import { describe, expect, it } from "vitest";
import { HR_INTAKE_EMAILS, isHrIntakeGrantee } from "@/lib/hr/intake-grantees";
import { TEAM_ROSTER } from "@/lib/teams/roster";
import { SUPER_ADMIN_EMAILS } from "@/lib/auth/super-admin";

/**
 * This list is an ACCESS-CONTROL key, so the tests below are deliberately about
 * the failure modes that would hand access to the wrong person: a near-miss
 * address, a stray case/whitespace difference, or an empty value sailing through.
 */
describe("HR intake grantees", () => {
  it("holds exactly the intended people, lower-cased and de-duplicated", () => {
    expect([...HR_INTAKE_EMAILS]).toEqual([
      "jeevanbharambe.altuscorp@gmail.com",
      "rohanchoudhary.altuscorp@gmail.com",
      "mitulmehta.altuscorp@gmail.com",
    ]);
    for (const e of HR_INTAKE_EMAILS) {
      expect(e).toBe(e.toLowerCase().trim());
      expect(e).toContain("@");
    }
    expect(new Set(HR_INTAKE_EMAILS).size).toBe(HR_INTAKE_EMAILS.length);
  });

  it("matches every listed address case- and whitespace-insensitively", () => {
    for (const e of HR_INTAKE_EMAILS) {
      expect(isHrIntakeGrantee(e)).toBe(true);
      expect(isHrIntakeGrantee(e.toUpperCase())).toBe(true);
      expect(isHrIntakeGrantee(`  ${e}  `)).toBe(true);
    }
  });

  it("refuses absent, empty and near-miss addresses", () => {
    expect(isHrIntakeGrantee(null)).toBe(false);
    expect(isHrIntakeGrantee(undefined)).toBe(false);
    expect(isHrIntakeGrantee("")).toBe(false);
    expect(isHrIntakeGrantee("   ")).toBe(false);
    // The repo carries BOTH spellings of Jeevan's surname (roster.ts says
    // "bharambe", scripts/adapt-form-csv.ts says "bharambhe"). Only the roster
    // spelling is granted; the other must NOT match by accident.
    expect(isHrIntakeGrantee("jeevanbharambhe.altuscorp@gmail.com")).toBe(false);
    expect(isHrIntakeGrantee("jeevan@altuscorp.com")).toBe(false);
    expect(isHrIntakeGrantee("mitulmehta.altuscorp@gmail.com.evil.test")).toBe(false);
  });

  it("grants nobody who was meant to get FULL HR instead", () => {
    // Ruchita and Rutvisha get full HR via department membership, NOT this list.
    // If either shows up here, someone has confused the two grants.
    expect(isHrIntakeGrantee("ruchitaambre.altuscorp@gmail.com")).toBe(false);
    expect(isHrIntakeGrantee("rutvishamehta.altuscorp@gmail.com")).toBe(false);
  });

  it("does not silently overlap the super-admin list", () => {
    for (const e of SUPER_ADMIN_EMAILS) expect(isHrIntakeGrantee(e)).toBe(false);
  });

  it("uses addresses that match the roster, so a grant can't point at nobody", () => {
    // Every grantee here is a team manager in lib/teams/roster.ts. That file is
    // the closest thing to a verified address book in the repo, so keeping the
    // two in step is what stops a typo from granting access to a non-existent
    // account (which fails open to "nobody" - quiet, and hard to notice).
    const roster = new Set(TEAM_ROSTER.map((t) => t.managerEmail.toLowerCase()));
    for (const e of HR_INTAKE_EMAILS) expect(roster.has(e)).toBe(true);
  });
});
