import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * THE AUTHORIZATION SERVICE — every rule, in one place, against the clock.
 *
 * The device lookup is the only thing mocked. It is the sole database read in
 * the decision path, and stubbing it lets each case state exactly one thing:
 * "Ruchita, on her phone, editing Om's attendance". Everything else — the
 * capability registry, the 15-minute window, the monthly lock, the laptop rule
 * and the audit context — is the real implementation.
 *
 * Scenario numbers refer to the acceptance list in the brief.
 */

type Ctx = {
  allowed: boolean;
  device: { id: string; label: string } | null;
  exempt: boolean;
  kind: "laptop" | "phone" | null;
  reason?: string;
  error?: string;
};

let deviceCtx: Ctx;

vi.mock("@/lib/security/device-access", () => ({
  resolveDeviceContext: async () => deviceCtx,
}));

const { authorizeAttendanceMutation, isPrivilegedChange } = await import(
  "@/lib/security/attendance-authorization"
);

/* ── Fixtures ─────────────────────────────────────────────────────────────── */

const OM = "11111111-1111-4111-8111-111111111111";
const RUCHITA_ID = "22222222-2222-4222-8222-222222222222";
const RUTVISHA_ID = "33333333-3333-4333-8333-333333333333";
const MANAN_ID = "44444444-4444-4444-8444-444444444444";

const person = (id: string, email: string) =>
  ({ id, email, name: email.split("@")[0] }) as never;

const om = person(OM, "om.jadhav@example.invalid");
const ruchita = person(RUCHITA_ID, "ruchitaambre.altuscorp@gmail.com");
const rutvisha = person(RUTVISHA_ID, "rutvishamehta.altuscorp@gmail.com");
const manan = person(MANAN_ID, "manan@unleashed.in");

const laptop = (): Ctx => ({
  allowed: true,
  device: { id: "dev-laptop", label: "Office Dell" },
  exempt: false,
  kind: "laptop",
});
const phone = (): Ctx => ({
  allowed: true,
  device: { id: "dev-phone", label: "Pixel 8" },
  exempt: false,
  kind: "phone",
});
const unknownDevice = (): Ctx => ({
  allowed: false,
  device: null,
  exempt: false,
  kind: null,
  reason: "unregistered",
  error: "This device is not registered for WMS access.",
});
const exemptDevice = (): Ctx => ({ allowed: true, device: null, exempt: true, kind: null });

/** 10:00 IST on 9 September 2026 — the brief's own example. */
const PUNCH_AT = new Date("2026-09-09T04:30:00.000Z");
const SIX_MIN_LATER = new Date("2026-09-09T04:36:00.000Z");
const TWENTY_MIN_LATER = new Date("2026-09-09T04:50:00.000Z");
/** After September's lock (3 October 00:00 IST). */
const AFTER_LOCK = new Date("2026-10-05T06:00:00.000Z");

beforeEach(() => {
  deviceCtx = laptop();
});

/* ── Device gate ──────────────────────────────────────────────────────────── */

describe("device gate", () => {
  it("scenario 5 — refuses any mutation from an unauthorized device", async () => {
    deviceCtx = unknownDevice();
    const r = await authorizeAttendanceMutation({
      actor: om,
      targetEmployeeId: OM,
      logDate: "2026-09-09",
      action: "update",
      existingPunchAt: PUNCH_AT,
      now: SIX_MIN_LATER,
    });
    expect(r.ok).toBe(false);
    // Refused for the DEVICE, before the window is even considered — the window
    // was open, so a wrong ordering here would have allowed it.
    if (!r.ok) expect(r.error).toContain("not registered");
  });

  it("scenario 6 — a device-exempt actor is allowed from an unregistered device", async () => {
    deviceCtx = exemptDevice();
    const r = await authorizeAttendanceMutation({
      actor: manan,
      targetEmployeeId: OM,
      logDate: "2026-09-09",
      action: "update",
      existingPunchAt: PUNCH_AT,
      now: TWENTY_MIN_LATER,
    });
    expect(r.ok).toBe(true);
  });
});

/* ── Whose attendance ─────────────────────────────────────────────────────── */

