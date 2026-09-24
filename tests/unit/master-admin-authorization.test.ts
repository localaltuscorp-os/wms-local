import { describe, it, expect, vi } from "vitest";
import { codeOf } from "../fixtures/source-code";
import {
  canGrantAnyDelegatedAccess,
  emailsWithCapability,
  hasCapability,
} from "@/lib/security/capabilities";
import {
  DB_BACKED_CAPABILITIES,
  isMasterAdmin,
} from "@/lib/security/capability-grants";

/**
 * "ONLY MANAN AND ROHAN" — asserted as a property of the capability registry,
 * and asserted to be enforced on the SERVER.
 *
 * ── WHAT CHANGED, AND WHY THESE ASSERTIONS STILL MEAN SOMETHING ─────────────
 * Master-admin membership used to be a pure function over the code `GRANTS`
 * table. It is now a ROW in `capability_grants` (migration 0226), so the owner
 * can grant it from the Admin panel without a deploy, which makes the predicate
 * ASYNC and database-backed.
 *
 * The two code-listed addresses remain the BOOTSTRAP: they are master admins
 * whatever the table says, and they are what the reader falls back to when the
 * table cannot be read. The database is mocked here to FAIL, so every assertion
 * below is exercised through that fallback path. That is not a workaround for
 * the test environment — it is the fail-closed guarantee, asserted: an
 * unreadable grants table can REVOKE an administered grant but can never INVENT
 * one, and it can never lock the two named people out of the tool that fixes it.
 */

vi.mock("server-only", () => ({}));

// The read fails, deliberately. See the header.
vi.mock("@/lib/db", () => ({
  db: {
    select: () => {
      throw new Error("grants table unavailable");
    },
  },
}));

vi.mock("@/db/schema", () => ({
  capabilityGrants: { employeeId: "employee_id", employeeEmail: "employee_email", capability: "capability" },
  capabilityGrantEvents: {},
  employees: { id: "id", email: "email" },
}));

const MANAN = "manan@unleashed.in";
const ROHAN = "rohanchoudhary.altuscorp@gmail.com";

describe("who holds master_admin.manage", () => {
  it("the CODE BOOTSTRAP is exactly Manan and Rohan", () => {
    // `emailsWithCapability` still reads the code table, so this now asserts
    // something narrower and more precise than it used to: these two are the
    // people who are master admins with no database row at all.
    expect(emailsWithCapability("master_admin.manage").sort()).toEqual(
      [MANAN, ROHAN].sort(),
    );
  });

  it("admits those two even when the grants table cannot be read", async () => {
    expect(await isMasterAdmin(MANAN)).toBe(true);
    expect(await isMasterAdmin(ROHAN)).toBe(true);
  });

  it("refuses everybody else, including the other capability holders", async () => {
    // Ruchita and Rutvisha hold device.manage and attendance.manage_others.
    // Neither is a master admin — the grants are itemised per person so that
    // adding somebody to one system cannot hand them another.
    expect(await isMasterAdmin("ruchitaambre.altuscorp@gmail.com")).toBe(false);
    expect(await isMasterAdmin("rutvishamehta.altuscorp@gmail.com")).toBe(false);
    expect(hasCapability("ruchitaambre.altuscorp@gmail.com", "device.manage")).toBe(true);
  });

  it("fails CLOSED for absent, blank and unknown identities", async () => {
    expect(await isMasterAdmin(null)).toBe(false);
    expect(await isMasterAdmin(undefined)).toBe(false);
    expect(await isMasterAdmin("")).toBe(false);
    expect(await isMasterAdmin("   ")).toBe(false);
    expect(await isMasterAdmin("someone.else@altuscorp.com")).toBe(false);
    // A near-miss must not match — no prefix or substring behaviour.
    expect(await isMasterAdmin("manan@unleashed.in.evil.com")).toBe(false);
    expect(await isMasterAdmin("xmanan@unleashed.in")).toBe(false);
  });

  it("normalises case and surrounding whitespace, since sign-in does", async () => {
    expect(await isMasterAdmin("Manan@Unleashed.IN")).toBe(true);
    expect(await isMasterAdmin("  manan@unleashed.in  ")).toBe(true);
  });

  it("grants both of them delegated_access.grant_any, and nobody else", () => {
    expect(canGrantAnyDelegatedAccess(MANAN)).toBe(true);
    expect(canGrantAnyDelegatedAccess(ROHAN)).toBe(true);
    expect(canGrantAnyDelegatedAccess("ruchitaambre.altuscorp@gmail.com")).toBe(false);
    expect(emailsWithCapability("delegated_access.grant_any").sort()).toEqual(
      [MANAN, ROHAN].sort(),
    );
  });
});

