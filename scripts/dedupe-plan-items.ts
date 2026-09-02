// One-off cleanup: collapse DUPLICATE Plan-My-Day rows so an item lives on
// exactly ONE day (Sir, 2026-08).
//
// WHY THEY EXIST: every add-path in app/(app)/goals/plan/actions.ts de-duplicated
// only within the TARGET day (`employee + plan_date + ref`), so the same goal or
// task could be written onto today AND tomorrow AND any other day — separate
// rows, each tickable. The code fix (moveIfPlannedElsewhere) stops NEW ones; this
// collapses the rows already written.
//
// THE RULE — for each (employee, source item) group of NOT-DONE rows spread over
// more than one day, keep exactly ONE:
//   · the soonest occurrence that is TODAY or LATER (the work still ahead), else
//   · the most recent PAST occurrence (nothing upcoming, so keep the freshest).
// Everything else in the group is deleted.
//
// DONE rows are never touched: a completed commitment is history for the day it
// was completed on, and deleting it would rewrite what someone already reported.
//
// Dry-run by default — prints exactly what it WOULD delete and changes nothing:
//   pnpm tsx --env-file=.env.local scripts/dedupe-plan-items.ts
// Apply:
//   APPLY=1 pnpm tsx --env-file=.env.local scripts/dedupe-plan-items.ts
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");
const APPLY = process.env.APPLY === "1";
const sql = postgres(url, { max: 1, prepare: false });

/** IST "today" — the same day boundary the app grades against. */
function istToday(): string {
  return new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);
}

async function main() {
  const today = istToday();

  // Does `cascade_goal_id` exist? Migration 0141 may be unapplied in prod, and
  // referencing a missing column would throw for the whole run.
  const [col] = (await sql`
    select count(*)::int as n from information_schema.columns
     where table_name = 'daily_checklist' and column_name = 'cascade_goal_id'`) as unknown as { n: number }[];
  const refExpr = (col?.n ?? 0) > 0
    ? sql`coalesce(dc.task_id::text, dc.goal_id::text, dc.cascade_goal_id::text)`
    : sql`coalesce(dc.task_id::text, dc.goal_id::text)`;

  // The rows to DELETE: every not-done duplicate that is not its group's keeper.
  const doomed = await sql`
    with grouped as (
      select dc.id, dc.employee_id, dc.plan_date, dc.title,
             ${refExpr} as ref,
             row_number() over (
               partition by dc.employee_id, ${refExpr}
               order by
                 case when dc.plan_date >= ${today}::date then 0 else 1 end,
                 case when dc.plan_date >= ${today}::date then dc.plan_date end asc,
                 dc.plan_date desc
             ) as rn,
             count(*) over (partition by dc.employee_id, ${refExpr}) as grp
        from daily_checklist dc
       where dc.done = false
         and ${refExpr} is not null
    )
    select g.id, g.plan_date, g.title, e.name
      from grouped g join employees e on e.id = g.employee_id
     where g.grp > 1 and g.rn > 1
     order by e.name, g.plan_date`;

  console.log(`IST today: ${today}`);
  console.log(`Rows that are duplicate occurrences (would be deleted): ${doomed.length}`);
  const byPerson = new Map<string, number>();
  for (const r of doomed as unknown as { name: string }[]) {
    byPerson.set(r.name, (byPerson.get(r.name) ?? 0) + 1);
  }
  for (const [name, n] of [...byPerson].sort((a, b) => b[1] - a[1])) {
    console.log(`   ${name}: ${n}`);
  }

  if (!APPLY) {
    console.log("\nDRY RUN — nothing deleted. Re-run with APPLY=1 to apply.");
    return;
  }
  if (doomed.length === 0) {
    console.log("Nothing to do.");
    return;
  }

  const ids = (doomed as unknown as { id: string }[]).map((r) => r.id);
  const deleted = await sql`delete from daily_checklist where id = any(${ids}::uuid[]) returning id`;
  console.log(`\nDELETED ${deleted.length} duplicate rows.`);

  const [left] = (await sql`
    with g as (
      select dc.employee_id, ${refExpr} as ref, count(distinct dc.plan_date) as days
        from daily_checklist dc
       where dc.done = false and ${refExpr} is not null
       group by 1, 2
    ) select count(*)::int as n from g where days > 1`) as unknown as { n: number }[];
  console.log(`Remaining items still on more than one day: ${left?.n ?? 0} (expect 0)`);
}

main()
  .then(() => sql.end())
  .catch(async (e) => {
    console.error(e);
    await sql.end();
    process.exit(1);
  });
