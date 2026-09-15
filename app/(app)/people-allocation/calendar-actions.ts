"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { employees, paPeople } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { rateLimitOrError } from "@/lib/rate-limit";
import { canEditPerson } from "@/lib/hh/access";
import { mondayOf } from "@/lib/hh/calendar";
import { loadHhCalendarWeek, type HhCalendarWeek } from "@/lib/queries/hh-calendar";

type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

const YMD = /^\d{4}-\d{2}-\d{2}$/u;

/** One week of the Handholding calendar's DCC — for the ‹ › week arrows. */
export async function getHhCalendarWeek(input: unknown): Promise<Result<{ week: HhCalendarWeek }>> {
  const me = await requireUser();
  const parsed = z.object({ weekStart: z.string().regex(YMD) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid week." };
  try {
    return { ok: true, week: await loadHhCalendarWeek(me, mondayOf(parsed.data.weekStart)) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Couldn't load that week." };
  }
}

/**
 * Link a Handholding name to the employee whose DCC it should show — or unlink
 * it. Admin and Ruchita, the same people who edit the roster.
 */
export async function linkHhPersonEmployee(input: unknown): Promise<Result> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  if (!canEditPerson(me)) return { ok: false, error: "Only Admin or Ruchita can link a person to an employee." };
  const parsed = z
    .object({ personId: z.string().uuid(), employeeId: z.string().uuid().nullable() })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input." };
  const { personId, employeeId } = parsed.data;
  try {
    if (employeeId) {
      const [emp] = await db.select({ id: employees.id }).from(employees).where(eq(employees.id, employeeId)).limit(1);
      if (!emp) return { ok: false, error: "That employee no longer exists." };
    }
    const updated = await db
      .update(paPeople)
      .set({ employeeId, updatedAt: new Date() })
      .where(eq(paPeople.id, personId))
      .returning({ id: paPeople.id });
    if (updated.length === 0) return { ok: false, error: "That person is no longer on the roster." };
    revalidatePath("/people-allocation");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Couldn't save the link." };
  }
}
