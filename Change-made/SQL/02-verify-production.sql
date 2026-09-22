-- ============================================================================
-- Change-made / SQL / 02-verify-production.sql
--
-- READ-ONLY. Every statement here is a SELECT. Nothing is created, altered or
-- deleted. Run this before AND after applying 01-apply-production.sql.
--
-- It answers three questions:
--   1. Is anything missing that the Incentive/Accounts code needs?
--   2. Is the reversal fix (0240) in place — the one that caused the live error?
--   3. Is the data sound enough to run the departments -> functions migration?
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Missing tables.  EXPECT: zero rows.
-- ----------------------------------------------------------------------------
select t.name as missing_table
from (values
  ('incentive_entries'),
  ('incentive_requests'),
  ('incentive_catalog'),
  ('incentive_catalog_events'),
  ('incentive_notification_deliveries'),
  ('incentive_payout_events'),
  ('incentive_participants'),
  ('incentive_projects'),
  ('incentive_targets'),
  ('incentive_config'),
  ('incentive_eligibility'),
  ('salary_payments'),
  ('salary_runs'),
  ('functions'),
  ('outstanding_products')
) as t(name)
where not exists (
  select 1 from pg_tables
  where schemaname = 'public' and tablename = t.name
);


-- ----------------------------------------------------------------------------
-- 2. Missing columns.  EXPECT: zero rows.
--
-- The `incentive_requests` block at the end IS expected to report nine rows on
-- the current database — see SECTION B of 01-apply-production.sql. Those columns
-- are unused by the code today, so their absence breaks nothing.
-- ----------------------------------------------------------------------------
select t.tbl as table_name, t.col as missing_column
from (values
  ('incentive_entries', 'reversed'),
  ('incentive_entries', 'reversed_at'),
  ('incentive_entries', 'reversed_by_id'),
  ('incentive_entries', 'booked_amt'),
  ('incentive_entries', 'accrued_amt'),
  ('incentive_entries', 'client_status'),
  ('incentive_entries', 'payout_run_id'),
  ('incentive_entries', 'paid_by_id'),
  ('incentive_requests',  'split'),
  ('incentive_requests',  'submission_no'),
  ('incentive_requests',  'resubmitted_at'),
  ('incentive_catalog',   'incentive_type'),
  ('incentive_catalog',   'product_id'),
  ('incentive_catalog',   'duration'),
  ('incentive_catalog',   'valid_until'),
  ('salary_payments',     'kind'),
  ('salary_payments',     'incentive_entry_id'),
  ('salary_payments',     'method'),
  ('salary_payments',     'month'),
  ('employees',           'department_id'),
  ('employees',           'department'),
  ('employees',           'official_email'),
  ('employees',           'personal_email'),
  ('employees',           'employment_status'),
  ('employees',           'account_type'),
  ('employees',           'manager_id')
) as t(tbl, col)
where not exists (
  select 1 from information_schema.columns
  where table_schema = 'public' and table_name = t.tbl and column_name = t.col
);


-- ----------------------------------------------------------------------------
-- 3. The reversal fix.  EXPECT: both rows present, index listed.
-- ----------------------------------------------------------------------------
select 'column' as kind, column_name as name
from information_schema.columns
where table_schema = 'public' and table_name = 'incentive_entries'
  and column_name in ('reversed', 'reversed_at', 'reversed_by_id')

union all

select 'index' as kind, indexname as name
from pg_indexes
where schemaname = 'public' and indexname = 'incentive_entries_reversed_idx'

order by kind, name;


-- ----------------------------------------------------------------------------
-- 4. Was the migration recorded in the ledger?
--    EXPECT: 0240_incentive_entry_reversal.sql present.
--
--    NOTE: this ledger is NOT authoritative. It can list a migration whose
--    objects are absent (a database restored from a backup inherits the source
--    database's history), which is exactly how the missing `reversed` column
--    went unnoticed. Section 3 is the real answer; this is corroboration.
-- ----------------------------------------------------------------------------
select filename, applied_at
from __schema_applied
where filename in (
  '0229_incentive_request_split.sql',
  '0230_incentive_approval_workflow.sql',
  '0231_incentive_notifications.sql',
  '0232_incentive_master.sql',
  '0234_functions_replace_departments.sql',
  '0240_incentive_entry_reversal.sql'
)
order by filename;


-- ----------------------------------------------------------------------------
-- 5. PRE-CONDITIONS for the departments -> functions migration (0234).
--    Only relevant if you are about to run SECTION C of 01-apply-production.sql.
-- ----------------------------------------------------------------------------
-- 5a. EXPECT: a non-zero function count, at least as many as departments.
select
  (select count(*) from functions)   as functions,
  (select count(*) from departments) as departments;

-- 5b. EXPECT: ZERO rows. Each row here is an employee whose department link
--     would be SILENTLY NULLED by 0234 step 3 — they have a department_id that
--     exists in neither `functions` nor `departments`. Investigate before
--     running the migration.
select e.id, e.name, e.department_id, e.department
from employees e
where e.department_id is not null
  and not exists (select 1 from functions   f where f.id = e.department_id)
  and not exists (select 1 from departments d where d.id = e.department_id)
limit 50;

-- 5c. EXPECT: ZERO rows. `department_id` pointing at a department that is not
--     yet copied into `functions` — a normal, resolvable state BEFORE the
--     migration, and a problem after it.
select count(*) as employees_pointing_at_a_non_function
from employees e
where e.department_id is not null
  and not exists (select 1 from functions f where f.id = e.department_id);


-- ----------------------------------------------------------------------------
-- 6. Sanity: is there incentive money in flight at all?
--
--    Useful before/after a deployment to confirm nothing moved unexpectedly.
--    `reversal` should be <= 0. `paid` is the ledger's own figure and is
--    deliberately NOT reduced by a reversal.
-- ----------------------------------------------------------------------------
select
  count(*)                                      as entries,
  count(*) filter (where reversed)              as reversed_entries,
  coalesce(sum(approved_amt), 0)                as approved_total,
  coalesce(sum(paid_amt), 0)                    as paid_total
from incentive_entries;

select
  count(*)                                                as payment_rows,
  coalesce(sum(amount) filter (where amount >= 0), 0)      as gross_paid,
  coalesce(sum(amount) filter (where amount < 0), 0)       as reversal_total,
  coalesce(sum(amount), 0)                                 as net_paid
from salary_payments
where kind = 'incentive';


-- ----------------------------------------------------------------------------
-- 7. Duplicate-delivery ledger health.
--
--    The unique index is what makes every incentive notification idempotent.
--    EXPECT: the index to be present. Without it, the weekly report card, the
--    paid notice and the new breakup letter can all double-send.
-- ----------------------------------------------------------------------------
select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'incentive_notification_deliveries';


-- ----------------------------------------------------------------------------
-- 8. Delivery claims taken so far, by event — a quick read on what has shipped.
-- ----------------------------------------------------------------------------
select event_type, count(*) as claims, max(created_at) as latest
from incentive_notification_deliveries
group by event_type
order by event_type;
