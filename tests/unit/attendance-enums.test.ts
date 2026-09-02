import { describe, it, expect } from "vitest";
import { ATTENDANCE_CODES, ATTENDANCE_CODE_VALUES, PUNCH_SOURCES, PUNCH_REASONS } from "@/db/enums";
describe("attendance enums", () => {
  it("codes + day-values", () => {
    // Phase B (0059) extends this list; assert the Phase-A codes still exist.
    for (const c of ["P","H/D","A","W/O","incomplete"]) expect(ATTENDANCE_CODES).toContain(c);
    expect(ATTENDANCE_CODE_VALUES["P"]).toBe(1);
    expect(ATTENDANCE_CODE_VALUES["H/D"]).toBe(0.5);
    expect(ATTENDANCE_CODE_VALUES["A"]).toBe(0);
    expect(ATTENDANCE_CODE_VALUES["W/O"]).toBe(1);
  });
  it("punch source + reasons", () => {
    expect(PUNCH_SOURCES).toEqual(["self","admin"]);
    expect(PUNCH_REASONS).toEqual(["client_visit","wfh","forgot","correction"]);
  });
});
