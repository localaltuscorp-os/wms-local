import { describe, it, expect } from "vitest";
import {
  resolveEffectiveConfig,
  toAttendanceSchedule,
  FULL_TIME_DAILY_MINUTES,
  PART_TIME_DAILY_MINUTES,
} from "@/lib/attendance/effective-config";
import { computeDayCode } from "@/lib/attendance/status";
import { reconcileMonth, monthKeyOf } from "@/lib/attendance/hour-balance";
import { weekKeyOf } from "@/lib/attendance/hours-rule";

/** The org defaults that used to leak into every employee's grading. */
const ORG = {
  attLateAfter: "10:50",
  attEarlyBefore: "19:30",
  attFullDayHours: "9",
  attHalfDayHours: "5",
};

const FULL_TIME = {
  workerType: "full_time",
  attOfficialStart: "10:00:00",
  attOfficialEnd: "19:00:00",
  attLateAfter: null,
  attEarlyBefore: null,
  weeklyOff: 0,
};

const PART_TIME = {
  workerType: "hybrid",
  attOfficialStart: "10:00:00",
  attOfficialEnd: "15:00:00", // the 5h hourly-shift day (Sir, 2026-08)
  attLateAfter: null,
  attEarlyBefore: null,
  weeklyOff: 0,
};

const ctx = { isWeeklyOff: false };

function grade(emp: object, inAt: string, outAt: string | null) {
  const cfg = resolveEffectiveConfig(emp, ORG);
  return computeDayCode({ inAt, outAt }, toAttendanceSchedule(cfg), ctx, "23:59");
}

/* ────────────────────────────────────────────────────────────────────────── */

describe("Test 1 — Full-Time checkout at the configured official end", () => {
  it("is NOT an early checkout", () => {
    const r = grade(FULL_TIME, "10:00", "19:00");
    expect(r.leftEarly).toBe(false);
  });

  it("is a full present day with no deviation to deduct", () => {
    const r = grade(FULL_TIME, "10:00", "19:00");
    expect(r.code).toBe("P");
    expect(r.dayValue).toBe(1);
    expect(r.late).toBe(false);
  });

  it("REGRESSION: the org 19:30 default must not override a 19:00 schedule", () => {
    // This is the reported bug. `attEarlyBefore` is null, so the old resolver
    // fell back to the org-wide 19:30 and 19:00 < 19:30 read as early.
    const cfg = resolveEffectiveConfig(FULL_TIME, ORG);
    expect(cfg.earlyBefore).toBe("19:00");
    expect(cfg.officialEnd).toBe("19:00");
  });
});

describe("Test 2 — Full-Time genuine early checkout", () => {
  it("18:30 against a 19:00 end IS early", () => {
    const r = grade(FULL_TIME, "10:00", "18:30");
    expect(r.leftEarly).toBe(true);
  });

  it("still earns a full day when the hours are there (deviation forgiven)", () => {
    // 10:00→18:30 = 8h30 ≥ the 7.5h full-day cutoff.
    const r = grade(FULL_TIME, "10:00", "18:30");
    expect(r.code).toBe("P");
    expect(r.lateWaived).toBe(true);
  });
});

describe("Test 3 — Part-Time targets are never the Full-Time ones", () => {
  const cfg = resolveEffectiveConfig(PART_TIME, ORG);

  it("weekly target is 30h, not 54h", () => {
    expect(cfg.weeklyTargetMinutes).toBe(30 * 60);
    expect(cfg.weeklyTargetMinutes).not.toBe(54 * 60);
  });

  it("daily target is 5h", () => {
    expect(cfg.dailyTargetMinutes).toBe(PART_TIME_DAILY_MINUTES);
  });

  it("waiver threshold follows the hourly-shift week, not 54h", () => {
    expect(cfg.waiverThresholdMinutes).toBe(30 * 60);
  });

  it("the whole 5h shift IS the day — no hours-based half tier", () => {
    expect(cfg.fullDayMinutes).toBe(5 * 60);
    expect(cfg.halfDayMinutes).toBe(5 * 60);
  });

  it("a complete 5h shift is a FULL day, not a half day", () => {
    const r = grade(PART_TIME, "10:00", "15:00");
    expect(r.code).toBe("P");
    expect(r.leftEarly).toBe(false);
  });

  it("the full-time thresholds are never applied to an hourly shift", () => {
    // 5h would be a HALF day under full-time rules (≥4.5h, <7.5h); for this
    // shift it is the complete day.
    const r = grade(PART_TIME, "10:00", "15:00");
    expect(r.code).toBe("P");
    expect(grade(FULL_TIME, "10:00", "15:00").code).toBe("H/D");
  });
});

