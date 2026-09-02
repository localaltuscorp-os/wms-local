-- Weekly Goals redesign — Planning + Review field set (design 2026-06-18).
--
-- ADDITIVE ONLY. Every existing weekly_goals column, index and constraint is
-- left untouched; this migration only ADDs the new Planning/Review fields used
-- by the card-board redesign (weights, per-goal target date, planning notes)
-- and the super-admin Review flow (status, accept %, review notes, archive,
-- review provenance, approval stamp).
--
-- Field mapping recap (reused, NOT duplicated): Client→client, Subject→subject,
-- Goal→target_done, Priority→priority, Incentive→incentive(+incentive_amount),
-- KPI→kpi, % Done→pct_done, Explanation→explanation, Evidence→link_url.
--
-- Idempotent: `add column if not exists` throughout, so it is safe to re-run.
-- Applied via the established idempotent-SQL + one-off tsx path (the drizzle
-- journal is intentionally NOT used here). DO NOT run pnpm db:migrate.

-- Weight: the goal's share of the weekly weighted-completion score.
alter table weekly_goals
  add column if not exists weight integer not null default 100;

-- Per-goal target date (distinct from the Mon→Sun week_start bucket).
alter table weekly_goals
  add column if not exists target_date date;

-- Planning notes (distinct from the review-side `explanation`).
alter table weekly_goals
  add column if not exists notes text;

-- Status — reuses the app-wide Task status enum (same default as tasks.status).
alter table weekly_goals
  add column if not exists status task_status not null default 'not_started';

-- Manager-accepted % (review). NULL = not yet reviewed → effective % falls back
-- to the doer's pct_done.
alter table weekly_goals
  add column if not exists accept_pct integer;

-- Reviewer's notes.
alter table weekly_goals
  add column if not exists review_notes text;

-- Hides the goal from the active board (and from weekly-score aggregates);
-- the row stays queryable.
alter table weekly_goals
  add column if not exists archived boolean not null default false;

-- Review provenance — who reviewed + when.
alter table weekly_goals
  add column if not exists reviewed_by_id uuid references employees(id) on delete set null;
alter table weekly_goals
  add column if not exists reviewed_at timestamptz;

-- Approval stamp — presence means approved + Accept % locked.
alter table weekly_goals
  add column if not exists approved_at timestamptz;

-- accept_pct must be a 0..100 percentage when present.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'weekly_goals_accept_pct_range'
  ) then
    alter table weekly_goals
      add constraint weekly_goals_accept_pct_range
      check (accept_pct is null or (accept_pct >= 0 and accept_pct <= 100));
  end if;
end $$;
