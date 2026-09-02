/**
 * PMS Layer 2 — the PURE employee-score-daily projection rule (mig 0095). Same
 * counter deltas as the twin, but bucketed by the event's calendar day so the
 * result is a rebuildable HISTORY (the score-trend series), keyed (day,
 * employeeId). Reuses employeeTwinDelta so the two projections can never drift.
 */
import type { StoredEvent } from "@/lib/events/types";
import { employeeTwinDelta, type TwinDelta } from "./employee-twin-rule";

export interface DailyScoreDelta extends TwinDelta {
  day: string; // 'YYYY-MM-DD' (UTC day of occurredAt)
}

function dayOf(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** The (day, employee) counter delta for an event, or null when it doesn't
 *  count. Pure. */
export function employeeScoreDailyDelta(event: StoredEvent): DailyScoreDelta | null {
  const base = employeeTwinDelta(event);
  if (!base) return null;
  return { ...base, day: dayOf(event.occurredAt) };
}
