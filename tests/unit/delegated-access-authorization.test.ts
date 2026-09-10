import { describe, it, expect, vi, beforeEach } from "vitest";
import { codeOf } from "../fixtures/source-code";

vi.mock("server-only", () => ({}));

/**
 * WHO MAY GRANT TEMPORARY DELEGATED ACCESS, AND OVER WHOM.
 *
 * The org chart is the gate, so the chart is mocked and the predicate is driven
 * through every refusal it can produce. The most important test in this file is
 * the PRIVILEGE-ESCALATION one: delegated access to a master admin's account
 * would confer `master_admin.manage`, because capabilities are keyed on
 * `employees.email` and a delegated session resolves the current employee to the
 * target's row. That has to be impossible, for everybody, including the people
 * who can otherwise grant access anywhere.
 */

interface Row {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  accountType: string;
}

const { rowsById, downlineOf } = vi.hoisted(() => ({
  rowsById: new Map<string, unknown>(),
  downlineOf: new Map<string, string[]>(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      employees: {
        // `checkDelegationGrant` calls this with `where: eq(employees.id, x)`,
        // and the mocked `eq` below hands back the id it was given.
        findFirst: vi.fn(async ({ where }: { where: { id: string } }) =>
          rowsById.get(where.id) ?? undefined,
        ),
      },
    },
    // `delegationCandidates` selects the whole active roster.
    select: () => ({
      from: () => ({
        where: async () => [...rowsById.values()],
      }),
    }),
  },
}));

/**
 * The SCHEMA is stubbed, not loaded.
 *
 * `db/schema.ts` is 7,700 lines of table definitions that evaluate drizzle's
 * `sql` tagged template at module scope, so importing it forces a real
 * `drizzle-orm` — which then defeats the point of mocking `eq`. The predicate
 * under test touches five columns; stubbing them as their own names keeps the
 * mocked `eq` readable and the import graph small.
 */
