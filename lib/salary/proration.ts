// WS-5 Salary core — Proration v2 (PURE: no DB, no wall-clock `new Date()`).
//
// Salary is paid on ACTUAL days in the month (28/30/31), with the divisor taken
// from salary_config ('actual' | 'fixed31' | 'fixed30' — "divide by 31 if in
// doubt"). It honours:
//   • Date of joining — days before the join date never earn.
//   • Free-training window (7 or 15 days) — the person is PRESENT during it but
//     salary is payable only FROM the day after it ends (7-day free → paid from
//     the 8th). Those present-but-unpaid days are removed from the paid total.
//
// This module is a v2 SUPERSET of lib/salary/compute.ts. It is only ever called
// when salaryV2Enabled() is true; while the flag is off, compute.ts stays the
// source of truth and live numbers do not move.
//
// All money is rupees, rounded to 2 dp. All day math is UTC-noon to dodge DST.

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/** UTC date at noon for a YYYY-MM-DD (or a Date); noon avoids TZ/DST edges. */
function utcNoon(d: string | Date): Date {
  if (d instanceof Date) return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12));
  const [y, m, dd] = d.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, dd, 12));
}

/** Add whole days to a UTC-noon date. */
function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}

/** [firstDay, lastDay] (inclusive) of a YYYY-MM month, as UTC-noon dates. */
function monthBounds(month: string): { first: Date; last: Date; days: number } {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const first = new Date(Date.UTC(y, m - 1, 1, 12));
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const last = new Date(Date.UTC(y, m - 1, days, 12));
  return { first, last, days };
}

/** Inclusive whole-day count of [a, b] (0 if b < a). */
function inclusiveDays(a: Date, b: Date): number {
  const ms = b.getTime() - a.getTime();
  if (ms < 0) return 0;
  return Math.round(ms / 86_400_000) + 1;
}

export interface ProrationV2Input {
  month: string; // YYYY-MM
  monthlyCtc: number; // rupees/month (annualCtc / 12)
  divisor: number; // per-day denominator (from resolveDivisor: actual days or 31/30)
  /** Σ day-values from the attendance summary over the WHOLE month (PL=1, A=0,
   *  HP=2, half=0.5…). Includes any present-but-unpaid free-training days —
   *  proration removes them. */
  attendancePayableDays: number;
  /** Un-waived late marks (every 3rd → 0.5-day cut). Pass 0 if handled elsewhere. */
  lateMarksInMonth?: number;
  /** Employee date of joining (YYYY-MM-DD), or null if joined before this month. */
  joinDate?: string | null;
  /** Free-training window length in days (7 or 15). 0 disables it. */
  freeTrainingDays?: number;
}

export interface ProrationV2Result {
  daysInMonth: number;
  divisor: number;
  perDay: number;
  /** First calendar day of the month the person actually earns from (>= join,
   *  and after the free-training window). YYYY-MM-DD, or null if they earn all
   *  month. */
  paidFromDate: string | null;
  /** Calendar days in the month that fall inside the free-training window
   *  (present but unpaid) — removed from the paid total. */
  freeTrainingUnpaidDays: number;
  /** Calendar days in the month before the join date (never earn). */
  preJoinDays: number;
  lateDeductionDays: number;
  /** attendancePayableDays − late cut − free-training days, floored at 0. */
  effectivePayableDays: number;
  gross: number;
  /** Human trail for the payslip "how we got here" line. */
  notes: string[];
}

/**
 * Proration v2. Pure. Returns the gross earned for the month plus the full
 * day-accounting trail (pre-join, free-training, late cut) for the payslip.
 */
