/** Sanity-check #11 gate queries against live data before shipping a hard lock. */
import { managerDailyTaskGate, managerWeeklyGoalGate, isWeeklyGoalGateDay } from "@/lib/manager-gates";

const ROHAN = "0705ae8a-888b-44df-8a8e-ca6a98c5bbba";
const MANAN = "1fbc08ff-fa3f-47c3-bcee-3539a9c0c299";
const HETESH = "54507e35-1969-4755-b275-3317d67de3c9"; // no reports → should pass

async function show(label: string, id: string) {
  const daily = await managerDailyTaskGate(id);
  const weekly = await managerWeeklyGoalGate(id);
  console.log(`\n${label}`);
  console.log(`  DAILY satisfied=${daily.satisfied} reports=${daily.reports.length}`);
  for (const r of daily.reports.slice(0, 4)) console.log(`    ${r.name}: ${r.given}/${r.quota}`);
  console.log(`  WEEKLY satisfied=${weekly.satisfied} (gate-day today=${isWeeklyGoalGateDay()})`);
  for (const r of weekly.reports.slice(0, 4)) console.log(`    ${r.name}: ${r.open}/${r.need} open`);
}

async function main() {
  await show("ROHAN (manager, 12 reports)", ROHAN);
  await show("MANAN (top, 6 reports)", MANAN);
  await show("HETESH (no reports → must be satisfied)", HETESH);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
