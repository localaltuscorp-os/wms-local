import { describe, it, expect } from "vitest";
import { computeDayCode } from "@/lib/attendance/status";
import type { AttendanceSchedule } from "@/lib/attendance/schedule";
const s: AttendanceSchedule = { lateAfter:"10:50", earlyBefore:"19:20", fullDayMinutes:540, halfDayMinutes:300 };
describe("computeDayCode phase-B", () => {
  it("paid leave → PL", () => expect(computeDayCode({inAt:null,outAt:null}, s, {isWeeklyOff:false, leave:"paid"}, "20:00").code).toBe("PL"));
  it("unpaid leave → LWP val 0", () => { const r=computeDayCode({inAt:null,outAt:null}, s, {isWeeklyOff:false, leave:"unpaid"}, "20:00"); expect(r.code).toBe("LWP"); expect(r.dayValue).toBe(0); });
  it("comp-off redeemed → CO", () => expect(computeDayCode({inAt:null,outAt:null}, s, {isWeeklyOff:false, compOffRedeemed:true}, "20:00").code).toBe("CO"));
  it("holiday no work → H", () => expect(computeDayCode({inAt:null,outAt:null}, s, {isWeeklyOff:false, isHoliday:true}, "20:00").code).toBe("H"));
  it("holiday worked 8h → HP val 2", () => { const r=computeDayCode({inAt:"10:00",outAt:"18:00"}, s, {isWeeklyOff:false, isHoliday:true}, "20:00"); expect(r.code).toBe("HP"); expect(r.dayValue).toBe(2); });
  it("holiday worked 3h → H-H/D val 1.5", () => { const r=computeDayCode({inAt:"10:00",outAt:"13:00"}, s, {isWeeklyOff:false, isHoliday:true}, "20:00"); expect(r.code).toBe("H-H/D"); expect(r.dayValue).toBe(1.5); });
  it("weekly-off worked → HP", () => expect(computeDayCode({inAt:"10:00",outAt:"18:00"}, s, {isWeeklyOff:true}, "20:00").code).toBe("HP"));
});