describe("§3 — Full-Time three-tier daily classification (7.5h / 4.5h)", () => {
  const cases: [string, string, string][] = [
    ["10:00", "19:00", "P"], // 9h    → full day
    ["10:00", "18:30", "P"], // 8h30
    ["10:00", "17:30", "P"], // 7h30  → exactly the full-day bar
    ["10:00", "17:24", "H/D"], // 7h24 → NOT "anything under 9h is half" — but under 7.5h is
    ["10:00", "16:00", "H/D"], // 6h
    ["10:00", "14:30", "H/D"], // 4h30 → exactly the half-day floor
    ["10:00", "14:24", "A"], // 4h24  → under the 4.5h floor
    ["10:00", "14:00", "A"], // 4h
  ];
  for (const [inAt, outAt, code] of cases) {
    it(`${inAt}→${outAt} grades ${code}`, () => {
      expect(grade(FULL_TIME, inAt, outAt).code).toBe(code);
    });
  }

  it("an under-floor day still records its marks for audit (§5)", () => {
    const r = grade(FULL_TIME, "11:30", "14:00"); // 2h30 < 4.5h
    expect(r.code).toBe("A");
    expect(r.late).toBe(true); // 11:30 > 10:50
    expect(r.workedMinutes).toBe(150);
  });
});

describe("§3 — hourly shifts grade full-shift-or-absent, never by the FT tiers", () => {
  const cases: [string, string, string][] = [
    ["10:00", "12:00", "A"], // 2h    → not the shift
    ["10:00", "14:59", "A"], // 4h59  → one minute short is still not the shift
    ["10:00", "15:00", "P"], // 5h    → the whole shift IS the day
    ["10:00", "16:00", "P"], // longer than the shift is still one day
  ];
  for (const [inAt, outAt, code] of cases) {
    it(`${inAt}→${outAt} grades ${code}`, () => {
      expect(grade(PART_TIME, inAt, outAt).code).toBe(code);
    });
  }
});

/* ────────────────────────────────────────────────────────────────────────── */

/** Build a Mon–Sat week of ordinary days, each with the given worked minutes. */
function weekDays(mondayYmd: string, minutesPerDay: number[]): {
  date: string;
  weekKey: string;
  code: string;
  dayValue: number;
  workedMinutes: number;
  late: boolean;
  leftEarly: boolean;
}[] {
  const [y, m, d] = mondayYmd.split("-").map(Number);
  return minutesPerDay.map((mins, i) => {
    const dt = new Date(Date.UTC(y!, m! - 1, d! + i));
    const date = dt.toISOString().slice(0, 10);
    return {
      date,
      weekKey: weekKeyOf(date),
      code: mins >= 450 ? "P" : mins >= 270 ? "H/D" : "A",
      dayValue: mins >= 450 ? 1 : mins >= 270 ? 0.5 : 0,
      workedMinutes: mins,
      late: false,
      leftEarly: false,
    };
  });
}

const FT_OPTS = {
  weeklyTargetMinutes: 54 * 60,
  waiverThresholdMinutes: 54 * 60,
  workingDaysPerWeek: 6,
};

describe("Test 4 — weekly surplus offsets a later shortfall", () => {
  // Week 1 (Aug 4–9): 56h. Week 2 (Aug 11–16): 52h.
  const w1 = weekDays("2025-08-04", [560, 560, 560, 560, 560, 560]); // 56h
  const w2 = weekDays("2025-08-11", [520, 520, 520, 520, 520, 520]); // 52h

  const res = reconcileMonth([...w1, ...w2], { month: "2025-08", ...FT_OPTS });

  it("week 1 banks a +2h surplus", () => {
    expect(res.weeks[0]!.actualMinutes).toBe(56 * 60);
    expect(res.weeks[0]!.surplusMinutes).toBe(2 * 60);
    expect(res.weeks[0]!.closingBalanceMinutes).toBe(2 * 60);
  });

  it("week 2 draws that surplus down to cover its 2h shortfall", () => {
    expect(res.weeks[1]!.actualMinutes).toBe(52 * 60);
    expect(res.weeks[1]!.balanceAppliedMinutes).toBe(2 * 60);
    expect(res.weeks[1]!.closingBalanceMinutes).toBe(0);
  });

  it("week 2 therefore satisfies its weekly requirement", () => {
    expect(res.weeks[1]!.requirementSatisfied).toBe(true);
    expect(res.weeks[1]!.deficitMinutes).toBe(0);
  });
});

