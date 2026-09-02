import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { calendarEvents, eventBatchSchedules, eventBatchTypes } from "@/db/schema";

/**
 * Reconcile the generated (`source='batch'`, `is_locked=true`) calendar_events
 * for a single batch schedule so they exactly match the schedule's current
 * dates / times / days-of-week / category / status (design §4/§6).
 *
 * Idempotent by construction: we DELETE every `(source='batch', source_ref_id =
 * scheduleId)` row and re-insert the freshly-expanded set inside one
 * transaction, so re-saving a schedule never duplicates events. When the
 * schedule is missing or `is_active = false`, we only delete — no rows are
 * regenerated (delete/deactivate removes the auto-blocks).
 *
 * "Override facility" (design §6): unlocking a generated block is modelled by
 * the calendar detaching it (source → 'manual', source_ref_id → null). Detached
 * rows no longer match the `source='batch' AND source_ref_id` key, so they
 * survive this reconcile untouched.
 */
export async function reconcileBatchEvents(scheduleId: string): Promise<void> {
  const [schedule] = await db
    .select()
    .from(eventBatchSchedules)
    .where(eq(eventBatchSchedules.id, scheduleId))
    .limit(1);

  await db.transaction(async (tx) => {
    // 1. Always clear the previously-generated set (keeps re-saves idempotent).
    await tx
      .delete(calendarEvents)
      .where(
        and(
          eq(calendarEvents.source, "batch"),
          eq(calendarEvents.sourceRefId, scheduleId),
        ),
      );

    // 2. Nothing to regenerate for a deleted / deactivated schedule.
    if (!schedule || !schedule.isActive) return;

    // 3. Resolve category + title, falling back to the batch type defaults.
    let categoryId = schedule.categoryId ?? null;
    let title = schedule.name?.trim() || null;
    if ((!categoryId || !title) && schedule.batchTypeId) {
      const [bt] = await tx
        .select({
          name: eventBatchTypes.name,
          defaultCategoryId: eventBatchTypes.defaultCategoryId,
        })
        .from(eventBatchTypes)
        .where(eq(eventBatchTypes.id, schedule.batchTypeId))
        .limit(1);
      if (!categoryId) categoryId = bt?.defaultCategoryId ?? null;
      if (!title) title = bt?.name ?? "Batch";
    }
    if (!title) title = "Batch";

    // 4. Expand the date range, filtering by days_of_week (0=Mon…6=Sun; empty =
    //    every day). An empty/reversed range yields no rows.
    const days =
      schedule.daysOfWeek && schedule.daysOfWeek.length > 0
        ? new Set(schedule.daysOfWeek)
        : null;
    const dates = eachDateMon0(schedule.startDate, schedule.endDate).filter((d) =>
      days ? days.has(d.dowMon0) : true,
    );
    if (dates.length === 0) return;

    // 5. Timed schedule → block that slot; untimed → all-day banner.
    const hasSlot = schedule.startMin != null && schedule.endMin != null;
    const owner = schedule.updatedById ?? schedule.createdById ?? null;
    const rows = dates.map((d) => ({
      title: title!,
      categoryId,
      eventDate: d.iso,
      startMin: hasSlot ? schedule.startMin : null,
      endMin: hasSlot ? schedule.endMin : null,
      allDay: !hasSlot,
      status: schedule.status,
      location: schedule.location,
      notes: schedule.notes,
      source: "batch" as const,
      sourceRefId: scheduleId,
      isLocked: true,
      createdById: owner,
      updatedById: owner,
    }));

    // Chunk inserts to stay well under any parameter ceiling on long ranges.
    const CHUNK = 500;
    for (let i = 0; i < rows.length; i += CHUNK) {
      await tx.insert(calendarEvents).values(rows.slice(i, i + CHUNK));
    }
  });
}

/**
 * Enumerate every calendar date in the inclusive `[startISO, endISO]` window
 * (both `yyyy-mm-dd`), returning each with its Monday-0 day-of-week index
 * (0=Mon … 6=Sun) to match `event_batch_schedules.days_of_week`. Computed in UTC
 * to avoid DST / local-timezone drift on the date-only strings. A reversed or
 * malformed range yields `[]`; a hard guard caps runaway ranges (~5 years).
 */
function eachDateMon0(
  startISO: string,
  endISO: string,
): { iso: string; dowMon0: number }[] {
  const s = startISO.split("-").map(Number);
  const e = endISO.split("-").map(Number);
  if (s.length !== 3 || e.length !== 3 || s.some(Number.isNaN) || e.some(Number.isNaN)) {
    return [];
  }
  let cur = Date.UTC(s[0]!, s[1]! - 1, s[2]!);
  const end = Date.UTC(e[0]!, e[1]! - 1, e[2]!);
  const out: { iso: string; dowMon0: number }[] = [];
  let guard = 0;
  const DAY_MS = 86_400_000;
  while (cur <= end && guard < 2000) {
    const d = new Date(cur);
    const iso = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
      d.getUTCDate(),
    ).padStart(2, "0")}`;
    // getUTCDay: 0=Sun … 6=Sat → shift to 0=Mon … 6=Sun.
    out.push({ iso, dowMon0: (d.getUTCDay() + 6) % 7 });
    cur += DAY_MS;
    guard += 1;
  }
  return out;
}
