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
-- ── NOTE (merge, 2026-09-19): THE TWO SECTIONS BELOW ARE HISTORY ──────────
-- They describe the eligibility table this migration used to create. It no
-- longer does — see section 2. Per-employee eligibility is Rohan's 0216
-- (`incentive_eligibility` + `incentive_catalog.applies_to_all`), where a
-- removal DELETES the row and the effective date lives on the change event.
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
--
-- REMOVED at merge (2026-09-19). This section created its own
-- `incentive_eligibility` — catalog_id, effective_from, removed_effective_from,
-- added/removed_by — with a partial unique index over live grants. Rohan's
-- migration 0216 had already created a table of the SAME NAME with a different
-- shape (incentive_id, employee_id, one row per pair; `applies_to_all` on the
-- catalog), and that one reached main and staging first. `create table if not
-- exists` silently skipped this one, and the index below it then failed on real
-- Postgres: `column "removed_effective_from" does not exist`.
--
-- The decision recorded in HANDOFF-Production-DB.md is to keep Rohan's table.
-- The Incentive Master now reads and writes it (lib/queries/incentive-master.ts,
-- app/(admin)/admin/incentive-master/actions.ts). If dated eligibility is
-- genuinely required, it is a NEW migration agreed with Rohan — not this one.

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