describe("Test 5 — balances never cross the month boundary", () => {
  // +2h banked in August; September is reconciled on its own.
  const aug = weekDays("2025-08-04", [560, 560, 560, 560, 560, 560]);
  const sep = weekDays("2025-09-01", [520, 520, 520, 520, 520, 520]);
  const all = [...aug, ...sep];

  const august = reconcileMonth(all, { month: "2025-08", ...FT_OPTS });
  const september = reconcileMonth(all, { month: "2025-09", ...FT_OPTS });

  it("August closes at +2h", () => {
    expect(august.monthlyHourBalanceMinutes).toBe(2 * 60);
  });

  it("September opens at 0h — August's surplus is not inherited", () => {
    expect(september.weeks[0]!.balanceAppliedMinutes).toBe(0);
    expect(september.weeks[0]!.deficitMinutes).toBe(2 * 60);
    expect(september.weeks[0]!.requirementSatisfied).toBe(false);
  });

  it("only that month's days are counted", () => {
    expect(august.weeks.every((w) => w.month === "2025-08")).toBe(true);
    expect(september.totalActualMinutes).toBe(52 * 60);
  });
});

describe("§4–§6 — the signed weekly carry, the spec's own ladder", () => {
  // Week 1: 58h against 54h → +4h. Week 2's EFFECTIVE target is therefore 50h.
  // Week 2 works exactly 50h → square. (Spec §5 / §23.)
  it("a +4h surplus lowers next week's effective target to 50h", () => {
    const w1 = weekDays("2025-08-04", [580, 580, 580, 580, 580, 580]); // 58h
    const w2 = weekDays("2025-08-11", [500, 500, 500, 500, 500, 500]); // 50h
    const res = reconcileMonth([...w1, ...w2], { month: "2025-08", ...FT_OPTS });

    expect(res.weeks[0]!.surplusMinutes).toBe(4 * 60);
    expect(res.weeks[0]!.closingBalanceMinutes).toBe(4 * 60);
    expect(res.weeks[1]!.carryInMinutes).toBe(4 * 60);
    expect(res.weeks[1]!.effectiveTargetMinutes).toBe(50 * 60);
    expect(res.weeks[1]!.requirementSatisfied).toBe(true);
    expect(res.weeks[1]!.deficitMinutes).toBe(0);
    expect(res.weeks[1]!.closingBalanceMinutes).toBe(0);
  });

  // Week 1: 50h against 54h → −4h. Week 2's effective target RISES to 58h —
  // the deficit carries too (spec §6), it is not forgotten.
  it("a −4h deficit raises next week's effective target to 58h", () => {
    const w1 = weekDays("2025-08-04", [500, 500, 500, 500, 500, 500]); // 50h
    const w2 = weekDays("2025-08-11", [560, 560, 560, 560, 560, 560]); // 56h
    const res = reconcileMonth([...w1, ...w2], { month: "2025-08", ...FT_OPTS });

    expect(res.weeks[0]!.deficitMinutes).toBe(4 * 60);
    expect(res.weeks[0]!.closingBalanceMinutes).toBe(-4 * 60);
    expect(res.weeks[1]!.carryInMinutes).toBe(-4 * 60);
    expect(res.weeks[1]!.effectiveTargetMinutes).toBe(58 * 60);
    // 56h against an effective 58h → 2h still owed, carried on (spec §6).
    expect(res.weeks[1]!.requirementSatisfied).toBe(false);
    expect(res.weeks[1]!.deficitMinutes).toBe(2 * 60);
    expect(res.weeks[1]!.closingBalanceMinutes).toBe(-2 * 60);
  });

  it("an effective target is never negative, however large the surplus", () => {
    const w1 = weekDays("2025-08-04", [1200, 1200, 1200, 1200, 1200, 1200]); // 120h
    const w2 = weekDays("2025-08-11", [0, 0, 0, 0, 0, 0]);
    const res = reconcileMonth([...w1, ...w2], { month: "2025-08", ...FT_OPTS });
    expect(res.weeks[1]!.carryInMinutes).toBe(66 * 60); // 120h − 54h
    expect(res.weeks[1]!.effectiveTargetMinutes).toBe(0);
    expect(res.weeks[1]!.requirementSatisfied).toBe(true);
  });

  it("an August DEFICIT does not follow anyone into September (spec §7)", () => {
    const aug = weekDays("2025-08-04", [400, 400, 400, 400, 400, 400]); // 40h — short
    const sep = weekDays("2025-09-01", [540, 540, 540, 540, 540, 540]); // 54h
    const all = [...aug, ...sep];
    const september = reconcileMonth(all, { month: "2025-09", ...FT_OPTS });
    expect(september.weeks[0]!.carryInMinutes).toBe(0);
    expect(september.weeks[0]!.effectiveTargetMinutes).toBe(54 * 60);
    expect(september.weeks[0]!.requirementSatisfied).toBe(true);
  });
});

