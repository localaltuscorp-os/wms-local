"use server";

import { revalidatePath } from "next/cache";
import { and, eq, gte, lte } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { holidays, employeeEvents } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { canManageHolidays } from "@/lib/hr/holiday-admins";
import { rateLimitOrError } from "@/lib/rate-limit";

/**
 * AD-HOC HOLIDAYS, from the HR Holiday List.
 *
 * ── WHY THIS WRITES TO THE ATTENDANCE TABLE ────────────────────────────────
 * There is no separate "HR holiday" store and there must not be one. The
 * `holidays` table is the calendar `lib/queries/attendance-status.ts` reads:
 * line ~419 does `isHoliday = holidaySet.has(ymd)` for every day it grades. So
 * a row inserted here IS the attendance holiday - it shows on that month's
 * attendance record automatically, with no sync step to fall out of date.
 *
 * The 2026-2028 lists in lib/hr/holidays-2026.ts are a different thing: a fixed,
 * published calendar held in code. Ad-hoc days are the exceptions declared
 * during the year, and only those are stored.
 *
 * ── WHO ────────────────────────────────────────────────────────────────────
 * Ruchita and Rutvisha only - see lib/hr/holiday-admins.ts. Every action here
 * re-checks; the UI hiding the form is a convenience, never the control.
 */

type ActionResult<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

const REFUSAL = "Only Ruchita and Rutvisha can change the holiday calendar.";

/** Paths whose rendered output changes when the calendar does. */
const AFFECTED_PATHS = [
  "/hr/holidays",
  "/attendance",
  "/attendance/dashboard",
  "/admin/holidays",
];

const AddSchema = z
  .object({
    holidayDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date."),
    label: z.string().trim().min(1, "Give the holiday a name.").max(120, "Name is too long."),
  })
  .strict();

/**
 * Declare an ad-hoc holiday. Idempotent-ish: a date that already carries one is
 * refused by name rather than by the unique constraint, so the message is
 * readable.
 */
export async function addAdHocHoliday(input: {
  holidayDate: string;
  label: string;
}): Promise<ActionResult<{ id: string }>> {
  const me = await requireUser();
  if (!canManageHolidays(me.email)) return { ok: false, error: REFUSAL };
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = AddSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const { holidayDate, label } = parsed.data;

  const [clash] = await db
    .select({ id: holidays.id, label: holidays.label })
    .from(holidays)
    .where(eq(holidays.holidayDate, holidayDate))
    .limit(1);
  if (clash) {
    return { ok: false, error: `${holidayDate} is already a holiday (${clash.label}).` };
  }

  let inserted;
  try {
    [inserted] = await db
      .insert(holidays)
      .values({ holidayDate, label, createdById: me.id })
      .returning({ id: holidays.id });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/duplicate|unique/i.test(msg)) {
      return { ok: false, error: "That date is already a holiday." };
    }
    return { ok: false, error: `Could not save the holiday: ${msg}` };
  }
  if (!inserted) return { ok: false, error: "Could not save the holiday." };

  // Audit is best-effort: the holiday is saved, and a failed log must not
  // surface to the user as a failed action. Mirrors the admin action.
  try {
    await db.insert(employeeEvents).values({
      employeeId: me.id,
      actorId: me.id,
      eventType: "holiday_added",
      toValue: { holidayDate, label, source: "hr_adhoc" },
    });
  } catch (err) {
    console.error("[addAdHocHoliday] audit write failed", err);
  }

  for (const p of AFFECTED_PATHS) revalidatePath(p);
  return { ok: true, id: inserted.id };
}

const RemoveSchema = z.object({ id: z.string().uuid() }).strict();

/** Withdraw an ad-hoc holiday. The day reverts to a normal working day. */
export async function removeAdHocHoliday(input: { id: string }): Promise<ActionResult> {
  const me = await requireUser();
  if (!canManageHolidays(me.email)) return { ok: false, error: REFUSAL };
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = RemoveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid holiday." };

  const [row] = await db
    .select({ holidayDate: holidays.holidayDate, label: holidays.label })
    .from(holidays)
    .where(eq(holidays.id, parsed.data.id))
    .limit(1);
  if (!row) return { ok: false, error: "That holiday no longer exists." };

  try {
    await db.delete(holidays).where(eq(holidays.id, parsed.data.id));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Could not remove the holiday: ${msg}` };
  }

  try {
    await db.insert(employeeEvents).values({
      employeeId: me.id,
      actorId: me.id,
      eventType: "holiday_removed",
      toValue: { holidayDate: row.holidayDate, label: row.label, source: "hr_adhoc" },
    });
  } catch (err) {
    console.error("[removeAdHocHoliday] audit write failed", err);
  }

  for (const p of AFFECTED_PATHS) revalidatePath(p);
  return { ok: true };
}

export interface AdHocHolidayRow {
  id: string;
  holidayDate: string;
  label: string;
}

/**
 * Ad-hoc holidays inside a year, oldest first. READ-ONLY and open to every HR
 * viewer: seeing that a day is off is not the same capability as declaring it.
 *
 * Fails soft to `[]` - the published calendar is the important half of the page
 * and must still render if this read hiccups.
 */
export async function listAdHocHolidays(year: number): Promise<AdHocHolidayRow[]> {
  await requireUser();
  try {
    const rows = await db
      .select({ id: holidays.id, holidayDate: holidays.holidayDate, label: holidays.label })
      .from(holidays)
      .where(
        and(
          eq(holidays.isActive, true),
          gte(holidays.holidayDate, `${year}-01-01`),
          lte(holidays.holidayDate, `${year}-12-31`),
        ),
      )
      .orderBy(holidays.holidayDate);
    return rows.map((r) => ({ ...r, holidayDate: String(r.holidayDate) }));
  } catch (err) {
    console.error("[listAdHocHolidays] read failed", err);
    return [];
  }
}
