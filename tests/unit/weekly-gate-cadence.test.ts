import { describe, expect, it } from "vitest";
import { istWeekday, isGateDay, gateCheckpoint } from "@/lib/weekly-goals/gate-cadence";

// Reference IST days. 2026-06-15 is a Monday; the rest follow.
//   Mon 2026-06-15, Tue 16, Wed 17, Thu 18, Fri 19, Sat 20, Sun 21
const at = (iso: string) => new Date(iso);

describe("istWeekday", () => {
  it("maps IST dates to 1..7 (Mon..Sun)", () => {
    expect(istWeekday(at("2026-06-15T06:00:00Z"))).toBe(1); // Mon
    expect(istWeekday(at("2026-06-18T06:00:00Z"))).toBe(4); // Thu
    expect(istWeekday(at("2026-06-21T06:00:00Z"))).toBe(7); // Sun
  });
  it("uses IST, not UTC — late-UTC Sunday is already Monday in IST", () => {
    // 2026-06-14 was a Sunday; 20:00 UTC = 01:30 IST Monday 15th.
    expect(istWeekday(at("2026-06-14T20:00:00Z"))).toBe(1);
  });
});

describe("isGateDay / gateCheckpoint", () => {
  it("gates only on Monday and Thursday", () => {
    expect(isGateDay(at("2026-06-15T06:00:00Z"))).toBe(true); // Mon
    expect(isGateDay(at("2026-06-18T06:00:00Z"))).toBe(true); // Thu
    expect(isGateDay(at("2026-06-16T06:00:00Z"))).toBe(false); // Tue
    expect(isGateDay(at("2026-06-20T06:00:00Z"))).toBe(false); // Sat
  });
  it("checkpoint is null off-gate-days, IST-midnight on gate days", () => {
    expect(gateCheckpoint(at("2026-06-17T06:00:00Z"))).toBeNull(); // Wed
    const mon = gateCheckpoint(at("2026-06-15T12:00:00Z")); // Mon noon UTC
    expect(mon).not.toBeNull();
    // IST midnight of Mon 15th = 2026-06-14T18:30:00Z
    expect(mon!.toISOString()).toBe("2026-06-14T18:30:00.000Z");
  });
  it("a Monday fill is stale by the Thursday checkpoint", () => {
    const monFill = at("2026-06-15T10:00:00Z"); // reported Monday
    const thuCheckpoint = gateCheckpoint(at("2026-06-18T05:00:00Z"))!; // Thu
    expect(monFill < thuCheckpoint).toBe(true); // → must re-report Thursday
  });
});
