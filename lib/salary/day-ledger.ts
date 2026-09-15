// THE DAILY SALARY LEDGER — one graded month, attributed day by day.
//
// Pure: no DB, no Date, no `server-only`. The client component that renders the
// report imports the formatters and the status taxonomy from here, so the
// server and the browser cannot disagree about what a status is called or how
// an hour is written.
//
// ════════════════════════════════════════════════════════════════════════════
//  WHAT THIS MODULE IS, AND WHAT IT REFUSES TO BE
// ════════════════════════════════════════════════════════════════════════════
//
// It is NOT a salary calculation. It computes no rate, no target and no gross.
// Every one of those arrives as an INPUT: the rate and the gross are read off
// the stored `salary_runs` row that the payslip and the Accounts module already
// read, and the hours come from the engine that produced that run
// (`lib/attendance/payroll-month.ts` → `reconcileMonth` + `payableHoursForMonth`).
//
// What it does is ATTRIBUTION: it takes the month's authoritative money and
// says which day each rupee of it came from. That is a genuinely different
// question from "what is this month worth", and the engine cannot answer it —
// by design. The pay model is deliberately month-level:
//
//     ordinaryPayable = min(totalActualMinutes, totalTargetMinutes)
//
// A 50-hour week followed by a 58-hour week is square and pays in full,
// whichever order they came in (spec §9). That min() is taken ONCE, over the
// whole month, which is exactly why no per-day figure falls out of the engine
// and why this module has to exist to produce one.
//
// ── THE RECONCILIATION IS THE CONTRACT ─────────────────────────────────────
// Because the attribution is derived rather than authoritative, it is only
// trustworthy if it ADDS UP. So the ledger closes the loop explicitly, and
// every term is either a per-day figure the report shows or a month-level
// effect the engine demonstrably applies. There is no fudge line.
// `reconciliation.residual` is what is left over, and it is paise: the drift
// from rounding each visible row to two decimals. The tests assert it stays
// under a rupee across every scenario in the spec's §19 list.
//
// ── WHY THE SPEC'S §8 WARNING IS SATISFIED ─────────────────────────────────
// "Do NOT calculate this as monthly salary / number of days." Nothing here
// divides by a day count. The unit of money in this system is the HOUR:
//
//     hourlyRate = monthlySalary ÷ monthlyTargetHours     (the engine)
//     day earned = hourlyRate × that day's payable hours  (this module)
//
// and "that day's payable hours" uses the engine's own rules, imported rather
// than restated.
//
// ── TWO PAY PATHS, TWO ATTRIBUTIONS ────────────────────────────────────────
// `computeForRow` routes a month to one of two hour-priced functions, and they
// pay for DIFFERENT things. Collapsing them into one attribution would have
// made the report lie to one group of employees:
//
//   hours_schedule  (full-time, monthly CTC → computeScheduleHourlySalary)
//     Paid for hours worked on ordinary days PLUS a full daily target credited
//     for every paid-but-not-worked day — approved paid leave, comp-off, a
//     worked holiday. Then netted, floored, charged for chargeable half-days
//     and unpaid leave, and capped at the monthly salary.
//
//   hours_worked    (every hourly shift → computeHourlySalary)
//     Paid for hours ACTUALLY WORKED, on any day, and nothing else. That
//     function's only attendance input is `workedMinutes`: it never sees the
//     credited days, the half-day charges or the unpaid-leave count. So no day
//     carries an adjustment on this path, and — see the DISCREPANCY note on
//     `hours_worked` below — a paid-leave day earns nothing.
//
// The mode is chosen by the LOADER from the same `payBasisFor` branch the
// salary engine uses, never guessed here.

import {
  isPaidCreditedDay,
  MONTHLY_HALF_DAY_GRACE,
  UNPAID_LEAVE_CODE,
  type MonthReconciliation,
  type PayableHoursResult,
} from "@/lib/attendance/hour-balance";
import { isOrdinaryAttendanceDay, weekKeyOf } from "@/lib/attendance/hours-rule";

/* ════════════════════════════════════════════════════════════════════════════
   STATUS TAXONOMY — every value here maps to a real attendance code
   ════════════════════════════════════════════════════════════════════════════ */

/**
 * The statuses a day in this report can carry.
 *
 * Each one is a real graded `AttendanceCode` (db/enums.ts) or a real state of
 * the calendar — nothing is invented (spec §12: "Do not invent statuses that do
 * not exist"). The two that are not codes are:
 *
 *   `overtime`  — a PRESENTATION refinement of a Full Day whose worked hours
 *                 exceeded the day's requirement. It is the same "P" code and
 *                 it changes NO money; see OVERTIME_LABEL_MINUTES.
 *   `upcoming`  — a day the month has not reached. The grader marks every future
 *                 working day "A" because it has no punches yet, and rendering
 *                 that as ABSENT would tell an employee on the 10th that they
 *                 had already missed the 25th.
 */
export type DayStatus =
  | "full_day"
  | "overtime"
  | "half_day"
  | "absent"
  | "holiday"
  | "holiday_worked"
  | "holiday_half"
  | "weekly_off"
  | "paid_leave"
  | "unpaid_leave"
  | "comp_off"
  | "no_checkout"
  | "upcoming";

export const DAY_STATUS_LABELS: Record<DayStatus, string> = {
  full_day: "Full Day",
  overtime: "Overtime",
  half_day: "Half Day",
  absent: "Absent",
  holiday: "Holiday",
  holiday_worked: "Worked on Holiday",
  holiday_half: "Holiday Half Day",
  weekly_off: "Weekly Off",
  paid_leave: "Paid Leave",
  unpaid_leave: "Unpaid Leave",
  comp_off: "Comp Off",
  no_checkout: "No Check-out",
  upcoming: "Upcoming",
};

/** The order the Status filter offers, and the order a legend reads in. */
export const DAY_STATUS_FILTER_ORDER: readonly DayStatus[] = [
  "full_day",
  "overtime",
  "half_day",
  "absent",
  "holiday",
  "holiday_worked",
  "holiday_half",
  "weekly_off",
  "paid_leave",
  "unpaid_leave",
  "comp_off",
  "no_checkout",
  "upcoming",
] as const;

/**
 * How much surplus a Full Day needs before it is LABELLED "Overtime".
 *
 * A labelling threshold and nothing else. The BALANCE column shows the true
 * signed surplus on every row whatever this is set to, and no rupee anywhere in
 * this module reads it. It exists because an hourly shift's full-day cutoff IS
 * its daily target (see effective-config.ts — a 5h shift is a Full Day at 5h),
 * so a person one minute over would otherwise be shouting OVERTIME every day.
 */
export const OVERTIME_LABEL_MINUTES = 30;

/**
 * Day codes that were never on the employee's roster in the first place.
 *
 * A weekly off and a declared holiday owe nothing and are not scheduled work —
 * and neither are the two holiday-WORKING codes, because a holiday is a holiday
 * whether or not somebody chose to come in on it.
 */
const UNSCHEDULED_CODES = new Set(["W/O", "H", "HP", "H-H/D"]);

/**
 * Was this a day the employee was ROSTERED to work?
 *
 * The question the ADJ. column's baseline turns on, and deliberately NOT the
 * same question as `isOrdinaryAttendanceDay`. A day spent on approved leave WAS
 * a working day — needing approval is what makes it one — so PL, CO and LWP are
 * scheduled here even though the hour engine expects no hours on them. That is
 * the whole point: it is what lets a leave day show the pay it cost, instead of
 * showing nothing because nothing was required.
 */
