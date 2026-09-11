import { describe, it, expect, vi } from "vitest";
import { codeOf } from "../fixtures/source-code";
import {
  canGrantAnyDelegatedAccess,
  emailsWithCapability,
  hasCapability,
  isMasterAdmin,
} from "@/lib/security/capabilities";

/**
 * "ONLY MANAN AND ROHAN" — asserted as a property of the capability registry,
 * and asserted to be enforced on the SERVER.
 *
 * The brief has three requirements here and each gets a test:
 *   · exactly those two people,
 *   · identical locally and on os.altuscorp.com,
 *   · no bypass by typing a URL or hitting an API endpoint.
 */

const MANAN = "manan@unleashed.in";
const ROHAN = "rohanchoudhary.altuscorp@gmail.com";

describe("who holds master_admin.manage", () => {
  it("is exactly Manan and Rohan", () => {
    expect(emailsWithCapability("master_admin.manage").sort()).toEqual(
      [MANAN, ROHAN].sort(),
    );
  });

  it("admits those two", () => {
    expect(isMasterAdmin(MANAN)).toBe(true);
    expect(isMasterAdmin(ROHAN)).toBe(true);
  });

  it("refuses everybody else, including the other capability holders", () => {
    // Ruchita and Rutvisha hold device.manage and attendance.manage_others.
    // Neither is a master admin — the grants are itemised per person so that
    // adding somebody to one system cannot hand them another.
    expect(isMasterAdmin("ruchitaambre.altuscorp@gmail.com")).toBe(false);
    expect(isMasterAdmin("rutvishamehta.altuscorp@gmail.com")).toBe(false);
    expect(hasCapability("ruchitaambre.altuscorp@gmail.com", "device.manage")).toBe(true);
  });

  it("fails CLOSED for absent, blank and unknown identities", () => {
    expect(isMasterAdmin(null)).toBe(false);
    expect(isMasterAdmin(undefined)).toBe(false);
    expect(isMasterAdmin("")).toBe(false);
    expect(isMasterAdmin("   ")).toBe(false);
    expect(isMasterAdmin("someone.else@altuscorp.com")).toBe(false);
    // A near-miss must not match — no prefix or substring behaviour.
    expect(isMasterAdmin("manan@unleashed.in.evil.com")).toBe(false);
    expect(isMasterAdmin("xmanan@unleashed.in")).toBe(false);
  });

  it("normalises case and surrounding whitespace, since sign-in does", () => {
    expect(isMasterAdmin("Manan@Unleashed.IN")).toBe(true);
    expect(isMasterAdmin("  manan@unleashed.in  ")).toBe(true);
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

describe("the rule cannot differ between local and os.altuscorp.com", () => {
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

  it("behaves identically whatever NODE_ENV says", () => {
    // `vi.stubEnv`, not `Object.defineProperty`: vitest installs `process.env`
    // as a non-configurable proxy, so redefining a key on it throws.
    for (const env of ["development", "production", "test"] as const) {
      vi.stubEnv("NODE_ENV", env);
      expect(isMasterAdmin(MANAN)).toBe(true);
      expect(isMasterAdmin(ROHAN)).toBe(true);
      expect(isMasterAdmin("someone.else@altuscorp.com")).toBe(false);
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

  it("EVERY exported server action re-checks the capability itself", () => {
    // A layout cannot gate a server action: the action is an HTTP endpoint and
    // is reachable whether or not a page rendered a control for it. So the
    // capability must be re-read inside each one — this test is the reason the
    // actions share a `requireMasterAdmin` helper rather than trusting the
    // layout.
    expect(actions).toMatch(/async function requireMasterAdmin\(\)/);
    expect(actions).toMatch(/isMasterAdmin\(me\.email\)/);

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
    expect(layout).toMatch(/getSignedInEmployee/);
  });
});