export function prorateV2(input: ProrationV2Input): ProrationV2Result {
  const { first, last, days } = monthBounds(input.month);
  const divisor = input.divisor > 0 ? input.divisor : 31; // "divide by 31 if in doubt"
  const perDay = round2(input.monthlyCtc / divisor);
  const freeTraining = Math.max(0, input.freeTrainingDays ?? 0);
  const notes: string[] = [];

  // ── Join-date window ──
  let preJoinDays = 0;
  let paidFrom = first; // earn from the 1st unless a later join/training pushes it
  const join = input.joinDate ? utcNoon(input.joinDate) : null;
  if (join && join > first) {
    // Days in this month before joining never earn.
    preJoinDays = inclusiveDays(first, addDays(join, -1));
    paidFrom = join;
    notes.push(`Joined ${input.joinDate}; ${preJoinDays} pre-join day(s) excluded`);
  }

  // ── Free-training window (present but unpaid) ──
  // Window starts at the join date (or the month start for an existing joiner
  // whose training straddles into this month is out of scope — training is a
  // joiner concept, so we anchor it to the join date only).
  let freeTrainingUnpaidDays = 0;
  if (freeTraining > 0 && join) {
    const trainStart = join;
    const trainEndExclusive = addDays(join, freeTraining); // paid FROM this day
    // Overlap of [trainStart, trainEndExclusive) with the month.
    const ovStart = trainStart > first ? trainStart : first;
    const ovEndInclusive = addDays(trainEndExclusive, -1); // last unpaid day
    const ovEnd = ovEndInclusive < last ? ovEndInclusive : last;
    freeTrainingUnpaidDays = inclusiveDays(ovStart, ovEnd);
    if (freeTrainingUnpaidDays > 0) {
      paidFrom = trainEndExclusive > paidFrom ? trainEndExclusive : paidFrom;
      notes.push(
        `Free training ${freeTraining}d: ${freeTrainingUnpaidDays} present-but-unpaid day(s); paid from ${paidFrom.toISOString().slice(0, 10)}`,
      );
    }
  }

  const lateMarks = Math.max(0, input.lateMarksInMonth ?? 0);
  const lateDeductionDays = Math.floor(lateMarks / 3) * 0.5;
  if (lateDeductionDays > 0) notes.push(`${lateMarks} late marks → ${lateDeductionDays}-day cut`);

  const effectivePayableDays = Math.max(
    0,
    round2(input.attendancePayableDays - lateDeductionDays - freeTrainingUnpaidDays),
  );
  const gross = round2(perDay * effectivePayableDays);

  const paidFromDate =
    paidFrom > first ? paidFrom.toISOString().slice(0, 10) : null;

  return {
    daysInMonth: days,
    divisor,
    perDay,
    paidFromDate,
    freeTrainingUnpaidDays,
    preJoinDays,
    lateDeductionDays,
    effectivePayableDays,
    gross,
    notes,
  };
}

// ── Advance-salary schedule ────────────────────────────────────────────────
// Spec: "Advance salary entry supported; next-6-months pattern '3, 4 and
// repeat'." salary_config.joinerLeaveAccrual defaults to [3,4,3,4,3,4]. This
// helper expands that pattern into a concrete per-month plan starting at a
// given month, so an accountant can pre-load a joiner's 6-month advance/accrual
// entries in one click. PURE — the caller persists the entries (salary_advances
// already exists) and subtracts them in the net calc.

/** Add N months to a YYYY-MM key. */
function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const idx = (y * 12 + (m - 1)) + n;
  const ny = Math.floor(idx / 12);
  const nm = (idx % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

export interface AdvanceScheduleRow {
  month: string; // YYYY-MM
  /** Day-quota for that month per the repeating pattern (e.g. 3 then 4…). */
  days: number;
  /** ₹ value of that quota at the person's per-day rate (0 if perDay omitted). */
  amount: number;
}

/**
 * Expand the "3, 4 and repeat" advance/accrual pattern over the next
 * `pattern.length` months from `startMonth`. `perDay` (optional) converts the
 * day-quota into a rupee advance amount.
 */
export function advanceSchedule(
  startMonth: string,
  pattern: number[],
  perDay = 0,
): AdvanceScheduleRow[] {
  const src = pattern.length > 0 ? pattern : [3, 4, 3, 4, 3, 4];
  return src.map((days, i) => ({
    month: addMonths(startMonth, i),
    days,
    amount: round2(perDay * days),
  }));
}
