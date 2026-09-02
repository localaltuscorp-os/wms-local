// Pure compute helpers for the manager workload drill-down.
// Standalone: no DB, no new queries, load-neutral. UTC-calendar-day math
// mirrors the utcDayKey/dayNumber pattern in lib/transforms/done-on-time.ts.

export type Delivery = "on_time" | "late" | "aging";

function utcDayKey(d: Date | string): string {
  return typeof d === "string" ? d.slice(0, 10) : d.toISOString().slice(0, 10);
}
function dayNumber(d: Date | string): number {
  return Math.floor(new Date(`${utcDayKey(d)}T00:00:00Z`).getTime() / 86_400_000);
}

/**
 * Classify a single task's delivery state (UTC calendar days).
 * - DONE with completedAt: on_time if completed day <= due day, else late.
 * - Otherwise (open, OR done with null completedAt): aging if due day < today,
 *   else on_time.
 */
export function deliveryOf(
  t: { status: string; dueAt: Date | string; completedAt: Date | string | null },
  now: Date,
): Delivery {
  if (t.status === "done" && t.completedAt != null) {
    return dayNumber(t.completedAt) <= dayNumber(t.dueAt) ? "on_time" : "late";
  }
  // Open task (or done-with-no-completedAt): past-due → aging, else on_time.
  return dayNumber(t.dueAt) < dayNumber(now) ? "aging" : "on_time";
}

/** Delegation percentage now vs prior, with the signed delta. */
export function delegationDelta(
  curPct: number,
  priorPct: number,
): { pct: number; deltaPct: number } {
  return { pct: curPct, deltaPct: curPct - priorPct };
}

/**
 * Mean age (today − createdDay) in whole UTC days, rounded. 0 when empty.
 */
export function avgAgingDays(
  openCreatedAts: (Date | string)[],
  now: Date,
): number {
  if (openCreatedAts.length === 0) return 0;
  const today = dayNumber(now);
  const total = openCreatedAts.reduce(
    (sum, c) => sum + (today - dayNumber(c)),
    0,
  );
  return Math.round(total / openCreatedAts.length);
}

/**
 * Status donut counts. onTime/late/aging come from deliveryOf; done is the
 * total count of tasks with status === "done" (regardless of the on_time/late
 * split), for the label.
 */
export function statusDonut(
  tasks: { status: string; dueAt: Date | string; completedAt: Date | string | null }[],
  now: Date,
): { onTime: number; late: number; aging: number; done: number } {
  let onTime = 0,
    late = 0,
    aging = 0,
    done = 0;
  for (const t of tasks) {
    if (t.status === "done") done++;
    switch (deliveryOf(t, now)) {
      case "on_time":
        onTime++;
        break;
      case "late":
        late++;
        break;
      case "aging":
        aging++;
        break;
    }
  }
  return { onTime, late, aging, done };
}
