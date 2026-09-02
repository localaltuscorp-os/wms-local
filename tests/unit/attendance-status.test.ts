import { describe, it, expect } from "vitest";
import { computeDayCode } from "@/lib/attendance/status";
import type { AttendanceSchedule } from "@/lib/attendance/schedule";
// An EXPLICIT schedule, so these cases exercise the engine directly. In
// production the two cutoffs are resolved per employee from their own daily
// target (lib/attendance/effective-config.ts) — 7h/5h for a 9h full-timer,
// 3.5h/2.5h for a 4.5h part-timer. Grading is three-tier:
//   >= fullDayMinutes -> P,  >= halfDayMinutes -> H/D,  below -> A.
const sched: AttendanceSchedule = { lateAfter:"10:50", earlyBefore:"19:20", fullDayMinutes:540, halfDayMinutes:300 };
const work = { isWeeklyOff:false };
describe("computeDayCode", () => {
  it("present on time", () => {
    const r = computeDayCode({inAt:"10:30", outAt:"19:30"}, sched, work, "20:00");
    expect(r).toMatchObject({ code:"P", dayValue:1, late:false, leftEarly:false, lateWaived:false });
    expect(r.workedMinutes).toBe(540);
  });
  it("late check-in, <9h => half day (Sir's 9h rule)", () => {
    // in 11:10 → out 19:30 = 8h20m worked (<9h) → HALF day now, not a full P.
    const r = computeDayCode({inAt:"11:10", outAt:"19:30"}, sched, work, "20:00");
    expect(r.late).toBe(true); expect(r.code).toBe("H/D"); expect(r.dayValue).toBe(0.5); expect(r.lateWaived).toBe(false);
  });
  it("late but >=9h waives", () => {
    const r = computeDayCode({inAt:"11:00", outAt:"20:05"}, sched, work, "21:00");
    expect(r.late).toBe(true); expect(r.lateWaived).toBe(true); expect(r.code).toBe("P");
  });
  it("left early flagged, <9h => half day", () => {
    // in 10:30 → out 19:00 = 8h30m (<9h) and before 19:20 → early + half day.
    const r = computeDayCode({inAt:"10:30", outAt:"19:00"}, sched, work, "20:00");
    expect(r.leftEarly).toBe(true); expect(r.code).toBe("H/D"); expect(r.dayValue).toBe(0.5);
  });
  it("under the half-day floor => ABSENT, not half day", () => {
    // 11:00 -> 14:00 = 3h, below the 5h floor. Present-but-under-floor now
    // grades A (spec §3). The marks are still recorded for audit (§5).
    const r = computeDayCode({inAt:"11:00", outAt:"14:00"}, sched, work, "20:00");
    expect(r.code).toBe("A"); expect(r.dayValue).toBe(0);
    expect(r.workedMinutes).toBe(180);
  });
  it("at the half-day floor => half day", () => {
    const r = computeDayCode({inAt:"11:00", outAt:"16:00"}, sched, work, "20:00");
    expect(r.code).toBe("H/D"); expect(r.dayValue).toBe(0.5);
  });
  it("absent no check-in", () => {
    const r = computeDayCode({inAt:null, outAt:null}, sched, work, "20:00");
    expect(r.code).toBe("A"); expect(r.dayValue).toBe(0);
  });
  it("check-in but no check-out => half day (Sir #12)", () => {
    const r = computeDayCode({inAt:"10:30", outAt:null}, sched, work, "23:59");
    expect(r.code).toBe("H/D"); expect(r.dayValue).toBe(0.5);
  });
  it("weekly off, no work", () => {
    const r = computeDayCode({inAt:null,outAt:null}, sched, {isWeeklyOff:true}, "20:00");
    expect(r.code).toBe("W/O"); expect(r.dayValue).toBe(1);
  });
});