describe("changing another employee's attendance", () => {
  it("refuses an ordinary employee outright", async () => {
    const r = await authorizeAttendanceMutation({
      actor: om,
      targetEmployeeId: RUCHITA_ID,
      logDate: "2026-09-09",
      action: "update",
      existingPunchAt: PUNCH_AT,
      now: SIX_MIN_LATER, // window open — and still refused
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/not authorized/i);
  });

  it("scenario 16 — Ruchita may, from her registered laptop", async () => {
    const r = await authorizeAttendanceMutation({
      actor: ruchita,
      targetEmployeeId: OM,
      logDate: "2026-09-09",
      action: "update",
      existingPunchAt: PUNCH_AT,
      now: TWENTY_MIN_LATER,
    });
    expect(r.ok).toBe(true);
  });

  it("scenario 17 — Rutvisha may, from her registered laptop", async () => {
    const r = await authorizeAttendanceMutation({
      actor: rutvisha,
      targetEmployeeId: OM,
      logDate: "2026-09-09",
      action: "update",
      existingPunchAt: PUNCH_AT,
      now: TWENTY_MIN_LATER,
    });
    expect(r.ok).toBe(true);
  });

  it("scenario 18 — Ruchita may NOT, from her registered phone", async () => {
    deviceCtx = phone();
    const r = await authorizeAttendanceMutation({
      actor: ruchita,
      targetEmployeeId: OM,
      logDate: "2026-09-09",
      action: "update",
      existingPunchAt: PUNCH_AT,
      now: TWENTY_MIN_LATER,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/laptop/i);
  });

  it("scenario 19 — Rutvisha may NOT, from her registered phone", async () => {
    deviceCtx = phone();
    const r = await authorizeAttendanceMutation({
      actor: rutvisha,
      targetEmployeeId: OM,
      logDate: "2026-09-09",
      action: "update",
      existingPunchAt: PUNCH_AT,
      now: TWENTY_MIN_LATER,
    });
    expect(r.ok).toBe(false);
  });

  it("but Ruchita MAY change her OWN attendance from her phone", async () => {
    // The distinction the brief draws: the phone is fine for yourself, and only
    // the laptop is acceptable for somebody else.
    deviceCtx = phone();
    const r = await authorizeAttendanceMutation({
      actor: ruchita,
      targetEmployeeId: RUCHITA_ID,
      logDate: "2026-09-09",
      action: "update",
      existingPunchAt: PUNCH_AT,
      now: SIX_MIN_LATER,
    });
    expect(r.ok).toBe(true);
  });
});

/* ── The 15-minute window ─────────────────────────────────────────────────── */

describe("15-minute self-correction window", () => {
  it("scenario 13 — an employee may correct their own punch within 15 minutes", async () => {
    const r = await authorizeAttendanceMutation({
      actor: om,
      targetEmployeeId: OM,
      logDate: "2026-09-09",
      action: "update",
      existingPunchAt: PUNCH_AT,
      now: SIX_MIN_LATER,
    });
    expect(r.ok).toBe(true);
    // Not privileged — an ordinary self-correction, so not audited.
    if (r.ok) expect(isPrivilegedChange(r.context)).toBe(false);
  });

  it("scenarios 14 & 15 — refused after 15 minutes, however the call arrives", async () => {
    // There is no UI in this test. This IS the API-level check, which is what
    // the requirement asks for: a hand-crafted call gets the same refusal.
    const r = await authorizeAttendanceMutation({
      actor: om,
      targetEmployeeId: OM,
      logDate: "2026-09-09",
      action: "update",
      existingPunchAt: PUNCH_AT,
      now: TWENTY_MIN_LATER,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/15 minutes/);
  });

  it("refuses an employee editing a day with no punch on file", async () => {
    const r = await authorizeAttendanceMutation({
      actor: om,
      targetEmployeeId: OM,
      logDate: "2026-09-09",
      action: "update",
      existingPunchAt: null,
      now: SIX_MIN_LATER,
    });
    expect(r.ok).toBe(false);
  });

  it("does not bind a privileged manager", async () => {
    const r = await authorizeAttendanceMutation({
      actor: ruchita,
      targetEmployeeId: RUCHITA_ID,
      logDate: "2026-09-09",
      action: "update",
      existingPunchAt: PUNCH_AT,
      now: TWENTY_MIN_LATER,
    });
    expect(r.ok).toBe(true);
    // Own punch, but past the window — the capability was used, so it IS audited.
    if (r.ok) expect(isPrivilegedChange(r.context)).toBe(true);
  });
});

/* ── The monthly lock ─────────────────────────────────────────────────────── */

describe("monthly lock", () => {
  it("scenario 20 — before the lock, the normal rules apply", async () => {
    // Inside the window → allowed; the lock has no opinion yet.
    const ok = await authorizeAttendanceMutation({
      actor: om,
      targetEmployeeId: OM,
      logDate: "2026-09-09",
      action: "update",
      existingPunchAt: PUNCH_AT,
      now: SIX_MIN_LATER,
    });
    expect(ok.ok).toBe(true);

    // Outside the window → refused by the WINDOW, not the lock.
    const late = await authorizeAttendanceMutation({
      actor: om,
      targetEmployeeId: OM,
      logDate: "2026-09-09",
      action: "update",
      existingPunchAt: PUNCH_AT,
      now: new Date("2026-09-20T06:00:00.000Z"),
    });
    expect(late.ok).toBe(false);
    if (!late.ok) expect(late.error).toMatch(/15 minutes/);
  });

  it("scenario 21 — after the lock, an ordinary user is refused", async () => {
    const r = await authorizeAttendanceMutation({
      actor: om,
      targetEmployeeId: OM,
      logDate: "2026-09-09",
      action: "update",
      existingPunchAt: PUNCH_AT,
      now: AFTER_LOCK,
    });
    expect(r.ok).toBe(false);
    // Refused by the LOCK specifically — checked before the window, so the
    // message names the rule that actually applies to a September record.
    if (!r.ok) expect(r.error).toMatch(/2026-09 locked/);
  });

  it("scenario 22 — Ruchita may change locked attendance", async () => {
    const r = await authorizeAttendanceMutation({
      actor: ruchita,
      targetEmployeeId: OM,
      logDate: "2026-09-09",
      action: "update",
      existingPunchAt: PUNCH_AT,
      now: AFTER_LOCK,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.context.monthLocked).toBe(true);
      expect(r.context.monthLockOverridden).toBe(true);
    }
  });

  it("scenario 23 — Rutvisha may change locked attendance", async () => {
    const r = await authorizeAttendanceMutation({
      actor: rutvisha,
      targetEmployeeId: OM,
      logDate: "2026-09-09",
      action: "update",
      existingPunchAt: PUNCH_AT,
      now: AFTER_LOCK,
    });
    expect(r.ok).toBe(true);
  });

  it("still refuses a privileged manager on a PHONE for someone else's locked record", async () => {
    // The two rules compose: the override does not dissolve the laptop rule.
    deviceCtx = phone();
    const r = await authorizeAttendanceMutation({
      actor: ruchita,
      targetEmployeeId: OM,
      logDate: "2026-09-09",
      action: "update",
      existingPunchAt: PUNCH_AT,
      now: AFTER_LOCK,
    });
    expect(r.ok).toBe(false);
  });
});

/* ── The audit context ────────────────────────────────────────────────────── */

describe("scenario 24 — the authorization context recorded on an audited change", () => {
  it("describes a cross-employee change made past the lock", async () => {
    const r = await authorizeAttendanceMutation({
      actor: ruchita,
      targetEmployeeId: OM,
      logDate: "2026-09-09",
      action: "update",
      existingPunchAt: PUNCH_AT,
      now: AFTER_LOCK,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    expect(r.context).toMatchObject({
      basis: "privileged",
      capability: "attendance.manage_others",
      onBehalfOfOther: true,
      selfWindowOpen: false,
      monthLocked: true,
      monthLockOverridden: true,
      deviceKind: "laptop",
      deviceExempt: false,
    });
    // The device travels with it, so the log can say WHICH laptop.
    expect(r.deviceRowId).toBe("dev-laptop");
    expect(r.deviceLabel).toBe("Office Dell");
    expect(isPrivilegedChange(r.context)).toBe(true);
  });

  it("marks an ordinary self-correction as unprivileged and unaudited", async () => {
    const r = await authorizeAttendanceMutation({
      actor: om,
      targetEmployeeId: OM,
      logDate: "2026-09-09",
      action: "update",
      existingPunchAt: PUNCH_AT,
      now: SIX_MIN_LATER,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.context.basis).toBe("self");
    expect(r.context.capability).toBeUndefined();
    expect(r.context.monthLockOverridden).toBe(false);
    expect(isPrivilegedChange(r.context)).toBe(false);
  });

  it("records a device-exempt actor honestly rather than claiming a device", async () => {
    deviceCtx = exemptDevice();
    const r = await authorizeAttendanceMutation({
      actor: manan,
      targetEmployeeId: OM,
      logDate: "2026-09-09",
      action: "update",
      existingPunchAt: PUNCH_AT,
      now: AFTER_LOCK,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.context.deviceExempt).toBe(true);
    expect(r.context.deviceKind).toBeNull();
    expect(r.deviceRowId).toBeNull();
  });
});
