-- ============================================================================
-- Change-made / SQL / 01-apply-production.sql
--
-- Additive, idempotent SQL for the Incentive + Accounts changes on the `Om`
-- branch. Safe to run more than once: every statement is `if not exists` or is
-- wrapped in a catalog check.
--
-- READ SQL/README.md FIRST. On the Supabase database this branch points at,
-- every object below is ALREADY PRESENT. This file is for a different
-- environment, or as a written record of what the code requires.
--
-- Run with:
--   psql "$DATABASE_URL" -f Change-made/SQL/01-apply-production.sql
-- or paste into Supabase Dashboard -> SQL Editor -> New query -> Run.
--
-- Nothing here drops, truncates or deletes a row.
-- ============================================================================


-- ============================================================================
-- SECTION A — REQUIRED
--
-- 0240_incentive_entry_reversal.sql
--
-- WHY THIS IS THE ONE THAT MATTERS: `db/schema.ts` declares `reversed`,
-- `reversed_at` and `reversed_by_id` on `incentive_entries`, so Drizzle's
-- `select()` expands to include them. Without these columns EVERY query on the
-- table fails with:
--
--     Error [PostgresError]: column "reversed" does not exist   (code 42703)
--
-- which took the whole /incentive page down with a React error boundary. This
-- was the actual live bug fixed on 2026-09-17.
-- ============================================================================

alter table incentive_entries
  add column if not exists reversed       boolean     not null default false,
  add column if not exists reversed_at    timestamptz,
  add column if not exists reversed_by_id uuid references employees(id) on delete set null;

create index if not exists incentive_entries_reversed_idx
  on incentive_entries (reversed);


-- ============================================================================
-- SECTION B — OPTIONAL, DEFENSIVE
--
-- The nine `incentive_requests` ledger columns that `lib/ensure-incentive-schema.ts`
-- lists. Migration 0060 introduces them, and 0060 is recorded as applied in
-- `__schema_applied`, but on the checked database they are ABSENT. That is the
-- documented "the ledger can lie" case (a database restored from a backup
-- inherits the source's history).
--
-- NO CODE PATH READS OR WRITES THESE TODAY — verified by searching for each
-- column as a Drizzle field access. So this block changes nothing about current
-- behaviour. It is included because the moment an INSERT touches one of them,
-- it fails on the first missing column, and the columns are free to add.
--
-- Skip this block if you want the minimum change.
-- ============================================================================

alter table incentive_requests
  add column if not exists amount     integer not null default 0,
  add column if not exists paid       boolean not null default false,
  add column if not exists paid_amt   integer not null default 0,
  add column if not exists paid_date  date,
  add column if not exists conditions jsonb,
  add column if not exists label      text,
  add column if not exists source     text not null default 'form',
  add column if not exists source_ref text,
  add column if not exists archived   boolean not null default false;


-- ============================================================================
-- SECTION C — DO NOT RUN BLINDLY
--
-- 0234_functions_replace_departments.sql
--
-- This is the ONLY statement in the push that MOVES IDENTITY DATA: it copies
-- `departments` into `functions`, re-points `employees.department_id` at the
-- matching function, and NULLs any `department_id` that has no counterpart.
--
-- It is already applied on the Supabase database this branch points at (the
-- `functions` table exists and `employees.department_id` is populated), so
-- there is nothing to do. It is reproduced here only so the requirement is
-- recorded in one place. Check the pre-conditions in 02-verify-production.sql
-- BEFORE running it anywhere else, and take a backup first.
--
-- verify first, using the queries in 02-verify-production.sql, that:
--   (a) `functions` exists and is populated, and
--   (b) no `employees.department_id` points at a department that is missing
--       from `functions` — otherwise that link is silently nulled.
-- ============================================================================

-- begin;

-- -- 1. Carry the departments across.
-- insert into functions (id, name, is_active, sort_order, created_at, updated_at)
-- select d.id, d.name, d.is_active, d.sort_order, d.created_at, d.updated_at
-- from departments d
-- on conflict (id) do nothing;

-- -- 2. Re-point employees whose department_id exists in functions.
-- update employees e
-- set department_id = f.id
-- from functions f
-- where e.department_id is not null
--   and not exists (select 1 from functions x where x.id = e.department_id)
--   and e.department is not null
--   and lower(btrim(e.department)) = lower(f.name);

-- -- 3. Null the ones with no counterpart.
-- update employees
-- set department_id = null
-- where department_id is not null
--   and not exists (select 1 from functions f where f.id = department_id);

-- commit;


-- ============================================================================
-- Section D — objects that must already exist
--
-- These are NOT created here. They are listed so a reader can see what the
-- code depends on, and they are all checked by 02-verify-production.sql.
-- All of them were confirmed present on the checked database.
--
--   tables   incentive_entries, incentive_requests, incentive_catalog,
--            incentive_catalog_events, incentive_notification_deliveries,
--            incentive_payout_events, incentive_participants,
--            incentive_projects, incentive_targets, incentive_config,
--            incentive_eligibility, salary_payments, salary_runs,
--            functions, outstanding_products
--
--   columns  incentive_requests.{split, submission_no, resubmitted_at}
--            incentive_catalog.{incentive_type, product_id, duration, valid_until}
--            salary_payments.{kind, incentive_entry_id, method, month}
--            employees.{department_id, department, official_email,
--                       personal_email, employment_status, account_type,
--                       manager_id}
--            incentive_entries.{booked_amt, accrued_amt, client_status,
--                               payout_run_id, paid_by_id}
-- ============================================================================