describe("only capabilities whose guards can wait for a read are stored as data", () => {
  /**
   * THE RULE, NOT JUST THE LIST.
   *
   * Every capability NOT named here is consulted synchronously, including from
   * inside a `.filter()` (see `isPrivilegedAccount`). A database row for one of
   * those would be a grant the application SILENTLY IGNORES — somebody told they
   * hold a power they do not have, which is worse than no grant at all.
   *
   * So this list is short on purpose and each entry has to earn its place. The
   * second test below is the one that makes adding a name a deliberate act
   * rather than a one-line edit: the capability must be REFERENCED by guards,
   * and those guards must be asynchronous.
   */
  it("is exactly these three, and each is here for a reason", () => {
    expect([...DB_BACKED_CAPABILITIES].sort()).toEqual([
      "dcc.coordinator",
      "hr.letters.issue",
      "master_admin.manage",
    ]);
  });

  it("every listed capability is actually read by an async guard", () => {
    // A capability in this list that nothing consults is a row that does
    // nothing. A capability in this list whose guard is SYNCHRONOUS is worse:
    // the guard would answer from the code table and ignore the grant.
    const guardSources = [
      codeOf("lib/security/capability-grants.ts"),
      codeOf("lib/hr/letters/issue-access.ts"),
      codeOf("lib/permissions/resolve.ts"),
      codeOf("lib/dcc/access.ts"),
      codeOf("app/master-admin/layout.tsx"),
      codeOf("app/(app)/hr/letters/[key]/page.tsx"),
    ].join("\n");

    for (const capability of DB_BACKED_CAPABILITIES) {
      expect(guardSources, `${capability} must be read somewhere`).toContain(capability);
    }
    // Every guard in this list is ASYNCHRONOUS — that is what makes these legal
    // here, and the synchronous `.filter()` case is why the rule exists.
    const letterAccess = codeOf("lib/hr/letters/issue-access.ts");
    expect(letterAccess).toContain("hasCapabilityGrant(");
    expect(letterAccess).toMatch(/export async function canIssueLetters/);

    const dccAccess = codeOf("lib/dcc/access.ts");
    expect(dccAccess).toContain('hasCapabilityGrant(email, "dcc.coordinator")');
    expect(dccAccess).toMatch(/export async function isComplianceCoordinator/);
    // And the scope loader that consumes it must be async too, since that is
    // what everything on the two checklists goes through.
    expect(dccAccess).toMatch(/export async function loadComplianceScope/);

    const grants = codeOf("lib/security/capability-grants.ts");
    expect(grants).toMatch(/export async function hasCapabilityGrant/);
    expect(grants).toMatch(/export async function isMasterAdmin/);
  });
});

