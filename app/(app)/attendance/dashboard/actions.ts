"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { compOffCredits, employeeEvents, employees } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/current";
import { rateLimitOrError } from "@/lib/rate-limit";
import {
  getEmployeeMonthStatus,
  type EmployeeMonthStatus,
} from "@/lib/queries/attendance-status";
import { hasInPunchOn, listCompOff, type CompOffRow } from "@/lib/queries/comp-off";
import { listHolidayDateSet } from "@/lib/queries/holidays";
import {
  ConvertToCompOff,
  RedeemCompOff,
  DeleteCompOff,
} from "@/lib/validators/comp-off";
import { localDateString } from "@/lib/format";

type ActionResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

/** Default reporting timezone for the admin dashboard. The per-employee query
 *  reads each employee's own tz internally; this is only used to derive the
 *  caller's "today" for the live-row grading. */
const DEFAULT_TZ = "Asia/Kolkata";

const PATH = "/attendance/dashboard";

/**
 * Fetch one employee's daily month status for the drill-down dialog
 * (Task A6). Admin-only. `refTodayISO` is computed server-side in the default
 * reporting tz so the current-day row uses the live clock.
 */
export async function fetchEmployeeMonthDetail(
  employeeId: string,
  year: number,
  month: number,
): Promise<{ ok: boolean; error?: string; data?: EmployeeMonthStatus }> {
  await requireAdmin();
  if (
    !Number.isInteger(year) ||
    year < 2000 ||
    year > 2100 ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12
  ) {
    return { ok: false, error: "Invalid month." };
  }
  try {
    const refTodayISO = localDateString(DEFAULT_TZ);
    const data = await getEmployeeMonthStatus(employeeId, year, month, refTodayISO);
    return { ok: true, data };
  } catch (err) {
    console.error("[fetchEmployeeMonthDetail] failed", err);
    return { ok: false, error: "Could not load attendance detail." };
  }
}

/**
 * List an employee's comp-off credits (open + redeemed) for the dashboard
 * dialog's Redeem affordance. Admin-only.
 */
export async function fetchCompOff(
  employeeId: string,
): Promise<{ ok: boolean; error?: string; data?: CompOffRow[] }> {
  await requireAdmin();
  try {
    const data = await listCompOff(employeeId);
    return { ok: true, data };
  } catch (err) {
    console.error("[fetchCompOff] failed", err);
    return { ok: false, error: "Could not load comp-off credits." };
  }
}

// ── Comp-off (Task B6) ──────────────────────────────────────────────────────
//
// Comp-off semantics: working a holiday or weekly-off defaults to HP (extra
// pay, 2×). It is NOT auto-credited. Comp-off is an EXPLICIT admin election
// that REPLACES that day's extra pay with a redeemable day:
//   convert → suppresses HP on `earnedDate` (reverts to H / W/O via the query
//             layer) and creates an `open` credit
//   redeem  → stamps `redeemedDate` + status `redeemed`; that weekday grades CO
//   delete  → removes the credit, reverting both effects
// All three are admin-only, rate-limited, audited (employee_events) and
// revalidate the dashboard.

/**
 * Convert a worked holiday / weekly-off into a redeemable comp-off credit.
 *
 * Eligibility check (light): the `earnedDate` must be a HOLIDAY or the
 * employee's WEEKLY-OFF *and* carry an in-punch. The holiday/WO test uses the
 * holiday set for the date's year + `employees.weeklyOff`; the worked test uses
 * `hasInPunchOn`. If the day is neither holiday nor WO, or has no in-punch, the
 * conversion is refused — the admin shouldn't be able to mint a credit from an
 * ordinary working day. (We deliberately keep this light: we don't re-grade the
 * full day, only confirm the holiday/WO + worked preconditions.)
 */
