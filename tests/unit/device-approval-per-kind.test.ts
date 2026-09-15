import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * setDeviceStatus — the approval cap is counted PER KIND (fixed 0222).
 *
 * ── WHAT WAS WRONG ─────────────────────────────────────────────────────────
 * The count ran across ALL kinds and was then compared against
 * MAX_APPROVED_PER_KIND (= 1). An employee holding one approved PHONE could
 * therefore not have a pending LAPTOP approved: the count returned 1, the
 * comparison tripped, and the administrator was told "already has an approved
 * laptop" while the laptop slot sat empty.
 *
 * The database never agreed with that — `mobile_devices_employee_kind_approved_uq`
 * and `mobile_devices_cap_approved_trg` have been scoped to (employee_id, kind)
 * since 0215. Only this count disagreed.
 *
 * ── HOW THIS TEST CATCHES IT ───────────────────────────────────────────────
 * The `db.select` mock reads the predicate it is handed and counts the way a
 * real database would: scoped to `kind` when a kind filter is present, across
 * every kind when it is not. So the assertions below fail against the old code
 * and pass against the fixed code — rather than asserting the shape of a query
 * string, which would pass against either.
 */

const { state } = vi.hoisted(() => ({
  state: {
    row: null as Record<string, unknown> | null,
    /** The kinds this employee currently holds APPROVED. */
    approved: [] as string[],
    updates: [] as Record<string, unknown>[],
    /** Did the cap count filter on kind at all? */
    countScopedToKind: false,
  },
}));

vi.mock("@/db/schema", () => ({
  mobileDevices: {
    __t: "mobile_devices",
    id: "id",
    employeeId: "employee_id",
    status: "status",
    kind: "kind",
    deviceId: "device_id",
  },
  employees: { __t: "employees", id: "id", name: "name" },
}));

vi.mock("drizzle-orm", () => ({
  and: (...a: unknown[]) => ({ __and: a.filter(Boolean) }),
  eq: (col: unknown, val: unknown) => ({ __eq: [col, val] }),
  ne: () => ({}),
  desc: () => ({}),
  inArray: () => ({}),
  sql: Object.assign((s: TemplateStringsArray) => ({ __sql: s.raw.join("?") }), {
    raw: (s: string) => ({ __raw: s }),
  }),
}));

vi.mock("@/lib/db", () => ({
  db: {
    query: { mobileDevices: { findFirst: () => Promise.resolve(state.row) } },
    update: () => ({
      set: (vals: Record<string, unknown>) => {
        state.updates.push(vals);
        return { where: () => Promise.resolve(undefined) };
      },
    }),
    insert: () => ({ values: () => Promise.resolve(undefined) }),
    select: () => ({
      from: () => ({
        where: (pred: { __and?: { __eq?: [unknown, unknown] }[] }) => {
          const eqs = (pred?.__and ?? []).filter((x) => x?.__eq).map((x) => x.__eq!);
          const kindEq = eqs.find(([col]) => col === "kind");
          state.countScopedToKind = Boolean(kindEq);
          const n = kindEq
            ? state.approved.filter((k) => k === kindEq[1]).length
            : state.approved.length;
          return Promise.resolve([{ n }]);
        },
      }),
    }),
  },
}));

const { setDeviceStatus, MAX_APPROVED_PER_KIND } = await import("@/lib/attendance/mobile-devices");

const ADMIN = "admin-1";

beforeEach(() => {
  state.row = null;
  state.approved = [];
  state.updates = [];
  state.countScopedToKind = false;
});

function pending(kind: "laptop" | "phone") {
  state.row = { id: "row-1", employeeId: "emp-1", kind, status: "pending" };
}

describe("the cap is one per kind", () => {
  it("MAX_APPROVED_PER_KIND is 1", () => {
    expect(MAX_APPROVED_PER_KIND).toBe(1);
  });

  it("counts scoped to the kind being approved, not across kinds", async () => {
    pending("laptop");
    state.approved = ["phone"];
    await setDeviceStatus("row-1", "approved", ADMIN);
    expect(state.countScopedToKind).toBe(true);
  });
});

describe("approval with the other slot occupied", () => {
  // SCENARIO 11 — approved phone + pending laptop → laptop CAN be approved.
  it("approves a laptop for someone who already has an approved phone", async () => {
    pending("laptop");
    state.approved = ["phone"];
    const r = await setDeviceStatus("row-1", "approved", ADMIN);
    expect(r).toEqual({ ok: true });
    expect(state.updates[0]).toMatchObject({ status: "approved", approvedById: ADMIN });
  });

  // SCENARIO 12 — approved laptop + pending phone → phone CAN be approved.
  it("approves a phone for someone who already has an approved laptop", async () => {
    pending("phone");
    state.approved = ["laptop"];
    const r = await setDeviceStatus("row-1", "approved", ADMIN);
    expect(r).toEqual({ ok: true });
    expect(state.updates[0]).toMatchObject({ status: "approved" });
  });
});

describe("the same slot twice is still refused", () => {
  // SCENARIO 13 — a second laptop cannot become approved.
  it("refuses a second laptop", async () => {
    pending("laptop");
    state.approved = ["laptop"];
    const r = await setDeviceStatus("row-1", "approved", ADMIN);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/already has an approved laptop/i);
    expect(state.updates).toHaveLength(0);
  });

  // SCENARIO 14 — a second phone cannot become approved.
  it("refuses a second phone", async () => {
    pending("phone");
    state.approved = ["phone"];
    const r = await setDeviceStatus("row-1", "approved", ADMIN);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/already has an approved phone/i);
    expect(state.updates).toHaveLength(0);
  });

  it("refuses a second laptop even when BOTH slots are full", async () => {
    pending("laptop");
    state.approved = ["laptop", "phone"];
    const r = await setDeviceStatus("row-1", "approved", ADMIN);
    expect(r.ok).toBe(false);
  });
});

describe("unaffected paths", () => {
  it("approves into an entirely empty pair of slots", async () => {
    pending("laptop");
    const r = await setDeviceStatus("row-1", "approved", ADMIN);
    expect(r).toEqual({ ok: true });
  });

  it("re-approving an already-approved row does not trip its own count", async () => {
    state.row = { id: "row-1", employeeId: "emp-1", kind: "laptop", status: "approved" };
    state.approved = ["laptop"];
    const r = await setDeviceStatus("row-1", "approved", ADMIN);
    expect(r).toEqual({ ok: true });
  });

  it("revocation is never capped", async () => {
    state.row = { id: "row-1", employeeId: "emp-1", kind: "laptop", status: "approved" };
    state.approved = ["laptop", "phone"];
    const r = await setDeviceStatus("row-1", "revoked", ADMIN, "Replaced");
    expect(r).toEqual({ ok: true });
    expect(state.updates[0]).toMatchObject({ status: "revoked", revokeReason: "Replaced" });
  });

  it("reports a missing row rather than throwing", async () => {
    state.row = null;
    const r = await setDeviceStatus("nope", "approved", ADMIN);
    expect(r).toMatchObject({ ok: false });
  });
});
