-- ===========================================================================
--  APPLY — Incentive applicability, intern employee type, internship dates
--  Altus WMS | branch Om | source: db/migrations/0244_incentive_applicability_and_intern_type.sql
--  Applied to the Supabase database this branch points at on 2026-09-22.
-- ===========================================================================
--
--  WHAT THIS DOES, IN PLAIN ENGLISH
--
--   1. Repairs `incentive_eligibility`, which never received migration 0232's
--      shape. 0232 used `create table if not exists`, and an older table of the
--      same name (from 0216) already existed around a column called
--      `incentive_id`. The `if not exists` therefore did nothing, and every read
--      of the column the code names — `catalog_id` — failed at runtime with
--      `column "catalog_id" does not exist (42703)`. That took the Incentive
--      Master screen and incentive request submission down. SECTION 0 fixes it:
--      rename the column, add the missing foreign key, and replace the bare
--      unique index with 0232's partial one.
--
--   2. Gives every Incentive Master scheme an explicit audience —
--      ALL_EMPLOYEES (default), FUNCTION or SELECTED_EMPLOYEES — and translates
--      the old sales_eligible / interns_eligible pair into it so that NO scheme
--      changes audience on the day this runs.
--
--   3. Adds the two new request types, Breakthrough Idea and Employment
--      Referral.
--
--   4. Adds `designations.employee_type` and `employees.employee_type`, so that
--      intern status is a stored flag rather than something inferred from the
--      word "intern" in a designation's name. Marks the designations that match
--      the old heuristic once, so no runtime code has to read text again.
--
--   5. Adds `employees.internship_start` and a GENERATED `internship_end`
--      (start + 6 months), so no screen can set a pair that disagrees.
--
--  SAFETY
--
--   * Additive and idempotent. Every statement either guards itself or uses
--     `if not exists`. Re-running changes nothing.
--   * No DELETE, no TRUNCATE, no DROP TABLE, no DROP COLUMN. The only DROP is
--     `drop index if exists incentive_eligibility_pair_uq`, which removes an
--     index, not rows.
--   * Two `update` statements write data, both by design and both narrow:
--     `incentive_catalog.applicability` (§2, translating the old audience rule)
--     and `designations.employee_type` (§8, marking intern designations). Review
--     the two pre-flight queries in the comment block below before running.
--   * `incentive_eligibility` held 0 rows when this ran, so SECTION 0 moved a
--     column name and nothing else.
--
--  RUN: Supabase Dashboard -> SQL Editor -> New query -> paste -> Run
--       or: psql "$DATABASE_URL" -f Change-made/SQL/09-apply-incentive-applicability.sql
--
--  VERIFY AFTERWARDS: 10-verify-incentive-applicability.sql
--
--  Everything below this line is db/migrations/0244_incentive_applicability_and_intern_type.sql,
--  copied verbatim.
-- ===========================================================================

