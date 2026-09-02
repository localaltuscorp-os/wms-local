// Phase B — one-time backfill of the event log from existing history.
//
// Adding event-sourcing to a live system means the log starts EMPTY, so the
// projection would only see post-launch activity. This script derives the
// historical task events from the operational tables (`tasks` + the existing
// `task_events` audit log) so the log holds full history and the projection
// rebuilds to real numbers — and it demonstrates Law 4 (state rebuilt from the
// log). Set-based INSERT…SELECT, ordered by occurred time so `seq` ≈ time order.
//
// Idempotent: it first deletes all aggregate_type='task' events, then re-derives.
// Run BEFORE relying on the projection, then rebuild the projection:
//   pnpm tsx --env-file=.env.local scripts/backfill-event-log.ts
//   pnpm tsx --env-file=.env.local scripts/rebuild-task-metrics.ts
//
// Known approximation: historical doer attribution uses the task's CURRENT
// doer_id (the per-moment doer isn't reconstructable without replaying every
// reassign). Counts are exact; per-doer history may differ after reassignments.
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");
const sql = postgres(url, { max: 1, prepare: false });

async function main() {
  const taskCountRows = (await sql.unsafe(`select count(*)::int as tasks from tasks`)) as unknown as { tasks: number }[];
  console.log(`backfilling event_log from ${taskCountRows[0]?.tasks ?? 0} tasks + their task_events…`);

  await sql.begin(async (tx) => {
    await tx.unsafe(`delete from event_log where aggregate_type = 'task'`);
    await tx.unsafe(`
      insert into event_log
        (aggregate_type, aggregate_id, event_type, event_version, payload, actor_id, correlation_id, occurred_at)
      select aggregate_type, aggregate_id, event_type, 1, payload, actor_id, correlation_id, occurred_at
      from (
        -- One TaskCreated per task, synthesised from the row itself.
        select 'task'::text as aggregate_type,
               t.id as aggregate_id,
               'TaskCreated'::text as event_type,
               jsonb_build_object(
                 'doerId', t.doer_id, 'initiatorId', t.initiator_id,
                 'createdById', t.created_by_id, 'title', t.title,
                 'subject', t.subject, 'priority', t.priority,
                 'status', 'dont_know', 'dueAt', to_jsonb(t.due_at)
               ) as payload,
               t.created_by_id as actor_id,
               t.id as correlation_id,
               t.created_at as occurred_at
        from tasks t

        union all

        -- Lifecycle events from the existing audit log (skip 'created' — already
        -- synthesised above to guarantee every task has exactly one).
        select 'task'::text,
               te.task_id,
               case te.event_type
                 when 'status_changed' then 'TaskStatusChanged'
                 when 'declined'       then 'TaskStatusChanged'
                 when 'reassigned'     then 'TaskReassigned'
                 when 'archived'       then 'TaskArchived'
                 when 'restored'       then 'TaskRestored'
                 when 'field_updated'  then 'TaskFieldUpdated'
                 else 'TaskFieldUpdated'
               end,
               case te.event_type
                 when 'status_changed' then jsonb_build_object('doerId', t.doer_id, 'fromStatus', te.from_value->>'status', 'toStatus', te.to_value->>'status')
                 when 'declined'       then jsonb_build_object('doerId', t.doer_id, 'fromStatus', te.from_value->>'status', 'toStatus', coalesce(te.to_value->>'status','not_approved'))
                 when 'reassigned'     then jsonb_build_object('fromDoerId', te.from_value->>'doerId', 'toDoerId', te.to_value->>'doerId', 'resetStatus', false)
                 when 'archived'       then jsonb_build_object('doerId', t.doer_id)
                 when 'restored'       then jsonb_build_object('doerId', t.doer_id)
                 else jsonb_build_object('doerId', t.doer_id, 'field', coalesce(te.to_value->>'field',''), 'value', te.to_value->'value')
               end,
               te.actor_id,
               te.task_id as correlation_id,
               te.created_at as occurred_at
        from task_events te
        join tasks t on t.id = te.task_id
        where te.event_type <> 'created'
      ) derived
      order by occurred_at asc
    `);
  });

  const nRows = (await sql.unsafe(`select count(*)::int as n from event_log where aggregate_type='task'`)) as unknown as { n: number }[];
  const byType = (await sql.unsafe(`select event_type, count(*)::int as n from event_log where aggregate_type='task' group by event_type order by n desc`)) as unknown as { event_type: string; n: number }[];
  console.log(`✓ backfilled ${nRows[0]?.n ?? 0} task events`);
  for (const r of byType) console.log(`   ${r.event_type.padEnd(20)} ${r.n}`);
}

main().then(() => sql.end()).catch(async (e) => { console.error(e); await sql.end(); process.exit(1); });
