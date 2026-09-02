import { describe, expect, it } from "vitest";
import {
  mergeScheduleForBulk,
  type CurrentRates,
  type CurrentSchedule,
} from "@/lib/employees/bulk-schedule-merge";

/**
 * The failure this guards against: an admin ticks 25 people, changes ONLY
 * Worker Type, and every one of them silently loses their start/end times,
 * their weekly off and their pay rates — because the underlying schedule action
 * writes all of those columns unconditionally.
 */

const FULL_TIMER: CurrentSchedule = {
  weeklyOff: 0,
  attOfficialStart: "10:00:00",
  attLateAfter: "10:50:00",
  attOfficialEnd: "19:00:00",
  attEarlyBefore: "19:20:00",
  workerType: "full_time",
  attFullDayMinutes: null,
  attHalfDayMinutes: null,
  weeklyTargetMinutes: null,
};

const PART_TIMER: CurrentSchedule = {
  ...FULL_TIMER,
  workerType: "hybrid",
  weeklyTargetMinutes: 1620,
};

const RATES: CurrentRates = {
  monthlyPayAtTarget: "3500.00",
  weeklyTargetHours: "27.00",
  monthlyFee: null,
};

const ID = "0705ae8a-888b-44df-8a8e-ca6a98c5bbba";

describe("mergeScheduleForBulk", () => {
  it("changing ONLY weekly off leaves every other field exactly as it was", () => {
    const out = mergeScheduleForBulk(ID, FULL_TIMER, undefined, { weeklyOff: 6 });
    expect(out.weeklyOff).toBe(6);
    expect(out.attOfficialStart).toBe("10:00");
    expect(out.attLateAfter).toBe("10:50");
    expect(out.attOfficialEnd).toBe("19:00");
    expect(out.attEarlyBefore).toBe("19:20");
    expect(out.workerType).toBe("full_time");
  });

  it("changing ONLY worker type keeps the times and the weekly off", () => {
    const out = mergeScheduleForBulk(ID, FULL_TIMER, undefined, {
      workerType: "hybrid",
    });
    expect(out.workerType).toBe("hybrid");
    expect(out.weeklyOff).toBe(FULL_TIMER.weeklyOff);
    expect(out.attOfficialStart).toBe("10:00");
    expect(out.attOfficialEnd).toBe("19:00");
  });

  it("carries a part-timer's pay rates through a schedule-only edit", () => {
    const out = mergeScheduleForBulk(ID, PART_TIMER, RATES, { weeklyOff: 6 });
    expect(out.monthlyPayAtTarget).toBe(3500);
    expect(out.weeklyTargetHours).toBe(27);
    expect(out.weeklyTargetMinutes).toBe(1620);
  });

  it("trims Postgres HH:mm:ss down to the HH:mm the validator accepts", () => {
    const out = mergeScheduleForBulk(ID, FULL_TIMER, undefined, { weeklyOff: 1 });
    for (const v of [
      out.attOfficialStart,
      out.attLateAfter,
      out.attOfficialEnd,
      out.attEarlyBefore,
    ]) {
      expect(v).toMatch(/^\d{2}:\d{2}$/);
    }
  });

  /**
   * Absent and empty are different intentions and must stay different: absent
   * keeps the employee's override, empty deletes it.
   */
  it("treats an explicitly emptied time as 'clear the override'", () => {
    const out = mergeScheduleForBulk(ID, FULL_TIMER, undefined, {
      attOfficialStart: "",
    });
    expect(out.attOfficialStart).toBeNull();
    // …and the ones that were never touched still survive.
    expect(out.attOfficialEnd).toBe("19:00");
  });

  it("treats an explicit null the same way as an empty string", () => {
    const out = mergeScheduleForBulk(ID, FULL_TIMER, undefined, { attLateAfter: null });
    expect(out.attLateAfter).toBeNull();
    expect(out.attEarlyBefore).toBe("19:20");
  });

  it("applies a new time when one is given", () => {
    const out = mergeScheduleForBulk(ID, FULL_TIMER, undefined, {
      attOfficialStart: "09:30",
      attOfficialEnd: "18:30",
    });
    expect(out.attOfficialStart).toBe("09:30");
    expect(out.attOfficialEnd).toBe("18:30");
    expect(out.attLateAfter).toBe("10:50");
  });

  /**
   * Type-specific columns belong to ONE worker type. Moving someone off that
   * type has to release them, exactly as the single-employee editor does —
   * otherwise a part-time weekly target would keep pricing a full-timer.
   */
  it("releases type-specific fields when the worker type moves away", () => {
    const afternoon: CurrentSchedule = {
      ...FULL_TIMER,
      workerType: "second_half",
      attFullDayMinutes: 300,
      attHalfDayMinutes: 150,
    };
    const stays = mergeScheduleForBulk(ID, afternoon, undefined, { weeklyOff: 6 });
    expect(stays.attFullDayMinutes).toBe(300);
    expect(stays.attHalfDayMinutes).toBe(150);

    const moved = mergeScheduleForBulk(ID, afternoon, undefined, {
      workerType: "full_time",
    });
    expect(moved.attFullDayMinutes).toBeNull();
    expect(moved.attHalfDayMinutes).toBeNull();
  });

  it("keeps a project retainer only while the type is project_remote", () => {
    const project: CurrentSchedule = { ...FULL_TIMER, workerType: "project_remote" };
    const rates: CurrentRates = {
      monthlyPayAtTarget: null,
      weeklyTargetHours: null,
      monthlyFee: "15000.00",
    };
    expect(mergeScheduleForBulk(ID, project, rates, { weeklyOff: 6 }).monthlyFee).toBe(15000);
    expect(
      mergeScheduleForBulk(ID, project, rates, { workerType: "full_time" }).monthlyFee,
    ).toBeNull();
  });

  it("falls back to full_time for an unrecognised stored worker type", () => {
    const odd: CurrentSchedule = { ...FULL_TIMER, workerType: "contractor" };
    expect(mergeScheduleForBulk(ID, odd, undefined, { weeklyOff: 3 }).workerType).toBe(
      "full_time",
    );
  });

  it("survives an employee with no schedule overrides at all", () => {
    const bare: CurrentSchedule = {
      weeklyOff: 0,
      attOfficialStart: null,
      attLateAfter: null,
      attOfficialEnd: null,
      attEarlyBefore: null,
      workerType: null,
      attFullDayMinutes: null,
      attHalfDayMinutes: null,
      weeklyTargetMinutes: null,
    };
    const out = mergeScheduleForBulk(ID, bare, undefined, { workerType: "hybrid" });
    expect(out.attOfficialStart).toBeNull();
    expect(out.workerType).toBe("hybrid");
    expect(out.monthlyPayAtTarget).toBeNull();
  });
});
