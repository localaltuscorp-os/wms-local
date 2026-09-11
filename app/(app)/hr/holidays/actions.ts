"use server";

import { revalidatePath } from "next/cache";
import { and, eq, gte, lte } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { holidays, employeeEvents } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { canManageHolidays } from "@/lib/hr/holiday-admins";
import { refreshMonthAfterCalendarChange } from "@/lib/salary/refresh-run";
import { publishedHolidaysForYear } from "@/lib/hr/holidays-2026";
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
  // Declaring or withdrawing a holiday moves the month's TARGET HOURS, and the
  // target hours are the denominator of the hourly rate every payslip is built
  // from (lib/salary/compute.computeScheduleHourlySalary). Pay changes with the
  // calendar, so the pay pages have to be invalidated with it.
  "/my-salary",
  "/salary",
  // The company Holiday List reads the same merged calendar.
  "/holidays",
];

const DateField = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date.");
const LabelField = z
  .string()
  .trim()
  .min(1, "Give the holiday a name.")
  .max(120, "Name is too long.");
/** Optional: an empty field is stored as NULL, not "". One representation of
 *  "no note", so no reader has to treat the two as the same thing. */
const NoteField = z.string().trim().max(500, "Note is too long.").optional();

const AddSchema = z
  .object({ holidayDate: DateField, label: LabelField, note: NoteField })
  .strict();

/**
 * Is `holidayDate` free for a holiday, or already claimed?
 *
 * Extracted because ADD and EDIT need exactly the same answer: an edit that
 * moves a holiday onto another date is the same collision as adding one there,
 * and `holidays.holiday_date` is UNIQUE, so without this the edit would surface
 * a raw Postgres constraint error instead of a sentence.
 *
 * `exceptId` is the row being edited — a holiday must not collide with itself.
 */
async function dateTakenError(
  holidayDate: string,
  exceptId?: string,
): Promise<string | null> {
  // The PUBLISHED calendar is not in this table and feeds attendance too
  // (lib/queries/holidays.listHolidayDateSet), so a date it already covers would
  // otherwise be accepted here and then appear twice on this very page.
  const published = publishedHolidaysForYear(Number(holidayDate.slice(0, 4))).find(
    (h) => h.date === holidayDate,
  );
  if (published) {
    return `${holidayDate} is already on the published calendar (${published.label}).`;
  }

  const [clash] = await db
    .select({ id: holidays.id, label: holidays.label, isActive: holidays.isActive })
    .from(holidays)
    .where(eq(holidays.holidayDate, holidayDate))
    .limit(1);
  if (!clash || clash.id === exceptId) return null;

  // An INACTIVE row is a deliberate "this date is NOT a holiday" (see
  // listHolidayDateSet). Saying "already a holiday" about one would be the
  // opposite of what it means, and would leave the admin with no idea why the
  // date is refused.
  return clash.isActive
    ? `${holidayDate} is already a holiday (${clash.label}).`
    : `${holidayDate} was withdrawn as a holiday (${clash.label}). Re-activate it in the Admin Panel instead of adding it again.`;
}

/**
 * Declare an ad-hoc holiday. Idempotent-ish: a date that already carries one is
 * refused by name rather than by the unique constraint, so the message is
 * readable.
 */
export async function addAdHocHoliday(input: {
  holidayDate: string;
  label: string;
  note?: string;
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
  const note = parsed.data.note?.trim() || null;

  const taken = await dateTakenError(holidayDate);
  if (taken) return { ok: false, error: taken };

  let inserted;
  try {
    [inserted] = await db
      .insert(holidays)
      .values({ holidayDate, label, note, createdById: me.id })
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
      toValue: { holidayDate, label, note, source: "hr_adhoc" },
    });
  } catch (err) {
    console.error("[addAdHocHoliday] audit write failed", err);
  }

  // Recompute the month the holiday lands in, for everyone (spec §11) — a
  // revalidate only clears a render cache, it does not rewrite the stored runs.
  await refreshMonthAfterCalendarChange(holidayDate.slice(0, 7));
  for (const p of AFFECTED_PATHS) revalidatePath(p);
  return { ok: true, id: inserted.id };
}

const EditSchema = z
  .object({
    id: z.string().uuid(),
    holidayDate: DateField,
    label: LabelField,
    note: NoteField,
  })
  .strict();

