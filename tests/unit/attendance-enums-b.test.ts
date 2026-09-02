import { describe, it, expect } from "vitest";
import { ATTENDANCE_CODES, ATTENDANCE_CODE_VALUES, LEAVE_KINDS, LEAVE_STATUS, COMP_OFF_STATUS } from "@/db/enums";
describe("phase-B enums", () => {
  it("codes extended", () => {
    for (const c of ["H","HP","H-H/D","PL","LWP","CO"]) expect(ATTENDANCE_CODES).toContain(c);
    expect(ATTENDANCE_CODE_VALUES["HP"]).toBe(2);
    expect(ATTENDANCE_CODE_VALUES["H-H/D"]).toBe(1.5);
    expect(ATTENDANCE_CODE_VALUES["H"]).toBe(1);
    expect(ATTENDANCE_CODE_VALUES["PL"]).toBe(1);
    expect(ATTENDANCE_CODE_VALUES["LWP"]).toBe(0);
    expect(ATTENDANCE_CODE_VALUES["CO"]).toBe(1);
  });
  it("leave + comp-off enums", () => {
    expect(LEAVE_KINDS).toEqual(["paid","unpaid"]);
    expect(LEAVE_STATUS).toEqual(["pending","approved","rejected","cancelled"]);
    expect(COMP_OFF_STATUS).toEqual(["open","redeemed"]);
  });
});
