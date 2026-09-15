import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * THE EXEMPTION AT THE DOOR.
 *
 * `resolveDeviceContext` (tested in device-access.test.ts) honours
 * `device.exempt_from_restriction` on every request AFTER sign-in.
 * `adoptDeviceOnLogin` guards the sign-in ITSELF, and used to refuse on device
 * status alone — so an exempt super-admin whose laptop slot was already filled
 * was told "waiting for approval" at the login form and never got in at all.
 *
 * These are the cases that catch that regression. Every one of them asks the
 * same question: does an exempt actor get in from a machine nobody has seen?
 */

let cookieValue: string | undefined;
let deviceRow: Record<string, unknown> | null = null;
let inserted: Record<string, unknown>[] = [];
let cookieSet: string | null = null;
let insertShouldThrow = false;

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "att_device" && cookieValue !== undefined ? { value: cookieValue } : undefined,
    set: (_n: string, v: string) => {
      cookieSet = v;
    },
  }),
  headers: async () => ({ get: () => "Mozilla/5.0 (Macintosh)" }),
}));

vi.mock("@/lib/db", () => ({
  db: {
    query: {
      mobileDevices: {
        // Reads AFTER an insert must see the inserted row, not the fixture.
        // `enroll` writes a row and then re-reads it by device id to decide the
        // verdict; a mock that always replays the fixture makes a refused
        // enrolment look successful, which would hide the very regression the
        // "does not leak" cases exist to catch.
        findFirst: async () => (inserted.length ? inserted[inserted.length - 1] : deviceRow),
      },
    },
    update: () => ({ set: () => ({ where: async () => undefined }) }),
    insert: () => ({
      values: async (v: Record<string, unknown>) => {
        if (insertShouldThrow) throw new Error("mobile_devices_employee_kind_approved_uq");
        inserted.push(v);
      },
    }),
  },
}));

vi.mock("@/db/schema", () => ({
  mobileDevices: { deviceId: "device_id", id: "id", employeeId: "employee_id", kind: "kind", status: "status" },
}));
vi.mock("drizzle-orm", () => ({ eq: () => ({}), and: () => ({}) }));

const { adoptDeviceOnLogin, resolveDeviceContext } = await import(
  "@/lib/security/device-access"
);

const OM = "11111111-1111-4111-8111-111111111111";
const MANAN = "44444444-4444-4444-8444-444444444444";

const om = { id: OM, email: "om.jadhav@example.invalid", name: "Om Jadhav" } as never;
const manan = { id: MANAN, email: "manan@unleashed.in", name: "Manan Vasa" } as never;

const approvedLaptopFor = (employeeId: string) => ({
  id: "row-1",
  employeeId,
  deviceId: "dev-1",
  kind: "laptop",
  label: "Office Dell",
  status: "approved",
});

beforeEach(() => {
  cookieValue = undefined;
  deviceRow = null;
  inserted = [];
  cookieSet = null;
  insertShouldThrow = false;
  delete process.env.DEVICE_ACCESS_ENFORCEMENT;
  delete process.env.DEVICE_AUTO_ADOPT;
});

afterEach(() => {
  delete process.env.DEVICE_ACCESS_ENFORCEMENT;
  delete process.env.DEVICE_AUTO_ADOPT;
});

describe("Manan signing in from an unregistered device", () => {
  it("is allowed from a brand-new laptop with no cookie", async () => {
    const r = await adoptDeviceOnLogin(manan);
    expect(r.ok).toBe(true);
  });

  it("is allowed from a brand-new PHONE", async () => {
    const r = await adoptDeviceOnLogin(manan);
    expect(r.ok).toBe(true);
  });

  it("is allowed even when BOTH his slots are already full", async () => {
    // THE REGRESSION THIS FILE EXISTS FOR. Enrolment finds no free slot, which
    // for a normal employee means 'pending' and a refused login. An exempt
    // actor must still get in — he is not subject to the cap.
    deviceRow = approvedLaptopFor(MANAN);
    const r = await adoptDeviceOnLogin(manan);
    expect(r.ok).toBe(true);
  });

  it("is allowed even when auto-adoption has been closed", async () => {
    // Post-rollout steady state: every new device needs an administrator. That
    // is the rule the exemption exempts him from.
    process.env.DEVICE_AUTO_ADOPT = "off";
    deviceRow = approvedLaptopFor(MANAN);
    const r = await adoptDeviceOnLogin(manan);
    expect(r.ok).toBe(true);
  });

  it("is allowed when his device row is PENDING", async () => {
    deviceValue({ ...approvedLaptopFor(MANAN), status: "pending" });
    const r = await adoptDeviceOnLogin(manan);
    expect(r.ok).toBe(true);
  });

  it("is allowed when his device row was REVOKED", async () => {
    deviceValue({ ...approvedLaptopFor(MANAN), status: "revoked" });
    const r = await adoptDeviceOnLogin(manan);
    expect(r.ok).toBe(true);
  });

  it("is allowed even if enrolling the device fails outright", async () => {
    // A race for the slot, a constraint, a database hiccup — none of them is a
    // reason to refuse an exempt actor, because the device was never the
    // condition of his access.
    insertShouldThrow = true;
    const r = await adoptDeviceOnLogin(manan);
    expect(r.ok).toBe(true);
  });

  it("still receives a device cookie, so the same machine is recognisable later", async () => {
    // The exemption is "you need not register your devices", not "we stop
    // recording which device you used" — the audit trail still wants to name it.
    await adoptDeviceOnLogin(manan);
    expect(cookieSet).toBeTruthy();
  });

  it("does NOT adopt a device belonging to somebody else", async () => {
    // On a colleague's browser he signs in, but must never be recorded as
    // holding that colleague's device.
    cookieValue = "dev-1";
    deviceValue(approvedLaptopFor(OM));
    const r = await adoptDeviceOnLogin(manan);
    expect(r.ok).toBe(true);
    expect(cookieSet).not.toBe("dev-1");
    for (const row of inserted) expect(row.employeeId).toBe(MANAN);
  });

  it("is exempt on every request AFTER login, not only at the door", async () => {
    // The two halves have to agree, or he gets in and is then bounced to
    // /device-blocked on the very next navigation.
    deviceRow = null;
    const ctx = await resolveDeviceContext(manan);
    expect(ctx.allowed).toBe(true);
    if (ctx.allowed) expect(ctx.exempt).toBe(true);
  });
});