-- 0244 · Incentive applicability (All / Function / Selected employees),
--        two new request types, and Employee Type (intern) as the source of
--        truth for who may earn an incentive.
--
-- ADDITIVE AND IDEMPOTENT, with ONE statement that can change who earns money
-- (§2 below). Nothing is dropped; no column is retyped. Every guard is
-- `if not exists` / `where`-qualified so a re-run is a no-op.
--
-- ════════════════════════════════════════════════════════════════════════════
-- WHAT THIS REPLACES
-- ════════════════════════════════════════════════════════════════════════════
-- Until now the audience of an Incentive Master scheme was decided by two group
-- flags — `sales_eligible` / `interns_eligible` — unless the scheme had EVER had
-- a row in `incentive_eligibility`, in which case those named rows governed
-- outright (lib/incentive/master.ts, `windows.length > 0 ? named : groups`).
--
-- That rule becomes an explicit, stored choice: `applicability` ∈
-- {ALL_EMPLOYEES, FUNCTION, SELECTED_EMPLOYEES}. §2 translates the old rule into
-- the new column so that NOT ONE scheme changes audience on the day this ships.
-- The two flag columns are left in place as legacy (they are still carried by
-- every pre-0244 `incentive_catalog_events` snapshot) but nothing reads them for
-- a decision any more.
--
-- ════════════════════════════════════════════════════════════════════════════
-- RUN THE PRE-FLIGHT FIRST
-- ════════════════════════════════════════════════════════════════════════════
-- §2 is the only statement here that can move money. Before applying, run and
-- read these two counts on the target database — they are exactly the sets §2
-- will touch, and both must be reviewed rather than assumed empty:
--
--   -- (a) schemes that today govern by NAMED rows, incl. removed ones
--   select c.id, c.name, c.active, c.sales_eligible, c.interns_eligible,
--          (select count(*) from incentive_eligibility e where e.catalog_id = c.id) as grants
--     from incentive_catalog c
--    where exists (select 1 from incentive_eligibility e where e.catalog_id = c.id)
--    order by c.name;
--
--   -- (b) schemes that reach NOBODY today (`sales_eligible` false or NULL,
--   --     which after §8's intern rule includes interns-only schemes)
--   select id, name, active, sales_eligible, interns_eligible
--     from incentive_catalog
--    where coalesce(sales_eligible, false) = false
--    order by name;
--
--   -- (c) designations §7 will mark as intern, so the list can be eyeballed
--   select id, name, is_active from designations
--    where lower(name) ~ '\m(intern|trainee|apprentice)\M'
--    order by name;
--
--   -- (d) active employees who will be blocked from their next save (§8)
--   select id, name, employee_code from employees
--    where probation_end is null and is_active = true
--    order by name;

-- ════════════════════════════════════════════════════════════════════════════
-- 0 · REPAIR: `incentive_eligibility` never received 0232's shape
-- ════════════════════════════════════════════════════════════════════════════
-- 0232 defines this table with `create table if not exists` — but by the time it
-- ran, an OLDER `incentive_eligibility` (from 0216, since deleted from the tree)
-- already existed, built around `incentive_id`, with no foreign key and a
-- different unique index. The `if not exists` therefore did nothing at all, and
-- every read of the column that `db/schema.ts` and the application code both
-- name has failed at runtime since:
--
--   Error [PostgresError]: column "catalog_id" does not exist   (code 42703)
--
-- §2 below reads `incentive_eligibility.catalog_id`, so the drift is repaired
-- here or this file cannot apply. Every statement is guarded, and the table is
-- empty on the databases this ships to — the repair moves a NAME, not data.
--
-- On a database built from the migrations in order, 0232 already produced the
-- correct shape and every block below skips itself.
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'incentive_eligibility'
       and column_name = 'incentive_id'
  ) and not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'incentive_eligibility'
       and column_name = 'catalog_id'
  ) then
    alter table incentive_eligibility rename column incentive_id to catalog_id;
  end if;
end $$;

-- The old table carried no foreign key on that column; 0232's definition does.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'incentive_eligibility_catalog_id_fkey'
  ) and not exists (
    select 1 from incentive_eligibility
     where catalog_id is not null
       and catalog_id not in (select id from incentive_catalog)
  ) then
    alter table incentive_eligibility
      add constraint incentive_eligibility_catalog_id_fkey
      foreign key (catalog_id) references incentive_catalog (id) on delete cascade;
  end if;
end $$;

-- 0232's unique index is PARTIAL — one live row per (scheme, employee) while the
-- person is eligible — so somebody removed can be added again later. The old
-- table indexed the bare pair, which forbids exactly that.
drop index if exists incentive_eligibility_pair_uq;
create unique index if not exists incentive_eligibility_current_uq
  on incentive_eligibility (catalog_id, employee_id)
  where removed_effective_from is null;
create index if not exists incentive_eligibility_catalog_idx
  on incentive_eligibility (catalog_id, removed_effective_from);

