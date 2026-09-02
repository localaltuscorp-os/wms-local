import { describe, expect, it } from "vitest";
import { BulkEditEmployeesSchema } from "@/lib/validators/employee";
import {
  hoursLabel,
  requirementFor,
  targetsFor,
  to12h,
} from "@/components/admin/employee-editor/schedule-format";

/**
 * The schedule panel must show what ATTENDANCE actually enforces. These assert
 * the figures come out of `lib/attendance/hours-rule.ts` with the values
 * the spec asked for — if someone changes the policy there, these fail loudly
 * rather than the admin screen quietly lying about the requirement.
 */
describe("schedule requirement display", () => {
  it("shows the full-time requirement as 9h/day · 54h/week", () => {
    expect(requirementFor("full_time")).toBe("9h/day · 54h/week");
    expect(targetsFor("full_time")).toEqual({ daily: 540, weekly: 3240 });
  });

  it("shows the hourly-shift requirement as 5h/day · 30h/week", () => {
    expect(requirementFor("hybrid")).toBe("5h/day · 30h/week");
    expect(targetsFor("hybrid")).toEqual({ daily: 300, weekly: 1800 });
  });

  /**
   * Afternoon/college shift shares the part-timer's schedule (Sir, 2026-08) —
   * it used to inherit 9h/54h purely by not being `hybrid`.
   */
  it("puts afternoon/college shift on the SAME 5h/30h as part-time", () => {
    expect(requirementFor("second_half")).toBe("5h/day · 30h/week");
    expect(targetsFor("second_half")).toEqual(targetsFor("hybrid"));
  });

  it("leaves project/remote on the full-time day", () => {
    expect(requirementFor("project_remote")).toBe("9h/day · 54h/week");
  });

  it("formats hours without trailing noise", () => {
    expect(hoursLabel(540)).toBe("9h");
    expect(hoursLabel(270)).toBe("4.5h");
    expect(hoursLabel(0)).toBe("0h");
  });

  it("renders 24h times for the summary line", () => {
    expect(to12h("10:00")).toBe("10:00 AM");
    expect(to12h("19:00")).toBe("7:00 PM");
    expect(to12h("00:30")).toBe("12:30 AM");
    expect(to12h("12:05")).toBe("12:05 PM");
  });

  it("returns blank for anything that is not a real HH:mm", () => {
    expect(to12h("")).toBe("");
    expect(to12h("7:00")).toBe("");
    expect(to12h("99:99")).toBe("");
  });
});

/**
 * THE bulk-edit safety property: a patch carries ONLY the fields the admin
 * touched. An absent key means "leave it alone"; null / "" on a time field means
 * "clear this override back to the company default". Those are different
 * intentions and the schema has to keep them distinguishable.
 */
describe("BulkEditEmployeesSchema", () => {
  it("accepts a single-field patch and adds nothing to it", () => {
    const parsed = BulkEditEmployeesSchema.parse({ workerType: "hybrid" });
    expect(parsed).toEqual({ workerType: "hybrid" });
    expect(Object.keys(parsed)).toHaveLength(1);
  });

  it("keeps several touched fields and still omits the rest", () => {
    const parsed = BulkEditEmployeesSchema.parse({
      workerType: "hybrid",
      weeklyOff: 6,
    });
    expect(Object.keys(parsed).sort()).toEqual(["weeklyOff", "workerType"]);
    expect("attOfficialStart" in parsed).toBe(false);
    expect("attLateAfter" in parsed).toBe(false);
  });

  it("distinguishes 'clear the override' from 'do not touch'", () => {
    const cleared = BulkEditEmployeesSchema.parse({ attOfficialStart: "" });
    expect("attOfficialStart" in cleared).toBe(true);
    expect(cleared.attOfficialStart).toBe("");

    const nulled = BulkEditEmployeesSchema.parse({ attLateAfter: null });
    expect(nulled.attLateAfter).toBeNull();

    const untouched = BulkEditEmployeesSchema.parse({ weeklyOff: 0 });
    expect("attOfficialStart" in untouched).toBe(false);
  });

  it("rejects an empty patch rather than writing nothing to everyone", () => {
    const res = BulkEditEmployeesSchema.safeParse({});
    expect(res.success).toBe(false);
  });

  it("rejects out-of-range and malformed values", () => {
    expect(BulkEditEmployeesSchema.safeParse({ weeklyOff: 7 }).success).toBe(false);
    expect(BulkEditEmployeesSchema.safeParse({ weeklyOff: -1 }).success).toBe(false);
    expect(BulkEditEmployeesSchema.safeParse({ attOfficialEnd: "7pm" }).success).toBe(false);
    expect(BulkEditEmployeesSchema.safeParse({ dailyTaskQuota: 51 }).success).toBe(false);
    expect(BulkEditEmployeesSchema.safeParse({ workerType: "contractor" }).success).toBe(false);
  });

  /**
   * Name / phone / admin are per-person or privilege-granting. `.strict()` is
   * what stops a caller from smuggling them into a bulk apply.
   */
  it("refuses fields that must never be applied to many people at once", () => {
    expect(BulkEditEmployeesSchema.safeParse({ name: "Someone" }).success).toBe(false);
    expect(BulkEditEmployeesSchema.safeParse({ isAdmin: true }).success).toBe(false);
    expect(
      BulkEditEmployeesSchema.safeParse({ whatsappPhone: "+919820062511" }).success,
    ).toBe(false);
  });

  it("allows clearing the manager, and setting one", () => {
    expect(BulkEditEmployeesSchema.parse({ managerId: null }).managerId).toBeNull();
    const id = "0705ae8a-888b-44df-8a8e-ca6a98c5bbba";
    expect(BulkEditEmployeesSchema.parse({ managerId: id }).managerId).toBe(id);
  });
});