export function isScheduledWorkDay(code: string): boolean {
  return !UNSCHEDULED_CODES.has(code);
}

/** Approved remote-work modes, plus the ordinary office day. */
export type WorkPlace = "office" | "wfh" | "field" | "client_site";

export const WORK_PLACE_LABELS: Record<WorkPlace, string> = {
  office: "Office",
  wfh: "Work From Home",
  field: "On Field",
  client_site: "Client Site",
};

export const WORK_PLACE_FILTER_ORDER: readonly WorkPlace[] = [
  "office",
  "wfh",
  "field",
  "client_site",
] as const;

/* ════════════════════════════════════════════════════════════════════════════
   INPUT SHAPES
   ════════════════════════════════════════════════════════════════════════════ */

/** One graded day, exactly as `getEmployeeMonthStatus` produced it. */
export interface LedgerDayInput {
  logDate: string; // yyyy-mm-dd
  weekday: number; // 0=Sun..6=Sat
  code: string;
  dayValue: number;
  workedMinutes: number;
  inAt: string | null; // "HH:mm", 24h, employee tz
  outAt: string | null;
  isWeeklyOff: boolean;
  late: boolean;
  leftEarly: boolean;
  lateWaived: boolean;
  remoteMode: string | null;
}

export type LedgerMoneyMode =
  | "daily"
  | "hours_schedule"
  | "hours_worked"
  | "attendance_only";

/**
 * The authoritative money for the month, and which engine produced it.
 *
 * A discriminated union rather than an options bag, because the three cases do
 * not share a reconciliation — see the TWO PAY PATHS note at the top.
 */
export type LedgerPay =
  | {
      /**
       * `computeDailySalary` — the full-timer's model (spec §4).
       *
       * The cleanest of the three to attribute, because the engine is already
       * per-day: each day earns `dailyRate × its own day-value`, and the month
       * is the sum. There is no rounding to explain, no cap to explain and no
       * discarded surplus, so the reconciliation residual on this path is zero
       * by construction rather than by tolerance.
       *
       * DEDUCTIONS ARE NOT HIDDEN IN THE EARNING (spec §5). An absence earns
       * ₹0 and a half day earns half — that IS the day's earning, and it reads
       * as one on the row beside its status. PT, TDS and advances are monthly
       * and appear in the month summary, never smeared across days.
       */
      mode: "daily";
      /** Monthly salary ÷ CALENDAR days in this month. */
      dailyRate: number;
      /** The run's gross. The figure everything must reconcile to. */
      gross: number;
    }
  | {
      /** `computeScheduleHourlySalary` — the RETIRED full-time model, kept for
       *  months priced before the daily one. */
      mode: "hours_schedule";
      /** ₹/hour, as frozen on the run. */
      hourlyRate: number;
      /** The run's gross. The figure everything must reconcile to. */
      gross: number;
      /**
       * Additional-hours pay, added OUTSIDE the base cap. Zero for every
       * full-timer today (`earnsOvertime` is false for them, so `computeForRow`
       * passes 0), and carried anyway so the reconciliation stays correct if
       * that policy ever changes.
       */
      overtimeAmount: number;
      /** CTC/12 — the cap the engine applies to the base. */
      monthlySalary: number;
    }
  | {
      /**
       * `computeHourlySalary` — every hourly shift.
       *
       * ── DISCREPANCY, REPORTED NOT PAPERED OVER ──────────────────────────
       * This function's ONLY attendance input is `workedMinutes`. It never sees
       * the credited days that `payableHoursForMonth` computes, so on this path
       * an approved PAID LEAVE day earns nothing — while the month's target
       * (`eligibleTargetHours`) still includes it, because
       * `payableHoursForMonth` adds credited minutes to BOTH sides. The
       * denominator rises, the numerator does not, and the employee is docked
       * for a day the leave policy says is paid.
       *
       * The ledger reports what the engine actually pays rather than what it
       * ought to, because the alternative is a report that disagrees with the
       * payslip. The finding is written up rather than silently corrected —
       * changing it moves real money for real people and is not this task's
       * call to make.
       */
      mode: "hours_worked";
      hourlyRate: number;
      gross: number;
      /** The monthly anchor the base is capped at when no surplus is paid. */
      monthlyAnchor: number;
      /**
       * True when hours beyond the target are paid at the same rate — then
       * `gross` is `rate × every worked hour` and there is no cap at all.
       */
      surplusPaid: boolean;
    }
  | {
      /**
       * The month's pay does not decompose into days: a fixed retainer, or a
       * frozen pre-cutover month priced from the HR sheet rather than from
       * graded hours, or a run generated before the rate column existed.
       *
       * The attendance columns are still real and still shown. The money
       * columns read "—", never a fabricated share.
       */
      mode: "attendance_only";
      /** Shown verbatim, so the blank columns explain themselves. */
      note: string;
    };

export interface LedgerConfig {
  /** One scheduled day, in minutes. The "/ 9h" in the WORK HOURS column. */
  dailyTargetMinutes: number;
  /** This employee's own weekly requirement — 54h full-time, 30h on a shift.
   *  Shown, never assumed: the calendar's 54h default is exactly the bug that
   *  `effective-config.ts` exists to have removed. */
  weeklyTargetMinutes: number;
}

export interface DayLedgerInput {
  /** yyyy-mm */
  month: string;
  /** "August 2026" */
  monthLabel: string;
  days: LedgerDayInput[];
  cfg: LedgerConfig;
  /** The reconciliation and payable-hours result the SALARY ENGINE used. */
  recon: MonthReconciliation;
  hours: PayableHoursResult;
  pay: LedgerPay;
  /** Today (yyyy-mm-dd) in the employee's timezone. */
  refTodayISO: string;
}

/* ════════════════════════════════════════════════════════════════════════════
   OUTPUT SHAPES
   ════════════════════════════════════════════════════════════════════════════ */

/** One day, ready to render. */
export interface LedgerDay {
  date: string; // yyyy-mm-dd
  /** "10 Aug" — compact, because the month is already in the header (spec §4). */
  dateLabel: string;
  /** "Mon" */
  dayLabel: string;
  weekday: number;
  code: string;
  status: DayStatus;
  statusLabel: string;
  /** Where the day was worked. Presentation only — it never moves money. */
  place: WorkPlace;
  /** "10:21" / null. 24-hour, always (spec §4). */
  inAt: string | null;
  outAt: string | null;
  workedMinutes: number;
  /**
   * Minutes this day required, or null when it required none — a holiday, a
   * weekly off, approved leave, comp-off, a worked holiday.
   *
   * Uses the SALARY target's own definition (`isOrdinaryAttendanceDay`), which
   * is what the money was measured against.
   */
  requiredMinutes: number | null;
  /** worked − required. Null when nothing was required, or the day is future. */
  balanceMinutes: number | null;
  /** ₹ this day contributed to the month's pay. Null in attendance_only. */
  earned: number | null;
  /**
   * ₹ a NORMAL day of this kind is worth under this month's pay model — the
   * baseline `adjustment` is measured against, so the ADJ. column can be read
   * without knowing the rate.
   *
   * Null when the month has no money view, and on the retired `hours_schedule`
   * path, whose ADJ. column carries engine charges rather than a comparison.
   */
  standardEarning: number | null;
  /**
   * ₹ this day is ABOVE (+) or BELOW (−) a normal one. The `ADJ.` column.
   *
   * NOT a deduction sitting on top of `earned` — `earned` is already the net
   * figure for the day. This is the comparison beside it: what a day of leave
   * cost, what an hour of overtime added. `reconcile` therefore leaves it out
   * of the arithmetic that has to close on the month's gross, on every path
   * except the retired `hours_schedule` one where it really is a charge.
   */
  adjustment: number | null;
  /** Why the day differs from a normal one, in the pay model's own terms. */
  adjustmentReason: string | null;
  /** Minutes of this day that were payable at the hourly rate. */
  payableMinutes: number;
  late: boolean;
  leftEarly: boolean;
  lateWaived: boolean;
  /** The month has not reached this day yet. */
  future: boolean;
  /** Punched in but never out, on a day that has passed. */
  missingCheckOut: boolean;
  /** Punched out but never in. */
  missingCheckIn: boolean;
  /** Extra sentences for the expanded row — engine facts, not commentary. */
  notes: string[];
}

