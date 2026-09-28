-- RUN-IN-SUPABASE-0245.sql — DD Master (dropdown master).
-- Paste this whole file into Supabase → SQL Editor → New query → Run.
-- Additive, idempotent, safe to run twice. See db/migrations/0245_dd_options.sql
-- for the same content with commentary.

create table if not exists dd_options (
  id          uuid primary key default gen_random_uuid(),
  list_key    text not null,
  code        text not null,
  label       text not null,
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_by  uuid references employees(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index if not exists dd_options_key_code_uidx on dd_options (list_key, code);
create index if not exists dd_options_key_active_idx on dd_options (list_key, is_active, sort_order);

insert into dd_options (list_key, code, label, sort_order)
select 'batch_number', n::text, n::text, n
from generate_series(78, 110) as n
on conflict (list_key, code) do nothing;

insert into dd_options (list_key, code, label, sort_order) values
  ('handholding_calls', 'onboarding_call', 'Onboarding Call', 1),
  ('handholding_calls', 'check_in_call', 'Check-in Call', 2),
  ('handholding_calls', 'review_call', 'Review Call', 3)
on conflict (list_key, code) do nothing;

insert into dd_options (list_key, code, label, sort_order) values
  ('product_names', 'ps', 'PS', 1),
  ('product_names', 'bss', 'BSS', 2),
  ('product_names', 'consulting', 'Consulting', 3)
on conflict (list_key, code) do nothing;

-- Verify:
-- select list_key, count(*) from dd_options group by list_key order by list_key;
