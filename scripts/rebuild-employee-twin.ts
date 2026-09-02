// PMS Layer 2 — rebuild the employee_twin projection from the event log (Law 4).
// Truncates the projection, resets its cursor, and replays every event.
//   pnpm tsx --env-file=.env.local scripts/rebuild-employee-twin.ts
import { rebuildEmployeeTwin } from "@/lib/projections/employee-twin";

async function main() {
  console.log("rebuilding employee_twin from event_log…");
  const { processed } = await rebuildEmployeeTwin();
  console.log(`✓ replayed ${processed} events into the projection`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
