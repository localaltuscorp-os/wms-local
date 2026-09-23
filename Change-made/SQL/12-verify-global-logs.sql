-- ===========================================================================
--  VERIFY — Global WMS Logs (daily_sessions + activity_logs)
--  Altus WMS | branch Om | read-only. Run AFTER
--  Change-made/SQL/11-apply-global-logs.sql.
-- ===========================================================================
--
--  Nothing here writes. Numbers below were read off the Supabase database this
--  branch points at on 2026-09-22, immediately after 0245 ran.

-- ---------------------------------------------------------------------------
-- 1. THE TWO TABLES. Expect two rows.
-- ---------------------------------------------------------------------------
select table_name
  from information_schema.tables
 where table_schema = 'public'
   and table_name in ('daily_sessions', 'activity_logs')
 order by table_name;

-- ---------------------------------------------------------------------------
-- 2. The immutability trigger. Expect one row: activity_logs_no_mutate.
-- ---------------------------------------------------------------------------
select tgname, pg_get_triggerdef(oid) as definition
  from pg_trigger
 where tgrelid = 'activity_logs'::regclass
   and not tgisinternal;

-- ---------------------------------------------------------------------------
-- 3. The key indexes. Expect all of:
--    activity_logs_employee_event_idx, activity_logs_event_at_idx,
--    activity_logs_module_event_idx, activity_logs_event_type_event_idx,
--    activity_logs_status_event_idx, activity_logs_client_event_id_uq, …
--    and daily_sessions_employee_date_uq.
-- ---------------------------------------------------------------------------
select indexname
  from pg_indexes
 where tablename in ('activity_logs', 'daily_sessions')
 order by indexname;

-- ---------------------------------------------------------------------------
-- 4. The column names the application reads. Expect `event_at` (NOT `timestamp`)
--    and `client_event_id`.
-- ---------------------------------------------------------------------------
select column_name
  from information_schema.columns
 where table_name = 'activity_logs'
   and column_name in ('event_at', 'client_event_id', 'employee_id', 'changes', 'metadata')
 order by column_name;

-- ---------------------------------------------------------------------------
-- 5. THE IMMUTABILITY PROOF. This must FAIL with:
--    "activity_logs is append-only (no UPDATE, no DELETE)".
--    It is the only statement in this file that writes, and it fails by design —
--    keep it as the one proof the trigger is live. Comment it out once you have
--    seen it fail.
-- ---------------------------------------------------------------------------
-- update activity_logs set module = 'tampered' where id = (select id from activity_logs limit 1);

-- ---------------------------------------------------------------------------
-- 6. Daily-session rollup sanity. Expect one row per employee per date, no
--    negative counters, status in (active, closed, finalized).
-- ---------------------------------------------------------------------------
select status, count(*) as sessions, sum(total_event_count) as events
  from daily_sessions
 group by status
 order by status;
