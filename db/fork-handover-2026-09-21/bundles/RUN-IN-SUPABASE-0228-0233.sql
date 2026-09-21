-- ============================================================================
-- RUN IN SUPABASE SQL EDITOR — MIGRATIONS 0228 to 0233
-- Generated for Vinal branch (2026-09-15)
-- All statements are IDEMPOTENT and safe to run multiple times.
-- ============================================================================

-- ── 0228 — Category on Job Description ─────────────────────────────────────
alter table jd_entries add column if not exists category text;


-- ── 0229 — Daily Compliance Google Calendar Sync ───────────────────────────
create table if not exists dcc_calendar_events (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  event_date date not null,
  google_event_id text,
  synced_hash text,
  snapshot_at timestamptz,
  synced_at timestamptz,
  last_error text,
  attempts integer not null default 0,
  updated_at timestamptz not null default now()
);

create unique index if not exists dcc_calendar_events_uq
  on dcc_calendar_events (employee_id, event_date);


-- ── 0230 — DCC Masters (Position Templates & Live Linking) ─────────────────
create table if not exists dcc_master_items (
  id uuid primary key default gen_random_uuid(),
  designation_id uuid not null references designations(id) on delete cascade,
  section text,
  code text,
  title text not null,
  frequency text,
  target_number numeric(14, 2),
  unit text,
  sort_order integer not null default 100,
  is_active boolean not null default true,
  created_by_id uuid references employees(id) on delete set null,
  updated_by_id uuid references employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists dcc_master_items_designation_idx
  on dcc_master_items (designation_id, is_active, sort_order);

create table if not exists dcc_master_links (
  item_id uuid primary key references dcc_kpi_items(id) on delete cascade,
  master_item_id uuid not null references dcc_master_items(id) on delete cascade,
  owner_employee_id uuid not null references employees(id) on delete cascade,
  created_at timestamptz not null default now()
);

create unique index if not exists dcc_master_links_owner_master_uq
  on dcc_master_links (owner_employee_id, master_item_id);


-- ── 0231 — Approver / Initiator Status (Tasks, Goals, Weekly Goals) ───────
-- Add 'on_hold' to approval_status enum if not present
alter type approval_status add value if not exists 'on_hold';

create table if not exists goal_approver_statuses (
  goal_id uuid primary key references goals(id) on delete cascade,
  approval_status text not null check (approval_status in ('approved', 'not_approved', 'on_hold', 'cancelled')),
  set_by_id uuid references employees(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists weekly_goal_approver_statuses (
  weekly_goal_id uuid primary key references weekly_goals(id) on delete cascade,
  approval_status text not null check (approval_status in ('approved', 'not_approved', 'on_hold', 'cancelled')),
  set_by_id uuid references employees(id) on delete set null,
  updated_at timestamptz not null default now()
);


-- ── 0232 — Recruitment JDs (HR Candidate Job Descriptions & Sends) ─────────
create table if not exists recruitment_jds (
  id uuid primary key default gen_random_uuid(),
  position_id uuid not null unique references interview_positions(id) on delete restrict,
  master_content jsonb,
  master_updated_by_id uuid references employees(id) on delete set null,
  master_updated_at timestamptz,
  recruiter_content jsonb,
  recruiter_updated_by_id uuid references employees(id) on delete set null,
  recruiter_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists recruitment_jd_sends (
  id uuid primary key default gen_random_uuid(),
  jd_id uuid references recruitment_jds(id) on delete set null,
  position_label text not null,
  channel text not null check (channel in ('whatsapp', 'email')),
  recipient_name text,
  recipient_phone text,
  recipient_email text,
  content jsonb not null,
  status text not null check (status in ('opened', 'sent', 'failed')),
  error text,
  sent_by_id uuid references employees(id) on delete set null,
  sent_at timestamptz not null default now()
);

create index if not exists recruitment_jd_sends_jd_idx on recruitment_jd_sends (jd_id, sent_at desc);


-- ── 0233 — Person-Specific Job Descriptions ─────────────────────────────────
alter table jd_entries alter column position_id drop not null;

alter table jd_entries
  add column if not exists owner_employee_id uuid references employees(id) on delete cascade;

alter table jd_entries drop constraint if exists jd_entries_owner_chk;
alter table jd_entries
  add constraint jd_entries_owner_chk check ((position_id is null) <> (owner_employee_id is null));

create index if not exists jd_entries_owner_employee_idx on jd_entries (owner_employee_id, is_active);
