import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { SECURITY_ROLE_DEFS, isSecurityRole } from "@/lib/auth/security-roles-catalog";
import { resolvePunchGeofence } from "@/lib/attendance/record-punch";

vi.mock("@/lib/db", () => ({ db: {} }));

const settings = {
  officeLat: 19.0,
  officeLng: 72.0,
  attendanceRadiusM: 100,
} as never;

describe("Punch From Anywhere", () => {
  it("is an active assignable database role", () => {
    expect(isSecurityRole("attendance_punch_anywhere")).toBe(true);
    expect(SECURITY_ROLE_DEFS.attendance_punch_anywhere.enforced).toBe(true);
  });

  it("permits a punch without GPS when the employee holds the bypass", () => {
    expect(resolvePunchGeofence(settings, undefined, true)).toEqual({
      ok: true,
      distanceM: null,
    });
  });

  it("keeps the normal geofence closed without the bypass", () => {
    expect(resolvePunchGeofence(settings, undefined, false)).toMatchObject({ ok: false });
  });

  it("is consulted by both web and mobile punch paths", () => {
    const web = readFileSync("app/(app)/attendance/actions.ts", "utf8");
    const mobile = readFileSync("app/api/mobile/attendance/punch/route.ts", "utf8");
    for (const source of [web, mobile]) {
      expect(source).toContain("mayPunchAttendanceAnywhere(me)");
      expect(source).toContain("resolvePunchGeofence(settings, location, mayPunchAnywhere)");
    }
    expect(web).toContain("mayPunchAnywhere");
    expect(web).toContain("evaluateOfficeIp");
  });
});
