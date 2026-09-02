"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { attendanceDisciplineNotes } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/current";
import { rateLimitOrError } from "@/lib/rate-limit";

type Result = { ok: true } | { ok: false; error: string };

/**
 * Save the admin notes / reasons for one employee's attendance discipline in a
 * given month (the read-only analytics page). ADMIN only. Never affects pay.
 */
export async function setDisciplineNote(input: {
  employeeId: string;
  month: string;
  note: string;
}): Promise<Result> {
  const me = await requireAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = z
    .object({
      employeeId: z.string().uuid(),
      month: z.string().regex(/^\d{4}-\d{2}$/),
      note: z.string().max(2000),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input." };

  const note = parsed.data.note.trim() || null;
  try {
    await db
      .insert(attendanceDisciplineNotes)
      .values({ employeeId: parsed.data.employeeId, month: parsed.data.month, note, updatedById: me.id })
      .onConflictDoUpdate({
        target: [attendanceDisciplineNotes.employeeId, attendanceDisciplineNotes.month],
        set: { note, updatedById: me.id, updatedAt: new Date() },
      });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Load the saved discipline note for an employee + month ("" when none). */
export async function getDisciplineNote(employeeId: string, month: string): Promise<string> {
  const [row] = await db
    .select({ note: attendanceDisciplineNotes.note })
    .from(attendanceDisciplineNotes)
    .where(and(eq(attendanceDisciplineNotes.employeeId, employeeId), eq(attendanceDisciplineNotes.month, month)))
    .limit(1);
  return row?.note ?? "";
}
