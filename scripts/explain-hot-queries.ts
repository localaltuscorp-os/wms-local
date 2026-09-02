// Phase 1.4 — EXPLAIN ANALYZE the queries that the task-detail page and
// the dashboard fire. Anything reporting `Seq Scan` on a non-tiny table
// is a candidate for an index. The output is meant for eyeballing; we
// note the row counts and the plan node and call out anything obvious.
//
// Usage: pnpm tsx --env-file=.env.local scripts/explain-hot-queries.ts
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");
const sql = postgres(url, { max: 1, prepare: false });

interface HotQuery {
  name: string;
  text: string;
  params?: unknown[];
}

const QUERIES: HotQuery[] = [
  {
    name: "getTaskById — single task by uuid (3 joins)",
    text: `
      select t.id, t.title, t.status, t.priority, t.created_at, t.due_at,
             de.name as doer_name, ie.name as initiator_name
      from tasks t
      left join employees de on de.id = t.doer_id
      left join employees ie on ie.id = t.initiator_id
      where t.id = (select id from tasks limit 1)
    `,
  },
  {
    name: "listTasks — non-archived, ordered by created_at desc, limit 200",
    text: `
      select id, title, status, priority, due_at, doer_id, initiator_id, created_at
      from tasks
      where archived = false
      order by created_at desc
      limit 200
    `,
  },
  {
    name: "listTaskEvents — by task_id, ordered by created_at",
    text: `
      select id, task_id, actor_id, event_type, created_at
      from task_events
      where task_id = (select id from tasks limit 1)
      order by created_at asc
    `,
  },
  {
    name: "Dashboard status counts — group by status",
    text: `
      select status, count(*)::int as n
      from tasks
      where archived = false
      group by status
    `,
  },
  {
    name: "Pending tasks for a doer (dashboard status_table)",
    text: `
      select count(*)::int as n
      from tasks
      where archived = false
        and doer_id = (select id from employees limit 1)
        and status in ('dont_know','not_started','initiated','follow_up','need_help','need_info','follow_up_1','follow_up_2','follow_up_3')
    `,
  },
  {
    name: "Subject-grouped tasks (potential seq scan on tasks.subject)",
    text: `
      select subject, count(*)::int as n
      from tasks
      where archived = false and subject is not null
      group by subject
    `,
  },
  {
    name: "Notifications for a user (inbox unread count)",
    text: `
      select count(*)::int as n
      from notifications
      where user_id = (select id from employees limit 1)
        and read_at is null
    `,
  },
  {
    name: "Tasks linked to any project node (subtree)",
    text: `
      select id from tasks
      where archived = false and project_node_id is not null
      order by created_at desc
      limit 200
    `,
  },
];

interface PlanRow {
  "QUERY PLAN": string;
}

async function explain(q: HotQuery) {
  // EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) — runs the query (cheap on
  // our row counts) and returns the chosen plan.
  const rows = (await sql.unsafe(
    `explain (analyze, buffers, format text) ${q.text}`,
  )) as unknown as PlanRow[];
  const plan = rows.map((r) => r["QUERY PLAN"]).join("\n");
  const seqScans = (plan.match(/Seq Scan/g) ?? []).length;
  const indexScans = (plan.match(/Index Scan|Index Only Scan|Bitmap Index Scan/g) ?? []).length;
  const execMatch = plan.match(/Execution Time:\s+([0-9.]+)\s+ms/);
  const exec = execMatch ? Number(execMatch[1]) : NaN;
  return { plan, seqScans, indexScans, exec };
}

async function main() {
  console.log(`\n=== Phase 1.4 — hot-query plan audit ===\n`);
  const summary: { name: string; ms: number; seq: number; idx: number }[] = [];
  for (const q of QUERIES) {
    process.stdout.write(`▶ ${q.name}\n`);
    try {
      const { plan, seqScans, indexScans, exec } = await explain(q);
      summary.push({ name: q.name, ms: exec, seq: seqScans, idx: indexScans });
      const flag = seqScans > 0 ? "⚠ SEQ" : "✓ idx";
      console.log(`   ${flag} · ${exec.toFixed(2)}ms · ${seqScans} seq · ${indexScans} idx`);
      // Print top 3 plan lines for context.
      for (const line of plan.split("\n").slice(0, 4)) {
        console.log(`     ${line}`);
      }
      console.log();
    } catch (e) {
      console.log(`   ✗ failed: ${(e as Error).message}\n`);
    }
  }
  console.log("=== summary ===");
  console.log("ms   seq idx  query");
  for (const s of summary.sort((a, b) => b.ms - a.ms)) {
    console.log(`${s.ms.toFixed(1).padStart(6)}  ${String(s.seq).padStart(2)}  ${String(s.idx).padStart(2)}   ${s.name}`);
  }
}

main()
  .then(() => sql.end())
  .catch(async (e) => {
    console.error(e);
    await sql.end();
    process.exit(1);
  });
