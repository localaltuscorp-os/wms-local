import type { Task } from "@/db/schema";
import type { KpiTotals } from "@/lib/types";
import { kpiBucketOf, isCountableTask } from "@/lib/dashboard/kpi-buckets";

/**
 * The six Task Summary numbers, over whatever task set is handed in.
 *
 * The classification itself lives in lib/dashboard/kpi-buckets.ts — this
 * function is only the tally. That split is deliberate: the sparklines, the
 * week-over-week deltas and the operational summary all need the SAME
 * question answered ("which card is this task on?"), and when each of them
 * answered it locally they answered it differently. See that module's header
 * for the three definitions that had drifted apart.
 *
 * INVARIANT: total === pending + notStarted + needHelp + done + notApproved.
 * `pending` is the residual bucket and archived / cancelled / transferred rows
 * are excluded from `total` too, so the five cards always reconcile with the
 * Total card. They previously did not.
 */
export function computeKpiTotals(tasks: Task[]): KpiTotals {
  const totals: KpiTotals = {
    total: 0,
    pending: 0,
    notStarted: 0,
    needHelp: 0,
    done: 0,
    notApproved: 0,
  };

  for (const t of tasks) {
    if (!isCountableTask(t)) continue;
    totals.total += 1;
    const bucket = kpiBucketOf(t);
    if (bucket) totals[bucket] += 1;
  }

  return totals;
}
