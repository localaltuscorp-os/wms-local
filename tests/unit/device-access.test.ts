import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * DEVICE-BASED WMS ACCESS — the verdict, given a device id and a database row.
 *
 * `resolveDeviceContext` is what `requireUser()` and `authenticateMobileRequest`
 * both call, so these cases are the WMS access rules themselves rather than a
 * test of one screen. The cookie jar and the single device lookup are stubbed;
 * the capability registry and the whole decision are real.
 *
 * Scenario numbers refer to the acceptance list in the brief.
 */

let cookieValue: string | undefined;
let deviceRow: Record<string, unknown> | null = null;

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "att_device" && cookieValue !== undefined ? { value: cookieValue } : undefined,
    set: () => {},
  }),
  headers: async () => ({ get: () => "Mozilla/5.0 (Macintosh)" }),
}));

vi.mock("@/lib/db", () => ({
  db: {
    query: { mobileDevices: { findFirst: async () => deviceRow } },
    update: () => ({ set: () => ({ where: async () => undefined }) }),
  },
}));

vi.mock("@/db/schema", () => ({ mobileDevices: { deviceId: "device_id", id: "id" } }));
vi.mock("drizzle-orm", () => ({ eq: () => ({}), and: () => ({}) }));

const { resolveDeviceContext } = await import("@/lib/security/device-access");

const OM = "11111111-1111-4111-8111-111111111111";
const SOMEONE_ELSE = "99999999-9999-4999-8999-999999999999";

const om = { id: OM, email: "om.jadhav@example.invalid", name: "Om Jadhav" } as never;
const MANAN = "44444444-4444-4444-8444-444444444444";
const manan = { id: MANAN, email: "manan@unleashed.in", name: "Manan Vasa" } as never;

const row = (over: Record<string, unknown> = {}) => ({
  id: "row-1",
  employeeId: OM,
  deviceId: "dev-1",
  kind: "laptop",
  label: "Office Dell",
  status: "approved",
  ...over,
});

beforeEach(() => {
  cookieValue = "dev-1";
  deviceRow = row();
  delete process.env.DEVICE_ACCESS_ENFORCEMENT;
});

afterEach(() => {
  delete process.env.DEVICE_ACCESS_ENFORCEMENT;
});

describe("a normal employee", () => {
  it("scenario 1 — is allowed from their registered laptop", async () => {
    deviceRow = row({ kind: "laptop" });
    const r = await resolveDeviceContext(om);
    expect(r.allowed).toBe(true);
    if (r.allowed) {
      expect(r.kind).toBe("laptop");
      expect(r.exempt).toBe(false);
    }
  });

  it("scenario 2 — is allowed from their registered phone", async () => {
    deviceRow = row({ kind: "phone", label: "Pixel 8" });
    const r = await resolveDeviceContext(om);
    expect(r.allowed).toBe(true);
    if (r.allowed) expect(r.kind).toBe("phone");
  });

  it("scenarios 3 & 4 — is DENIED from an unknown laptop or phone", async () => {
    // An id we have never seen. The same answer whichever kind of machine it is:
    // the device is unknown, so there is nothing to distinguish.
    deviceRow = null;
    const r = await resolveDeviceContext(om);
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.reason).toBe("unregistered");
  });

  it("is denied when no device id is presented at all", async () => {
    // A cleared cookie, or an API call from a script that never had one. This
    // is the case a check that only looked up PRESENT ids would let through.
    cookieValue = undefined;
    deviceRow = null;
    const r = await resolveDeviceContext(om);
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.reason).toBe("unidentified");
  });

  it("is denied on a device registered to another employee", async () => {
    deviceRow = row({ employeeId: SOMEONE_ELSE });
    const r = await resolveDeviceContext(om);
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.reason).toBe("other_employee");
  });

  it("is denied while a device is still pending approval", async () => {
    deviceRow = row({ status: "pending" });
    const r = await resolveDeviceContext(om);
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.reason).toBe("pending");
  });

  it("is denied on a revoked device", async () => {
    deviceRow = row({ status: "revoked" });
    const r = await resolveDeviceContext(om);
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.reason).toBe("revoked");
  });

  it("gives a DIFFERENT reason for each refusal, so the UI can explain it", async () => {
    const reasons = new Set<string>();
    for (const [cookie, r] of [
      [undefined, null],
      ["dev-1", null],
      ["dev-1", row({ status: "pending" })],
      ["dev-1", row({ status: "revoked" })],
      ["dev-1", row({ employeeId: SOMEONE_ELSE })],
    ] as const) {
      cookieValue = cookie;
      deviceRow = r;
      const res = await resolveDeviceContext(om);
      if (!res.allowed) reasons.add(res.reason);
    }
    expect(reasons.size).toBe(5);
  });
});

describe("scenario 6 — the device-exempt super-admin", () => {
  it("is allowed with no device id at all", async () => {
    cookieValue = undefined;
    deviceRow = null;
    const r = await resolveDeviceContext(manan);
    expect(r.allowed).toBe(true);
    if (r.allowed) expect(r.exempt).toBe(true);
  });

  it("is allowed from a device that is unregistered, pending or revoked", async () => {
    for (const d of [null, row({ status: "pending" }), row({ status: "revoked" })]) {
      deviceRow = d;
      expect((await resolveDeviceContext(manan)).allowed).toBe(true);
    }
  });

  it("still reports its own registered device when on one", async () => {
    // So the audit trail can name the laptop rather than recording "exempt" for
    // a change that was in fact made from a known machine.
    deviceRow = row({ employeeId: MANAN, kind: "laptop" });
    const r = await resolveDeviceContext(manan);
    expect(r.allowed).toBe(true);
    if (r.allowed) expect(r.kind).toBe("laptop");
  });
});

describe("the native app's device id", () => {
  it("is used in place of the cookie when supplied", async () => {
    // The phone sends its keystore id on a header; there is no cookie.
    cookieValue = undefined;
    deviceRow = row({ kind: "phone", deviceId: "keystore-abc" });
    const r = await resolveDeviceContext(om, "keystore-abc");
    expect(r.allowed).toBe(true);
    if (r.allowed) expect(r.kind).toBe("phone");
  });

  it("is refused when it names no known device", async () => {
    cookieValue = undefined;
    deviceRow = null;
    const r = await resolveDeviceContext(om, "keystore-unknown");
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.reason).toBe("unregistered");
  });
});

describe("the enforcement switch", () => {
  it("enforces by DEFAULT, with the variable unset", async () => {
    // A security control that has to be switched on ships as documentation.
    deviceRow = null;
    expect((await resolveDeviceContext(om)).allowed).toBe(false);
  });

  it("only disables on the exact value 'off'", async () => {
    deviceRow = null;
    for (const v of ["", "false", "no", "OFF", "0", "true"]) {
      process.env.DEVICE_ACCESS_ENFORCEMENT = v;
      expect((await resolveDeviceContext(om)).allowed).toBe(false);
    }
    process.env.DEVICE_ACCESS_ENFORCEMENT = "off";
    expect((await resolveDeviceContext(om)).allowed).toBe(true);
  });

  it("does not claim an exemption while enforcement is off", async () => {
    // The audit context must not report that someone holds a capability they do
    // not: a log that misstates WHY something was permitted is worse than one
    // that says nothing.
    process.env.DEVICE_ACCESS_ENFORCEMENT = "off";
    deviceRow = null;
    const r = await resolveDeviceContext(om);
    expect(r.allowed).toBe(true);
    if (r.allowed) expect(r.exempt).toBe(false);
  });
});
