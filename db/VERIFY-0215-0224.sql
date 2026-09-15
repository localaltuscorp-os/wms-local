-- ===========================================================================
--  VERIFY — run BEFORE and AFTER RUN-IN-SUPABASE-0215-0224-ALL.sql
--  Read-only. Changes nothing.
--
--  BEFORE: confirms you are in the right project and every prerequisite exists.
--          Any `false` in step 2 or 3 means the migration file will fail.
--  AFTER:  every row in steps 4–6 should read true / present.
-- ===========================================================================


-- 1. RIGHT PROJECT?
--    Production is mwaijzxuyicysvimzspx. The team's own database is
--    fjopgyqytfvbudkwhdto -- do not run the migration file there.
--    A TABLE COUNT CANNOT TELL THEM APART: both carry the full WMS schema,
--    so ~270+ only rules out an empty project. Step 3 is the real test.
select current_database()                                   as db,
       (select count(*)::int from information_schema.tables
         where table_schema = 'public')                     as public_tables;


-- 2. PREREQUISITE TABLES — all must be true BEFORE running the migrations.
select t as prerequisite_table, to_regclass('public.' || t) is not null as exists
from unnest(array[
  'employees','attendance_logs','broadcasts','broadcast_recipients',
  'calendar_events','candidate_intake','departments','holidays',
  'leave_requests','mobile_devices','module_submissions',
  'outstanding_entities','outstanding_payment_modes','outstanding_products',
  'product_options'
]) as t
order by exists, t;


-- 3. RLS HELPER FUNCTIONS — Part 0 of the migration file creates these if missing.
--    ALSO THE PROJECT TEST. Production has both; the team's database has
--    neither. Two falses here mean you are in the wrong project, not that
--    Part 0 has work to do.
select to_regprocedure('app.is_admin()') is not null            as has_is_admin,
       to_regprocedure('app.current_employee_id()') is not null as has_current_employee_id;


-- 4. AFTER: every table the 15 migrations create.
select t as created_table, to_regclass('public.' || t) is not null as exists
from unnest(array[
  'attendance_audit_log','candidate_access_links','candidate_policy_signatures',
  'delegated_access_events','delegated_access_grants','device_consent_events',
  'employee_manager_history','jd_assignments','jd_attachments','jd_delegations',
  'jd_entries','jd_position_holders','jd_positions','jd_push_log','jd_ranks',
  'module_permission_events','module_permissions','module_submission_attachments',
  'ops_checklist_checks','ops_checklist_items','ops_checklist_runs',
  'ops_checklist_templates'
]) as t
order by exists, t;


-- 5. AFTER: columns added to existing tables.
select tbl, col,
       exists (select 1 from information_schema.columns c
                where c.table_name = tbl and c.column_name = col) as present
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
order by present, tbl, col;


-- 6. AFTER: 0224 renamed bios_serial_number -> device_name. Expect ZERO rows.
select column_name as should_not_exist
from information_schema.columns
where table_name = 'mobile_devices' and column_name = 'bios_serial_number';


-- 7. AFTER: row-writing migrations landed.
select (select count(*) from outstanding_payment_modes where name = 'IJV')   as ijv_payment_mode,
       (select count(*) from employees)                                      as employees,
       (select count(*) from employee_manager_history where effective_to is null) as open_manager_history;


-- 8. ONLY IF you ran Part 2 (the device wipe).
-- select (select count(*) from mobile_devices)          as live_devices,
--        (select count(*) from mobile_devices_pre_0223) as backed_up;
