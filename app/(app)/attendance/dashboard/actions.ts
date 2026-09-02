"use server";

import { revalidatePath } from "next/cache";
import { and, asc, eq, getTableName, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { dbErrorMessage, logDbError } from "@/lib/db/error";
import type { PgTable } from "drizzle-orm/pg-core";
import {
  attendanceDisciplineNotes,
  attendanceLogs,
  attendanceMonthFreeze,
  attendanceSheetDay,
  attendanceSheetMonth,
  attendanceWeekAck,
  compOffCredits,
  employeeEvents,
  employees,
} from "@/db/schema";
import { requireAdmin, requireSuperAdmin } from "@/lib/auth/current";
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

export interface SheetDayRow {
  day: number;
  statusCode: string;
  date: string | null;
  /** REAL first-in / last-out for that date (IST, "h:mm AM"), or null when the
   *  person didn't punch. The HR sheet itself carries no times. */
  inTime: string | null;
  outTime: string | null;
}

/**
 * Per-day status codes from the synced HR sheet for one person's month, with the
 * REAL punch times overlaid from `attendance_logs` (first-in / last-out per day).
 * `employeeId` drives the punch join; pass null for an unresolved sheet name
 * (then every day shows no time).
 */
export async function fetchSheetEmployeeDays(
  employeeId: string | null,
  employeeName: string,
  year: number,
  month: number,
): Promise<SheetDayRow[]> {
  await requireAdmin();
  const bucket = `${year}-${String(month).padStart(2, "0")}-01`;
  const rows = await db
    .select({
      day: attendanceSheetDay.day,
      statusCode: attendanceSheetDay.statusCode,
      date: attendanceSheetDay.date,
    })
    .from(attendanceSheetDay)
    .where(and(eq(attendanceSheetDay.employeeName, employeeName), eq(attendanceSheetDay.month, bucket)))
    .orderBy(asc(attendanceSheetDay.day));

  // Overlay real punches: earliest `in` and latest `out` per date, in IST.
  const times = new Map<string, { inTime: string | null; outTime: string | null }>();
  if (employeeId) {
    const res = (await db.execute(sql`
      select log_date::text as d,
        to_char((min(logged_at) filter (where kind = 'in'))  at time zone 'Asia/Kolkata', 'FMHH12:MI AM') as in_t,
        to_char((max(logged_at) filter (where kind = 'out')) at time zone 'Asia/Kolkata', 'FMHH12:MI AM') as out_t
      from ${attendanceLogs}
      where employee_id = ${employeeId}
        and date_trunc('month', log_date) = ${bucket}::date
      group by log_date
    `)) as unknown as { rows?: Array<{ d: string; in_t: string | null; out_t: string | null }> };
    const list = res.rows ?? (res as unknown as Array<{ d: string; in_t: string | null; out_t: string | null }>);
    for (const p of list) times.set(p.d, { inTime: p.in_t ?? null, outTime: p.out_t ?? null });
  }

  return rows.map((r) => {
    const t = r.date ? times.get(r.date as string) : undefined;
    return {
      day: r.day,
      statusCode: r.statusCode,
      date: r.date as string | null,
      inTime: t?.inTime ?? null,
      outTime: t?.outTime ?? null,
    };
  });
}

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

/**
 * AIRSTRIKE — wipe every attendance record, for every employee, for all time.
 *
 * The manual equivalent is opening each person's drawer and deleting their
 * punches one by one; this is that, for the whole company at once, and it is
 * IRREVERSIBLE. Reserved for super-admins (`requireSuperAdmin`), and the button
 * that calls it stays hidden until the operator presses `*` on the report.
 *
 * What it clears — everything the month report reads as a "record":
 *   attendance_logs             the punches themselves (app era, Aug 2026 →)
 *   attendance_sheet_day/_month the imported HR-sheet era (→ Jul 2026), which
 *                               otherwise keeps rendering full counts
 *   attendance_week_ack         weekly loss acknowledgements
 *   attendance_discipline_notes per-month admin notes hung off those records
 *   attendance_month_freeze     month locks, which would otherwise refuse the
 *                               re-entry this reset exists to allow
 *
 * What it deliberately does NOT touch — separate modules with their own
 * approval trails, not attendance records: leave requests, remote-work
 * requests, comp-off credits, and employees themselves.
 *
 * One transaction: it all goes, or none of it does.
 */
export async function wipeAllAttendance(): Promise<
  ActionResult<{ deleted: Record<string, number>; skipped: string[] }>
> {
  const me = await requireSuperAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const deleted: Record<string, number> = {};
  const skipped: string[] = [];
  try {
    await db.transaction(async (tx) => {
      const wipe = async (label: string, table: PgTable) => {
        const name = getTableName(table);

        // ASK BEFORE DELETING.
        //
        // In Postgres a failed statement poisons the WHOLE transaction: one
        // table this database has never heard of and the other five deletes
        // roll back with it. So a schema that is one migration behind does not
        // cost you that table — it costs you the entire reset, with no way to
        // clear anything at all.
        //
        // That is not hypothetical. `attendance_week_ack` (migration 0189,
        // 2026-08-21) was never applied to production, and on 2026-08-30 it
        // made this whole function impossible to run:
        //
        //     relation "attendance_week_ack" does not exist [42P01]
        //
        // A table that does not exist holds no records, so stepping over it
        // serves this function's contract — "no attendance record survives" —
        // exactly as well as deleting from it would have.
        const probe = (await tx.execute(
          sql`select to_regclass(${`public.${name}`}) is not null as present`,
        )) as unknown as Array<{ present: boolean }>;

        if (!probe[0]?.present) {
          // NEVER SILENTLY. A missing table means this database is behind the
          // migrations in this tree, and every OTHER reader of these tables
          // fails open (see `hasAcknowledged`), so nothing else will ever
          // mention it. This return value is the only place it surfaces.
          skipped.push(name);
          deleted[label] = 0;
          return;
        }

        // postgres.js hands back a RowList carrying `.count`; keep the pg-style
        // `rowCount` fallback so the tally survives a driver swap.
        const res = (await tx.delete(table)) as unknown as {
          count?: number;
          rowCount?: number;
        };
        deleted[label] = res?.count ?? res?.rowCount ?? 0;
      };
      await wipe("punches", attendanceLogs);
      await wipe("sheetDays", attendanceSheetDay);
      await wipe("sheetMonths", attendanceSheetMonth);
      await wipe("weekAcks", attendanceWeekAck);
      await wipe("disciplineNotes", attendanceDisciplineNotes);
      await wipe("monthFreezes", attendanceMonthFreeze);
    });
  } catch (err: unknown) {
    // `dbErrorMessage` and not `err.message`: drizzle's wrapper message is only
    // ever "Failed query: <sql> params:", which names the table the wipe died
    // on and hides why. The reason lives on `.cause`. See lib/db/error.ts.
    logDbError("attendance/dashboard wipeAllAttendance", err);
    return { ok: false, error: `DB: ${dbErrorMessage(err)}` };
  }

  // Audit against the actor's own record — the wipe is company-wide, so there
  // is no single subject. Best-effort: a failed audit never undoes the wipe.
  try {
    await db.insert(employeeEvents).values({
      employeeId: me.id,
      actorId: me.id,
      eventType: "attendance_wiped_all",
      fromValue: { deleted, skipped },
      note:
        `Super-admin wiped ALL attendance records: ${JSON.stringify(deleted)}` +
        (skipped.length ? ` · absent from this database: ${skipped.join(", ")}` : ""),
    });
  } catch (err) {
    console.error("[attendance/dashboard] wipe audit write failed", err);
  }

  revalidatePath(PATH);
  revalidatePath("/attendance");
  revalidatePath("/attendance/insights");
  return { ok: true, deleted, skipped };
}
