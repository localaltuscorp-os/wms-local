-- WS-3 · Phase A2 — salary_config singleton.
-- Confirmed decisions seeded as defaults (see ALTUS-MEGA-CHANGES-MASTER-PROMPT §2).
-- Additive + idempotent; reads are fail-open to these same defaults, so the row
-- merely makes them admin-editable. No behaviour change on landing.
create table if not exists salary_config (
  id                   text primary key default 'default',
  divisor_policy       text not null default 'actual',      -- 'actual' | 'fixed31' | 'fixed30'
  fixed_divisor        integer not null default 31,
  free_training_days   integer not null default 7,          -- unpaid; salary payable from day 8
  default_pt           numeric(14,2) not null default 200,  -- professional tax, per-entity override elsewhere
  salary_day_of_month  integer not null default 10,
  joiner_leave_accrual jsonb not null default '[3,4,3,4,3,4]'::jsonb,  -- months 1..6 for new joiners
  updated_by_id        uuid references employees(id) on delete set null,
  updated_at           timestamptz not null default now()
);

insert into salary_config (id) values ('default') on conflict (id) do nothing;
