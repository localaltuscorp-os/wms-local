import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { attendanceMonthFreeze } from "@/db/schema";
import { attendanceFreezeOn } from "@/lib/reports/flags";

/**
 * Attendance month freeze (Sir's rule 7). A completed month freezes on the 2nd
 * (after its query window); once frozen, its attendance can't be edited. All
 * ENFORCEMENT is gated on `attendanceFreezeOn()` (default OFF) so this is inert
 * until flipped — the freeze table can fill up harmlessly in the meantime.
 */

/** "YYYY-MM-DD" or "YYYY-MM" → "YYYY-MM". */
function toMonth(dateOrMonth: string): string {
  return dateOrMonth.slice(0, 7);
}

export async function isMonthFrozen(month: string): Promise<boolean> {
  const [row] = await db
    .select({ month: attendanceMonthFreeze.month })
    .from(attendanceMonthFreeze)
    .where(eq(attendanceMonthFreeze.month, toMonth(month)))
    .limit(1);
  return !!row;
}

export async function freezeMonth(month: string, byId?: string | null): Promise<void> {
  await db
    .insert(attendanceMonthFreeze)
    .values({ month: toMonth(month), frozenById: byId ?? null })
    .onConflictDoNothing({ target: attendanceMonthFreeze.month });
}

/**
 * Guard for any attendance EDIT targeting `dateOrMonth`. Returns not-ok when the
 * freeze is enabled AND that month is frozen. Fail-open: a read error never traps
 * an edit. Callers: `const g = await assertMonthEditable(d); if (!g.ok) return g;`
 */
export async function assertMonthEditable(
  dateOrMonth: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!attendanceFreezeOn()) return { ok: true };
  const month = toMonth(dateOrMonth);
  const frozen = await isMonthFrozen(month).catch(() => false);
  if (frozen) {
    return { ok: false, error: `Attendance for ${month} is frozen and can no longer be changed.` };
  }
  return { ok: true };
}
