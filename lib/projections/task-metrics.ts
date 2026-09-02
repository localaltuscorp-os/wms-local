/**
 * Phase B — the task-metrics projection (ARCHITECTURE.md Laws 4, 5, 10).
 *
 * A rebuildable daily rollup of task activity, derived ONLY from task events.
 * It is the "materialize, don't scan" seam: a cheap point-read of per-doer
 * activity over time for dashboards and AI agents, with no scan of `tasks`.
 *
 * Idempotency (Law 7): the relay applies each event inside a transaction that
 * also advances the consumer cursor, so an event's +1 commits exactly once. To
 * rebuild from scratch (Law 4), `rebuildTaskMetrics()` truncates the table and
 * replays the whole log.
 */
import { and, gte, lte, sql } from "drizzle-orm";
import { db, taskMetricsDaily, eventConsumers } from "@/lib/db";
import { runConsumer } from "@/lib/relay/relay";
import type { Consumer } from "@/lib/relay/relay";
import type { StoredEvent } from "@/lib/events/types";
import { taskMetricDelta, type CountColumn } from "./task-metrics-rule";

export { taskMetricDelta, type MetricDelta, type CountColumn } from "./task-metrics-rule";

export const TASK_METRICS_CONSUMER = "projection:task_metrics";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

function dayOf(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Upsert +1 into one counter for (day, doer), inside the relay's transaction. */
async function bump(
  tx: Tx,
  day: string,
  doerId: string,
  column: CountColumn,
  orgId: string | null,
): Promise<void> {
  const base = {
    day,
    doerId,
    orgId,
    createdCount: 0,
    doneCount: 0,
    approvedCount: 0,
    notApprovedCount: 0,
  };
  const col = taskMetricsDaily[column];
  await tx
    .insert(taskMetricsDaily)
    .values({ ...base, [column]: 1, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [taskMetricsDaily.day, taskMetricsDaily.doerId],
      set: { [column]: sql`${col} + 1`, updatedAt: new Date() },
    });
}

/** The relay consumer. Pure projection — no external effects, safe to run by
 *  default. Ignores non-task events. */
export const taskMetricsConsumer: Consumer = {
  name: TASK_METRICS_CONSUMER,
  async handle(event: StoredEvent, tx: Tx) {
    const delta = taskMetricDelta(event);
    if (!delta) return; // non-task / non-counting event
    await bump(tx, delta.day, delta.doerId, delta.column, event.orgId ?? null);
  },
};

// ── Stable read interface (Law 5) — consumers never know it's a table vs a
//    live query; today it's the materialized rollup. ────────────────────────

export interface TaskMetricsRow {
  day: string;
  doerId: string;
  createdCount: number;
  doneCount: number;
  approvedCount: number;
  notApprovedCount: number;
}

/** Per-doer daily activity over a date window, straight from the projection. */
export async function getTaskMetrics(opts: {
  start: Date;
  end: Date;
  doerIds?: string[];
}): Promise<TaskMetricsRow[]> {
  const conds = [
    gte(taskMetricsDaily.day, dayOf(opts.start)),
    lte(taskMetricsDaily.day, dayOf(opts.end)),
  ];
  if (opts.doerIds && opts.doerIds.length > 0) {
    conds.push(sql`${taskMetricsDaily.doerId} = any(${opts.doerIds})`);
  }
  const rows = await db
    .select()
    .from(taskMetricsDaily)
    .where(and(...conds));
  return rows.map((r) => ({
    day: r.day,
    doerId: r.doerId,
    createdCount: r.createdCount,
    doneCount: r.doneCount,
    approvedCount: r.approvedCount,
    notApprovedCount: r.notApprovedCount,
  }));
}

/** Rebuild the whole projection from the event log (Law 4): truncate, reset the
 *  cursor, replay. Safe to run anytime — the projection is disposable. */
export async function rebuildTaskMetrics(): Promise<{ processed: number }> {
  await db.delete(taskMetricsDaily);
  await db
    .insert(eventConsumers)
    .values({ consumer: TASK_METRICS_CONSUMER, lastSeq: 0, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: eventConsumers.consumer,
      set: { lastSeq: 0, updatedAt: new Date() },
    });
  const res = await runConsumer(taskMetricsConsumer);
  return { processed: res.processed };
}
