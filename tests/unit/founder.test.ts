import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SECURITY_ROLES, SECURITY_ROLE_DEFS } from "@/lib/auth/security-roles-catalog";

describe("database-backed Founder role", () => {
  it("is an enforced audited security role", () => {
    expect(SECURITY_ROLES).toContain("founder");
    expect(SECURITY_ROLE_DEFS.founder.enforced).toBe(true);
  });

  it("contains no identity or email allow-list", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "lib/auth/founder.ts"), "utf8");
    expect(source).not.toMatch(/@[a-z0-9.-]+\.[a-z]{2,}/i);
    expect(source).not.toContain("FOUNDER_EMAIL");
    expect(source).not.toContain("isFounderEmail");
    expect(source).toContain('eq(securityRoleGrants.role, "founder")');
  });
});
