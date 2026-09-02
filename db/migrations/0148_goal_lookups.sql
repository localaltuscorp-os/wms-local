-- 0148 — Goal Area + Measure lookups (admin-extensible dropdowns).
-- ADDITIVE + idempotent. The goal composer's Area and Measure fields become
-- managed dropdowns: a fixed base set (Revenue/Health/Strategy/Self/Family for
-- Area; Rs./Seats/Nos./Yes-No/NA for Measure) lives in code; admins can add
-- MORE options, which persist here and appear for everyone. `kind` = 'area' |
-- 'measure'. Soft-delete via `active`. Mirrors the accounts_lookups pattern.

create table if not exists goal_lookups (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  value text not null,
  active boolean not null default true,
  sort_order integer,
  created_by_id uuid references employees(id) on delete set null,
  created_at timestamptz not null default now()
);

-- One row per (kind, value) case-insensitively — so "Revenue" can't be added twice.
create unique index if not exists goal_lookups_kind_value_uidx
  on goal_lookups (kind, lower(value));
create index if not exists goal_lookups_kind_idx on goal_lookups (kind);
