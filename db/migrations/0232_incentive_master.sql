-- 0232 · Admin Panel → Incentive → Incentive Master + Incentive Chart
--
-- ADDITIVE ONLY. Four new columns on the existing Incentive Master, one new
-- table for per-employee eligibility, one new column on the change log. No
-- existing column is dropped, renamed or re-typed, and nothing that already
-- reads `incentive_catalog` has to change to keep working.
--
-- ── WHY NOT A NEW "incentives" TABLE ───────────────────────────────────────
-- `incentive_catalog` IS the Incentive Master — the "3.Incentive Chart" the
-- Incentive Table dialog shows, the prices the dashboard values approvals at
-- (lib/incentive/analytics/model.ts), and what weekly_goals.incentive_catalog_id
-- points to. A second table would mean two answers to "what does a Google
-- Review pay", and eventually two different ones. So the fields the brief adds
-- are columns here.
--
-- ── ELIGIBILITY BECOMES PER-EMPLOYEE, WITHOUT BREAKING THE GROUPS ──────────
-- Until now eligibility was two flags — `sales_eligible` / `interns_eligible` —
-- resolved against an employee's designation
-- (lib/incentive/notifications/eligibility.ts). The brief asks for named
-- employees, added and removed with an effective date, which those flags cannot
-- express.
--
-- Both are kept, and `incentive_eligibility` WINS WHERE IT EXISTS: an incentive
-- with at least one eligibility row is governed by those rows; one with none
-- keeps the group flags exactly as it behaves today. That is what lets this
-- migration run against live data without silently changing who is eligible for
-- anything, and without a backfill that would guess at names.
--
-- ── REMOVAL IS A DATE, NOT A DELETE ────────────────────────────────────────
-- "When removing an employee, record the effective date." So removal sets
-- `removed_effective_from` and the row stays. Eligibility is therefore a
-- history, and "who was eligible on 3 Jun" is answerable. Nothing here deletes
-- requests, approvals, resubmissions or payments — none of those reference the
-- Master at all (incentive_requests / incentive_entries carry no catalog FK,
-- and weekly_goals' reference is ON DELETE SET NULL).

-- ── 1 · The Master's new fields ──────────────────────────────────────────────

alter table incentive_catalog
  -- Which request type this scheme prices, from the existing INCENTIVE_TYPES
  -- vocabulary (db/enums.ts). Nullable: project, sheet and weekly-goal
  -- incentives are real rows here and map to no request form.
  add column if not exists incentive_type text,
  -- "Product where applicable — pull from Admin Panel → Products." The SAME
  -- product master every other dropdown reads (`outstanding_products`, served
  -- by lib/queries/products.ts). Never a text copy of a product name: renaming
  -- a product must not leave a stale name behind here.
  add column if not exists product_id uuid references outstanding_products(id) on delete set null,
  -- Permanent (runs until switched off) or One-Time (a single campaign).
  add column if not exists duration text not null default 'permanent',
  -- Optional last day the incentive applies. Independent of `active`: a scheme
  -- can be switched off before it expires, and an expired one can still be
  -- marked active without paying anything.
  add column if not exists valid_until date;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'incentive_catalog_duration_chk'
  ) then
    alter table incentive_catalog
      add constraint incentive_catalog_duration_chk
      check (duration in ('permanent', 'one_time'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'incentive_catalog_type_chk'
  ) then
    -- Mirrors INCENTIVE_TYPES in db/enums.ts. Null is allowed (see above).
    alter table incentive_catalog
      add constraint incentive_catalog_type_chk
      check (
        incentive_type is null
        or incentive_type in (
          'bss_conversion', 'sales_pitch', 'client_happiness',
          'group_intro', 'leads_referrals'
        )
      );
  end if;
end $$;

create index if not exists incentive_catalog_active_name_idx
  on incentive_catalog (active, name);

-- ── 2 · Per-employee eligibility (the Incentive Chart) ───────────────────────

create table if not exists incentive_eligibility (
  id                     uuid primary key default gen_random_uuid(),
  -- Cascades: an incentive that no longer exists has no eligibility. The
  -- "deleted" event in incentive_catalog_events keeps the snapshot of who was
  -- eligible at the moment it went, so the record is not lost with the rows.
  catalog_id             uuid not null references incentive_catalog(id) on delete cascade,
  employee_id            uuid not null references employees(id) on delete cascade,
  -- The day eligibility starts. Chosen by the person making the change.
  effective_from         date not null,
  -- Null = still eligible. Set on removal, never deleted.
  removed_effective_from date,
  added_by_id            uuid references employees(id) on delete set null,
  removed_by_id          uuid references employees(id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  -- A removal cannot predate the grant it ends.
  constraint incentive_eligibility_window_chk
    check (removed_effective_from is null or removed_effective_from >= effective_from),
  -- Removed => we know who removed it and when the row was touched.
  constraint incentive_eligibility_removed_chk
    check (removed_effective_from is not null or removed_by_id is null)
);

-- AT MOST ONE LIVE GRANT per person per incentive. The partial unique index is
-- what makes "add the same employee twice" impossible in the database rather
-- than only in the action, while still allowing a full history of earlier
-- grants that were removed.
create unique index if not exists incentive_eligibility_current_uq
  on incentive_eligibility (catalog_id, employee_id)
  where removed_effective_from is null;

create index if not exists incentive_eligibility_catalog_idx
  on incentive_eligibility (catalog_id, removed_effective_from);

create index if not exists incentive_eligibility_employee_idx
  on incentive_eligibility (employee_id, removed_effective_from);

-- ── 3 · The change log carries the chosen effective date ─────────────────────
--
-- 0231 used `created_at` as the effective date of any eligibility change, which
-- was right when eligibility could only change at the moment of the edit. Now
-- that a date is chosen, the notification must say the chosen one — "no longer
-- eligible with effect from 1 Oct" — not the day the button was pressed.
-- Nullable, and readers fall back to `created_at`, so every event already
-- written keeps the meaning it had.
alter table incentive_catalog_events
  add column if not exists effective_date date;
