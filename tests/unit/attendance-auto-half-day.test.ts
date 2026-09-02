import { describe, it, expect } from "vitest";
import { computeDayCode } from "@/lib/attendance/status";
import type { AttendanceSchedule } from "@/lib/attendance/schedule";

/**
 * The two AUTOMATIC half-day rules.
 *
 * Both exist because a missing PUNCH is not a missing DAY, and grading them the
 * same way is what these tests exist to prevent. They are pinned here rather
 * than left to the wider status suites because each one has a natural-looking
 * wrong answer the engine used to give: "out with no in" graded ABSENT, and an
 * auto-closed day graded ABSENT because the cron's out-punch carries the
 * clock-in time and so reads as zero minutes worked.
 */
const sched: AttendanceSchedule = {
  lateAfter: "10:50",
  earlyBefore: "19:20",
  fullDayMinutes: 540,
  halfDayMinutes: 300,
};

const ordinary = { isWeeklyOff: false } as const;

describe("automatic half-day rules", () => {
  describe("Case 1 — checked in, forgot to check out", () => {
    it("grades a half day, not absent and not a full one", () => {
      const r = computeDayCode({ inAt: "10:00", outAt: null }, sched, ordinary, "20:00");
      expect(r.code).toBe("H/D");
      expect(r.dayValue).toBe(0.5);
    });

    it("still records the late arrival — the day is halved, the mark stays", () => {
      const r = computeDayCode({ inAt: "11:30", outAt: null }, sched, ordinary, "20:00");
      expect(r.code).toBe("H/D");
      expect(r.late).toBe(true);
    });

    it("is NOT reported as having left early — there is no out-punch to judge", () => {
      const r = computeDayCode({ inAt: "10:00", outAt: null }, sched, ordinary, "20:00");
      expect(r.leftEarly).toBe(false);
    });
  });

  describe("Case 1 continued — after the compulsory-punch-out cron closes the day", () => {
    // The cron stamps its out at the CLOCK-IN time, so worked = 0. Without the
    // autoClosed flag this falls through the three-tier rule, lands under the
    // half-day floor and grades ABSENT — the opposite of the policy the cron is
    // named after.
    it("still grades a half day even though worked minutes are zero", () => {
      const r = computeDayCode(
        { inAt: "10:00", outAt: "10:00" },
        sched,
        { ...ordinary, autoClosed: true },
        "23:30",
      );
      expect(r.code).toBe("H/D");
      expect(r.dayValue).toBe(0.5);
    });

    it("without the flag the same punches grade absent — the regression this guards", () => {
      const r = computeDayCode({ inAt: "10:00", outAt: "10:00" }, sched, ordinary, "23:30");
      expect(r.code).toBe("A");
    });

    it("does not downgrade a genuinely full day that happens to be flagged", () => {
      // A real out-punch after a full shift: the floor must not become a ceiling.
      const r = computeDayCode(
        { inAt: "10:00", outAt: "19:30" },
        sched,
        { ...ordinary, autoClosed: false },
        "20:00",
      );
      expect(r.code).toBe("P");
      expect(r.dayValue).toBe(1);
    });
  });

  describe("Case 2 — checked out, never checked in", () => {
    it("grades a half day rather than absent", () => {
      const r = computeDayCode({ inAt: null, outAt: "19:00" }, sched, ordinary, "20:00");
      expect(r.code).toBe("H/D");
      expect(r.dayValue).toBe(0.5);
    });

    it("neither punch at all is still absent", () => {
      const r = computeDayCode({ inAt: null, outAt: null }, sched, ordinary, "20:00");
      expect(r.code).toBe("A");
      expect(r.dayValue).toBe(0);
    });

    it("a weekly off outranks it — an out-punch does not turn W/O into a half day", () => {
      const r = computeDayCode({ inAt: null, outAt: "19:00" }, sched, { isWeeklyOff: true }, "20:00");
      expect(r.code).toBe("W/O");
      expect(r.dayValue).toBe(1);
    });

    it("approved leave still outranks it — the punch does not retract the leave", () => {
      const r = computeDayCode(
        { inAt: null, outAt: "19:00" },
        sched,
        { isWeeklyOff: false, leave: "paid" },
        "20:00",
      );
      expect(r.code).toBe("PL");
    });
  });
});