describe("Test 6 — monthly half-day grace: 3 waived, the rest charged", () => {
  // Five short weeks, each with exactly one half-day, none reaching the waiver.
  const days = [
    ...weekDays("2025-08-04", [330, 330, 330, 330, 330, 330]),
    ...weekDays("2025-08-11", [330, 330, 330, 330, 330, 330]),
  ];
  // Force exactly 5 half-days in the month, the rest absent.
  const shaped = days.map((d, i) => ({
    ...d,
    code: i < 5 ? "H/D" : "A",
    dayValue: i < 5 ? 0.5 : 0,
  }));

  const res = reconcileMonth(shaped, { month: "2025-08", ...FT_OPTS });

  it("charges exactly 2 of the 5", () => {
    expect(res.halfDayCharges).toHaveLength(5);
    expect(res.warnedHalfDays).toBe(3);
    expect(res.chargeableHalfDays).toBe(2);
  });

  it("the first three are warnings, the 4th and 5th bite", () => {
    expect(res.halfDayCharges.map((c) => c.waived)).toEqual([
      true,
      true,
      true,
      false,
      false,
    ]);
  });
});

describe("§6/§7 — a waived week's half-day does not spend a grace slot", () => {
  // Week 1 clears 54h (waiver) but contains a half-day; week 2 does not.
  const w1 = weekDays("2025-08-04", [540, 540, 540, 540, 540, 540]).map((d, i) =>
    i === 0 ? { ...d, code: "H/D", dayValue: 0.5 } : d,
  );
  const w2 = weekDays("2025-08-11", [330, 330, 330, 330, 330, 330]).map((d) => ({
    ...d,
    code: "H/D",
    dayValue: 0.5,
  }));

  const res = reconcileMonth([...w1, ...w2], { month: "2025-08", ...FT_OPTS });

  it("week 1 reaches the waiver threshold", () => {
    expect(res.weeks[0]!.deviationsWaived).toBe(true);
  });

  it("its half-day is absorbed, not counted against the 3 monthly slots", () => {
    expect(res.waiverAbsorbedHalfDays).toBe(1);
    expect(res.halfDayCharges.every((c) => c.date >= "2025-08-11")).toBe(true);
  });

  it("week 2's half-days start at ordinal 1, not 2", () => {
    expect(res.halfDayCharges[0]!.ordinal).toBe(1);
  });
});

describe("§6 — the waiver bar follows the employee's own week", () => {
  const PT_OPTS = {
    weeklyTargetMinutes: 30 * 60,
    waiverThresholdMinutes: 30 * 60,
    workingDaysPerWeek: 6,
  };
  // 30h across six 5h days.
  const week = weekDays("2025-08-04", [300, 300, 300, 300, 300, 300]).map((d) => ({
    ...d,
    code: "P",
    dayValue: 1,
  }));

  it("an hourly-shift week is waived at 30h and is NOT held to 54h", () => {
    const res = reconcileMonth(week, { month: "2025-08", ...PT_OPTS });
    expect(res.weeks[0]!.deviationsWaived).toBe(true);
    expect(res.weeks[0]!.weeklyTargetMinutes).toBe(30 * 60);
  });

  it("the same hours would FAIL a full-timer's bar", () => {
    const res = reconcileMonth(week, { month: "2025-08", ...FT_OPTS });
    expect(res.weeks[0]!.deviationsWaived).toBe(false);
  });
});

