import { describe, it, expect } from "vitest";
import { reconcileMonth, payableHoursForMonth } from "@/lib/attendance/hour-balance";
import { computeScheduleHourlySalary } from "@/lib/salary/compute";
import { weekKeyOf } from "@/lib/attendance/hours-rule";
import { resolveEffectiveConfig } from "@/lib/attendance/effective-config";

const FT_OPTS = {
  weeklyTargetMinutes: 54 * 60,
  waiverThresholdMinutes: 54 * 60,
  workingDaysPerWeek: 6,
};
const PT_OPTS = {
  weeklyTargetMinutes: 27 * 60,
  waiverThresholdMinutes: 27 * 60,
  workingDaysPerWeek: 6,
};

/**
 * Build a Mon–Sat week. `codes` lets a day be something other than an ordinary
 * worked day — "H" for a declared holiday, "W/O" for a weekly off, etc.
 */
function week(
  mondayYmd: string,
  minutes: number[],
  codes?: (string | null)[],
): {
  date: string;
  weekKey: string;
  code: string;
  dayValue: number;
  workedMinutes: number;
  late: boolean;
  leftEarly: boolean;
}[] {
  const [y, m, d] = mondayYmd.split("-").map(Number);
  return minutes.map((mins, i) => {
    const dt = new Date(Date.UTC(y!, m! - 1, d! + i));
    const date = dt.toISOString().slice(0, 10);
    const override = codes?.[i] ?? null;
    const code = override ?? (mins >= 420 ? "P" : mins >= 300 ? "H/D" : "A");
    const dayValue = code === "P" ? 1 : code === "H/D" ? 0.5 : code === "A" ? 0 : 1;
    return {
      date,
      weekKey: weekKeyOf(date),
      code,
      dayValue,
      workedMinutes: override ? 0 : mins,
      late: false,
      leftEarly: false,
    };
  });
}

/* ── §4 Holiday reduces the WEEKLY target ─────────────────────────────────── */

describe("§4 — a declared holiday reduces the weekly target", () => {
  it("Full-Time: 6 days × 9h = 54h becomes 45h with one holiday", () => {
    const days = week("2026-08-10", [540, 540, 540, 540, 540, 540], [
      "H", null, null, null, null, null,
    ]);
    const r = reconcileMonth(days, { month: "2026-08", ...FT_OPTS });
    expect(r.weeks[0]!.expectedDays).toBe(5);
    expect(r.weeks[0]!.weeklyTargetMinutes).toBe(45 * 60);
  });

  it("Part-Time: 6 × 4.5h = 27h becomes 22.5h with one holiday", () => {
    const days = week("2026-08-10", [270, 270, 270, 270, 270, 270], [
      "H", null, null, null, null, null,
    ]);
    const r = reconcileMonth(days, { month: "2026-08", ...PT_OPTS });
    expect(r.weeks[0]!.expectedDays).toBe(5);
    expect(r.weeks[0]!.weeklyTargetMinutes).toBe(22.5 * 60);
  });

  it("the employee is NOT expected to make up the holiday's hours", () => {
    // Works 5 × 9h = 45h in a week containing one holiday → no deficit.
    const days = week("2026-08-10", [0, 540, 540, 540, 540, 540], [
      "H", null, null, null, null, null,
    ]);
    const r = reconcileMonth(days, { month: "2026-08", ...FT_OPTS });
    expect(r.weeks[0]!.deficitMinutes).toBe(0);
    expect(r.weeks[0]!.requirementSatisfied).toBe(true);
  });
});

/* ── §12 Holiday reduces the target BEFORE surplus is computed ────────────── */

describe("§12 — surplus is measured against the holiday-adjusted target", () => {
  it("47h worked in a 45h (holiday) week banks +2h, not −7h", () => {
    // 5 working days totalling 47h, plus one holiday.
    const days = week("2026-08-10", [0, 564, 564, 564, 564, 564], [
      "H", null, null, null, null, null,
    ]);
    const r = reconcileMonth(days, { month: "2026-08", ...FT_OPTS });
    expect(r.weeks[0]!.weeklyTargetMinutes).toBe(45 * 60);
    expect(r.weeks[0]!.actualMinutes).toBe(47 * 60);
    expect(r.weeks[0]!.surplusMinutes).toBe(2 * 60);
    expect(r.monthlyHourBalanceMinutes).toBe(2 * 60);
  });
});

