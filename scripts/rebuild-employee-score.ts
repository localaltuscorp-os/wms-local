// PMS Layer 2 — rebuild the employee_score_daily projection from the event log
// (Law 4). Truncates the projection, resets its cursor, and replays every event.
//   pnpm tsx --env-file=.env.local scripts/rebuild-employee-score.ts
import { rebuildEmployeeScoreDaily } from "@/lib/projections/employee-score-daily";

async function main() {
  console.log("rebuilding employee_score_daily from event_log…");
  const { processed } = await rebuildEmployeeScoreDaily();
  console.log(`✓ replayed ${processed} events into the projection`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
