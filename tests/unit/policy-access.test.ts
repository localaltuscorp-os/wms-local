import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Employee } from "@/db/schema";
import { codeOf } from "../fixtures/source-code";

/**
 * WHO MAY PUBLISH OR REMOVE A FIRM POLICY.
 *
 * The rule is a ROLE — HR staff, or a super-admin — and this file exists mostly
 * to pin what it is NOT.
 *
 * Until 2026-09-21 it was two hardcoded addresses plus a fallback that admitted
 * anyone whose NAME contained "manan", "ruchita" or "rutvisha". `includes()` on
 * a full name is a wide net: Suruchita, Mananjay and Priya Ruchita Das all
 * passed it. Publishing a policy puts a document in front of the whole firm to
 * sign, so it cannot turn on something a namesake can borrow — and it should
 * not need a deploy to change who holds it.
 */

vi.mock("server-only", () => ({}));
vi.mock("@/lib/hr/access", () => ({ isHrStaff: vi.fn() }));

const { canPublishPolicies } = await import("@/lib/hr/policies/access");
const { isHrStaff } = await import("@/lib/hr/access");
const hrStaff = vi.mocked(isHrStaff);

/** Only the fields the rule reads; the rest of Employee is not its business. */
const person = (email: string | null, name: string): Employee =>
  ({ email, name }) as unknown as Employee;

beforeEach(() => hrStaff.mockReset());

describe("canPublishPolicies", () => {
  it("admits HR staff and super-admins — whoever isHrStaff says", async () => {
    hrStaff.mockResolvedValue(true);
    expect(await canPublishPolicies(person("rutvishamehta.altuscorp@gmail.com", "Rutvisha Mehta"))).toBe(true);
    expect(await canPublishPolicies(person("someone.new@altuscorp.in", "Someone New"))).toBe(true);
  });

  it("refuses everybody else", async () => {
    hrStaff.mockResolvedValue(false);
    expect(await canPublishPolicies(person("asha@example.invalid", "Asha Kulkarni"))).toBe(false);
  });

  it("refuses a NAMESAKE — the hole the old rule had", async () => {
    // Not HR, not a super-admin: the name is now worth nothing here, however
    // closely it reads. Each of these passed the old `name.includes(...)` test.
    hrStaff.mockResolvedValue(false);
    for (const name of ["Mananjay Sharma", "Suruchita Nair", "Priya Ruchita Das", "Rutvisha Kulkarni"]) {
      expect(await canPublishPolicies(person("new.joiner@altuscorp.in", name))).toBe(false);
    }
    // And the real people are admitted by their ROLE, not by their name.
    hrStaff.mockResolvedValue(true);
    expect(await canPublishPolicies(person("ruchitaambre.altuscorp@gmail.com", "Ruchita Ambre"))).toBe(true);
  });

  it("admits the dummy admin, and only in dummy mode", async () => {
    hrStaff.mockResolvedValue(false);
    const dummy = person("dummy.admin@example.invalid", "Dummy Admin");
    expect(await canPublishPolicies(dummy, true)).toBe(true);
    expect(await canPublishPolicies(dummy, false)).toBe(false);
  });

  it("reads no list of names or addresses at all", async () => {
    // The structural half: a future edit that reintroduces a people list fails
    // here rather than quietly working for the person who added themselves.
    const src = codeOf("lib/hr/policies/access.ts");
    expect(src).toContain("isHrStaff");
    expect(src).not.toMatch(/BY_NAME|BY_EMAIL|PUBLISHERS/);
    expect(src).not.toMatch(/@unleashed\.in|altuscorp@gmail\.com/);
  });
});