vi.mock("@/db/schema", () => ({
  employees: {
    id: "id",
    name: "name",
    email: "email",
    accountType: "accountType",
    isActive: "isActive",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: (col: unknown, val: string) => ({ id: val, col }),
}));

vi.mock("@/lib/weekly-goals/hierarchy", () => ({
  getDownlineIds: vi.fn(async (id: string) => downlineOf.get(id) ?? []),
}));

const { checkDelegationGrant, canOpenDelegatedAccess, delegationCandidates } =
  await import("@/lib/auth/delegation-permission");

/* ── The cast of characters ───────────────────────────────────────────────── */

const person = (over: Partial<Row> & { id: string }): Row => ({
  name: over.id,
  email: `${over.id}@altuscorp.com`,
  isActive: true,
  accountType: "employee",
  ...over,
});

const MANAGER = person({ id: "mgr", name: "Manager", email: "mgr@altuscorp.com" });
const RUTVISHA = person({ id: "rutvisha", name: "Rutvisha", email: "r.m@altuscorp.com" });
const RUDRA = person({ id: "rudra", name: "Rudra", email: "r.t@altuscorp.com" });
const OUTSIDER = person({ id: "outsider", name: "Outsider" });
const LONER = person({ id: "loner", name: "Loner" });

/** The two real master admins, from the capability registry. */
const MANAN = person({ id: "manan", name: "Manan Vasa", email: "manan@unleashed.in" });
const ROHAN = person({
  id: "rohan",
  name: "Rohan Choudhary",
  email: "rohanchoudhary.altuscorp@gmail.com",
});
/** A device administrator — privileged, but not a master admin. */
const RUCHITA = person({
  id: "ruchita",
  name: "Ruchita Ambre",
  email: "ruchitaambre.altuscorp@gmail.com",
});

const asEmployee = (r: Row) => r as any;

beforeEach(() => {
  rowsById.clear();
  downlineOf.clear();
  for (const r of [MANAGER, RUTVISHA, RUDRA, OUTSIDER, LONER, MANAN, ROHAN, RUCHITA]) {
    rowsById.set(r.id, r);
  }
  // Rutvisha and Rudra report to the manager; the outsider and the loner do not.
  downlineOf.set(MANAGER.id, [RUTVISHA.id, RUDRA.id]);
});

describe("the brief's scenario", () => {
  it("a manager may let Rudra test Rutvisha's account", () => {
    return expect(
      checkDelegationGrant(asEmployee(MANAGER), RUTVISHA.id, RUDRA.id),
    ).resolves.toEqual({ ok: true });
  });

  it("a manager may nominate THEMSELVES as the delegate", async () => {
    // They are not in their own downline, so this needs its own allowance — and
    // a manager testing their own report's account is the ordinary case.
    await expect(
      checkDelegationGrant(asEmployee(MANAGER), RUTVISHA.id, MANAGER.id),
    ).resolves.toEqual({ ok: true });
  });
});

describe("the hierarchy is the gate", () => {
  it("an employee with nobody reporting to them can grant nothing", async () => {
    const res = await checkDelegationGrant(asEmployee(LONER), RUTVISHA.id, RUDRA.id);
    expect(res.ok).toBe(false);
    expect(res.refusal).toBe("not_authorized");
  });

  it("a manager cannot grant over an account outside their team", async () => {
    const res = await checkDelegationGrant(asEmployee(MANAGER), OUTSIDER.id, RUDRA.id);
    expect(res.ok).toBe(false);
    expect(res.refusal).toBe("target_not_in_team");
  });

  it("a manager cannot hand their team's account to an outsider", async () => {
    // The same exposure from the other direction — both sides must be in scope.
    const res = await checkDelegationGrant(asEmployee(MANAGER), RUTVISHA.id, OUTSIDER.id);
    expect(res.ok).toBe(false);
    expect(res.refusal).toBe("delegate_not_in_team");
  });

  it("the grant_any capability bypasses the org chart", async () => {
    // Manan holds it, and has no downline in this fixture.
    await expect(
      checkDelegationGrant(asEmployee(MANAN), RUTVISHA.id, RUDRA.id),
    ).resolves.toEqual({ ok: true });
    await expect(
      checkDelegationGrant(asEmployee(ROHAN), OUTSIDER.id, RUDRA.id),
    ).resolves.toEqual({ ok: true });
  });

  it("opening the screen is derived from the hierarchy, not from a role flag", async () => {
    expect(await canOpenDelegatedAccess(asEmployee(MANAGER))).toBe(true);
    expect(await canOpenDelegatedAccess(asEmployee(LONER))).toBe(false);
    // A capability holder gets in without a downline.
    expect(await canOpenDelegatedAccess(asEmployee(MANAN))).toBe(true);
  });
});

describe("PRIVILEGE ESCALATION is refused outright", () => {
  it("nobody may borrow a MASTER ADMIN's account", async () => {
    // Capabilities are keyed on `employees.email`, and a delegated session
    // resolves the current employee to the TARGET's row — email included. So
    // access to Manan's account would confer master_admin.manage.
    downlineOf.set(MANAGER.id, [RUTVISHA.id, RUDRA.id, MANAN.id]);
    const res = await checkDelegationGrant(asEmployee(MANAGER), MANAN.id, RUDRA.id);
    expect(res.ok).toBe(false);
    expect(res.refusal).toBe("target_privileged");
  });

  it("not even the OTHER master admin may borrow one", async () => {
    // The refusal is a property of the target, checked BEFORE the org chart, so
    // it does not depend on who is asking. Otherwise the person holding
    // grant_any could impersonate their counterpart.
    for (const granter of [MANAN, ROHAN]) {
      const res = await checkDelegationGrant(
        asEmployee(granter),
        granter.id === MANAN.id ? ROHAN.id : MANAN.id,
        RUDRA.id,
      );
      expect(res.ok).toBe(false);
      expect(res.refusal).toBe("target_privileged");
    }
  });

  it("nor a DEVICE ADMINISTRATOR's account", async () => {
    // Whoever can register a device against a person can then act as that
    // person, so device.manage is as sensitive as the matrix.
    downlineOf.set(MANAGER.id, [RUCHITA.id, RUDRA.id]);
    const res = await checkDelegationGrant(asEmployee(MANAGER), RUCHITA.id, RUDRA.id);
    expect(res.ok).toBe(false);
    expect(res.refusal).toBe("target_privileged");
  });

  it("a privileged person may still be the DELEGATE — only the target is barred", async () => {
    // Ruchita testing Rutvisha's account grants Ruchita nothing she lacks.
    downlineOf.set(MANAGER.id, [RUTVISHA.id, RUCHITA.id]);
    await expect(
      checkDelegationGrant(asEmployee(MANAGER), RUTVISHA.id, RUCHITA.id),
    ).resolves.toEqual({ ok: true });
  });

  it("privileged accounts are not even OFFERED as targets", async () => {
    const { targets, delegates } = await delegationCandidates(asEmployee(MANAN));
    expect(targets.map((t) => t.id)).not.toContain(MANAN.id);
    expect(targets.map((t) => t.id)).not.toContain(ROHAN.id);
    expect(targets.map((t) => t.id)).not.toContain(RUCHITA.id);
    // …but they can receive access, so they stay in the delegate list.
    expect(delegates.map((d) => d.id)).toContain(RUCHITA.id);
  });
});

describe("the obvious mistakes", () => {
  it("refuses delegating an account to itself", async () => {
    const res = await checkDelegationGrant(asEmployee(MANAGER), RUTVISHA.id, RUTVISHA.id);
    expect(res.ok).toBe(false);
    expect(res.refusal).toBe("self");
  });

  it("refuses an unknown employee on either side", async () => {
    expect(
      (await checkDelegationGrant(asEmployee(MANAGER), "nope", RUDRA.id)).refusal,
    ).toBe("target_not_found");
    expect(
      (await checkDelegationGrant(asEmployee(MANAGER), RUTVISHA.id, "nope")).refusal,
    ).toBe("delegate_not_found");
  });

  it("refuses a deactivated account on either side", async () => {
    rowsById.set(RUTVISHA.id, { ...RUTVISHA, isActive: false });
    expect(
      (await checkDelegationGrant(asEmployee(MANAGER), RUTVISHA.id, RUDRA.id)).refusal,
    ).toBe("target_inactive");

    rowsById.set(RUTVISHA.id, RUTVISHA);
    rowsById.set(RUDRA.id, { ...RUDRA, isActive: false });
    expect(
      (await checkDelegationGrant(asEmployee(MANAGER), RUTVISHA.id, RUDRA.id)).refusal,
    ).toBe("delegate_inactive");
  });

  it("refuses a candidate guest-account on either side", async () => {
    rowsById.set(RUTVISHA.id, { ...RUTVISHA, accountType: "candidate", isActive: false });
    expect(
      (await checkDelegationGrant(asEmployee(MANAGER), RUTVISHA.id, RUDRA.id)).refusal,
    ).toBe("target_is_candidate");
  });

  it("offers only real staff in the pickers", async () => {
    rowsById.set("cand", person({ id: "cand", accountType: "candidate", isActive: true }));
    rowsById.set("sys", person({ id: "sys", accountType: "system", isActive: true }));
    const { targets, delegates } = await delegationCandidates(asEmployee(MANAN));
    for (const list of [targets, delegates]) {
      expect(list.map((p) => p.id)).not.toContain("cand");
      expect(list.map((p) => p.id)).not.toContain("sys");
    }
  });
});

describe("the mechanism stores no credential", () => {
  const source = codeOf("lib/auth/delegated-access.ts");

  it("never reads or writes a password", () => {
    // The brief forbids sharing, copying, storing or changing the employee's
    // password. The strongest check available is that the module has no notion
    // of one.
    expect(source).not.toMatch(/password/i);
    expect(source).not.toMatch(/firebaseUid|firebase/i);
  });

  it("stores only a HASH of the token", () => {
    expect(source).toMatch(/createHash\("sha256"\)/);
    expect(source).toMatch(/tokenHash/);
  });

  it("mints the token from a cryptographic source, not Math.random", () => {
    expect(source).toMatch(/randomBytes\(32\)/);
    expect(source).not.toMatch(/Math\.random/);
  });

  it("puts the token in an httpOnly cookie — never localStorage", () => {
    expect(source).toMatch(/httpOnly: true/);
    expect(source).toMatch(/sameSite: "lax"/);
    expect(source).not.toMatch(/localStorage|sessionStorage/);
  });

  it("re-checks expiry AND revocation on the server, per request", () => {
    expect(source).toMatch(/isDelegationLive\(grant, now\)/);
    // The grant lookup is scoped to the signed-in delegate, so a stolen token
    // is inert for anybody else.
    expect(source).toMatch(/eq\(delegatedAccessGrants\.delegateEmployeeId, delegateId\)/);
  });

  it("logs the six events the brief lists", () => {
    for (const kind of [
      '"granted"',
      '"started"',
      '"expired"',
      '"revoked"',
      '"denied_after_expiry"',
      '"denied"',
    ]) {
      expect(source, kind).toContain(kind);
    }
  });

  it("never writes the token VALUE into an audit detail", () => {
    // The check is about the token variable reaching a stored string, not about
    // the WORD appearing — one detail legitimately reads "A delegated-access
    // token was presented that matches no grant for this user." So the string
    // literals are removed first, and what remains must not reference the token.
    const details = source.match(/detail:[^\n]*/g) ?? [];
    expect(details.length).toBeGreaterThan(4);
    for (const d of details) {
      const withoutLiterals = d
        .replace(/`(?:[^`\\]|\\.)*`/g, "``")
        .replace(/"(?:[^"\\]|\\.)*"/g, '""')
        .replace(/'(?:[^'\\]|\\.)*'/g, "''");
      expect(withoutLiterals, d).not.toMatch(/\btoken(Hash)?\b/);
    }
  });

  it("never interpolates the token into any template string", () => {
    // The other half of the same guarantee, covering logs and thrown errors as
    // well as audit rows.
    const interpolations = source.match(/\$\{[^}]*\}/g) ?? [];
    for (const i of interpolations) {
      expect(i, i).not.toMatch(/\btoken(Hash)?\b/);
    }
  });
});

describe("the device restriction still applies to the real person", () => {
  const current = codeOf("lib/auth/current.ts");

  it("the device check runs on the signed-in employee, not the borrowed one", () => {
    // Rudra's laptop is registered to Rudra, not to Rutvisha, so checking the
    // effective identity would refuse the very case this feature exists for —
    // and checking the real one keeps Rudra confined to his own devices.
    expect(current).toMatch(/const real = \(await getSignedInEmployee\(\)\) \?\? e;/);
    expect(current).toMatch(/await enforceWmsDeviceAccess\(real\);/);
  });

  it("delegation cannot chain — it resolves from the real person only", () => {
    expect(current).toMatch(/const real = await getSignedInEmployee\(\);[\s\S]{0,200}resolveDelegation\(real\.id\)/);
  });

  it("is skipped under the three no-login development modes", () => {
    expect(current).toMatch(
      /if \(DUMMY_MODE \|\| devAuthBypassEnabled\(\) \|\| localSessionEnabled\(\)\) return null;/,
    );
  });
});