-- `catalog_id` is NOT NULL in the declaration. A no-op on an empty table today,
-- and a guard against a database that somehow has rows without a scheme.
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'incentive_eligibility'
       and column_name = 'catalog_id' and is_nullable = 'YES'
  ) and not exists (
    select 1 from incentive_eligibility where catalog_id is null
  ) then
    alter table incentive_eligibility alter column catalog_id set not null;
  end if;
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 1 · APPLICABILITY on the Incentive Master
-- ════════════════════════════════════════════════════════════════════════════
-- NOT NULL DEFAULT 'ALL_EMPLOYEES' is the safe landing state for a row nobody
-- has classified yet; §2 immediately corrects the rows for which that default
-- would be wrong. Single-valued on purpose: a scheme cannot be both
-- Function-scoped and Selected-employees-scoped, so a mapping table for the
-- enum would only allow contradictory states.
alter table incentive_catalog
  add column if not exists applicability text not null default 'ALL_EMPLOYEES';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'incentive_catalog_applicability_chk'
  ) then
    alter table incentive_catalog
      add constraint incentive_catalog_applicability_chk
      check (applicability in ('ALL_EMPLOYEES', 'FUNCTION', 'SELECTED_EMPLOYEES'));
  end if;
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 2 · KEEP EVERY EXISTING AUDIENCE EXACTLY AS IT IS
-- ════════════════════════════════════════════════════════════════════════════
-- (a) A scheme with ANY eligibility row — live OR removed — is governed by its
--     named rows today, including after the last person was removed. Saying
--     SELECTED_EMPLOYEES keeps that meaning; leaving it ALL_EMPLOYEES would
--     fall back to the group flags and hand the scheme to everybody, which is
--     the opposite of what the removals meant.
update incentive_catalog c
   set applicability = 'SELECTED_EMPLOYEES'
 where c.applicability = 'ALL_EMPLOYEES'
   and exists (select 1 from incentive_eligibility e where e.catalog_id = c.id);

-- (b) The flag that still means something is `sales_eligible`. The old groups
--     are BINARY and read off the designation — everybody is either "sales" or
--     "interns" — so `sales_eligible = true` already meant "every non-intern
--     employee", which is exactly what ALL_EMPLOYEES now means.
--
--     `sales_eligible` false/NULL therefore reaches NOBODY today, whether or
--     not `interns_eligible` is set: an interns-only scheme (interns true,
--     sales false) is the one case where the flag did reach people, and from
--     this migration on interns cannot earn an incentive at all (the brief's
--     intern rule, §8). SELECTED_EMPLOYEES with zero grants resolves to nobody,
--     which is the truthful translation of both.
--
-- Idempotent: any row (a) already moved is no longer 'ALL_EMPLOYEES'.
update incentive_catalog c
   set applicability = 'SELECTED_EMPLOYEES'
 where c.applicability = 'ALL_EMPLOYEES'
   and c.sales_eligible is not true;

-- `sales_eligible` / `interns_eligible` are DELIBERATELY NOT dropped: dropping
-- is irreversible, and every pre-0244 change-log snapshot carries them.

-- ════════════════════════════════════════════════════════════════════════════
-- 3 · FUNCTION SCOPE — which functions a FUNCTION-scoped scheme covers
-- ════════════════════════════════════════════════════════════════════════════
-- A mapping table rather than a uuid[] on the catalog: `functions` is an
-- admin-managed master (/admin/functions), array elements cannot carry a
-- foreign key, and an incentive must not keep scoping a function that was
-- deleted. The reverse index answers "which incentives apply to Sales", which
-- the function master needs before it lets that function be deactivated.
create table if not exists incentive_function_scope (
  catalog_id  uuid not null references incentive_catalog(id) on delete cascade,
  function_id uuid not null references functions(id)         on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (catalog_id, function_id)
);

create index if not exists incentive_function_scope_function_idx
  on incentive_function_scope (function_id);

