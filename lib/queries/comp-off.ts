import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { attendanceLogs, compOffCredits } from "@/db/schema";
import type { CompOffStatus } from "@/db/enums";

export interface CompOffRow {
  id: string;
  employeeId: string;
  earnedDate: string;
  redeemedDate: string | null;
  status: CompOffStatus;
  note: string | null;
  createdAt: Date;
}

/**
 * All comp-off credits (open + redeemed) for one employee, oldest-earned first.
 * Drives the admin comp-off list / redeem UI.
 */
export async function listCompOff(employeeId: string): Promise<CompOffRow[]> {
  const rows = await db
    .select({
      id: compOffCredits.id,
      employeeId: compOffCredits.employeeId,
      earnedDate: compOffCredits.earnedDate,
      redeemedDate: compOffCredits.redeemedDate,
      status: compOffCredits.status,
      note: compOffCredits.note,
      createdAt: compOffCredits.createdAt,
    })
    .from(compOffCredits)
    .where(eq(compOffCredits.employeeId, employeeId))
    .orderBy(asc(compOffCredits.earnedDate));

  return rows.map((r) => ({ ...r, status: r.status as CompOffStatus }));
}

export interface CompOffRangeMaps {
  /** Per employee, the set of CONVERTED earnedDates (YYYY-MM-DD). The query
   *  layer treats these days as NON-worked so a converted worked-holiday/WO
   *  reverts from HP to a plain H / W/O (the extra pay is replaced by the
   *  redeemable credit, never double-counted). */
  convertedByEmp: Map<string, Set<string>>;
  /** Per employee, the set of REDEEMED dates (YYYY-MM-DD) — each grades CO. */
  redeemedByEmp: Map<string, Set<string>>;
}

/**
 * Comp-off maps for a set of employees over [start,end] (B7 grid). Batched —
 * ONE query across all employees, then grouped in memory, so the dashboard
 * path stays free of an N+1.
 *
 * - A credit's `earnedDate` lands in `convertedByEmp` when it falls in range
 *   (a credit always represents a conversion election, open or redeemed).
 * - A credit's `redeemedDate` lands in `redeemedByEmp` when set and in range.
 *
 * Note: earned and redeemed dates are usually in different months, so we pull
 * every credit for the employee set and filter both dates against the window
 * in JS rather than trying to express an OR-over-two-columns range predicate.
 */
export async function getCompOffMapForRange(
  employeeIds: string[],
  start: string,
  end: string,
): Promise<CompOffRangeMaps> {
  const convertedByEmp = new Map<string, Set<string>>();
  const redeemedByEmp = new Map<string, Set<string>>();
  if (employeeIds.length === 0) {
    return { convertedByEmp, redeemedByEmp };
  }

  const rows = await db
    .select({
      employeeId: compOffCredits.employeeId,
      earnedDate: compOffCredits.earnedDate,
      redeemedDate: compOffCredits.redeemedDate,
    })
    .from(compOffCredits)
    .where(inArray(compOffCredits.employeeId, employeeIds));

  const addTo = (map: Map<string, Set<string>>, emp: string, date: string) => {
    let s = map.get(emp);
    if (!s) {
      s = new Set<string>();
      map.set(emp, s);
    }
    s.add(date);
  };

  for (const r of rows) {
    if (r.earnedDate >= start && r.earnedDate <= end) {
      addTo(convertedByEmp, r.employeeId, r.earnedDate);
    }
    if (r.redeemedDate && r.redeemedDate >= start && r.redeemedDate <= end) {
      addTo(redeemedByEmp, r.employeeId, r.redeemedDate);
    }
  }

  return { convertedByEmp, redeemedByEmp };
}

/**
 * True if the employee has at least one `in` punch on `date` — a light
 * "did they actually work" check for the convert action. Whether the day is a
 * holiday or the employee's weekly-off is the action's responsibility (it holds
 * the holiday set + the employee's weeklyOff); this only proves the work part.
 */
export async function hasInPunchOn(
  employeeId: string,
  date: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: attendanceLogs.id })
    .from(attendanceLogs)
    .where(
      and(
        eq(attendanceLogs.employeeId, employeeId),
        eq(attendanceLogs.logDate, date),
        eq(attendanceLogs.kind, "in"),
      ),
    )
    .limit(1);
  return rows.length > 0;
}