/** Totals for a week or for the whole month. */
export interface LedgerTotals {
  /** Σ worked minutes on days that OWED hours — the figure the balance below is
   *  measured against, and the engine's own `actualMinutes` by construction. */
  workedMinutes: number;
  /**
   * Σ worked minutes on days that owed NONE — a holiday or a weekly off
   * somebody came in on.
   *
   * Kept apart rather than added in, because the hour engine does not treat
   * these as hours toward the target: a worked day off is CREDITED at the daily
   * target instead (see `isPaidCreditedDay`). Folding them into `workedMinutes`
   * would break the one property that makes the BALANCE column trustworthy —
   * that a week total is the sum of the rows above it.
   */
  offDayWorkedMinutes: number;
  /** Σ required minutes over ELAPSED days that owed hours. */
  requiredMinutes: number;
  /** worked − required. */
  balanceMinutes: number;
  earned: number | null;
  adjustment: number | null;
  /** Day counts by status. Only non-zero entries are present. */
  counts: Partial<Record<DayStatus, number>>;
}

export interface LedgerWeek {
  /** 1-based, in calendar order — "Week 1", "Week 2" … (spec §2). */
  index: number;
  /** Monday-anchored key, shared with the hour engine's own week buckets. */
  weekKey: string;
  startDate: string;
  endDate: string;
  /** "01 Aug – 02 Aug" */
  rangeLabel: string;
  days: LedgerDay[];
  totals: LedgerTotals;
  /** The engine's own figures for this week, for the expanded detail. */
  engine: {
    /** Ordinary days of the week that fall in this month. */
    expectedDays: number;
    /** The week's own target, before any carry. */
    targetMinutes: number;
    /** Signed balance walking in from the earlier weeks of this month. */
    carryInMinutes: number;
    /** target − carryIn, floored at 0 — what the week actually had to produce. */
    effectiveTargetMinutes: number;
    /** Banked surplus actually spent covering this week's shortfall. */
    balanceAppliedMinutes: number;
    /** Did the raw hours clear the deviation-waiver bar? */
    deviationsWaived: boolean;
  } | null;
}

/** How the month's attributed rupees close on the run's gross. */
export interface LedgerReconciliation {
  /** Σ of every row's `earned`. */
  attributedEarned: number;
  /** Σ of every row's `adjustment` (negative for charges). */
  attributedAdjustment: number;
  /**
   * Charges the month could not absorb, added back.
   *
   * `computeScheduleHourlySalary` floors paid hours at zero, so a month with
   * almost nothing worked and unpaid leave in it cannot be charged the full
   * amount — there is nothing left to charge. Zero in every ordinary month.
   */
  chargesBeyondEarnings: number;
  /**
   * Hours worked beyond everything the month required, which the engine does
   * NOT pay: month-end surplus balances targets, it is not money (spec §14/15).
   * Zero on `hours_worked`, where every worked hour is paid.
   */
  surplusNotPayable: number;
  /** The engine pays whole hours only: 53.8h and 53.9h both pay 53h (spec §2). */
  roundedDownToWholeHours: number;
  /** Base pay is capped at the monthly figure. */
  cappedAtMonthlySalary: number;
  /**
   * Additional-hours pay added OUTSIDE the cap. Zero on `hours_worked`, where
   * it is already inside `attributedEarned` — every hour is paid at one rate,
   * so surplus hours need no separate line and adding one would double-count.
   */
  additionalHoursPay: number;
  /** The run's gross — the authoritative figure everything above explains. */
  gross: number;
  /**
   * What the lines above fail to explain. Paise, from rounding each visible row
   * to two decimals. A rupee or more here means the attribution has drifted
   * from the engine and the report is not to be trusted — which is exactly why
   * it is reported rather than swallowed.
   */
  residual: number;
}

export interface DayLedger {
  month: string;
  monthLabel: string;
  mode: LedgerMoneyMode;
  /** Why the money columns are blank. Null unless `mode` is attendance_only. */
  moneyNote: string | null;
  /** ₹/hour, as frozen on the run. Null in `attendance_only` — and in `daily`,
   *  which has no hourly rate because it does not price hours. */
  hourlyRate: number | null;
  /** ₹/day = monthly salary ÷ calendar days in this month (spec §4). Non-null
   *  only in `daily` mode, where it is the rate every row is built from. */
  dailyRate: number | null;
  /**
   * Does this ledger carry per-day MONEY at all?
   *
   * The one flag every surface should read. The view used to ask
   * `hourlyRate != null` in eight places, which was a correct proxy while both
   * priced modes were hourly and became silently wrong the moment the daily
   * model arrived with no hourly rate: the rows carried rupees and every total
   * above them rendered "—".
   */
  hasMoney: boolean;
  /** One scheduled day, in minutes — what a "/ 9h" in the table means. */
  dailyTargetMinutes: number;
  /** This employee's own weekly requirement. */
  weeklyTargetMinutes: number;
  weeks: LedgerWeek[];
  /** Every day, flattened — the filter/sort surface works over this. */
  days: LedgerDay[];
  totals: LedgerTotals;
  /** The month's engine figures, for the summary strip (spec §15). */
  engine: {
    /** The month's full target — what the hourly rate divides by. */
    targetMinutes: number;
    /** Hours actually worked on days that owed hours. */
    actualMinutes: number;
    /** After the month-level netting and the credited days, before rounding. */
    payableMinutesRaw: number;
    /** Whole payable hours — what the money was actually computed on. */
    payableHours: number;
    /** Minutes credited for paid-but-not-worked days. */
    creditedMinutes: number;
    /** Signed month-end balance: surplus positive, deficit negative. */
    monthlyHourBalanceMinutes: number;
    /** Hours beyond everything the month required. */
    netSurplusMinutes: number;
    chargeableHalfDays: number;
    /** Half-days the 3-per-month grace forgave. */
    warnedHalfDays: number;
    /** Half-days the weekly-hours waiver absorbed (these spend no grace slot). */
    waiverAbsorbedHalfDays: number;
    unpaidLeaveDays: number;
  };
  reconciliation: LedgerReconciliation | null;
}

/* ════════════════════════════════════════════════════════════════════════════
   FORMATTERS — exported so the server and the browser render one way
   ════════════════════════════════════════════════════════════════════════════ */

const MONTH_ABBR = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const DOW_ABBR = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "2026-08-10" → "10 Aug". Compact by design (spec §4). */
export function shortDate(ymd: string): string {
  const mi = Number(ymd.slice(5, 7)) - 1;
  return `${ymd.slice(8, 10)} ${MONTH_ABBR[mi] ?? "?"}`;
}

