import { describe, it, expect } from "vitest";
import { computeDayCode } from "@/lib/attendance/status";
import type { AttendanceSchedule } from "@/lib/attendance/schedule";
const sched: AttendanceSchedule = { lateAfter:"10:50", earlyBefore:"19:20", fullDayMinutes:540, halfDayMinutes:300 };
const work = { isWeeklyOff:false };
describe("computeDayCode", () => {
  it("present on time", () => {
    const r = computeDayCode({inAt:"10:30", outAt:"19:30"}, sched, work, "20:00");
    expect(r).toMatchObject({ code:"P", dayValue:1, late:false, leftEarly:false, lateWaived:false });
    expect(r.workedMinutes).toBe(540);
  });
  it("late check-in, <9h not waived", () => {
    const r = computeDayCode({inAt:"11:10", outAt:"19:30"}, sched, work, "20:00");
    expect(r.late).toBe(true); expect(r.code).toBe("P"); expect(r.lateWaived).toBe(false);
  });
  it("late but >=9h waives", () => {
    const r = computeDayCode({inAt:"11:00", outAt:"20:05"}, sched, work, "21:00");
    expect(r.late).toBe(true); expect(r.lateWaived).toBe(true); expect(r.code).toBe("P");
  });
  it("left early flagged", () => {
    const r = computeDayCode({inAt:"10:30", outAt:"19:00"}, sched, work, "20:00");
    expect(r.leftEarly).toBe(true); expect(r.code).toBe("P");
  });
  it("half day under 5h", () => {
    const r = computeDayCode({inAt:"11:00", outAt:"14:00"}, sched, work, "20:00");
    expect(r.code).toBe("H/D"); expect(r.dayValue).toBe(0.5);
  });
  it("absent no check-in", () => {
    const r = computeDayCode({inAt:null, outAt:null}, sched, work, "20:00");
    expect(r.code).toBe("A"); expect(r.dayValue).toBe(0);
  });
  it("incomplete: in but no out", () => {
    const r = computeDayCode({inAt:"10:30", outAt:null}, sched, work, "23:59");
    expect(r.code).toBe("incomplete");
  });
  it("weekly off, no work", () => {
    const r = computeDayCode({inAt:null,outAt:null}, sched, {isWeeklyOff:true}, "20:00");
    expect(r.code).toBe("W/O"); expect(r.dayValue).toBe(1);
  });
});
