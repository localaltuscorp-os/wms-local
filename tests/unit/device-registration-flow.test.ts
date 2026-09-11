import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * FIRST-LOGIN DEVICE REGISTRATION — the decision and the write (0222).
 *
 * Covers the scenarios from the brief that need a database: when the modal
 * appears at all (1, 6, 7, 8, 9, 16), what refuses a registration (3, 5), and
 * what a successful one writes (4, 15).
 *
 * The pure validation half lives in device-registration-rules.test.ts.
 */

const WINDOWS_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

const { state } = vi.hoisted(() => ({
  state: {
    enforced: true,
    /** false == device-exempt, i.e. the anywhere-login exception. */
    restricted: true,
    requestKind: "laptop" as "laptop" | "phone",
    ua: "",
    cookieId: null as string | null,
    deviceRow: null as Record<string, unknown> | null,
    hasApprovedOfKind: false,
    /** Rows the BIOS-serial uniqueness probe finds. */
    clash: [] as Record<string, unknown>[],
    deviceUpdates: [] as Record<string, unknown>[],
    deviceInserts: [] as Record<string, unknown>[],
    consentInserts: [] as Record<string, unknown>[],
    cookieSets: [] as { name: string; value: string }[],
  },
}));

vi.mock("@/db/schema", () => ({
  mobileDevices: {
    __t: "mobile_devices",
    id: "id",
    deviceId: "device_id",
    employeeId: "employee_id",
    status: "status",
    kind: "kind",
    deviceName: "device_name",
  },
  deviceConsentEvents: { __t: "device_consent_events" },
}));

vi.mock("drizzle-orm", () => ({
  and: (...a: unknown[]) => ({ __and: a }),
  eq: () => ({}),
  ne: () => ({}),
  sql: (s: TemplateStringsArray) => ({ __sql: s.raw.join("?") }),
}));

vi.mock("@/lib/db", () => ({
  db: {
    query: { mobileDevices: { findFirst: () => Promise.resolve(state.deviceRow) } },
    update: () => ({
      set: (vals: Record<string, unknown>) => {
        state.deviceUpdates.push(vals);
        return { where: () => Promise.resolve(undefined) };
      },
    }),
    insert: (t: { __t: string }) => ({
      values: (vals: Record<string, unknown>) => {
        if (t.__t === "device_consent_events") state.consentInserts.push(vals);
        else state.deviceInserts.push(vals);
        // Thenable AND chainable: the device insert calls .returning(), the
        // consent insert is simply awaited.
        return {
          returning: () => Promise.resolve([{ id: "new-row-id" }]),
          then: (r: (v: unknown) => unknown) => Promise.resolve(undefined).then(r),
        };
      },
    }),
    select: () => ({ from: () => ({ where: () => ({ limit: () => Promise.resolve(state.clash) }) }) }),
  },
}));

vi.mock("@/lib/security/capabilities", () => ({
  deviceRestrictionRequired: () => state.restricted,
}));

vi.mock("@/lib/security/device-access", () => ({
  DEVICE_COOKIE: "att_device",
  DEVICE_COOKIE_MAX_AGE_SECONDS: 315360000,
  deviceAccessEnforced: () => state.enforced,
  describeRequestDevice: () => Promise.resolve({ kind: state.requestKind, label: "Web" }),
  hasApprovedDeviceOfKind: () => Promise.resolve(state.hasApprovedOfKind),
}));

vi.mock("next/headers", () => ({
  cookies: () =>
    Promise.resolve({
      get: () => (state.cookieId ? { value: state.cookieId } : undefined),
      set: (name: string, value: string) => state.cookieSets.push({ name, value }),
    }),
  headers: () => Promise.resolve({ get: () => state.ua }),
}));

const { pendingDeviceRegistration, completeDeviceRegistration } = await import(
  "@/lib/security/device-registration"
);

const ME = { id: "emp-1", email: "someone@altuscorp.in" } as never;

beforeEach(() => {
  state.enforced = true;
  state.restricted = true;
  state.requestKind = "laptop";
  state.ua = WINDOWS_UA;
  state.cookieId = null;
  state.deviceRow = null;
  state.hasApprovedOfKind = false;
  state.clash = [];
  state.deviceUpdates = [];
  state.deviceInserts = [];
  state.consentInserts = [];
  state.cookieSets = [];
});