/** 0=Sun..6=Sat → "Sun".."Sat". */
export function shortDow(weekday: number): string {
  return DOW_ABBR[((weekday % 7) + 7) % 7] ?? "?";
}

/**
 * Minutes → "8h 42m" / "9h" / "45m" / "0h".
 *
 * NEVER decimal hours. "8.7h" is a number an employee has to convert in their
 * head before they can compare it with the clock times in the next two columns.
 */
export function hm(minutes: number): string {
  const sign = minutes < 0 ? "-" : "";
  const abs = Math.abs(Math.round(minutes));
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  if (h === 0 && m === 0) return "0h";
  if (m === 0) return `${sign}${h}h`;
  if (h === 0) return `${sign}${m}m`;
  return `${sign}${h}h ${m}m`;
}

/** Minutes → "+45m" / "-3h 28m" / "+0h". Always signed (spec §6). */
export function signedHm(minutes: number): string {
  const r = Math.round(minutes);
  if (r === 0) return "+0h";
  return r > 0 ? `+${hm(r)}` : hm(r);
}

/** Rupees, Indian grouping, decimals only when there are paise. Unsigned. */
export function inr(n: number): string {
  const r = Math.round(n * 100) / 100;
  const whole = Number.isInteger(r);
  return (
    "₹" +
    Math.abs(r).toLocaleString(
      "en-IN",
      whole ? {} : { minimumFractionDigits: 2, maximumFractionDigits: 2 },
    )
  );
}

