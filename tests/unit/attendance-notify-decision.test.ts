import { describe, it, expect } from "vitest";
import { decideCheckoutNotification } from "@/lib/attendance/status";
import type { AttendanceSchedule } from "@/lib/attendance/schedule";

const sched: AttendanceSchedule = {
  lateAfter: "10:50",
  earlyBefore: "19:20",
  fullDayMinutes: 540,
  halfDayMinutes: 300,
};

describe("decideCheckoutNotification", () => {
  it("returns null when the day isn't finalized (no out)", () => {
    expect(
      decideCheckoutNotification({ inAt: "10:30", outAt: null, sched }),
    ).toBeNull();
  });

  it("returns null for a clean on-time full day", () => {
    expect(
      decideCheckoutNotification({ inAt: "10:30", outAt: "19:30", sched }),
    ).toBeNull();
  });

  it("flags half-day when worked < halfDayMinutes", () => {
    expect(
      decideCheckoutNotification({ inAt: "11:00", outAt: "14:00", sched }),
    ).toBe("attendance_half_day");
  });

  it("waives a late arrival that still completes a full day", () => {
    expect(
      decideCheckoutNotification({ inAt: "11:00", outAt: "20:05", sched }),
    ).toBe("attendance_late_waived");
  });

  it("does NOT waive a late arrival under a full day (but >= half) — returns null", () => {
    // 11:10 → 19:30 is 8h20m: late, but < 9h and >= 5h → graded P, not waived.
    expect(
      decideCheckoutNotification({ inAt: "11:10", outAt: "19:30", sched }),
    ).toBeNull();
  });

  it("waives a left-early day that still hit full hours", () => {
    // in 09:00, out 19:15 (<= earlyBefore 19:20) → leftEarly, worked 615 >= 540.
    expect(
      decideCheckoutNotification({ inAt: "09:00", outAt: "19:15", sched }),
    ).toBe("attendance_late_waived");
  });

  it("half-day takes precedence over a late flag", () => {
    // 11:00 → 12:00 is late AND < half → half-day wins.
    expect(
      decideCheckoutNotification({ inAt: "11:00", outAt: "12:00", sched }),
    ).toBe("attendance_half_day");
  });
});
