-- ===========================================================================
--  VERIFY — run BEFORE and AFTER RUN-IN-SUPABASE-0215-0224-ALL.sql
--  Read-only. Changes nothing. Safe to run any number of times.
--
--  ONE QUERY, ONE RESULT TABLE. That is the whole point of the rewrite.
--
--  This file used to be eight separate SELECTs, and the Supabase SQL editor
--  displays only the LAST result set of a multi-statement run. So running the
--  old file showed check 7 and silently discarded checks 1-6 — including the
--  one that gates the deploy. It looked like a clean run. It was one seventh
--  of a clean run.
--
--  Read the result top to bottom: it is ordered failures first. If row 1 says
--  ok = true, everything below it does too.
-- ===========================================================================

with

-- ── 1. RIGHT PROJECT? ─────────────────────────────────────────────────────
--    The RLS helpers are the test that actually discriminates. A table count
--    does not: every database in play carries the full WMS schema, so "~270
--    tables" only rules out an empty project. This one has app.is_admin();
--    the team's does not, which is why their PART 3b shipped commented out.
project as (
  select 'A. project · app.is_admin() exists (you are on ours)' as check_name,
         to_regprocedure('app.is_admin()') is not null as ok
  union all
  select 'A. project · app.current_employee_id() exists',
         to_regprocedure('app.current_employee_id()') is not null
),

-- ── 2. PREREQUISITES — true BEFORE the migration file will run ────────────
prereq as (
  select 'B. prerequisite table · ' || t as check_name,
         to_regclass('public.' || t) is not null as ok
  from unnest(array[
    'employees','attendance_logs','broadcasts','broadcast_recipients',
    'calendar_events','candidate_intake','departments','holidays',
    'leave_requests','mobile_devices','module_submissions',
    'outstanding_entities','outstanding_payment_modes','outstanding_products',
    'product_options'
  ]) as t
),

-- ── 3. PRE-0215 DRIFT — migrations the -ALL sheet does NOT contain ────────
--    db/history/SCHEMA_DRIFT_FIX_2026-09-10.sql, Parts 1 and 2 only. These
--    are the 8-9 September outages by their real cause: sign-in 500ing as
--    "Email or password didn't match" while Firebase succeeded, and Daily
--    Goals dying. Any false here means run that file too.
drift as (
  select 'C. pre-0215 drift · ' || tbl || '.' || col as check_name,
         exists (select 1 from information_schema.columns c
                  where c.table_name = tbl and c.column_name = col) as ok
  from (values
    ('employees','employment_status'),
    ('employees','last_working_day'),
    ('employees','legal_hold'),
    ('employees','anonymised_at'),
    ('goals','client'),
    ('project_nodes','client_name'),
    ('project_nodes','subject'),
    ('project_nodes','priority'),
    ('project_nodes','initiator_id'),
    ('project_nodes','tags'),
    ('project_nodes','links')
  ) as v(tbl, col)
  union all
  select 'C. pre-0215 drift · table project_node_attachments',
         to_regclass('public.project_node_attachments') is not null
),

-- ── 4. AFTER: every table the migrations create ───────────────────────────
created as (
  select 'D. new table · ' || t as check_name,
         to_regclass('public.' || t) is not null as ok
  from unnest(array[
    'attendance_audit_log','candidate_access_links','candidate_policy_signatures',
    'delegated_access_events','delegated_access_grants','device_consent_events',
    'employee_manager_history','jd_assignments','jd_attachments','jd_delegations',
    'jd_entries','jd_position_holders','jd_positions','jd_push_log','jd_ranks',
    'module_permission_events','module_permissions','module_submission_attachments',
    'ops_checklist_checks','ops_checklist_items','ops_checklist_runs',
    'ops_checklist_templates'
  ]) as t
),

-- ── 5. AFTER: columns added to existing tables ────────────────────────────
cols as (
  select 'E. new column · ' || tbl || '.' || col as check_name,
         exists (select 1 from information_schema.columns c
                  where c.table_name = tbl and c.column_name = col) as ok
  from (values
    ('broadcast_recipients','snoozed_at'),
    ('broadcast_recipients','snooze_session'),
    ('broadcast_recipients','snooze_count'),
    ('broadcast_recipients','popup_seen_at'),
    ('broadcasts','popup'),
    ('mobile_devices','revoked_by_id'),
    ('mobile_devices','revoke_reason'),
    ('mobile_devices','registered_by_id'),
    ('mobile_devices','last_seen_at'),
    ('mobile_devices','manufacturer'),
    ('mobile_devices','model'),
    ('mobile_devices','registered_at'),
    ('mobile_devices','device_name'),
    ('holidays','note'),
    ('holidays','updated_by_id'),
    ('holidays','updated_at'),
    ('outstanding_products','code')
  ) as v(tbl, col)
),

-- ── 6. AFTER: 0224 — THE ONE THAT GATES THE DEPLOY ────────────────────────
--    0224 renames mobile_devices.bios_serial_number to device_name, and
--    db/schema.ts already declares deviceName. Drizzle's findFirst expands
--    every declared column, and resolveDeviceContext makes that call on every
--    request carrying a device cookie with no try/catch above it. Until this
--    row reads true, deploying the code 500s the app for anyone holding that
--    cookie. See HANDOFF.md, pending-migrations section.
renamed as (
  select 'F. 0224 GATES THE DEPLOY · device_name exists' as check_name,
         exists (select 1 from information_schema.columns
                  where table_name = 'mobile_devices'
                    and column_name = 'device_name') as ok
  union all
  select 'F. 0224 GATES THE DEPLOY · bios_serial_number is gone',
         not exists (select 1 from information_schema.columns
                      where table_name = 'mobile_devices'
                        and column_name = 'bios_serial_number')
),

-- ── 7. AFTER: the row-writing migrations ──────────────────────────────────
rows_written as (
  select 'G. rows · 0217 seeded the IJV payment mode' as check_name,
         (select count(*) from outstanding_payment_modes where name = 'IJV') > 0 as ok
  union all
  select 'G. rows · 0220 backfilled manager history for every employee',
         (select count(*) from employee_manager_history where effective_to is null)
           >= (select count(*) from employees)
),

-- ── 8. PART 2 — the device wipe, if it was run ────────────────────────────
--    Not a pass/fail. Part 2 is optional, so "backup absent" simply means you
--    stopped at END OF PART 1, which is a valid choice. Read the counts.
wipe as (
  select 'H. part 2 · backup mobile_devices_pre_0223 exists' as check_name,
         to_regclass('public.mobile_devices_pre_0223') is not null as ok
)

select * from renamed
union all select * from project
union all select * from created
union all select * from cols
union all select * from rows_written
union all select * from drift
union all select * from prereq
union all select * from wipe
order by ok, check_name;


-- ===========================================================================
--  THE DEVICE COUNTS — only meaningful if row H above says true.
--  Run this as its own query (the editor shows one result set at a time).
--
--    live_devices = 0 and backed_up > 0  ->  the wipe ran. Everyone
--    re-registers a device at next sign-in; nobody is locked out, because
--    sign-in stopped refusing on device status. The old rows are in the
--    backup table and can be read or restored from there.
--
--    live_devices > 0                    ->  people have registered since.
-- ===========================================================================

-- select (select count(*) from mobile_devices)          as live_devices,
--        (select count(*) from mobile_devices_pre_0223) as backed_up;
