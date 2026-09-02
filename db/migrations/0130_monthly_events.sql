-- Migration 0130 — Monthly Events Master (ADDITIVE, load-neutral).
-- NEW tables only + one nullable column on employees. Idempotent: safe to
-- re-run. Apply path (drizzle journal is stale by design):
--   pnpm tsx --env-file=.env.local scripts/apply-0130-monthly-events.ts
--
-- Tables: event_categories, event_batch_types, event_batch_schedules,
--         calendar_events, holidays, obligations, obligation_completions.
-- Plus: employees.religion (nullable text).

-- ── event_categories ────────────────────────────────────────────────────────
create table if not exists event_categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  color       text not null,
  sort_order  integer not null default 100,
  is_active   boolean not null default true,
  created_by_id uuid references employees(id) on delete set null,
  updated_by_id uuid references employees(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ── event_batch_types ───────────────────────────────────────────────────────
create table if not exists event_batch_types (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  default_category_id uuid references event_categories(id) on delete set null,
  sort_order  integer not null default 100,
  is_active   boolean not null default true,
  created_by_id uuid references employees(id) on delete set null,
  updated_by_id uuid references employees(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ── event_batch_schedules ───────────────────────────────────────────────────
create table if not exists event_batch_schedules (
  id            uuid primary key default gen_random_uuid(),
  batch_type_id uuid not null references event_batch_types(id) on delete cascade,
  name          text,
  start_date    date not null,
  end_date      date not null,
  start_min     integer,
  end_min       integer,
  days_of_week  integer[],
  category_id   uuid references event_categories(id) on delete set null,
  status        text not null default 'confirmed',
  location      text,
  notes         text,
  is_active     boolean not null default true,
  created_by_id uuid references employees(id) on delete set null,
  updated_by_id uuid references employees(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists event_batch_schedules_type_idx on event_batch_schedules (batch_type_id);
create index if not exists event_batch_schedules_range_idx on event_batch_schedules (start_date, end_date);

-- ── obligations (declared before calendar_events for the FK) ─────────────────
create table if not exists obligations (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  counterparty  text,
  cadence       text not null default 'monthly',
  target_count  integer not null default 1,
  is_compulsory boolean not null default true,
  penalty_note  text,
  category_id   uuid references event_categories(id) on delete set null,
  is_active     boolean not null default true,
  created_by_id uuid references employees(id) on delete set null,
  updated_by_id uuid references employees(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ── event_holidays ──────────────────────────────────────────────────────────
-- NOTE: NOT named `holidays` — that table already exists (Attendance Phase B,
-- migration 0059) with a different shape. This is the Monthly Events Master
-- holiday master; the module's row type is still exported as `Holiday`.
create table if not exists event_holidays (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  fy_start_year     integer not null,
  holiday_date      date not null,
  applies_to        text not null default 'all',
  is_optional       boolean not null default false,
  is_office_closed  boolean not null default true,
  is_festival_marker boolean not null default false,
  is_exam_marker    boolean not null default false,
  notes             text,
  created_by_id     uuid references employees(id) on delete set null,
  updated_by_id     uuid references employees(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint event_holidays_name_fy_date_uidx unique (name, fy_start_year, holiday_date)
);
create index if not exists event_holidays_fy_idx on event_holidays (fy_start_year, holiday_date);

-- ── calendar_events (core) ──────────────────────────────────────────────────
create table if not exists calendar_events (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  category_id   uuid references event_categories(id) on delete set null,
  color_override text,
  event_date    date not null,
  start_min     integer,
  end_min       integer,
  all_day       boolean not null default false,
  status        text not null default 'confirmed',
  location      text,
  notes         text,
  source        text not null default 'manual',
  source_ref_id uuid,
  is_locked     boolean not null default false,
  obligation_id uuid references obligations(id) on delete set null,
  created_by_id uuid references employees(id) on delete set null,
  updated_by_id uuid references employees(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists calendar_events_date_idx on calendar_events (event_date);
create index if not exists calendar_events_source_idx on calendar_events (source, source_ref_id);
create index if not exists calendar_events_obligation_idx on calendar_events (obligation_id);

-- ── obligation_completions ──────────────────────────────────────────────────
create table if not exists obligation_completions (
  id              uuid primary key default gen_random_uuid(),
  obligation_id   uuid not null references obligations(id) on delete cascade,
  fy_start_year   integer not null,
  period_month    integer not null,
  completed_count integer not null default 0,
  note            text,
  created_by_id   uuid references employees(id) on delete set null,
  updated_by_id   uuid references employees(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint obligation_completions_uidx unique (obligation_id, fy_start_year, period_month)
);

-- ── employees.religion (nullable) ───────────────────────────────────────────
alter table employees add column if not exists religion text;

-- ── Seed: default event_categories (editable) ───────────────────────────────
insert into event_categories (name, color, sort_order) values
  ('PS',              '#F5D90A', 10),
  ('BSS',             '#FBEEB0', 20),
  ('Lead Generation', '#F6A6A0', 30),
  ('Consulting',      '#14B8A6', 40),
  ('Meetings',        '#6366F1', 50),
  ('Personal',        '#EC4899', 60),
  ('Family',          '#F59E0B', 70),
  ('Travel',          '#0EA5E9', 80),
  ('Reserved',        '#94A3B8', 90),
  ('Training',        '#8B5CF6', 100),
  ('Conclave',        '#EF4444', 110)
on conflict (name) do nothing;

-- ── Seed: default event_batch_types (default_category_id via name lookup) ────
insert into event_batch_types (name, default_category_id, sort_order) values
  ('PS Batch Schedule',  (select id from event_categories where name = 'PS'),       10),
  ('BSS Batch Schedule', (select id from event_categories where name = 'BSS'),      20),
  ('Altus Conclave',     (select id from event_categories where name = 'Conclave'), 30),
  ('Graduate Event',     (select id from event_categories where name = 'Training'), 40)
on conflict (name) do nothing;