/** Signed rupees: "+₹120" / "−₹450" / "—" for exactly zero or unknown. */
export function signedInr(n: number | null): string {
  if (n == null) return "—";
  const r = Math.round(n * 100) / 100;
  if (r === 0) return "—";
  return `${r > 0 ? "+" : "−"}${inr(r)}`;
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/* ════════════════════════════════════════════════════════════════════════════
   THE BUILDER
   ════════════════════════════════════════════════════════════════════════════ */

/** Days before the employee joined. Matches NOT_JOINED_CODE in the query layer. */
const NOT_JOINED = "–";

/**
 * Attribute one graded month, day by day, against its authoritative pay.
 *
 * Deterministic and total: every branch produces a row, and a month the engine
 * has no money view of still produces a full attendance ledger with the money
 * columns explicitly null — never 0, which would read as "you earned nothing".
 */
export function buildDayLedger(input: DayLedgerInput): DayLedger {
  const { cfg, recon, hours, pay, refTodayISO, month, monthLabel } = input;
  const dailyTarget = cfg.dailyTargetMinutes;
  // The hourly rate, for the two hour-priced models. The DAILY model has no
  // hourly rate at all — its money is per day — so it carries null here and
  // earns through `dailyRate` below.
  const rate =
    pay.mode === "attendance_only" || pay.mode === "daily" ? null : pay.hourlyRate;
  const dailyRate = pay.mode === "daily" ? pay.dailyRate : null;
  /** True when this month has ANY money view — either rate is enough. */
  const priced = rate != null || dailyRate != null;

  // ── The two per-date charges the engine makes ──────────────────────────────
  // Read from the engine's own record, keyed by the date IT recorded, so the
  // report can never charge a day the payslip did not. A chargeable half-day is
  // the 4th onward in the month; the first three are warned only.
  // `recon.halfDayCharges` carries the date and the ordinal, which is the whole
  // reason a per-day attribution of this charge is possible at all.
  //
  // Only `hours_schedule` applies them: `computeHourlySalary` takes neither
  // input, so charging them on that path would invent a deduction.
  const halfDayCharge = new Map<string, number>(); // date → ordinal
  if (pay.mode === "hours_schedule") {
    for (const c of recon.halfDayCharges) {
      if (!c.waived) halfDayCharge.set(c.date, c.ordinal);
    }
  }
  const chargesUnpaidLeave = pay.mode === "hours_schedule";

  // ── Rows ───────────────────────────────────────────────────────────────────
  const days: LedgerDay[] = [];
  for (const d of input.days) {
    if (d.code === NOT_JOINED) continue; // not gradeable; not this person's month
    if (d.logDate.slice(0, 7) !== month) continue;

    // ── `future` IS PRESENTATION ONLY ────────────────────────────────────
    // It never zeroes a payable minute and never suppresses a charge, and
    // that is load-bearing rather than tidy: the engine counts the WHOLE
    // month, so an approved paid leave or unpaid leave dated next week is
    // already in `payableHoursForMonth`'s credit and in `unpaidLeaveDays`.
    // Zeroing those rows because the calendar has not reached them would
    // leave the month unable to add up — an open month with approved future
    // leave in it would silently stop reconciling.
    //
    // Nothing is invented by trusting the data instead: a future ORDINARY
    // day has no punches, so its worked minutes are zero either way.
    const future = d.logDate > refTodayISO;
    const ordinary = isOrdinaryAttendanceDay(d.code);
    const credited = isPaidCreditedDay(d.code);
    const workedMinutes = d.workedMinutes;

    const requiredMinutes = ordinary ? dailyTarget : null;
    // No balance on a day that has not happened: nobody is 9h short of next
    // Tuesday. The requirement is still recorded — `totalsOf` is what keeps
    // it out of the elapsed total.
    const balanceMinutes =
      future || requiredMinutes == null ? null : workedMinutes - requiredMinutes;

    // ── PAYABLE MINUTES ──────────────────────────────────────────────────
    // Each mode's own rule, taken from the function that actually pays:
    //
    //   hours_schedule → `payableHoursForMonth`: worked minutes on an ordinary
    //                    day, the daily target credited on a paid day off.
    //   hours_worked   → `computeHourlySalary`: the minutes worked, wherever
    //                    they were worked, and nothing else.
    const payableMinutes =
      pay.mode === "hours_worked"
        ? workedMinutes
        : ordinary
          ? workedMinutes
          : credited
            ? dailyTarget
            : 0;

    // ── WHAT THIS DAY EARNED ─────────────────────────────────────────────
    // DAILY model: the day's own value × the daily rate. Full day ₹R, half day
    // ₹R/2, absent ₹0, holiday / weekly off / paid leave / comp-off ₹R, unpaid
    // leave ₹0 — the day-value table IS the pay policy (spec §4). A day that has
    // not happened has earned nothing YET, which is a different statement from
    // ₹0 and is rendered as a blank.
    //
    // HOUR-PRICED models: rate × the minutes that day made payable.
    // A day the month has not reached has earned nothing YET, which is not the
    // same sentence as ₹0 — so it reads as a blank on every path. On the two
    // hour-priced ones the test is `payableMinutes === 0` rather than `future`
    // alone, and deliberately: `hours_schedule` credits an approved FUTURE paid
    // leave at the daily target, that credit is already inside the month's
    // gross, and blanking it would leave the reconciliation unable to close.
    const earned =
      dailyRate != null
        ? future
          ? null
          : round2(dailyRate * d.dayValue)
        : rate == null
          ? null
          : future && payableMinutes === 0
            ? null
            : round2((rate * payableMinutes) / 60);

    // ── THE `ADJ.` COLUMN — HOW THIS DAY DIFFERED FROM A NORMAL ONE ──────
    // The two live pay models have genuinely different baselines, and using one
    // baseline for both would make the column lie to one group of employees:
    //
    //   daily         Every CALENDAR day is paid `dailyRate` — a holiday, a
    //                 weekly off and an approved paid leave all earn a full day
    //                 (spec §4) — so the baseline is `dailyRate` on every row.
    //                 A half day reads −½ a day, an absence and an unpaid leave
    //                 read −1 day, and everything else reads flat. A full-timer
    //                 working extra hours reads flat too, and MUST: their
    //                 surplus reconciles next week's target, it is never money
    //                 (spec §15), so printing it as +₹ here would promise pay
    //                 the payslip will not contain.
    //
    //   hours_worked  Paid for hours actually worked, so the baseline is one
    //                 SCHEDULED day at the hourly rate, and only on days that
    //                 were scheduled. Overtime therefore shows the real extra
    //                 rupees — on this path they are real, `surplusPaid` is
    //                 true and every hour is bought — a short day shows the
    //                 real shortfall, a day of leave shows the pay it cost
    //                 (see the DISCREPANCY note on `hours_worked`), and a
    //                 holiday or weekly off somebody chose to work shows the
    //                 whole thing as a gain, because none of it was owed.
    //
    // A FUTURE day gets no adjustment. Nothing has happened, so there is nothing
    // to compare — and on the daily path `earned` is null there anyway.
    let adjustment: number | null = null;
    let standardEarning: number | null = null;
    let adjustmentReason: string | null = null;

    if (pay.mode === "hours_schedule") {
      // ── THE RETIRED MODEL'S CHARGES, UNCHANGED ────────────────────────
      // Here the ADJ. column really is money the engine removed, and the
      // reconciliation adds it back term for term. Left exactly as it was:
      // `ledgerPayFor` no longer produces this mode, so nothing reaches it
      // today, and rewriting an unreachable path would only break the one
      // property that made it trustworthy.
      const chargeRate = pay.hourlyRate;
      let charge = 0;
      const ordinal = halfDayCharge.get(d.logDate);
      if (ordinal != null) {
        charge -= (chargeRate * dailyTarget) / 60 / 2;
        adjustmentReason =
          `Half-day #${ordinal} this month. The first ${MONTHLY_HALF_DAY_GRACE} each month are ` +
          `warned only; from the ${MONTHLY_HALF_DAY_GRACE + 1}th, half a scheduled day is charged ` +
          `at your hourly rate.`;
      }
      if (chargesUnpaidLeave && d.code === UNPAID_LEAVE_CODE) {
        charge -= (chargeRate * dailyTarget) / 60;
        adjustmentReason =
          "Approved unpaid leave. The day is removed from your target — you are not asked to " +
          "work it back and you are not marked absent — and charged once at your hourly rate.";
      }
      adjustment = round2(charge);
    } else if (priced && !future && earned != null) {
      standardEarning =
        dailyRate != null
          ? round2(dailyRate)
          : rate == null || !isScheduledWorkDay(d.code)
            ? 0
            : round2((rate * dailyTarget) / 60);
      adjustment = round2(earned - standardEarning);
      adjustmentReason = varianceReason(d, {
        variance: adjustment,
        mode: pay.mode,
        dailyTarget,
        scheduled: isScheduledWorkDay(d.code),
      });
    }

    const status = statusFor(d, { future, ordinary, requiredMinutes, workedMinutes });
    const missingCheckOut = !future && d.inAt != null && d.outAt == null;
    const missingCheckIn = !future && d.inAt == null && d.outAt != null;

    days.push({
      date: d.logDate,
      dateLabel: shortDate(d.logDate),
      dayLabel: shortDow(d.weekday),
      weekday: d.weekday,
      code: d.code,
      status,
      statusLabel: DAY_STATUS_LABELS[status],
      place: placeFor(d.remoteMode),
      inAt: d.inAt,
      outAt: d.outAt,
      workedMinutes,
      requiredMinutes,
      balanceMinutes,
      earned,
      standardEarning,
      adjustment,
      adjustmentReason,
      payableMinutes,
      late: d.late,
      leftEarly: d.leftEarly,
      lateWaived: d.lateWaived,
      future,
      missingCheckOut,
      missingCheckIn,
      notes: notesFor(d, {
        future,
        ordinary,
        missingCheckIn,
        missingCheckOut,
        dailyTarget,
        mode: pay.mode,
      }),
    });
  }

  days.sort((a, b) => a.date.localeCompare(b.date));

  // ── Weeks ─────────────────────────────────────────────────────────────────
  // Grouped by the hour engine's OWN Monday-anchored bucket, so "Week 2" in
  // this report and week 2 of the reconciliation are the same seven days. A
  // week straddling the month boundary appears clipped, which is exactly how
  // the engine reconciles it (see the MONTH BOUNDARY note in hour-balance.ts).
  const byWeek = new Map<string, LedgerDay[]>();
  const order: string[] = [];
  for (const d of days) {
    const k = weekKeyOf(d.date);
    let arr = byWeek.get(k);
    if (!arr) {
      arr = [];
      byWeek.set(k, arr);
      order.push(k);
    }
    arr.push(d);
  }
  const engineWeeks = new Map(recon.weeks.map((w) => [w.weekKey, w]));

  // EITHER rate counts: the daily model prices days, the other two price hours,
  // and all three produce real per-row money. Testing only `rate` here blanked
  // every total on the daily path while the rows beneath them carried figures.
  const hasMoney = priced;
  const weeks: LedgerWeek[] = order.map((weekKey, i) => {
    const wdays = byWeek.get(weekKey)!;
    const start = wdays[0]!.date;
    const end = wdays[wdays.length - 1]!.date;
    const e = engineWeeks.get(weekKey);
    return {
      index: i + 1,
      weekKey,
      startDate: start,
      endDate: end,
      rangeLabel: start === end ? shortDate(start) : `${shortDate(start)} – ${shortDate(end)}`,
      days: wdays,
      totals: totalsOf(wdays, hasMoney),
      engine: e
        ? {
            expectedDays: e.expectedDays,
            targetMinutes: e.weeklyTargetMinutes,
            carryInMinutes: e.carryInMinutes,
            effectiveTargetMinutes: e.effectiveTargetMinutes,
            balanceAppliedMinutes: e.balanceAppliedMinutes,
            deviationsWaived: e.deviationsWaived,
          }
        : null,
    };
  });

  return {
    month,
    monthLabel,
    mode: pay.mode,
    moneyNote: pay.mode === "attendance_only" ? pay.note : null,
    hourlyRate: rate,
    dailyRate,
    hasMoney,
    dailyTargetMinutes: dailyTarget,
    weeklyTargetMinutes: cfg.weeklyTargetMinutes,
    weeks,
    days,
    totals: totalsOf(days, hasMoney),
    engine: {
      targetMinutes: hours.targetMinutes,
      actualMinutes: hours.actualMinutes,
      payableMinutesRaw: hours.payableMinutesRaw,
      payableHours: hours.payableHours,
      creditedMinutes: hours.creditedMinutes,
      monthlyHourBalanceMinutes: recon.monthlyHourBalanceMinutes,
      netSurplusMinutes: hours.netSurplusMinutes,
      chargeableHalfDays: recon.chargeableHalfDays,
      warnedHalfDays: recon.warnedHalfDays,
      waiverAbsorbedHalfDays: recon.waiverAbsorbedHalfDays,
      unpaidLeaveDays: hours.unpaidLeaveDays,
    },
    reconciliation: reconcile(days, { cfg, recon, hours, pay }),
  };
}

/* ── status, place, notes ─────────────────────────────────────────────────── */

function statusFor(
  d: LedgerDayInput,
  ctx: {
    future: boolean;
    ordinary: boolean;
    requiredMinutes: number | null;
    workedMinutes: number;
  },
): DayStatus {
  // A future ORDINARY day is a guess: the grader has no punches for it and
  // marks it "A", which is not a statement about the employee. Every other
  // future code is a KNOWN fact already on the calendar — a declared holiday,
  // a weekly off, an approved leave — and hiding it behind "Upcoming" would
  // throw away the most useful thing the rest of the month has to say.
  if (ctx.future && ctx.ordinary) return "upcoming";
  switch (d.code) {
    case "P": {
      // A Full Day that beat its requirement by a visible margin reads as
      // Overtime. Same code, same money — see OVERTIME_LABEL_MINUTES.
      const req = ctx.requiredMinutes;
      return req != null && ctx.workedMinutes - req >= OVERTIME_LABEL_MINUTES
        ? "overtime"
        : "full_day";
    }
    case "H/D":
      return "half_day";
    case "W/O":
      return "weekly_off";
    case "H":
      return "holiday";
    case "HP":
      return "holiday_worked";
    case "H-H/D":
      return "holiday_half";
    case "PL":
      return "paid_leave";
    case "LWP":
      return "unpaid_leave";
    case "CO":
      return "comp_off";
    case "incomplete":
      return "no_checkout";
    // "A" and anything the enum grows without this switch: absent is the
    // conservative reading, and it is what the grader means by an ungraded
    // ordinary day.
    default:
      return "absent";
  }
}

function placeFor(mode: string | null): WorkPlace {
  return mode === "wfh" || mode === "field" || mode === "client_site" ? mode : "office";
}

/**
 * The sentences the expanded row shows.
 *
 * Every one of them states something the ENGINE does — why a day owed no hours,
 * why a missing punch was not treated as an absence, why a credited day pays.
 * The point of the report is to explain the existing calculation, so these are
 * facts about the code and not reassurance.
 */
function notesFor(
  d: LedgerDayInput,
  ctx: {
    future: boolean;
    ordinary: boolean;
    missingCheckIn: boolean;
    missingCheckOut: boolean;
    dailyTarget: number;
    mode: LedgerMoneyMode;
  },
): string[] {
  const notes: string[] = [];
  if (ctx.future) {
    notes.push(
      ctx.ordinary
        ? "This day has not happened yet. It is in your target for the month but not yet in " +
            "the hours you owe, so it cannot show as a shortfall."
        : "This day has not happened yet, but it is already on your calendar.",
    );
  }
  if (ctx.missingCheckOut) {
    notes.push(
      "No check-out recorded. A forgotten punch-out is credited half a day rather than zeroed, " +
        "and the hours shown are measured to the end of the day.",
    );
  }
  if (ctx.missingCheckIn) {
    notes.push(
      "No check-in recorded. An out-punch is evidence you were here, so the day is credited " +
        "half a day rather than marked absent.",
    );
  }
  if (d.code === "H" || d.code === "W/O") {
    notes.push(
      "No hours were required, so this day is not in your target and cannot create a deficit " +
        "or a deduction.",
    );
  }
  if (d.code === "HP" || d.code === "H-H/D") {
    notes.push(
      ctx.mode === "hours_worked"
        ? "Worked on a day off. It owed no hours, and every hour you worked is paid at your hourly rate."
        : `Worked on a day off. It owed no hours, and is credited ${hm(ctx.dailyTarget)} at your hourly rate.`,
    );
  }
  if (d.code === "PL" || d.code === "CO") {
    notes.push(
      ctx.mode === "hours_worked"
        ? // The discrepancy, stated to the person it affects rather than hidden.
          // See the DISCREPANCY note on LedgerPay's `hours_worked` member.
          "Approved leave, and removed from the hours you were asked to work. Because your pay " +
            "is calculated from hours actually worked, this day adds nothing to it."
        : `Paid without hours: credited ${hm(ctx.dailyTarget)} at your hourly rate, and removed ` +
            `from your target so it cannot show as a shortfall.`,
    );
  }
  if (d.code === UNPAID_LEAVE_CODE) {
    notes.push(
      "Removed from your target — you are not asked to work the day back, and you are not " +
        "marked absent.",
    );
  }
  if (d.code === "incomplete") {
    notes.push(
      "Neither required nor payable: with no usable punch pair this day is excluded from both " +
        "your target hours and your worked hours.",
    );
  }
  if (d.lateWaived) notes.push("Arrived late, but the full day worked forgave it.");
  else if (d.late) notes.push("Arrived after your late-after time.");
  if (d.leftEarly) notes.push("Left before your official end time.");
  return notes;
}

/**
 * The one sentence under the ADJ. figure, when there is one.
 *
 * Says what the difference IS in the pay model's own terms, because "−₹145.85"
 * on a leave day and "−₹145.85" on a day somebody left early are the same
 * number and completely different facts. Null when the day is flat, so a
 * perfectly ordinary row carries no explanation it does not need.
 */
function varianceReason(
  d: LedgerDayInput,
  ctx: {
    variance: number;
    mode: LedgerMoneyMode;
    dailyTarget: number;
    scheduled: boolean;
  },
): string | null {
  // Under a paisa is not a difference — it is `round2` on two paths.
  if (Math.round(ctx.variance * 100) === 0) return null;
  const short = ctx.variance < 0;

  if (ctx.mode === "daily") {
    switch (d.code) {
      case "H/D":
        return "Half day. It earns half the daily rate, and the other half is the difference shown here.";
      case UNPAID_LEAVE_CODE:
        return "Approved unpaid leave. The day is not paid at all, so a full daily rate is what it cost.";
      case "A":
        return "Absent. The day earns nothing, so a full daily rate is what it cost.";
      default:
        return short
          ? "This day earned less than a full daily rate."
          : "This day earned more than a full daily rate.";
    }
  }

  // ── hours_worked: every rupee here is real ────────────────────────────────
  // `surplusPaid` is true for every worker on this basis, so an hour beyond the
  // schedule is bought at the same rate as an hour inside it. The + is money.
  if (!ctx.scheduled) {
    return (
      "You were not rostered to work this day, so no hours were owed — every hour you did " +
      "work is paid on top of your schedule."
    );
  }
  if (d.code === "PL" || d.code === "CO") {
    return (
      "Approved leave. Your pay is calculated from hours actually worked, so this day adds " +
      `nothing to it and a scheduled ${hm(ctx.dailyTarget)} is what it cost.`
    );
  }
  if (d.code === UNPAID_LEAVE_CODE) {
    return `Approved unpaid leave, so a scheduled ${hm(ctx.dailyTarget)} is what it cost.`;
  }
  return short
    ? `Worked less than your scheduled ${hm(ctx.dailyTarget)}, and you are paid for the hours you work.`
    : `Worked beyond your scheduled ${hm(ctx.dailyTarget)}. Every extra hour is paid at your hourly rate.`;
}

/* ── totals ───────────────────────────────────────────────────────────────── */

/**
 * Sum a set of rows.
 *
 * `requiredMinutes` counts ELAPSED days only. The grader marks every future
 * working day "A", so including them would show a month in progress as an
 * enormous deficit on the 10th — the same trap `withRealAttendance` sidesteps
 * for the day counts. `workedMinutes` needs no such guard: a future day has
 * none.
 */
function totalsOf(rows: LedgerDay[], hasMoney: boolean): LedgerTotals {
  let workedMinutes = 0;
  let offDayWorkedMinutes = 0;
  let requiredMinutes = 0;
  let earned = 0;
  let adjustment = 0;
  const counts: Partial<Record<DayStatus, number>> = {};

  for (const r of rows) {
    counts[r.status] = (counts[r.status] ?? 0) + 1;
    if (r.requiredMinutes != null) {
      workedMinutes += r.workedMinutes;
      if (!r.future) requiredMinutes += r.requiredMinutes;
    } else {
      offDayWorkedMinutes += r.workedMinutes;
    }
    earned += r.earned ?? 0;
    adjustment += r.adjustment ?? 0;
  }

  return {
    workedMinutes,
    offDayWorkedMinutes,
    requiredMinutes,
    balanceMinutes: workedMinutes - requiredMinutes,
    earned: hasMoney ? round2(earned) : null,
    adjustment: hasMoney ? round2(adjustment) : null,
    counts,
  };
}

/* ── the reconciliation ───────────────────────────────────────────────────── */

/**
 * Close the loop: explain the run's gross entirely in terms of the rows above
 * it plus the month-level effects the engine explicitly applies.
 *
 * ── hours_schedule mirrors `computeScheduleHourlySalary` term for term ─────
 *     payableHours = floor(payableMinutesRaw / 60)
 *     paidHours    = max(0, payableHours − halfDayPenalty − unpaidLeave)
 *     base         = min(rate × paidHours, monthlySalary)
 *     gross        = base + rate × overtimeHours
 *
 * The one liberty taken is arithmetic ORDER: the report subtracts the per-date
 * charges as ROW adjustments, so an employee can see which day cost them, where
 * the engine subtracts them from the hour count first. `max(0, …)` is the only
 * place the two can diverge, and it bites only when the charges exceed every
 * payable hour in the month. `chargesBeyondEarnings` records that.
 *
 * ── hours_worked mirrors `computeHourlySalary` ─────────────────────────────
 *     workedHours = floor(workedMinutes / 60)
 *     gross       = surplusPaid ? rate × workedHours
 *                               : min(rate × workedHours, monthlyAnchor)
 *
 * No surplus line (every hour is paid) and no separate additional-hours line
 * (it is already inside the rows — same rate, no premium).
 */
function reconcile(
  days: LedgerDay[],
  a: {
    cfg: LedgerConfig;
    recon: MonthReconciliation;
    hours: PayableHoursResult;
    pay: LedgerPay;
  },
): LedgerReconciliation | null {
  const { cfg, recon, hours, pay } = a;
  if (pay.mode === "attendance_only") return null;

  const attributedEarnedAll = round2(days.reduce((s, d) => s + (d.earned ?? 0), 0));

  // ── DAILY: nothing to explain ─────────────────────────────────────────────
  // `computeDailySalary` is `dailyRate × Σ day-values`, and the rows ARE that
  // sum term by term. There is no whole-hour round-down, no monthly cap and no
  // discarded surplus on this path, so every reconciling line is structurally
  // zero and the residual is the plain difference. A non-zero residual here
  // means the stored run was computed from a DIFFERENT set of days than the one
  // graded now — which is exactly what `ledgerReconciles` is for.
  if (pay.mode === "daily") {
    return {
      attributedEarned: attributedEarnedAll,
      attributedAdjustment: 0,
      chargesBeyondEarnings: 0,
      surplusNotPayable: 0,
      roundedDownToWholeHours: 0,
      cappedAtMonthlySalary: 0,
      additionalHoursPay: 0,
      gross: round2(pay.gross),
      residual: round2(round2(pay.gross) - attributedEarnedAll),
    };
  }

  const rate = pay.hourlyRate;
  const dailyTargetHours = cfg.dailyTargetMinutes / 60;
  const attributedEarned = round2(days.reduce((s, d) => s + (d.earned ?? 0), 0));
  // Only `hours_schedule` puts real money in the ADJ. column. On every other
  // priced path it is a COMPARISON against a normal day and `earned` already
  // nets it, so summing it into the reconciliation would print a deduction the
  // payslip never made and then fail to close on the gross.
  const attributedAdjustment =
    pay.mode === "hours_schedule"
      ? round2(days.reduce((s, d) => s + (d.adjustment ?? 0), 0))
      : 0;
  const gross = round2(pay.gross);

  if (pay.mode === "hours_worked") {
    // `computeHourlySalary` prices `floor(workedMinutes / 60)`. The rows carry
    // the precise minutes, so the difference is the engine's round-down.
    const payableMinutes = days.reduce((s, d) => s + d.payableMinutes, 0);
    const wholeHours = Math.floor(payableMinutes / 60);
    const roundedDownToWholeHours = round2(rate * (payableMinutes / 60 - wholeHours));
    const cappedAtMonthlySalary =
      pay.surplusPaid || !(pay.monthlyAnchor > 0)
        ? 0
        : round2(Math.max(0, rate * wholeHours - pay.monthlyAnchor));
    const explained = round2(
      attributedEarned - roundedDownToWholeHours - cappedAtMonthlySalary,
    );
    return {
      attributedEarned,
      // Zero by the rule above: the rows' ADJ. figures describe this month, they
      // do not add to it.
      attributedAdjustment,
      chargesBeyondEarnings: 0,
      surplusNotPayable: 0,
      roundedDownToWholeHours,
      cappedAtMonthlySalary,
      additionalHoursPay: 0,
      gross,
      residual: round2(gross - explained),
    };
  }

  // ── hours_schedule ────────────────────────────────────────────────────────
  // Surplus the engine discards. `min(actual, target)` inside
  // `payableHoursForMonth` is where it goes, and `netSurplusMinutes` — the
  // engine's OWN report of the positive side of the month-end carry — is
  // exactly how much. Read rather than re-derived.
  const surplusNotPayable = round2((rate * hours.netSurplusMinutes) / 60);
  const roundedDownToWholeHours = round2(
    rate * (hours.payableMinutesRaw / 60 - hours.payableHours),
  );

  // The base cap, recomputed exactly as the engine does from the engine's own
  // inputs, so this line is a statement about the engine and not a guess.
  const chargeHours =
    recon.chargeableHalfDays * (dailyTargetHours / 2) +
    Math.max(0, hours.unpaidLeaveDays) * dailyTargetHours;
  const paidHours = Math.max(0, hours.payableHours - chargeHours);
  const cappedAtMonthlySalary =
    pay.monthlySalary > 0 ? round2(Math.max(0, rate * paidHours - pay.monthlySalary)) : 0;
  // `Math.max(0, …)` above is the engine refusing to pay a negative month. When
  // the charges exceed every payable hour there is nothing left to take them
  // from, so the part that could not be charged is added back — otherwise the
  // rows would show a deduction the payslip never made.
  const chargesBeyondEarnings = round2(rate * Math.max(0, chargeHours - hours.payableHours));
  const additionalHoursPay = round2(pay.overtimeAmount);

  const explained = round2(
    attributedEarned +
      attributedAdjustment +
      chargesBeyondEarnings -
      surplusNotPayable -
      roundedDownToWholeHours -
      cappedAtMonthlySalary +
      additionalHoursPay,
  );

  return {
    attributedEarned,
    attributedAdjustment,
    chargesBeyondEarnings,
    surplusNotPayable,
    roundedDownToWholeHours,
    cappedAtMonthlySalary,
    additionalHoursPay,
    gross,
    residual: round2(gross - explained),
  };
}

/* ════════════════════════════════════════════════════════════════════════════
   THE VIEW LAYER — filtering and sorting, as pure functions
   ════════════════════════════════════════════════════════════════════════════

   Here rather than in the component for two reasons. It is testable, which
   matters because "Status = Half Day AND Week = Week 3" combining correctly
   (spec §12) is a claim about set intersection that a screenshot cannot verify.
   And the totals shown against a FILTERED view have to be the totals OF that
   view — a week header still reading the unfiltered figures while the rows
   below it show three days is the kind of quiet inconsistency this whole report
   exists to remove.

   Filtering happens in the browser, and legitimately: the month is delivered
   whole and server-graded, so there is no pagination or server-side query for a
   client filter to disagree with. It narrows what is already in hand. */

export interface LedgerFilter {
  status: DayStatus | "all";
  place: WorkPlace | "all";
  /** A 1-based week index, or every week. */
  week: number | "all";
}

export const LEDGER_FILTER_NONE: LedgerFilter = {
  status: "all",
  place: "all",
  week: "all",
};

export type LedgerSort =
  | "date_asc"
  | "date_desc"
  | "hours_desc"
  | "hours_asc"
  | "earned_desc"
  | "earned_asc";

export const LEDGER_SORT_LABELS: Record<LedgerSort, string> = {
  date_asc: "Date — Oldest First",
  date_desc: "Date — Newest First",
  hours_desc: "Hours — Highest First",
  hours_asc: "Hours — Lowest First",
  earned_desc: "Earning — Highest First",
  earned_asc: "Earning — Lowest First",
};

/** Is any filter actually narrowing the view? Drives the "clear" affordance. */
export function isFiltered(f: LedgerFilter): boolean {
  return f.status !== "all" || f.place !== "all" || f.week !== "all";
}

/**
 * Keep the days that match EVERY set filter (spec §12: "Filters should work
 * together"). The week test is by index rather than by date so it survives a
 * re-sort.
 */
export function filterLedgerDays(
  days: readonly LedgerDay[],
  f: LedgerFilter,
  weekIndexOf: (date: string) => number,
): LedgerDay[] {
  return days.filter(
    (d) =>
      (f.status === "all" || d.status === f.status) &&
      (f.place === "all" || d.place === f.place) &&
      (f.week === "all" || weekIndexOf(d.date) === f.week),
  );
}

/**
 * Sort a set of day rows.
 *
 * Date is always the tie-breaker, so every ordering is total and the table
 * never reshuffles rows that compare equal. `hours` sorts on the minutes
 * actually worked; `earned` on the day's contribution, with a null (a month
 * with no money view) treated as the bottom rather than as zero.
 */
export function sortLedgerDays(days: readonly LedgerDay[], sort: LedgerSort): LedgerDay[] {
  const out = [...days];
  const byDate = (a: LedgerDay, b: LedgerDay) => a.date.localeCompare(b.date);
  switch (sort) {
    case "date_asc":
      return out.sort(byDate);
    case "date_desc":
      return out.sort((a, b) => byDate(b, a));
    case "hours_desc":
      return out.sort((a, b) => b.workedMinutes - a.workedMinutes || byDate(a, b));
    case "hours_asc":
      return out.sort((a, b) => a.workedMinutes - b.workedMinutes || byDate(a, b));
    case "earned_desc":
      return out.sort((a, b) => (b.earned ?? -1) - (a.earned ?? -1) || byDate(a, b));
    case "earned_asc":
      return out.sort((a, b) => (a.earned ?? -1) - (b.earned ?? -1) || byDate(a, b));
  }
}

/** A week as the view shows it: the original number, the matching rows only. */
export interface LedgerWeekView extends LedgerWeek {
  /** How many of this week's days the filter removed. */
  hiddenDays: number;
}

/**
 * Apply a filter and a sort, and hand back the weeks that still have rows.
 *
 * Weeks that lose every day DISAPPEAR rather than rendering as an empty
 * accordion (spec §12). Week numbers and date ranges are preserved from the
 * unfiltered ledger — "Week 3" is the third week of the month whether or not
 * weeks 1 and 2 matched — while the totals are recomputed over the visible
 * rows so a week header can never describe days that are not under it.
 */
export function applyLedgerView(
  ledger: DayLedger,
  f: LedgerFilter,
  sort: LedgerSort,
): LedgerWeekView[] {
  // `ledger.hasMoney`, NOT `hourlyRate != null`. The daily model has no hourly
  // rate at all, so the old test blanked every FILTERED week's totals while the
  // rows underneath them carried rupees — the same bug the flag was added to
  // remove, surviving in the one place that reads the ledger rather than the
  // component.
  const hasMoney = ledger.hasMoney;
  const out: LedgerWeekView[] = [];
  for (const w of ledger.weeks) {
    if (f.week !== "all" && w.index !== f.week) continue;
    const kept = filterLedgerDays(w.days, { ...f, week: "all" }, () => w.index);
    if (kept.length === 0) continue;
    out.push({
      ...w,
      days: sortLedgerDays(kept, sort),
      totals: totalsOf(kept, hasMoney),
      hiddenDays: w.days.length - kept.length,
    });
  }
  return out;
}

/** The totals for everything a view is showing, across its weeks. */
export function viewTotals(weeks: readonly LedgerWeekView[], hasMoney: boolean): LedgerTotals {
  return totalsOf(weeks.flatMap((w) => w.days), hasMoney);
}

/* ════════════════════════════════════════════════════════════════════════════
   IS THIS LEDGER TRUSTWORTHY?
   ════════════════════════════════════════════════════════════════════════════ */

/**
 * How far the attributed rupees may miss the stored gross before the money is
 * withheld, in rupees.
 *
 * ── WHY A TOLERANCE AT ALL ─────────────────────────────────────────────────
 * Each visible row is rounded to two decimals so the column adds up on screen,
 * and the engine's own arithmetic rounds at different points, so a perfect
 * month still lands a few paise out. Measured across every real employee-month
 * in August and September 2026 (30 of them, grosses from ₹318 to ₹71,212) the
 * largest honest residual was ₹0.73.
 *
 * ── WHY IT MATTERS THAT IT IS SMALL ────────────────────────────────────────
 * Anything above this is not rounding — it means the stored run was computed
 * against a DIFFERENT attendance or pay record than the one being attributed.
 * That happens legitimately: a closed month's run is frozen as it was issued
 * (see lib/salary/my-salary.ts), while attendance keeps moving underneath it —
 * a punch backfilled, a leave approved later, a holiday added to the HR
 * calendar, a salary profile edited. Verified on real data: 23 of 25 stored
 * August 2026 runs no longer matched the live grading, several by thousands of
 * rupees.
 *
 * When that is the case the honest answer is to show the attendance and WITHHOLD
 * the money, not to print per-day figures that contradict the payslip on the
 * same screen. ₹2 leaves comfortable headroom over the observed noise while
 * catching every real divergence seen (the smallest was ₹7.17).
 */
export const LEDGER_RECONCILE_TOLERANCE = 2;

/**
 * Do this ledger's per-day rupees actually add up to the gross it was given?
 *
 * True for a ledger with no money view at all: there is nothing to disagree
 * with, and the attendance in it is just as real.
 */
export function ledgerReconciles(ledger: DayLedger): boolean {
  if (!ledger.reconciliation) return true;
  return Math.abs(ledger.reconciliation.residual) <= LEDGER_RECONCILE_TOLERANCE;
}
