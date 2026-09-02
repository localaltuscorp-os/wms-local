-- WS-4 · Phase A1 — incentive_config singleton.
-- Config for incentive reporting basis + excluded actors, lifted out of the
-- hardcoded EXCLUDED set in lib/queries/incentives.ts. Additive + idempotent;
-- inert until code reads it (behind INCENTIVE_STATUS_OFF). PMS consumes PAID.
create table if not exists incentive_config (
  id               text primary key default 'default',
  pms_basis        text not null default 'paid',   -- 'paid' | 'accrued' | 'booked'
  excluded_names   jsonb not null default '["Manan Vasa","Dattaram Kap","Parvez Khan"]'::jsonb,
  attain_green_pct numeric(6,2) not null default 100,
  attain_amber_pct numeric(6,2) not null default 60,
  updated_by_id    uuid references employees(id) on delete set null,
  updated_at       timestamptz not null default now()
);

insert into incentive_config (id) values ('default') on conflict (id) do nothing;