/* ── §5 Holiday reduces the MONTHLY target ───────────────────────────────── */

describe("§5 — a holiday reduces the monthly target by one scheduled day", () => {
  const clean = [...week("2026-08-03", [540, 540, 540, 540, 540, 540])];
  const withHoliday = [
    ...week("2026-08-03", [540, 540, 540, 540, 540, 540], [
      "H", null, null, null, null, null,
    ]),
  ];

  it("drops the target by exactly 9h for a full-timer", () => {
    const a = reconcileMonth(clean, { month: "2026-08", ...FT_OPTS });
    const b = reconcileMonth(withHoliday, { month: "2026-08", ...FT_OPTS });
    expect(a.totalTargetMinutes - b.totalTargetMinutes).toBe(9 * 60);
  });

  it("the holiday contributes to neither target nor payable hours", () => {
    const r = reconcileMonth(withHoliday, { month: "2026-08", ...FT_OPTS });
    const p = payableHoursForMonth(withHoliday, r, 540);
    expect(r.totalTargetMinutes).toBe(45 * 60);
    // 5 worked days at 9h = 45h payable; the holiday adds nothing either side.
    expect(p.payableMinutesRaw).toBe(45 * 60);
  });
});

/* ── §2 Round payable hours DOWN ─────────────────────────────────────────── */

describe("§2 — payable hours round DOWN to a whole hour", () => {
  const cases: [number, number][] = [
    [53.8, 53],
    [53.2, 53],
    [53.9, 53],
    [54.0, 54],
    [0.99, 0],
  ];
  for (const [raw, expected] of cases) {
    it(`${raw}h pays ${expected}h`, () => {
      const s = computeScheduleHourlySalary({
        monthlySalary: 40000,
        monthlyTargetHours: 216,
        payableHoursRaw: raw,
        chargeableHalfDays: 0,
        dailyTargetHours: 9,
        ptExempt: true,
        tdsMonthly: 0,
        advances: 0,
        pendingBalanceIn: 0,
      });
      expect(s.workedHours).toBe(expected);
    });
  }

  it("never rounds 53.8 up to 54", () => {
    const s = computeScheduleHourlySalary({
      monthlySalary: 40000,
      monthlyTargetHours: 216,
      payableHoursRaw: 53.8,
      chargeableHalfDays: 0,
      dailyTargetHours: 9,
      ptExempt: true,
      tdsMonthly: 0,
      advances: 0,
      pendingBalanceIn: 0,
    });
    expect(s.workedHours).not.toBe(54);
  });
});

/* ── §1 The worked example from the spec ─────────────────────────────────── */

describe("§1 — hourly rate and payable salary", () => {
  const base = {
    monthlySalary: 40000,
    monthlyTargetHours: 216,
    chargeableHalfDays: 0,
    dailyTargetHours: 9,
    ptExempt: true,
    tdsMonthly: 0,
    advances: 0,
    pendingBalanceIn: 0,
  };

  it("₹40,000 ÷ 216h = ₹185.19/hour", () => {
    const s = computeScheduleHourlySalary({ ...base, payableHoursRaw: 216 });
    expect(s.hourlyRate).toBeCloseTo(185.19, 2);
  });

  it("210 hours pays ₹38,888.90", () => {
    const s = computeScheduleHourlySalary({ ...base, payableHoursRaw: 210 });
    // 210 × (40000/216) = 38888.888… → rounded to paise.
    expect(s.gross).toBeCloseTo(38888.89, 2);
  });

  it("only the missing hours are deducted", () => {
    const full = computeScheduleHourlySalary({ ...base, payableHoursRaw: 216 });
    const short = computeScheduleHourlySalary({ ...base, payableHoursRaw: 210 });
    expect(full.gross - short.gross).toBeCloseTo(6 * 185.185, 1);
  });

  it("a full target month pays exactly the monthly salary", () => {
    const s = computeScheduleHourlySalary({ ...base, payableHoursRaw: 216 });
    expect(s.gross).toBe(40000);
  });
});