-- ════════════════════════════════════════════════════════════════════════════
-- 4 · THE TWO NEW REQUEST TYPES
-- ════════════════════════════════════════════════════════════════════════════
-- 0232 pinned the type vocabulary in a CHECK. `incentive_type` is still NULL-
-- able (schemes that map to no request form — project, sheet, weekly-goal
-- incentives — carry NULL), and the two new keys are APPENDED: existing values
-- are untouched, so no row needs rewriting.
do $$
begin
  if exists (
    select 1 from pg_constraint where conname = 'incentive_catalog_type_chk'
  ) then
    alter table incentive_catalog drop constraint incentive_catalog_type_chk;
  end if;

  alter table incentive_catalog
    add constraint incentive_catalog_type_chk
    check (
      incentive_type is null
      or incentive_type in (
        'bss_conversion', 'sales_pitch', 'client_happiness',
        'group_intro', 'leads_referrals',
        'breakthrough_idea', 'employment_referral'
      )
    );
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 5 · EMPLOYEE TYPE on the DESIGNATION master
-- ════════════════════════════════════════════════════════════════════════════
-- A designation is a row an administrator maintains, so this is where the
-- company rule belongs — not in a substring of a name, which a rename would
-- silently change.
alter table designations
  add column if not exists employee_type text not null default 'employee';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'designations_employee_type_chk'
  ) then
    alter table designations
      add constraint designations_employee_type_chk
      check (employee_type in ('employee', 'intern'));
  end if;
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 6 · EMPLOYEE TYPE override, per person
-- ════════════════════════════════════════════════════════════════════════════
-- NULL is the common case and means "follow the designation". A value is the
-- exception, for the person the company rule does not fit. Effective type is
-- `coalesce(employees.employee_type, designations.employee_type, 'employee')`
-- — written once, in `resolveEmployeeType` (lib/incentive/master.ts).
alter table employees
  add column if not exists employee_type text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'employees_employee_type_chk'
  ) then
    alter table employees
      add constraint employees_employee_type_chk
      check (employee_type is null or employee_type in ('employee', 'intern'));
  end if;
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 7 · INTERNSHIP DATES
-- ════════════════════════════════════════════════════════════════════════════
-- Two statements, so the generated expression cannot reference a base column in
-- the same ALTER TABLE that creates it.
--
-- The END date is a STORED GENERATED column, computed by Postgres from the
-- start. The app never writes it, so a start and an end can never disagree —
-- no action, import or script can set a pair that does not match. 31 Aug + 6
-- months clamps to 28/29 Feb, which is the correct reading of "six months";
-- a NULL start gives a NULL end.
--
-- NOT backfilled: an internship start date is an HR fact that is not derivable
-- from anything already stored, and inventing one would corrupt the record it
-- is meant to preserve.
alter table employees
  add column if not exists internship_start date;

alter table employees
  add column if not exists internship_end date
  generated always as ((internship_start + interval '6 months')::date) stored;

-- ════════════════════════════════════════════════════════════════════════════
-- 8 · THE ONE PLACE DESIGNATION TEXT IS EVER MATCHED
-- ════════════════════════════════════════════════════════════════════════════
-- Materialises the old heuristic ONCE, so that after this migration no runtime
-- code has to read designation text to decide intern status. The pattern is the
-- same one lib/employees/employee-code.ts used (`\m`/`\M` = word boundaries).
--
-- Idempotent by construction: rows it has already marked are no longer
-- 'employee'. Compare the affected count against pre-flight query (c), then set
-- any designation this got wrong at /admin/designations — it is an editable
-- master field, not a migration's last word.
update designations
   set employee_type = 'intern'
 where employee_type = 'employee'
   and lower(name) ~ '\m(intern|trainee|apprentice)\M';

-- ════════════════════════════════════════════════════════════════════════════
-- 9 · WHAT THIS MIGRATION DOES **NOT** DO
-- ════════════════════════════════════════════════════════════════════════════
-- * No `probation_end` backfill and no NOT NULL. Required-ness is enforced where
--   the employee's effective type is known (the `editEmployee` action), because
--   two unrelated features — the leave cycle and the HR-confirmation cron —
--   treat NULL as a real state ("no anchor yet", "not scheduled").
-- * No grant rows are deleted. Switching a scheme away from SELECTED_EMPLOYEES
--   makes its rows unread, not gone; switching back restores the same audience.
-- * No new incentive amount, target or rate column. The rate stays
--   `incentive_catalog.amount`, which is what every screen already reads.
