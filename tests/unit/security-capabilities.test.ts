import { describe, it, expect } from "vitest";
import {
  hasCapability,
  deviceRestrictionRequired,
  canManageDevices,
  canManageOthersAttendance,
  canViewAttendanceAuditLog,
} from "@/lib/security/capabilities";

/**
 * WHO HOLDS WHAT.
 *
 * These assertions are the written form of the access rules, so they name real
 * addresses on purpose: a test that only checked "some address has the
 * capability" would keep passing if the registry were emptied.
 *
 * The negative cases matter more than the positive ones. Every one of them is a
 * person who is legitimately signed in — an ordinary employee, an ordinary
 * admin, an attendance administrator — and must still be refused.
 */

const MANAN = "manan@unleashed.in";
const RUCHITA = "ruchitaambre.altuscorp@gmail.com";
const RUTVISHA = "rutvishamehta.altuscorp@gmail.com";

/** An ordinary employee. */
const EMPLOYEE = "om.jadhav@example.invalid";
/** On ATTENDANCE_ADMIN_EMAILS but NOT a device manager — the case the narrowing
 *  in this change exists to produce, and the easiest one to regress. */
const ATTENDANCE_ADMIN_ONLY = "omjadhav.altuscorp@gmail.com";
/** On SUPER_ADMIN_EMAILS but with no device/attendance capability. */
const SUPER_ADMIN_ONLY = "rohanchoudhary.altuscorp@gmail.com";

describe("device restriction exemption (the Manan exception)", () => {
  it("exempts Manan from the registered-device restriction", () => {
    expect(deviceRestrictionRequired(MANAN)).toBe(false);
    expect(hasCapability(MANAN, "device.exempt_from_restriction")).toBe(true);
  });

  it("restricts an ordinary employee", () => {
    expect(deviceRestrictionRequired(EMPLOYEE)).toBe(true);
  });

  it("restricts the device MANAGERS themselves", () => {
    // Being allowed to approve devices is not being allowed to skip them.
    expect(deviceRestrictionRequired(RUCHITA)).toBe(true);
    expect(deviceRestrictionRequired(RUTVISHA)).toBe(true);
  });

  it("restricts a super-admin who was not granted the exemption", () => {
    expect(deviceRestrictionRequired(SUPER_ADMIN_ONLY)).toBe(true);
  });

  it("FAILS CLOSED for an unknown, empty or null address", () => {
    // The default for an address nobody has heard of must be "restricted", so a
    // typo in the registry removes an exemption rather than granting one.
    expect(deviceRestrictionRequired("nobody@example.invalid")).toBe(true);
    expect(deviceRestrictionRequired("")).toBe(true);
    expect(deviceRestrictionRequired(null)).toBe(true);
    expect(deviceRestrictionRequired(undefined)).toBe(true);
  });
});

describe("device management (approve / register / revoke)", () => {
  it("grants exactly the four named people", () => {
    expect(canManageDevices(MANAN)).toBe(true);
    expect(canManageDevices(RUCHITA)).toBe(true);
    expect(canManageDevices(RUTVISHA)).toBe(true);
    // Added 2026-09-11 on an explicit operator instruction. He is a super-admin
    // AND a device manager now, which is exactly why the test below had to
    // change shape — see the comment there.
    expect(canManageDevices(SUPER_ADMIN_ONLY)).toBe(true);
  });

  it("refuses an ordinary employee", () => {
    expect(canManageDevices(EMPLOYEE)).toBe(false);
  });

  it("refuses an attendance administrator who is not a device manager", () => {
    // The narrowing this change makes: ATTENDANCE_ADMIN_EMAILS still governs the
    // office-IP allowlist and attendance settings, and no longer governs device
    // authorization.
    expect(canManageDevices(ATTENDANCE_ADMIN_ONLY)).toBe(false);
  });

  it("reads its own grant list, not super-admin status", () => {
    // THIS TEST USED TO NAME ROHAN and assert `false` — he was a super-admin
    // holding no device capability, which proved that super-admin does not
    // imply device management.
    //
    // He was granted `device.manage` on 2026-09-11, and there are only two
    // super-admins, so BOTH now hold it and no real person can express that
    // assertion any more. The guarantee has not changed, but the evidence for
    // it has moved: it now rests on people who are NOT super-admins being
    // refused, which is what these two assertions are. If a third super-admin
    // is ever added without `device.manage`, name them here and restore the
    // direct form — it is the stronger test.
    expect(canManageDevices(ATTENDANCE_ADMIN_ONLY)).toBe(false);
    expect(canManageDevices(EMPLOYEE)).toBe(false);
  });

  it("refuses a missing address", () => {
    expect(canManageDevices(null)).toBe(false);
    expect(canManageDevices("")).toBe(false);
  });
});

describe("privileged attendance management", () => {
  it("grants Ruchita and Rutvisha", () => {
    expect(canManageOthersAttendance(RUCHITA)).toBe(true);
    expect(canManageOthersAttendance(RUTVISHA)).toBe(true);
  });

  it("grants Manan as the founder/super-admin", () => {
    expect(canManageOthersAttendance(MANAN)).toBe(true);
  });

  it("refuses an ordinary employee", () => {
    expect(canManageOthersAttendance(EMPLOYEE)).toBe(false);
  });

  it("refuses an ordinary admin — this is NOT an admin capability", () => {
    expect(canManageOthersAttendance(ATTENDANCE_ADMIN_ONLY)).toBe(false);
    expect(canManageOthersAttendance(SUPER_ADMIN_ONLY)).toBe(false);
  });
});

describe("attendance audit log access", () => {
  it("grants the three privileged people", () => {
    expect(canViewAttendanceAuditLog(MANAN)).toBe(true);
    expect(canViewAttendanceAuditLog(RUCHITA)).toBe(true);
    expect(canViewAttendanceAuditLog(RUTVISHA)).toBe(true);
  });

  it("refuses everyone else, admins included", () => {
    expect(canViewAttendanceAuditLog(EMPLOYEE)).toBe(false);
    expect(canViewAttendanceAuditLog(ATTENDANCE_ADMIN_ONLY)).toBe(false);
    expect(canViewAttendanceAuditLog(SUPER_ADMIN_ONLY)).toBe(false);
  });
});

describe("address matching", () => {
  it("is case-insensitive and tolerates surrounding whitespace", () => {
    // The email arrives from `employees.email`; a capitalised or padded value
    // must not silently lose someone their capability.
    expect(canManageDevices("  Ruchitaambre.AltusCorp@Gmail.com ")).toBe(true);
    expect(deviceRestrictionRequired("MANAN@UNLEASHED.IN")).toBe(false);
  });

  it("does not match a prefix or a lookalike address", () => {
    expect(canManageDevices("manan@unleashed.in.evil.com")).toBe(false);
    expect(canManageDevices("xmanan@unleashed.in")).toBe(false);
    expect(deviceRestrictionRequired("manan@unleashed.in.attacker.test")).toBe(true);
  });
});
