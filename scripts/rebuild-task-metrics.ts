// Phase B — rebuild the task_metrics projection from the event log (Law 4).
// Truncates the projection, resets its cursor, and replays every event.
//   pnpm tsx --env-file=.env.local scripts/rebuild-task-metrics.ts
import { rebuildTaskMetrics } from "@/lib/projections/task-metrics";

async function main() {
  console.log("rebuilding task_metrics_daily from event_log…");
  const { processed } = await rebuildTaskMetrics();
  console.log(`✓ replayed ${processed} events into the projection`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