describe("§3 — the monthly target is dynamic, never a fixed 216", () => {
  it("a holiday shrinks the target and the rate rises accordingly", () => {
    const normal = computeScheduleHourlySalary({
      monthlySalary: 40000, monthlyTargetHours: 216, payableHoursRaw: 216,
      chargeableHalfDays: 0, dailyTargetHours: 9,
      ptExempt: true, tdsMonthly: 0, advances: 0, pendingBalanceIn: 0,
    });
    const holiday = computeScheduleHourlySalary({
      monthlySalary: 40000, monthlyTargetHours: 207, payableHoursRaw: 207,
      chargeableHalfDays: 0, dailyTargetHours: 9,
      ptExempt: true, tdsMonthly: 0, advances: 0, pendingBalanceIn: 0,
    });
    // Working the (reduced) target still earns the whole salary — the employee
    // is not docked for a day the company declared off.
    expect(normal.gross).toBe(40000);
    expect(holiday.gross).toBe(40000);
    expect(holiday.targetHours).toBe(207);
    // `hourlyRate` is optional on SalaryBreakdown (the day-based path omits it),
    // so assert it is present before comparing.
    expect(holiday.hourlyRate).toBeDefined();
    expect(normal.hourlyRate).toBeDefined();
    expect(holiday.hourlyRate!).toBeGreaterThan(normal.hourlyRate!);
  });

  it("part-time is priced on its own target, never 216h", () => {
    const pt = computeScheduleHourlySalary({
      monthlySalary: 3500, monthlyTargetHours: 108, payableHoursRaw: 108,
      chargeableHalfDays: 0, dailyTargetHours: 4.5,
      ptExempt: true, tdsMonthly: 0, advances: 0, pendingBalanceIn: 0,
    });
    expect(pt.targetHours).toBe(108);
    expect(pt.gross).toBe(3500);
  });
});

describe("§15 — the monthly half-day grace still bites from the 4th", () => {
  const base = {
    monthlySalary: 40000, monthlyTargetHours: 216, payableHoursRaw: 216,
    dailyTargetHours: 9,
    ptExempt: true, tdsMonthly: 0, advances: 0, pendingBalanceIn: 0,
  };

  it("no charge when the month's half-days are all within the grace", () => {
    const s = computeScheduleHourlySalary({ ...base, chargeableHalfDays: 0 });
    expect(s.gross).toBe(40000);
  });

  it("each chargeable half-day costs half a scheduled day", () => {
    const s = computeScheduleHourlySalary({ ...base, chargeableHalfDays: 2 });
    // 2 × 4.5h = 9h deducted at ₹185.185/h.
    expect(s.workedHours).toBe(216 - 9);
    expect(s.gross).toBeCloseTo(40000 - 9 * (40000 / 216), 2);
  });
});

/* ── §16 end-to-end: the spec's own salary acceptance case ───────────────── */

describe("§16 — 53.8 payable hours pays 53, not 53.8 or 54", () => {
  it("uses 53 hours for the money", () => {
    const s = computeScheduleHourlySalary({
      monthlySalary: 40000,
      monthlyTargetHours: 216,
      payableHoursRaw: 53.8,
      chargeableHalfDays: 0,
      dailyTargetHours: 9,
      ptExempt: true, tdsMonthly: 0, advances: 0, pendingBalanceIn: 0,
    });
    expect(s.workedHours).toBe(53);
    expect(s.gross).toBeCloseTo(53 * (40000 / 216), 2);
  });
});

/* ── §16 part-time never sees a 54-hour target ───────────────────────────── */

