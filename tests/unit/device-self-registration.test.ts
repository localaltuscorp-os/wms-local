import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * ADMIN APPROVAL REMOVED (2026-09-09). These tests pin the new contract:
 * an employee registers their own device and punches from it immediately.
 *
 * They also pin what deliberately SURVIVED - the two-device cap, the revoked
 * check and the other-employee check are anti-proxy rules, not part of the
 * approval step, and removing approval must not have loosened them.
 */

const { state } = vi.hoisted(() => ({
  state: {
    row: null as Record<string, unknown> | null,
    activeCount: 0,
    updates: [] as Record<string, unknown>[],
    inserts: [] as Record<string, unknown>[],
    insertThrows: null as string | null,
    updateThrows: null as string | null,
  },
}));

vi.mock("@/lib/db", () => ({
  db: {
    query: { mobileDevices: { findFirst: () => Promise.resolve(state.row) } },
    update: () => ({
      set: (vals: Record<string, unknown>) => {
        state.updates.push(vals);
        return {
          where: () =>
            state.updateThrows
              ? Promise.reject(new Error(state.updateThrows))
              : Promise.resolve(undefined),
        };
      },
    }),
    insert: () => ({
      values: (vals: Record<string, unknown>) => {
        if (state.insertThrows) return Promise.reject(new Error(state.insertThrows));
        state.inserts.push(vals);
        return Promise.resolve(undefined);
      },
    }),
    // activeCount(): select({n}).from().where() → [{ n }]
    select: () => ({ from: () => ({ where: () => Promise.resolve([{ n: state.activeCount }]) }) }),
  },
}));

vi.mock("@/db/schema", () => ({
  mobileDevices: { id: "id", deviceId: "device_id", employeeId: "employee_id", status: "status" },
}));

vi.mock("drizzle-orm", () => ({
  and: (...a: unknown[]) => ({ __and: a }),
  eq: () => ({}),
  inArray: () => ({}),
  sql: Object.assign((s: TemplateStringsArray) => ({ __sql: s.raw.join("?") }), {
    raw: (s: string) => ({ __raw: s }),
  }),
}));

const { registerMobileDevice, resolveMobileDevice, getDeviceStatusFor, MAX_DEVICES_PER_EMPLOYEE } =
  await import("@/lib/attendance/mobile-devices");

const ME = "emp-1";

beforeEach(() => {
  state.row = null;
  state.activeCount = 0;
  state.updates = [];
  state.inserts = [];
  state.insertThrows = null;
  state.updateThrows = null;
});

