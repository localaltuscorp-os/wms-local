import { sql } from "drizzle-orm";
import { tasks } from "@/lib/db";

/**
 * "Overdue is ALWAYS calculated from the revised due date."
 *
 * A task's *effective* due date is its admin-set revision when present, else
 * the original committed `due_at`. `due_at` is immutable after creation (the
 * first committed date is permanent for audit); later changes land in
 * `revised_target_date`. Every overdue/late comparison and the due-date column
 * the lists/board/agenda show must therefore key off this COALESCE — NOT the
 * raw `due_at` — so a rescheduled task stops reading as overdue.
 *
 * Returns a fresh `sql` fragment on each call (drizzle SQL chunks are not
 * meant to be shared between queries).
 */
export function effectiveDueAtSql() {
  return sql<Date>`COALESCE(${tasks.revisedTargetDate}, ${tasks.dueAt})`;
}

/**
 * In-memory mirror of {@link effectiveDueAtSql} for rows already loaded as JS
 * objects: prefer the revised target date, fall back to the original due date.
 */
export function pickEffectiveDue(t: {
  dueAt: Date | null;
  revisedTargetDate: Date | null;
}): Date | null {
  return t.revisedTargetDate ?? t.dueAt;
}