describe("§9 — a short week repaid later in the month costs nothing", () => {
  // Spec §9/§23: 50h then 58h. Week 1 is 4h short, week 2 repays it exactly.
  // Under the old per-week cap week 2's extra hours were thrown away and the
  // month paid 104h of 108h; the month-level net pays all 108h.
  const w1 = week("2026-08-03", [500, 500, 500, 500, 500, 500]); // 50h
  const w2 = week("2026-08-10", [580, 580, 580, 580, 580, 580]); // 58h

  it("50h + 58h against 54h + 54h pays the full month", () => {
    const r = reconcileMonth([...w1, ...w2], { month: "2026-08", ...FT_OPTS });
    const p = payableHoursForMonth([...w1, ...w2], r, 540);
    expect(r.totalTargetMinutes).toBe(108 * 60);
    expect(p.payableMinutesRaw).toBe(108 * 60);

    const pay = computeScheduleHourlySalary({
      monthlySalary: 40000,
      monthlyTargetHours: p.targetMinutes / 60,
      payableHoursRaw: p.payableMinutesRaw / 60,
      chargeableHalfDays: 0,
      dailyTargetHours: 9,
      ptExempt: true,
      tdsMonthly: 0,
      advances: 0,
      pendingBalanceIn: 0,
    });
    expect(pay.gross).toBe(40000);
  });

  it("the same repayment works in the other order (58h then 50h)", () => {
    const a = week("2026-08-03", [580, 580, 580, 580, 580, 580]);
    const b = week("2026-08-10", [500, 500, 500, 500, 500, 500]);
    const r = reconcileMonth([...a, ...b], { month: "2026-08", ...FT_OPTS });
    const p = payableHoursForMonth([...a, ...b], r, 540);
    expect(p.payableMinutesRaw).toBe(108 * 60);
  });

  it("an UNREPAID shortfall still deducts — only the missing hours", () => {
    const a = week("2026-08-03", [500, 500, 500, 500, 500, 500]); // 50h
    const b = week("2026-08-10", [540, 540, 540, 540, 540, 540]); // 54h
    const r = reconcileMonth([...a, ...b], { month: "2026-08", ...FT_OPTS });
    const p = payableHoursForMonth([...a, ...b], r, 540);
    expect(p.payableMinutesRaw).toBe(104 * 60); // 4h short, priced by the engine
  });

  it("month-end surplus never inflates pay (spec §14/§15)", () => {
    const a = week("2026-08-03", [580, 580, 580, 580, 580, 580]); // 58h
    const b = week("2026-08-10", [580, 580, 580, 580, 580, 580]); // 58h
    const r = reconcileMonth([...a, ...b], { month: "2026-08", ...FT_OPTS });
    const p = payableHoursForMonth([...a, ...b], r, 540);
    expect(p.payableMinutesRaw).toBe(108 * 60); // capped at the month's target
    expect(p.netSurplusMinutes).toBe(8 * 60); // reported, never full-time money
  });
});

describe("§16 — Full-Time vs Part-Time targets stay separate", () => {
  it("full-time resolves 9h/day and 54h/week", () => {
    const cfg = resolveEffectiveConfig({
      workerType: "full_time",
      attOfficialStart: "10:00",
      attOfficialEnd: "19:00",
    });
    expect(cfg.dailyTargetMinutes).toBe(9 * 60);
    expect(cfg.weeklyTargetMinutes).toBe(54 * 60);
  });

  it("an hourly shift resolves 5h/day and 30h/week", () => {
    const cfg = resolveEffectiveConfig({
      workerType: "hybrid",
      attOfficialStart: "10:00",
      attOfficialEnd: "15:00",
    });
    expect(cfg.dailyTargetMinutes).toBe(5 * 60);
    expect(cfg.weeklyTargetMinutes).toBe(30 * 60);
    expect(cfg.weeklyTargetMinutes).not.toBe(54 * 60);
  });
});

/* ── Paid leave must still be paid ───────────────────────────────────────── */

describe("credited days are paid at the daily target", () => {
  it("a week of approved paid leave still pays", () => {
    const days = week("2026-08-03", [0, 0, 0, 0, 0, 0], [
      "PL", "PL", "PL", "PL", "PL", "PL",
    ]);
    const r = reconcileMonth(days, { month: "2026-08", ...FT_OPTS });
    const p = payableHoursForMonth(days, r, 540);
    // No hours were expected, but the days are paid — target and payable match.
    expect(p.targetMinutes).toBe(54 * 60);
    expect(p.payableMinutesRaw).toBe(54 * 60);
    expect(p.payableHours).toBe(54);
  });

  it("unpaid leave adds to the target but not to payable hours", () => {
    const days = week("2026-08-03", [540, 540, 540, 540, 540, 0], [
      null, null, null, null, null, "LWP",
    ]);
    const r = reconcileMonth(days, { month: "2026-08", ...FT_OPTS });
    const p = payableHoursForMonth(days, r, 540);
    expect(p.payableHours).toBe(45);
  });
});
