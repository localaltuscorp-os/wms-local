import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  designations,
  employees,
  payingEntities,
  salaryProfiles,
} from "@/db/schema";

// WS-5 Salary core — the shared CTC-per-person contract.
//
// `getMonthlyCtcByPerson(month)` is the salary pair of
// `getIncentivePaidByPerson(month)` (lib/queries/incentives.ts). Downstream
// (PMS incentive→CTC grade bands, salary entity totals, payslips) ALIASES this
// — it must never re-implement CTC lookup. Same shape: a Map keyed by BOTH the
// employeeId AND the normalised lower-cased name, each pointing at the same
// value, so callers can look up by whichever handle they hold.
//
// MONTH NOTE: CTC today lives on salary_profiles as a single current annualCtc
// (no per-month CTC history table exists). So the `month` argument is accepted
// for signature symmetry + future-proofing; the value returned is the person's
// CURRENT monthly CTC regardless of `month`. When a CTC-history table lands,
// this is the one place to make it month-aware — callers won't change.

/** Normalised key for matching ledger names to employee names (mirrors the
 *  incentives module's nameKey). */
function nameKey(name: string | null | undefined): string {
  return (name ?? "").trim().toLowerCase();
}

function num(v: string | number | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export interface MonthlyCtcRow {
  employeeId: string;
  name: string;
  designationName: string | null;
  payingEntityId: string | null;
  payingEntityName: string | null;
  annualCtc: number;
  monthlyCtc: number;
  ptExempt: boolean;
  tdsMonthly: number;
}

/**
 * Rich per-person CTC rows for a month (active employees with a salary profile).
 * The list form — for the entity-wise breakup screen / totals.
 */
export async function listMonthlyCtc(_month: string): Promise<MonthlyCtcRow[]> {
  const rows = await db
    .select({
      employeeId: employees.id,
      name: employees.name,
      designationName: designations.name,
      payingEntityId: employees.payingEntityId,
      payingEntityName: payingEntities.name,
      annualCtc: salaryProfiles.annualCtc,
      ptExempt: salaryProfiles.ptExempt,
      tdsMonthly: salaryProfiles.tdsMonthly,
    })
    .from(employees)
    .leftJoin(salaryProfiles, eq(salaryProfiles.employeeId, employees.id))
    .leftJoin(designations, eq(employees.designationId, designations.id))
    .leftJoin(payingEntities, eq(employees.payingEntityId, payingEntities.id))
    .where(eq(employees.isActive, true))
    .orderBy(asc(employees.name));

  return rows.map((r) => {
    const annualCtc = num(r.annualCtc);
    return {
      employeeId: r.employeeId,
      name: r.name,
      designationName: r.designationName ?? null,
      payingEntityId: r.payingEntityId ?? null,
      payingEntityName: r.payingEntityName ?? null,
      annualCtc,
      monthlyCtc: Math.round((annualCtc / 12 + Number.EPSILON) * 100) / 100,
      ptExempt: r.ptExempt ?? false,
      tdsMonthly: num(r.tdsMonthly),
    };
  });
}

/**
 * SHARED CONTRACT — CTC per person for a month, as a Map keyed by employeeId AND
 * normalised name (same total under both keys). Pairs with
 * getIncentivePaidByPerson(month). Value = MONTHLY CTC (annualCtc / 12).
 */
export async function getMonthlyCtcByPerson(month: string): Promise<Map<string, number>> {
  const rows = await listMonthlyCtc(month);
  const out = new Map<string, number>();
  for (const r of rows) {
    if (r.monthlyCtc <= 0) continue;
    out.set(r.employeeId, r.monthlyCtc);
    const key = nameKey(r.name);
    if (key) out.set(key, r.monthlyCtc);
  }
  return out;
}
