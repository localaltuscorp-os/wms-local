"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { holidays, employeeEvents } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { canManageHolidays } from "@/lib/hr/holiday-admins";
import { rateLimitOrError } from "@/lib/rate-limit";
import { refreshMonthAfterCalendarChange } from "@/lib/salary/refresh-run";

type ActionResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

const PATH = "/admin/holidays";

/**
 * Every surface a holiday change moves.
 *
 * A holiday is not a note on a calendar here: the grader marks the day off
 * instead of expecting a punch, which removes it from the month's TARGET HOURS
 * — and the target hours are the denominator of the hourly rate every payslip
 * is built from. So adding, retiring or removing one changes attendance AND
 * pay, and both have to be invalidated or the app keeps serving figures from
 * the calendar as it was a moment ago.
 */
const AFFECTED_PATHS = [
  PATH,
  "/hr/holidays",
  "/holidays",
  "/attendance",
  "/attendance/dashboard",
  "/my-salary",
  "/salary",
];

function revalidateHolidaySurfaces(): void {
  for (const p of AFFECTED_PATHS) revalidatePath(p);
}

/**
 * Reprice the month the holiday falls in, for EVERYONE (spec §11).
 *
 * Revalidating a path only clears a render cache — it does not rewrite the
 * stored `salary_runs` rows the payslip and the Accounts module read. Declaring
 * a holiday changes what every employee is owed for that month (the day becomes
 * paid without being worked, and leaves the hour target), so the runs have to be
 * recomputed, not merely re-rendered.
 *
 * The month is the HOLIDAY'S, not today's: retiring a holiday in October must
 * reprice August if that is where the date sits. Closed months are recalculable
 * (lib/salary/refresh-run.ts), so naming the right month is all it takes.
 *
 * Fire-and-forget and fully swallowed — the calendar edit is already committed
 * and must not fail because payroll was momentarily unreachable.
 */
async function repriceHolidayMonth(holidayDate: string): Promise<void> {
  await refreshMonthAfterCalendarChange(holidayDate.slice(0, 7));
}

const DateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");
const LabelSchema = z
  .string()
  .trim()
  .min(1, "Label is required")
  .max(120, "Label is too long");

const AddSchema = z
  .object({ holidayDate: DateSchema, label: LabelSchema })
  .strict();

/** Add a holiday (admin). Duplicate dates surface a friendly error. */
export async function addHoliday(input: {
  holidayDate: string;
  label: string;
}): Promise<ActionResult<{ id: string }>> {
  const me = await requireUser();
  // NARROWED from requireAdmin() - the holiday calendar drives attendance for
  // everyone, so it is held by two named people. See lib/hr/holiday-admins.ts.
  if (!canManageHolidays(me.email)) {
    return { ok: false, error: "Only Ruchita and Rutvisha can change the holiday calendar." };
  }
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = AddSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  // Friendly dup check up front so the unique constraint never surfaces raw.
  const existing = await db
    .select({ id: holidays.id })
    .from(holidays)
    .where(eq(holidays.holidayDate, parsed.data.holidayDate))
    .limit(1);
  if (existing[0]) {
    return { ok: false, error: "A holiday already exists on this date." };
  }

  let inserted;
  try {
    [inserted] = await db
      .insert(holidays)
      .values({
        holidayDate: parsed.data.holidayDate,
        label: parsed.data.label,
        createdById: me.id,
      })
      .returning({ id: holidays.id });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/duplicate|unique/i.test(msg)) {
      return { ok: false, error: "A holiday already exists on this date." };
    }
    return { ok: false, error: `DB: ${msg}` };
  }
  if (!inserted) return { ok: false, error: "DB: insert returned no row" };

  try {
    await db.insert(employeeEvents).values({
      employeeId: me.id,
      actorId: me.id,
      eventType: "holiday_added",
      toValue: { holidayDate: parsed.data.holidayDate, label: parsed.data.label },
    });
  } catch (err) {
    // Non-fatal: the holiday is already saved; a failed audit write must not
    // surface as "We hit a snag." after a successful mutation.
    console.error("[addHoliday] audit write failed", err);
  }

  await repriceHolidayMonth(parsed.data.holidayDate);
  revalidateHolidaySurfaces();
  return { ok: true, id: inserted.id };
}

const UpdateSchema = z
  .object({
    id: z.string().uuid(),
    label: LabelSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((v) => v.label !== undefined || v.isActive !== undefined, {
    message: "No changes to save.",
  });

/** Rename or activate/deactivate a holiday (admin). */
export async function updateHoliday(input: {
  id: string;
  label?: string;
  isActive?: boolean;
}): Promise<ActionResult> {
  const me = await requireUser();
  // NARROWED from requireAdmin() - the holiday calendar drives attendance for
  // everyone, so it is held by two named people. See lib/hr/holiday-admins.ts.
  if (!canManageHolidays(me.email)) {
    return { ok: false, error: "Only Ruchita and Rutvisha can change the holiday calendar." };
  }
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = UpdateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  // `holidayDate` is selected because the salary reprice below needs the month
  // the holiday sits in — which is not necessarily the current one.
  const existing = await db
    .select({ id: holidays.id, holidayDate: holidays.holidayDate })
    .from(holidays)
    .where(eq(holidays.id, parsed.data.id))
    .limit(1);
  if (!existing[0]) return { ok: false, error: "Holiday not found" };

  const patch: Record<string, unknown> = {};
  if (parsed.data.label !== undefined) patch.label = parsed.data.label;
  if (parsed.data.isActive !== undefined) patch.isActive = parsed.data.isActive;

  try {
    await db.update(holidays).set(patch).where(eq(holidays.id, parsed.data.id));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }

  try {
    await db.insert(employeeEvents).values({
      employeeId: me.id,
      actorId: me.id,
      eventType: "holiday_updated",
      toValue: { id: parsed.data.id, ...patch },
    });
  } catch (err) {
    console.error("[updateHoliday] audit write failed", err);
  }

  await repriceHolidayMonth(String(existing[0].holidayDate));
  revalidateHolidaySurfaces();
  return { ok: true };
}

const RemoveSchema = z.object({ id: z.string().uuid() }).strict();

/** Hard-delete a holiday (admin). Holidays have no FK dependents, so a real
 *  delete is safe; deactivation (updateHoliday) is the soft alternative. */
export async function removeHoliday(input: {
  id: string;
}): Promise<ActionResult> {
  const me = await requireUser();
  // NARROWED from requireAdmin() - the holiday calendar drives attendance for
  // everyone, so it is held by two named people. See lib/hr/holiday-admins.ts.
  if (!canManageHolidays(me.email)) {
    return { ok: false, error: "Only Ruchita and Rutvisha can change the holiday calendar." };
  }
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = RemoveSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const existing = await db
    .select({ id: holidays.id, holidayDate: holidays.holidayDate, label: holidays.label })
    .from(holidays)
    .where(eq(holidays.id, parsed.data.id))
    .limit(1);
  if (!existing[0]) return { ok: false, error: "Holiday not found" };

  try {
    await db.delete(holidays).where(eq(holidays.id, parsed.data.id));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }

  try {
    await db.insert(employeeEvents).values({
      employeeId: me.id,
      actorId: me.id,
      eventType: "holiday_removed",
      fromValue: { holidayDate: existing[0].holidayDate, label: existing[0].label },
    });
  } catch (err) {
    console.error("[removeHoliday] audit write failed", err);
  }

  await repriceHolidayMonth(String(existing[0].holidayDate));
  revalidateHolidaySurfaces();
  return { ok: true };
}