/**
 * Correct an ad-hoc holiday — its name, its date, or its note.
 *
 * ── WHY THIS EXISTS RATHER THAN "DELETE AND RE-ADD" ────────────────────────
 * That was the only option before, and it is a bad one. Removing a holiday and
 * adding it back reprices the month TWICE (`refreshMonthAfterCalendarChange`
 * runs on each), and it leaves two audit rows — a withdrawal and a declaration
 * — describing what was actually a typo fix. Anyone reading the trail later
 * sees a day that was cancelled and reinstated.
 *
 * ── MOVING A HOLIDAY IS TWO MONTHS' WORTH OF WORK ──────────────────────────
 * Changing the date changes the target hours of the month it LEFT and the month
 * it ARRIVED in, and those need not be the same month. Both are repriced below.
 * Getting this wrong would leave the old month still crediting a holiday that
 * is no longer there — which is a silent overpayment, not a display bug.
 *
 * A no-op save is refused rather than performed: repricing two months and
 * writing an audit row to record that nothing changed is worse than a message.
 */
export async function editAdHocHoliday(input: {
  id: string;
  holidayDate: string;
  label: string;
  note?: string;
}): Promise<ActionResult> {
  const me = await requireUser();
  if (!canManageHolidays(me.email)) return { ok: false, error: REFUSAL };
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = EditSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const { id, holidayDate, label } = parsed.data;
  const note = parsed.data.note?.trim() || null;

  const [current] = await db
    .select({
      holidayDate: holidays.holidayDate,
      label: holidays.label,
      note: holidays.note,
      isActive: holidays.isActive,
    })
    .from(holidays)
    .where(eq(holidays.id, id))
    .limit(1);
  if (!current) return { ok: false, error: "That holiday no longer exists." };

  // A WITHDRAWN row is not an ad-hoc holiday — it is the marker that says a
  // date is NOT a holiday (see listHolidayDateSet). Editing one here would let
  // this panel silently rewrite a suppression it does not present or explain.
  if (!current.isActive) {
    return {
      ok: false,
      error: "That date is a withdrawal, not a holiday. Change it in the Admin Panel.",
    };
  }

  const previousDate = String(current.holidayDate);
  const unchanged =
    previousDate === holidayDate &&
    current.label === label &&
    (current.note ?? null) === note;
  if (unchanged) return { ok: false, error: "No changes to save." };

  if (previousDate !== holidayDate) {
    const taken = await dateTakenError(holidayDate, id);
    if (taken) return { ok: false, error: taken };
  }

  try {
    await db
      .update(holidays)
      .set({ holidayDate, label, note, updatedById: me.id, updatedAt: new Date() })
      .where(eq(holidays.id, id));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/duplicate|unique/i.test(msg)) {
      return { ok: false, error: "That date is already a holiday." };
    }
    return { ok: false, error: `Could not save the holiday: ${msg}` };
  }

  try {
    await db.insert(employeeEvents).values({
      employeeId: me.id,
      actorId: me.id,
      eventType: "holiday_edited",
      fromValue: {
        holidayDate: previousDate,
        label: current.label,
        note: current.note ?? null,
      },
      toValue: { holidayDate, label, note, source: "hr_adhoc" },
    });
  } catch (err) {
    console.error("[editAdHocHoliday] audit write failed", err);
  }

  // BOTH months, and de-duplicated: a rename inside one month must not reprice
  // it twice, and a move across months must reprice both.
  const months = new Set([previousDate.slice(0, 7), holidayDate.slice(0, 7)]);
  for (const month of months) await refreshMonthAfterCalendarChange(month);
  for (const p of AFFECTED_PATHS) revalidatePath(p);
  return { ok: true };
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

  // The day reverts to a normal working day, so the month is repriced for
  // everyone — the month the HOLIDAY was in, which need not be this one.
  await refreshMonthAfterCalendarChange(String(row.holidayDate).slice(0, 7));
  for (const p of AFFECTED_PATHS) revalidatePath(p);
  return { ok: true };
}

export interface AdHocHolidayRow {
  id: string;
  holidayDate: string;
  label: string;
  /** HR's own optional reason. Read back by the panel that writes it; NOT
   *  rendered on the company-facing calendar. */
  note: string | null;
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
      .select({
        id: holidays.id,
        holidayDate: holidays.holidayDate,
        label: holidays.label,
        note: holidays.note,
      })
      .from(holidays)
      .where(
        and(
          eq(holidays.isActive, true),
          gte(holidays.holidayDate, `${year}-01-01`),
          lte(holidays.holidayDate, `${year}-12-31`),
        ),
      )
      .orderBy(holidays.holidayDate);
    return rows.map((r) => ({
      ...r,
      holidayDate: String(r.holidayDate),
      note: r.note ?? null,
    }));
  } catch (err) {
    console.error("[listAdHocHolidays] read failed", err);
    return [];
  }
}