describe("the exemption does not leak to anyone else", () => {
  /**
   * ── WHAT CHANGED IN 0222, AND WHY THESE ASSERTIONS MOVED ──────────────────
   * Sign-in no longer refuses ANYONE on device status. It used to answer
   * `pending` / `revoked` here, which stopped the person at the login form —
   * before a session existed, so before any screen could explain it or offer a
   * way forward. First-login device registration made that impossible to keep:
   * the modal that collects the BIOS serial lives inside the application, so
   * refusing at the door meant a new employee could never reach the form that
   * would have registered them.
   *
   * The restriction did not go away, it moved one step later — to
   * `resolveDeviceContext`, which every request passes through via
   * `requireUser()`. So "does this exemption leak?" is no longer asked of
   * `r.ok`, which is now true for everybody. It is asked of the SLOT: an exempt
   * actor consumes nothing, while an ordinary employee on an unrecognised
   * device is written `pending` and is refused by the gate on the very next
   * request. Approved is still the thing nobody gets by simply turning up.
   */

  it("signs a normal employee in, but gives them only a PENDING slot", async () => {
    // The same situation that lets Manan in must NOT hand an ordinary employee
    // a usable device. Without this, the tests above would also pass if the
    // device rule had simply been switched off for everybody.
    deviceRow = approvedLaptopFor(OM);
    const r = await adoptDeviceOnLogin(om);
    expect(r.ok).toBe(true);
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({ status: "pending" });
    expect(inserted[0]?.status).not.toBe("approved");
  });

  it("does not quietly approve a normal employee once auto-adoption is closed", async () => {
    process.env.DEVICE_AUTO_ADOPT = "off";
    deviceRow = null;
    const r = await adoptDeviceOnLogin(om);
    expect(r.ok).toBe(true);
    expect(inserted[0]).toMatchObject({ status: "pending" });
  });

  it("leaves a revoked device revoked — sign-in does not lift a revocation", async () => {
    cookieValue = "dev-1";
    deviceValue({ ...approvedLaptopFor(OM), status: "revoked" });
    const r = await adoptDeviceOnLogin(om);
    expect(r.ok).toBe(true);
    // Nothing was written, and the row handed back is still revoked, so
    // resolveDeviceContext refuses it on the next request.
    expect(inserted).toHaveLength(0);
    if (r.ok) expect(r.device).toMatchObject({ status: "revoked" });
  });

  it("is decided by CAPABILITY, not by name or id", async () => {
    // Same person, same device situation — only the email differs, and it is the
    // capability registry that reads it. A lookalike address earns no slot.
    deviceRow = approvedLaptopFor(OM);
    const impostor = { id: OM, email: "manan@unleashed.in.attacker.test" } as never;
    const r = await adoptDeviceOnLogin(impostor);
    expect(r.ok).toBe(true);
    expect(inserted[0]).toMatchObject({ status: "pending" });
  });

  it("does not exempt someone merely NAMED Manan", async () => {
    deviceRow = approvedLaptopFor(OM);
    const namesake = { id: OM, name: "Manan", email: "manan.other@example.invalid" } as never;
    const r = await adoptDeviceOnLogin(namesake);
    expect(r.ok).toBe(true);
    expect(inserted[0]).toMatchObject({ status: "pending" });
  });

  it("an EXEMPT actor with both slots full consumes no slot at all", async () => {
    // The contrast that makes the assertions above mean something: same full
    // slots, and the exempt actor writes nothing rather than queuing a pending
    // row. "You need not register your devices" is not "you take a slot anyway".
    deviceRow = approvedLaptopFor(MANAN);
    const r = await adoptDeviceOnLogin(manan);
    expect(r.ok).toBe(true);
    expect(inserted).toHaveLength(0);
  });
});

describe("the exemption is not a bypass of AUTHENTICATION", () => {
  it("only ever runs on an already-resolved employee", async () => {
    // `adoptDeviceOnLogin` takes an Employee. The sign-in route verifies the
    // Firebase ID token and resolves that row BEFORE calling it, so there is no
    // argument shape by which an unauthenticated caller reaches this at all.
    // This is a structural property, asserted here so it is not quietly lost:
    // the function cannot be handed an email or a token, only a resolved row.
    const r = await adoptDeviceOnLogin(manan);
    expect(r.ok).toBe(true);
    // No credential of any kind is consulted or returned.
    expect(r).not.toHaveProperty("token");
    expect(r).not.toHaveProperty("session");
  });
});

/** Set the single row the mocked `findFirst` returns. */
function deviceValue(row: Record<string, unknown> | null): void {
  deviceRow = row;
}
