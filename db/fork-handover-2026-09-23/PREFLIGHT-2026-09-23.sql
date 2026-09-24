-- ════════════════════════════════════════════════════════════════════════════
-- PREFLIGHT — fork delivery of 23 September 2026
--
-- READ-ONLY. Nothing here writes. Run it before running anything else, against
-- OUR production project `mwaijzxuyicysvimzspx`:
--
--   https://supabase.com/dashboard/project/mwaijzxuyicysvimzspx/sql/new
--
-- NOT `fjopgyqytfvbudkwhdto` — that is the fork team's database. The handoff
-- that came with this delivery names theirs and calls it "Correct Supabase
-- project". It is correct for them, not for us. RUN AGAINST THE WRONG REF AND
-- IT LOOKS LIKE IT WORKED: their data changes, ours stays unmigrated.
-- (Our own HANDOFF.md records this exact trap from 15 September.)
--
-- HOW TO READ THE RESULT
--   One row comes back. Every `..._exists` column that is FALSE is a thing
--   still missing on our database. `eligibility_shape` tells you which shape
--   `incentive_eligibility` is in today — read the note under the query.
-- ════════════════════════════════════════════════════════════════════════════

with cols as (
  select table_name, column_name
  from information_schema.columns
  where table_schema = 'public'
)
select
  -- ── the six the handoff names ─────────────────────────────────────────────
  to_regclass('public.visibility_grants')            as visibility_grants_exists,
  to_regclass('public.activity_logs')                as activity_logs_exists,
  to_regclass('public.daily_sessions')               as daily_sessions_exists,
  to_regclass('public.roles')                        as roles_exists,
  to_regclass('public.role_permissions')             as role_permissions_exists,
  to_regclass('public.employee_roles')               as employee_roles_exists,
  to_regclass('public.incentive_function_scope')     as incentive_function_scope_exists,

  -- ── the two the handoff MISSES but its own files insist on ────────────────
  -- 0242_wcc_minutes: its header says "RUN IT BEFORE DEPLOYING: db/schema.ts
  -- names the column" — and the fork's schema.ts does (dccKpiItems.minutes).
  exists (select 1 from cols
           where table_name = 'dcc_kpi_items' and column_name = 'minutes')
                                                     as dcc_kpi_items_minutes_exists,
  -- 0244_module_backup: "Apply BEFORE deploying the code."
  to_regclass('public.module_backup_settings')       as module_backup_settings_exists,
  to_regclass('public.module_backup_runs')           as module_backup_runs_exists,

  -- ── columns 0244 touches ─────────────────────────────────────────────────
  exists (select 1 from cols
           where table_name = 'incentive_catalog'
             and column_name = 'applicability')       as incentive_applicability_exists,
  exists (select 1 from cols
           where table_name = 'employees'
             and column_name = 'employee_type')       as employee_type_exists,

  -- ── incentive_eligibility: which shape is it? ────────────────────────────
  --  'legacy_incentive_id' → Rakesh's 0216 table. 0244 RENAMES the column.
  --  'dated_catalog_id'    → already 0244's shape.
  --  'table_absent'        → neither; stop and look.
  case
    when to_regclass('public.incentive_eligibility') is null then 'table_absent'
    when exists (select 1 from cols where table_name = 'incentive_eligibility'
                   and column_name = 'catalog_id') then 'dated_catalog_id'
    when exists (select 1 from cols where table_name = 'incentive_eligibility'
                   and column_name = 'incentive_id') then 'legacy_incentive_id'
    else 'unexpected_shape'
  end                                                as eligibility_shape,
  -- 0244 backfills `effective_from = current_date` on every existing row, so
  -- how many rows there are decides whether that is a no-op or a real change.
  (select count(*) from incentive_eligibility)       as eligibility_rows,

  -- ── earlier fork-only work (0225–0241) — none of it is on our main ───────
  to_regclass('public.hr_assets')                    as hr_assets_exists,
  to_regclass('public.ops_vendors')                  as ops_vendors_exists,
  to_regclass('public.billing_documents')            as billing_documents_exists,
  to_regclass('public.billing_contracts')            as billing_contracts_exists,
  to_regclass('public.ce_engagements')               as ce_engagements_exists,
  to_regclass('public.exec_calendar_events')         as exec_calendar_events_exists,
  exists (select 1 from cols
           where table_name = 'dcc_entries'
             and column_name = 'completed_quantity')  as dcc_entries_completed_qty_exists,
  exists (select 1 from cols
           where table_name = 'dcc_kpi_items'
             and column_name = 'mcc_frequency')       as dcc_mcc_frequency_exists;

-- ────────────────────────────────────────────────────────────────────────────
-- IF `eligibility_shape` = 'legacy_incentive_id'
-- ────────────────────────────────────────────────────────────────────────────
-- Then migration `0244_incentive_applicability_and_intern_type.sql` will RENAME
-- that column to `catalog_id`. Our LIVE code reads `incentive_id`:
--
--   db/schema.ts:3669                      incentiveId: uuid("incentive_id")
--   lib/queries/incentive-eligibility.ts   .where(eq(incentiveEligibility.incentiveId, …))
--
-- So running 0244 on its own — before the fork's code is merged and deployed —
-- breaks the Incentive Eligibility screen that works in production today, with
-- `column "incentive_id" does not exist` (42703).
--
-- 0244 is the ONE file in this delivery that is not safe to run ahead of the
-- deploy. Everything else in the list is additive: new tables and new columns
-- that nothing currently reads.
-- ────────────────────────────────────────────────────────────────────────────
