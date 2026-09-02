import { describe, it, expect } from "vitest";
import {
  AdminUpsertPunch,
  AdminEditDayTimes,
  AdminDeletePunch,
} from "@/lib/validators/attendance";

const EMP = "11111111-1111-4111-8111-111111111111";

describe("AdminUpsertPunch", () => {
  it("accepts a valid punch", () => {
    const r = AdminUpsertPunch.safeParse({
      employeeId: EMP,
      logDate: "2026-06-14",
      kind: "in",
      timeHHmm: "10:30",
      reason: "forgot",
    });
    expect(r.success).toBe(true);
  });

  it("rejects a bad time format", () => {
    const r = AdminUpsertPunch.safeParse({
      employeeId: EMP,
      logDate: "2026-06-14",
      kind: "in",
      timeHHmm: "9:5",
      reason: "forgot",
    });
    expect(r.success).toBe(false);
  });

  it("rejects an unknown reason", () => {
    const r = AdminUpsertPunch.safeParse({
      employeeId: EMP,
      logDate: "2026-06-14",
      kind: "in",
      timeHHmm: "10:30",
      reason: "vacation",
    });
    expect(r.success).toBe(false);
  });

  it("rejects a bad date format", () => {
    const r = AdminUpsertPunch.safeParse({
      employeeId: EMP,
      logDate: "14-06-2026",
      kind: "in",
      timeHHmm: "10:30",
      reason: "forgot",
    });
    expect(r.success).toBe(false);
  });

  it("rejects a non-uuid employee id", () => {
    const r = AdminUpsertPunch.safeParse({
      employeeId: "not-a-uuid",
      logDate: "2026-06-14",
      kind: "in",
      timeHHmm: "10:30",
      reason: "forgot",
    });
    expect(r.success).toBe(false);
  });

  it("rejects an unknown kind", () => {
    const r = AdminUpsertPunch.safeParse({
      employeeId: EMP,
      logDate: "2026-06-14",
      kind: "lunch",
      timeHHmm: "10:30",
      reason: "forgot",
    });
    expect(r.success).toBe(false);
  });

  it("rejects extra keys (strict)", () => {
    const r = AdminUpsertPunch.safeParse({
      employeeId: EMP,
      logDate: "2026-06-14",
      kind: "in",
      timeHHmm: "10:30",
      reason: "forgot",
      extra: true,
    });
    expect(r.success).toBe(false);
  });
});

describe("AdminEditDayTimes", () => {
  it("accepts in only", () => {
    const r = AdminEditDayTimes.safeParse({
      employeeId: EMP,
      logDate: "2026-06-14",
      inHHmm: "10:30",
    });
    expect(r.success).toBe(true);
  });

  it("accepts both", () => {
    const r = AdminEditDayTimes.safeParse({
      employeeId: EMP,
      logDate: "2026-06-14",
      inHHmm: "10:30",
      outHHmm: "19:30",
    });
    expect(r.success).toBe(true);
  });

  it("rejects when neither time is supplied", () => {
    const r = AdminEditDayTimes.safeParse({
      employeeId: EMP,
      logDate: "2026-06-14",
    });
    expect(r.success).toBe(false);
  });

  it("rejects a bad time format", () => {
    const r = AdminEditDayTimes.safeParse({
      employeeId: EMP,
      logDate: "2026-06-14",
      outHHmm: "7pm",
    });
    expect(r.success).toBe(false);
  });
});

describe("AdminDeletePunch", () => {
  it("accepts a valid delete", () => {
    const r = AdminDeletePunch.safeParse({
      employeeId: EMP,
      logDate: "2026-06-14",
      kind: "out",
    });
    expect(r.success).toBe(true);
  });

  it("rejects a bad date", () => {
    const r = AdminDeletePunch.safeParse({
      employeeId: EMP,
      logDate: "2026/06/14",
      kind: "out",
    });
    expect(r.success).toBe(false);
  });
});