describe("registerMobileDevice — no admin approval", () => {
  it("enrols a brand-new device as APPROVED, usable at once", async () => {
    const res = await registerMobileDevice(ME, { deviceId: "dev-a", label: "Pixel" });
    expect(res).toMatchObject({ ok: true, status: "approved", isNew: true });
    expect(state.inserts[0]).toMatchObject({ status: "approved" });
    // The old flow wrote 'pending' here; nothing may write it again.
    expect(state.inserts[0]?.status).not.toBe("pending");
  });

  it("promotes a LEGACY pending row instead of leaving it stranded", async () => {
    // Enrolled before the change, never approved, and no admin left to do it.
    state.row = { id: "r1", employeeId: ME, status: "pending" };
    const res = await registerMobileDevice(ME, { deviceId: "dev-a" });
    expect(res).toMatchObject({ ok: true, status: "approved" });
    expect(state.updates[0]).toMatchObject({ status: "approved" });
  });

  it("brings a REVOKED own device straight back to usable", async () => {
    state.row = { id: "r1", employeeId: ME, status: "revoked", label: "old" };
    const res = await registerMobileDevice(ME, { deviceId: "dev-a" });
    expect(res).toMatchObject({ ok: true, status: "approved", isNew: true });
    expect(state.updates[0]).toMatchObject({ status: "approved", revokedAt: null });
  });

  it("STILL refuses a device already held by someone else", async () => {
    state.row = { id: "r1", employeeId: "someone-else", status: "approved" };
    const res = await registerMobileDevice(ME, { deviceId: "dev-a" });
    expect(res.ok).toBe(false);
  });

  it("STILL enforces the per-employee cap — the anti-proxy rule survives", async () => {
    state.activeCount = MAX_DEVICES_PER_EMPLOYEE;
    const res = await registerMobileDevice(ME, { deviceId: "dev-new" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain(String(MAX_DEVICES_PER_EMPLOYEE));
    expect(state.inserts).toHaveLength(0);
  });

  it("rejects a malformed device id", async () => {
    expect((await registerMobileDevice(ME, { deviceId: "   " })).ok).toBe(false);
    expect((await registerMobileDevice(ME, { deviceId: "x".repeat(201) })).ok).toBe(false);
  });
});

describe("resolveMobileDevice — punch-time gate", () => {
  it("lets an approved own device punch", async () => {
    state.row = { id: "r1", employeeId: ME, status: "approved" };
    expect(await resolveMobileDevice(ME, { deviceId: "dev-a" })).toMatchObject({ ok: true, rowId: "r1" });
  });

  it("lets a LEGACY pending device punch, healing it on the way through", async () => {
    // The whole point: with no approver left, a pending row must not be a wall.
    state.row = { id: "r1", employeeId: ME, status: "pending" };
    const res = await resolveMobileDevice(ME, { deviceId: "dev-a" });
    expect(res).toMatchObject({ ok: true, rowId: "r1" });
    expect(state.updates[0]).toMatchObject({ status: "approved" });
  });

  it("STILL refuses a revoked device", async () => {
    state.row = { id: "r1", employeeId: ME, status: "revoked" };
    const res = await resolveMobileDevice(ME, { deviceId: "dev-a" });
    expect(res).toMatchObject({ ok: false, reason: "revoked" });
  });

  it("STILL refuses another employee's device", async () => {
    state.row = { id: "r1", employeeId: "someone-else", status: "approved" };
    const res = await resolveMobileDevice(ME, { deviceId: "dev-a" });
    expect(res).toMatchObject({ ok: false, reason: "other_employee" });
  });

  it("refuses an unregistered device WITHOUT telling anyone to await approval", async () => {
    state.row = null;
    const res = await resolveMobileDevice(ME, { deviceId: "dev-a" });
    expect(res).toMatchObject({ ok: false, reason: "unregistered" });
    if (!res.ok) expect(res.error.toLowerCase()).not.toContain("approv");
  });

  it("never answers 'pending' any more", async () => {
    for (const status of ["approved", "pending"]) {
      state.row = { id: "r1", employeeId: ME, status };
      const res = await resolveMobileDevice(ME, { deviceId: "dev-a" });
      expect(res.ok).toBe(true);
    }
  });
});

describe("getDeviceStatusFor — what the app's Register button reads", () => {
  it("reports a legacy pending row as approved, so no stale Register button shows", async () => {
    state.row = { id: "r1", employeeId: ME, status: "pending" };
    expect(await getDeviceStatusFor(ME, "dev-a")).toBe("approved");
  });

  it("still distinguishes unregistered / revoked / someone else's", async () => {
    state.row = null;
    expect(await getDeviceStatusFor(ME, "dev-a")).toBe("unregistered");
    state.row = { id: "r1", employeeId: ME, status: "revoked" };
    expect(await getDeviceStatusFor(ME, "dev-a")).toBe("revoked");
    state.row = { id: "r1", employeeId: "other", status: "approved" };
    expect(await getDeviceStatusFor(ME, "dev-a")).toBe("other");
  });
});

describe("legacy pending rows cannot breach the two-device cap", () => {
  // The old WEB path counted only APPROVED rows before writing a pending one, so
  // "2 approved + a pending third" exists in real data. Promoting that third
  // breaches the 0214 trigger; the employee must be told the cap, not shown a
  // raw SQL error at the moment they are trying to clock in.
  const CAP_ERROR = 'mobile_devices_cap_approved_trg: employee already has 2 approved devices';

  it("resolveMobileDevice reports the cap instead of leaking the trigger error", async () => {
    state.row = { id: "r3", employeeId: ME, status: "pending" };
    state.updateThrows = CAP_ERROR;
    const res = await resolveMobileDevice(ME, { deviceId: "dev-c" });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toBe("device_limit");
      expect(res.error).toContain(String(MAX_DEVICES_PER_EMPLOYEE));
      expect(res.error).not.toContain("trg");
    }
  });

  it("registerMobileDevice does the same when re-tapping Register", async () => {
    state.row = { id: "r3", employeeId: ME, status: "pending" };
    state.updateThrows = CAP_ERROR;
    const res = await registerMobileDevice(ME, { deviceId: "dev-c" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).not.toContain("trg");
  });

  it("an approved device is untouched by this - it only stamps lastUsedAt", async () => {
    state.row = { id: "r1", employeeId: ME, status: "approved" };
    const res = await resolveMobileDevice(ME, { deviceId: "dev-a" });
    expect(res.ok).toBe(true);
    expect(state.updates[0]).not.toHaveProperty("status");
  });
});
