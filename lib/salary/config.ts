import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { salaryConfig } from "@/db/schema";

// WS-5 Salary core — typed reader over the salary_config singleton (migration
// 0109). Fail-OPEN to the same defaults the DDL seeds, so a missing row / a DB
// hiccup never blocks a payroll screen and never silently changes a number
// (the defaults ARE the seeded values).
//
// CONFIG-GAP NOTE (surfaced to callers via `gaps`): the current salary_config
// has a SINGLE `default_pt` and NO per-entity Professional-Tax column. The spec
// (WS-5 "entity-wise total Salary Payable after PT") implies PT can differ by
// entity/state. Until a per-entity PT table exists we apply `defaultPt` to
// every entity and record "pt-per-entity" in `gaps`. See INTEGRATION NOTE.

export type DivisorPolicy = "actual" | "fixed31" | "fixed30";

export interface SalaryConfigResolved {
  /** 'actual' → divide by the month's real day-count; 'fixed31'/'fixed30' →
   *  always divide by 31 / 30 ("divide by 31 if in doubt"). */
  divisorPolicy: DivisorPolicy;
  /** Divisor used when divisorPolicy === 'fixed*' (defaults 31). */
  fixedDivisor: number;
  /** Unpaid free-training window in days (7 or 15). Person is PRESENT during it
   *  but salary is payable only from day (freeTrainingDays + 1). */
  freeTrainingDays: number;
  /** Flat Professional Tax ₹/month applied to a non-exempt person. */
  defaultPt: number;
  /** Salary date — always the 10th unless an admin changes it. */
  salaryDayOfMonth: number;
  /** New-joiner leave accrual per month for the first 6 months. Spec's advance-
   *  salary "3, 4 and repeat" pattern lives here too (see proration.ts). */
  joinerLeaveAccrual: number[];
  /** Non-empty when a config key the spec needs is absent — callers surface it
   *  in the UI instead of silently hardcoding. */
  gaps: string[];
}

const DEFAULTS: Omit<SalaryConfigResolved, "gaps"> = {
  divisorPolicy: "actual",
  fixedDivisor: 31,
  freeTrainingDays: 7,
  defaultPt: 200,
  salaryDayOfMonth: 10,
  joinerLeaveAccrual: [3, 4, 3, 4, 3, 4],
};

function coerceDivisor(v: string | null | undefined): DivisorPolicy {
  return v === "fixed31" || v === "fixed30" || v === "actual" ? v : DEFAULTS.divisorPolicy;
}

function coerceAccrual(v: unknown): number[] {
  if (Array.isArray(v) && v.every((n) => typeof n === "number")) return v as number[];
  return DEFAULTS.joinerLeaveAccrual;
}

/** Resolve the salary_config singleton. Never throws — falls back to seeded
 *  defaults and records config gaps. */
export async function getSalaryConfig(): Promise<SalaryConfigResolved> {
  const gaps: string[] = [];
  try {
    const [row] = await db
      .select()
      .from(salaryConfig)
      .where(eq(salaryConfig.id, "default"))
      .limit(1);

    if (!row) {
      gaps.push("salary_config row 'default' missing — using seeded defaults");
      return { ...DEFAULTS, gaps };
    }

    // The schema has no per-entity PT column; flag it so the UI can say so.
    gaps.push("pt-per-entity: salary_config.default_pt is a single flat value; no per-entity/state PT slab exists yet");

    return {
      divisorPolicy: coerceDivisor(row.divisorPolicy),
      fixedDivisor: row.fixedDivisor ?? DEFAULTS.fixedDivisor,
      freeTrainingDays: row.freeTrainingDays ?? DEFAULTS.freeTrainingDays,
      defaultPt: row.defaultPt == null ? DEFAULTS.defaultPt : Number(row.defaultPt),
      salaryDayOfMonth: row.salaryDayOfMonth ?? DEFAULTS.salaryDayOfMonth,
      joinerLeaveAccrual: coerceAccrual(row.joinerLeaveAccrual),
      gaps,
    };
  } catch (err: unknown) {
    gaps.push(
      `salary_config read failed (${err instanceof Error ? err.message : String(err)}) — using defaults`,
    );
    return { ...DEFAULTS, gaps };
  }
}

/** The divisor (denominator of per-day pay) for a month, per the config policy.
 *  'actual' → real days in month; 'fixed31'/'fixed30' → the fixed divisor.
 *  Pure — no DB. */
export function resolveDivisor(
  cfg: Pick<SalaryConfigResolved, "divisorPolicy" | "fixedDivisor">,
  daysInMonth: number,
): number {
  if (cfg.divisorPolicy === "fixed31") return 31;
  if (cfg.divisorPolicy === "fixed30") return 30;
  // 'actual' — but guard a nonsense 0 with the "divide by 31 if in doubt" rule.
  return daysInMonth > 0 ? daysInMonth : 31;
}