describe("pendingDeviceRegistration — when the modal appears", () => {
  // SCENARIO 1 — new Windows employee gets the laptop modal.
  it("asks a brand-new Windows browser to register a laptop, with a serial", async () => {
    const p = await pendingDeviceRegistration(ME);
    expect(p).toMatchObject({ kind: "laptop", needsDeviceName: true });
    expect(p?.platform.os).toBe("Windows");
    expect(p?.consentVersion).toBe("device-registration-v1");
  });

  // SCENARIOS 7 + 8 — iPhone gets the device modal, in the PHONE slot, no serial.
  it("asks an iPhone to register a phone and never asks it for a BIOS serial", async () => {
    state.requestKind = "phone";
    state.ua = IPHONE_UA;
    const p = await pendingDeviceRegistration(ME);
    expect(p).toMatchObject({ kind: "phone", needsDeviceName: false });
    expect(p?.platform).toMatchObject({ hardware: "iPhone", browser: "Safari", os: "iOS" });
    // The laptop slot is untouched by an iOS registration.
    expect(p?.kind).not.toBe("laptop");
  });

  // SCENARIOS 6 + 9 — an already-registered device is never asked again.
  it("stays silent for a device that has already been registered", async () => {
    state.cookieId = "web_known";
    state.deviceRow = {
      id: "row-1",
      employeeId: "emp-1",
      deviceId: "web_known",
      kind: "laptop",
      status: "approved",
      registeredAt: new Date("2026-09-01"),
    };
    expect(await pendingDeviceRegistration(ME)).toBeNull();
  });

  it("asks again when the row exists but nobody ever completed the form", async () => {
    // Auto-adoption writes an approved row with registered_at NULL — approved is
    // not the same as registered, which is the whole reason that column exists.
    state.cookieId = "web_known";
    state.deviceRow = {
      id: "row-1",
      employeeId: "emp-1",
      deviceId: "web_known",
      kind: "laptop",
      status: "approved",
      registeredAt: null,
    };
    const p = await pendingDeviceRegistration(ME);
    expect(p).toMatchObject({ deviceRowId: "row-1", kind: "laptop" });
  });

  // SCENARIO 16 — the anywhere-login exception survives.
  it("never blocks a device-exempt actor", async () => {
    state.restricted = false;
    expect(await pendingDeviceRegistration(ME)).toBeNull();
  });

  it("stays silent when device enforcement is switched off entirely", async () => {
    state.enforced = false;
    expect(await pendingDeviceRegistration(ME)).toBeNull();
  });

  it("stays silent on a revoked device — a form cannot lift a revocation", async () => {
    state.cookieId = "web_known";
    state.deviceRow = {
      id: "row-1",
      employeeId: "emp-1",
      deviceId: "web_known",
      kind: "laptop",
      status: "revoked",
      registeredAt: null,
    };
    expect(await pendingDeviceRegistration(ME)).toBeNull();
  });

  it("stays silent on a NEW machine when the slot for that kind is already full", async () => {
    // Offering a form the cap guarantees will fail is worse than the blocked
    // screen, which names the remedy.
    state.hasApprovedOfKind = true;
    expect(await pendingDeviceRegistration(ME)).toBeNull();
  });

  it("ignores a cookie naming somebody else's row", async () => {
    state.cookieId = "web_theirs";
    state.deviceRow = { id: "row-9", employeeId: "emp-OTHER", kind: "laptop", status: "approved", registeredAt: new Date() };
    const p = await pendingDeviceRegistration(ME);
    expect(p).toMatchObject({ kind: "laptop", deviceRowId: null });
  });
});