describe("Test 7 — switching Worker Type immediately changes the rules", () => {
  const asPart = resolveEffectiveConfig({ ...PART_TIME }, ORG);
  // Same employee row, worker type flipped and the schedule widened to 10–19.
  const asFull = resolveEffectiveConfig(
    { ...PART_TIME, workerType: "full_time", attOfficialEnd: "19:00:00" },
    ORG,
  );

  it("was 5h/day and 30h/week", () => {
    expect(asPart.dailyTargetMinutes).toBe(PART_TIME_DAILY_MINUTES);
    expect(asPart.weeklyTargetMinutes).toBe(30 * 60);
  });

  it("becomes 9h/day and 54h/week with no stale part-time values", () => {
    expect(asFull.dailyTargetMinutes).toBe(FULL_TIME_DAILY_MINUTES);
    expect(asFull.weeklyTargetMinutes).toBe(54 * 60);
    expect(asFull.waiverThresholdMinutes).toBe(54 * 60);
  });

  it("a stale hourly-shift weekly target cannot leak into a full-timer", () => {
    // weekly_target_minutes is left behind on the row when the type flips.
    const stale = resolveEffectiveConfig(
      {
        workerType: "full_time",
        attOfficialStart: "10:00:00",
        attOfficialEnd: "19:00:00",
        weeklyTargetMinutes: 30 * 60,
      },
      ORG,
    );
    expect(stale.weeklyTargetMinutes).toBe(54 * 60);
  });
});

describe("§8 — schedules are per-employee, not assumed", () => {
  it("an employee with no configured schedule still resolves sane defaults", () => {
    const cfg = resolveEffectiveConfig({ workerType: "full_time" }, ORG);
    expect(cfg.officialStart).toBe("10:00");
    expect(cfg.lateAfter).toBe("10:50");
    // With no official end configured, the org default applies — but is still
    // clamped so it can never sit past the official end.
    expect(cfg.earlyBefore).toBe("19:00");
  });

  it("a bespoke 08:00→17:00 full-timer grades against its own clock", () => {
    const cfg = resolveEffectiveConfig(
      { workerType: "full_time", attOfficialStart: "08:00", attOfficialEnd: "17:00" },
      ORG,
    );
    expect(cfg.lateAfter).toBe("08:50");
    expect(cfg.earlyBefore).toBe("17:00");
    expect(cfg.dailyTargetMinutes).toBe(9 * 60);
  });

  it("an explicit late-after/early-before override still wins", () => {
    const cfg = resolveEffectiveConfig(
      {
        workerType: "full_time",
        attOfficialStart: "10:00",
        attOfficialEnd: "19:00",
        attLateAfter: "10:15",
        attEarlyBefore: "18:45",
      },
      ORG,
    );
    expect(cfg.lateAfter).toBe("10:15");
    expect(cfg.earlyBefore).toBe("18:45");
  });
});

describe("other worker types are left alone", () => {
  it("afternoon_shift keeps its own configured full/half minutes", () => {
    const cfg = resolveEffectiveConfig(
      {
        workerType: "second_half",
        attOfficialStart: "14:00",
        attOfficialEnd: "19:00",
        attFullDayMinutes: 300,
        attHalfDayMinutes: 150,
      },
      ORG,
    );
    expect(cfg.fullDayMinutes).toBe(300);
    expect(cfg.halfDayMinutes).toBe(150);
  });

  it("project_remote is not day-graded", () => {
    const cfg = resolveEffectiveConfig({ workerType: "project_remote" }, ORG);
    expect(cfg.dayGraded).toBe(false);
  });
});

describe("monthKeyOf", () => {
  it("buckets by calendar month", () => {
    expect(monthKeyOf("2025-08-31")).toBe("2025-08");
    expect(monthKeyOf("2025-09-01")).toBe("2025-09");
  });
});