export async function convertToCompOff(input: {
  employeeId: string;
  earnedDate: string;
}): Promise<ActionResult<{ id: string }>> {
  const me = await requireAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = ConvertToCompOff.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { employeeId, earnedDate } = parsed.data;

  const emp = await db.query.employees.findFirst({
    where: eq(employees.id, employeeId),
    columns: { id: true, weeklyOff: true },
  });
  if (!emp) return { ok: false, error: "Employee not found." };

  // Holiday/WO eligibility. weekdayOfDate from a pure calendar day (UTC).
  const year = Number(earnedDate.slice(0, 4));
  const holidaySet = await listHolidayDateSet(year);
  const weekday = new Date(`${earnedDate}T00:00:00Z`).getUTCDay();
  const isHoliday = holidaySet.has(earnedDate);
  const isWeeklyOff = weekday === emp.weeklyOff;
  if (!isHoliday && !isWeeklyOff) {
    return {
      ok: false,
      error: "Comp-off can only be earned on a holiday or weekly-off.",
    };
  }
  if (!(await hasInPunchOn(employeeId, earnedDate))) {
    return {
      ok: false,
      error: "No check-in on that day — nothing to convert to comp-off.",
    };
  }

  // Guard against a duplicate conversion of the same earnedDate.
  const dupe = await db.query.compOffCredits.findFirst({
    where: and(
      eq(compOffCredits.employeeId, employeeId),
      eq(compOffCredits.earnedDate, earnedDate),
    ),
  });
  if (dupe) {
    return { ok: false, error: "That day is already converted to comp-off." };
  }

  let inserted;
  try {
    [inserted] = await db
      .insert(compOffCredits)
      .values({
        employeeId,
        earnedDate,
        status: "open",
        createdById: me.id,
      })
      .returning({ id: compOffCredits.id });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }
  if (!inserted) return { ok: false, error: "DB: insert returned no row" };

  await db.insert(employeeEvents).values({
    employeeId,
    actorId: me.id,
    eventType: "comp_off_converted",
    toValue: { earnedDate, status: "open" },
  });

  revalidatePath(PATH);
  return { ok: true, id: inserted.id };
}

/** Redeem an open comp-off credit onto a calendar date (graded CO). */
export async function redeemCompOff(input: {
  creditId: string;
  redeemedDate: string;
}): Promise<ActionResult> {
  const me = await requireAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = RedeemCompOff.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { creditId, redeemedDate } = parsed.data;

  const existing = await db.query.compOffCredits.findFirst({
    where: eq(compOffCredits.id, creditId),
  });
  if (!existing) return { ok: false, error: "Comp-off credit not found." };
  if (existing.status === "redeemed") {
    return { ok: false, error: "That credit is already redeemed." };
  }

  try {
    await db
      .update(compOffCredits)
      .set({ redeemedDate, status: "redeemed" })
      .where(eq(compOffCredits.id, creditId));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }

  await db.insert(employeeEvents).values({
    employeeId: existing.employeeId,
    actorId: me.id,
    eventType: "comp_off_redeemed",
    fromValue: { status: existing.status, earnedDate: existing.earnedDate },
    toValue: { status: "redeemed", redeemedDate },
  });

  revalidatePath(PATH);
  return { ok: true };
}

/** Delete a comp-off credit, reverting its effect. */
export async function deleteCompOff(input: {
  creditId: string;
}): Promise<ActionResult> {
  const me = await requireAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = DeleteCompOff.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { creditId } = parsed.data;

  const existing = await db.query.compOffCredits.findFirst({
    where: eq(compOffCredits.id, creditId),
  });
  if (!existing) return { ok: false, error: "Comp-off credit not found." };

  try {
    await db.delete(compOffCredits).where(eq(compOffCredits.id, creditId));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }

  await db.insert(employeeEvents).values({
    employeeId: existing.employeeId,
    actorId: me.id,
    eventType: "comp_off_deleted",
    fromValue: {
      earnedDate: existing.earnedDate,
      redeemedDate: existing.redeemedDate,
      status: existing.status,
    },
  });

  revalidatePath(PATH);
  return { ok: true };
}