describe("the code bootstrap cannot differ between local and os.altuscorp.com", () => {
  const source = codeOf("lib/security/capabilities.ts");

  it("the capability registry reads no environment variable and no host", () => {
    // The brief: "This restriction must work in BOTH local environment and
    // os.altuscorp.com." The only way to guarantee that is for the decision to
    // contain no environment input at all — so this asserts the absence rather
    // than trying to simulate two deployments.
    expect(source).not.toMatch(/process\.env/);
    expect(source).not.toMatch(/NODE_ENV/);
    expect(source).not.toMatch(/VERCEL/);
    expect(source).not.toMatch(/window\.location|headers\(\)|host/);
  });

  it("is a pure module — no server-only, no I/O, so both sides read one answer", () => {
    expect(source).not.toMatch(/^import "server-only"/m);
    expect(source).not.toMatch(/from "@\/lib\/db"/);
  });

  it("NO LONGER EXPORTS a synchronous isMasterAdmin", () => {
    // The trap this prevents: a leftover synchronous predicate that compiles,
    // returns a plausible `false` for a database-granted master admin, and fails
    // SILENTLY. The async one lives in lib/security/capability-grants.ts. If
    // somebody re-adds a helper here to "keep old imports working", they have
    // re-created the trap and this test is the thing that stops them.
    expect(source).not.toMatch(/export function isMasterAdmin/);
    expect(source).not.toMatch(/isMasterAdmin/);
  });

  it("behaves identically whatever NODE_ENV says", async () => {
    // `vi.stubEnv`, not `Object.defineProperty`: vitest installs `process.env`
    // as a non-configurable proxy, so redefining a key on it throws.
    for (const env of ["development", "production", "test"] as const) {
      vi.stubEnv("NODE_ENV", env);
      expect(await isMasterAdmin(MANAN)).toBe(true);
      expect(await isMasterAdmin(ROHAN)).toBe(true);
      expect(await isMasterAdmin("someone.else@altuscorp.com")).toBe(false);
    }
    vi.unstubAllEnvs();
  });
});

describe("no bypass by URL or API", () => {
  const layout = codeOf("app/master-admin/layout.tsx");
  const actions = codeOf("app/master-admin/actions.ts");

  it("the route layout refuses on the server", () => {
    expect(layout).toMatch(/isMasterAdmin/);
    expect(layout).toMatch(/forbiddenError\(\)/);
  });

  it("the route layout reads the REAL signed-in person, not a delegated identity", () => {
    expect(layout).toMatch(/getSignedInEmployee/);
    expect(layout).not.toMatch(/getCurrentEmployee/);
  });

  it("EVERY exported server action re-checks the capability itself", () => {
    // A layout cannot gate a server action: the action is an HTTP endpoint and
    // is reachable whether or not a page rendered a control for it. So the
    // capability must be re-read inside each one — this test is the reason the
    // actions share a `requireMasterAdmin` helper rather than trusting the
    // layout.
    expect(actions).toMatch(/async function requireMasterAdmin\(\)/);
    // AWAITED, because the predicate is async now. An un-awaited call would be a
    // truthy Promise and would let everybody through — hence this exact shape.
    expect(actions).toMatch(/await isMasterAdmin\(me\.email\)/);
    expect(actions).not.toMatch(/[^t] isMasterAdmin\(me\.email\)/);

    const exported = [...actions.matchAll(/export async function (\w+)/g)].map((m) => m[1]!);
    expect(exported.length).toBeGreaterThan(0);
    for (const name of exported) {
      const body = actions.slice(
        actions.indexOf(`export async function ${name}`),
        actions.indexOf("export async function", actions.indexOf(`export async function ${name}`) + 1) === -1
          ? actions.length
          : actions.indexOf("export async function", actions.indexOf(`export async function ${name}`) + 1),
      );
      expect(body, `${name} must call requireMasterAdmin()`).toMatch(/requireMasterAdmin\(\)/);
    }
  });

  it("the actions authorise the REAL signed-in person, not a delegated identity", () => {
    // Under temporary delegated access `getCurrentEmployee()` is the borrowed
    // account. Using it here would let a delegate inherit the permission matrix.
    expect(actions).toMatch(/getSignedInEmployee/);
    expect(actions).not.toMatch(/getCurrentEmployee/);
  });
});
