-- 0147 — Goals: incentive + Monthly-Master link (goal edit-drawer rework).
-- ADDITIVE + idempotent. WRITTEN, NOT APPLIED — apply via the usual idempotent
-- SQL one-off. Every column is nullable / has a default, so existing rows and
-- the flag-OFF CascadeWorkspace are untouched while unapplied; the new drawer
-- fields simply won't persist until this lands.
--
-- Adds to `goals`:
--   incentive_enabled  — Yes/No incentive toggle (default false).
--   incentive_amount   — numeric(14,2), the "How much (₹)" (null when disabled).
--   incentive_kind     — 'one_time' | 'repetitive' | 'milestone' (null = unset).
--   monthly_master_ref — jsonb {kind,id,label} snapshot of the picked Monthly
--                        Events Master item (obligation / batch). Nullable; the
--                        label is a display snapshot taken at pick time so the
--                        board never joins the events-master tables to render it.

alter table goals add column if not exists incentive_enabled boolean not null default false;
alter table goals add column if not exists incentive_amount numeric(14,2);
alter table goals add column if not exists incentive_kind text;
alter table goals add column if not exists monthly_master_ref jsonb;

-- Guard the incentive_kind vocabulary (idempotent — drop+recreate is cheap and
-- safe since the column is fresh/nullable).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'goals_incentive_kind_chk'
  ) then
    alter table goals add constraint goals_incentive_kind_chk
      check (incentive_kind is null or incentive_kind in ('one_time','repetitive','milestone'));
  end if;
end $$;
