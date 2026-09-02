"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { holidays, employeeEvents } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/current";
import { rateLimitOrError } from "@/lib/rate-limit";

type ActionResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

const PATH = "/admin/holidays";

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
  const me = await requireAdmin();
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

  await db.insert(employeeEvents).values({
    employeeId: me.id,
    actorId: me.id,
    eventType: "holiday_added",
    toValue: { holidayDate: parsed.data.holidayDate, label: parsed.data.label },
  });

  revalidatePath(PATH);
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
  const me = await requireAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = UpdateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const existing = await db
    .select({ id: holidays.id })
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

  await db.insert(employeeEvents).values({
    employeeId: me.id,
    actorId: me.id,
    eventType: "holiday_updated",
    toValue: { id: parsed.data.id, ...patch },
  });

  revalidatePath(PATH);
  return { ok: true };
}

const RemoveSchema = z.object({ id: z.string().uuid() }).strict();

/** Hard-delete a holiday (admin). Holidays have no FK dependents, so a real
 *  delete is safe; deactivation (updateHoliday) is the soft alternative. */
export async function removeHoliday(input: {
  id: string;
}): Promise<ActionResult> {
  const me = await requireAdmin();
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

  await db.insert(employeeEvents).values({
    employeeId: me.id,
    actorId: me.id,
    eventType: "holiday_removed",
    fromValue: { holidayDate: existing[0].holidayDate, label: existing[0].label },
  });

  revalidatePath(PATH);
  return { ok: true };
}