describe("completeDeviceRegistration", () => {
  function existingUnregisteredRow() {
    state.cookieId = "web_known";
    state.deviceRow = {
      id: "row-1",
      employeeId: "emp-1",
      deviceId: "web_known",
      kind: "laptop",
      status: "approved",
      registeredAt: null,
    };
  }

  // SCENARIO 3 — consent unchecked blocks registration.
  it("refuses without consent, and writes nothing at all", async () => {
    existingUnregisteredRow();
    const r = await completeDeviceRegistration(ME, { deviceName: "5CD1234ABC", consent: false });
    expect(r).toMatchObject({ ok: false, field: "consent" });
    expect(state.deviceUpdates).toHaveLength(0);
    expect(state.consentInserts).toHaveLength(0);
  });

  // SCENARIO 2 — missing serial blocks registration.
  it("refuses a laptop with no serial", async () => {
    existingUnregisteredRow();
    const r = await completeDeviceRegistration(ME, { deviceName: "", consent: true });
    expect(r).toMatchObject({ ok: false, field: "deviceName" });
    expect(state.consentInserts).toHaveLength(0);
  });

  // SCENARIOS 4 + 15 — a valid registration writes the device AND the consent row.
  it("registers the laptop, normalises the device name, and records consent", async () => {
    existingUnregisteredRow();
    const r = await completeDeviceRegistration(ME, {
      deviceName: "  DESKTOP-2874MGH ",
      manufacturer: "  Dell   Inc. ",
      model: "Latitude 5440",
      consent: true,
    });

    expect(r).toMatchObject({ ok: true, deviceRowId: "row-1" });

    const upd = state.deviceUpdates[0]!;
    // Trimmed, but NOT upper-cased (0224): the `lower(device_name)` index does
    // the case folding, so what an administrator reads back is what was typed.
    expect(upd.deviceName).toBe("DESKTOP-2874MGH");
    expect(upd.manufacturer).toBe("Dell Inc.");
    expect(upd.model).toBe("Latitude 5440");
    expect(upd.registeredAt).toBeInstanceOf(Date);

    const consent = state.consentInserts[0]!;
    expect(consent).toMatchObject({
      employeeId: "emp-1",
      deviceRowId: "row-1",
      deviceId: "web_known",
      consentVersion: "device-registration-v1",
      consentType: "device-registration",
      actorEmployeeId: "emp-1",
    });
    expect(consent.consentedAt).toBeInstanceOf(Date);
  });

  it("stores no fingerprint alongside the consent record", async () => {
    existingUnregisteredRow();
    await completeDeviceRegistration(ME, { deviceName: "5CD1234ABC", consent: true });
    // Phase 1 scope limit, asserted rather than trusted.
    expect(Object.keys(state.consentInserts[0]!).sort()).toEqual(
      ["actorEmployeeId", "consentType", "consentVersion", "consentedAt", "deviceId", "deviceRowId", "employeeId"].sort(),
    );
  });

  // SCENARIO 5 — a serial already held by another employee is rejected.
  it("rejects a serial registered to another employee, naming who to contact", async () => {
    existingUnregisteredRow();
    state.clash = [{ employeeId: "emp-OTHER" }];
    const r = await completeDeviceRegistration(ME, { deviceName: "5CD1234ABC", consent: true });
    expect(r).toMatchObject({ ok: false, field: "deviceName" });
    if (!r.ok) expect(r.error).toMatch(/another employee/i);
    expect(state.deviceUpdates).toHaveLength(0);
    expect(state.consentInserts).toHaveLength(0);
  });

  it("tells an employee plainly when the clash is their own laptop", async () => {
    existingUnregisteredRow();
    state.clash = [{ employeeId: "emp-1" }];
    const r = await completeDeviceRegistration(ME, { deviceName: "5CD1234ABC", consent: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/already registered to you/i);
  });

  // SCENARIO 7/8, the write half — a phone registers with no serial at all.
  it("registers a phone without asking for or storing a serial", async () => {
    state.requestKind = "phone";
    state.ua = IPHONE_UA;
    state.cookieId = "web_iphone";
    state.deviceRow = {
      id: "row-p",
      employeeId: "emp-1",
      deviceId: "web_iphone",
      kind: "phone",
      status: "approved",
      registeredAt: null,
    };

    const r = await completeDeviceRegistration(ME, { consent: true });
    expect(r).toMatchObject({ ok: true, deviceRowId: "row-p" });
    expect(state.deviceUpdates[0]!.deviceName).toBeNull();
    expect(state.consentInserts).toHaveLength(1);
  });

  it("creates a row when none exists yet, and carries the device cookie", async () => {
    state.cookieId = null;
    state.deviceRow = null;
    const r = await completeDeviceRegistration(ME, { deviceName: "PF0X9K2", consent: true });
    expect(r).toMatchObject({ ok: true, deviceRowId: "new-row-id" });
    expect(state.deviceInserts[0]).toMatchObject({
      employeeId: "emp-1",
      kind: "laptop",
      status: "approved",
      deviceName: "PF0X9K2",
    });
    expect(state.cookieSets[0]?.name).toBe("att_device");
  });

  it("lands PENDING rather than refusing when the slot is already taken", async () => {
    // The cap is the database's to enforce. This path is reached only when a row
    // is being created for a device the modal was already showing for.
    state.cookieId = "web_new";
    state.deviceRow = null;
    let call = 0;
    // Free for the modal decision, full by the time the row is written.
    const mod = await import("@/lib/security/device-access");
    vi.spyOn(mod, "hasApprovedDeviceOfKind").mockImplementation(() => Promise.resolve(call++ > 0));

    const r = await completeDeviceRegistration(ME, { deviceName: "PF0X9K2", consent: true });
    expect(r.ok).toBe(true);
    expect(state.deviceInserts[0]).toMatchObject({ status: "pending", approvedAt: null });
    vi.restoreAllMocks();
  });

  it("is a no-op, not an error, when there is nothing left to register", async () => {
    // A second tab, or a double submit.
    state.cookieId = "web_known";
    state.deviceRow = {
      id: "row-1",
      employeeId: "emp-1",
      deviceId: "web_known",
      kind: "laptop",
      status: "approved",
      registeredAt: new Date(),
    };
    const r = await completeDeviceRegistration(ME, { deviceName: "5CD1234ABC", consent: true });
    expect(r.ok).toBe(true);
    expect(state.deviceUpdates).toHaveLength(0);
    expect(state.consentInserts).toHaveLength(0);
  });
});
