-- 0146 — Appraisal module (consolidates Performance /pms + 360 Review +
-- Signals into ONE /appraisal multi-dimension scoring engine).
-- ADDITIVE + idempotent. WRITTEN, NOT APPLIED — apply via the usual idempotent
-- SQL one-off BEFORE flipping the module on (module ships behind APPRAISAL_OFF,
-- lib/pms/appraisal-flag.ts; when off, /appraisal redirects to /pms and the
-- old pages stand untouched).
--
-- Scoring law per hand-scored item: Self (+justification, optional attachment)
-- → Manager (+MANDATORY explanation) → Management (+explanation) → Final.
-- Relative max score = sub_weight% × dimension weight.
-- Culture reuses the pms_constitution_para pool (PMS v3): 3 items auto-
-- assigned per month SERIAL-WISE, rated together as ONE item.
--
-- NOTE: the appraisal_culture_assignments FK to pms_constitution_para assumes
-- the PMS v3 DDL is already applied (it is — v3 is live behind PMS_V3).

-- One cycle per period ('YYYY-MM' — monthly, matching the Culture cadence).
create table if not exists appraisal_cycles (
  id uuid primary key default gen_random_uuid(),
  period text not null,
  label text,
  status text not null default 'draft',
  opens_on date,
  closes_on date,
  created_by_id uuid references employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint appraisal_cycles_status_chk check (
    status in ('draft','open','review','finalized','archived')
  )
);
create unique index if not exists appraisal_cycles_period_uq on appraisal_cycles (period);

-- Singleton config (id 'default') — dimension weights (sums to 100), rating-
-- term bands, incentive target %, knowledge-sharing rule, culture cadence.
-- ADMIN-EDITABLE; the score engine reads ONLY this (no weight is hardcoded).
create table if not exists appraisal_config (
  id text primary key default 'default',
  dimension_weights jsonb not null default '{}',
  rating_terms jsonb not null default '[]',
  incentive_target_pct numeric(6,2) not null default 20,
  knowledge_sharing_rule jsonb not null default '{"do":6,"give":4}',
  culture_per_month integer not null default 3,
  updated_by_id uuid references employees(id) on delete set null,
  updated_at timestamptz not null default now()
);

-- Seed the sensible 100-sum default (from sir's table, reconciled with the
-- verbal "Incentive 30" into one whole). Mirrors
-- DEFAULT_APPRAISAL_DIMENSION_WEIGHTS / DEFAULT_APPRAISAL_RATING_TERMS in
-- db/enums.ts. Non-managers drop problem_solving/growth_mindset/ability and
-- the engine renormalises.
insert into appraisal_config (id, dimension_weights, rating_terms)
values (
  'default',
  '{
    "kpi": 25,
    "skill": 15,
    "attitude": 10,
    "incentive": 20,
    "culture": 10,
    "knowledge_sharing": 5,
    "problem_solving": 5,
    "growth_mindset": 5,
    "ability": 5
  }'::jsonb,
  '[
    {"min": 90, "label": "Outstanding"},
    {"min": 75, "label": "Exceeds Expectations"},
    {"min": 60, "label": "Meets Expectations"},
    {"min": 40, "label": "Needs Improvement"},
    {"min": 0,  "label": "Unsatisfactory"}
  ]'::jsonb
)
on conflict (id) do nothing;

-- One scorable line per (cycle, employee, dimension): a KPI row, one of ≤3
-- skills, one of ≤3 attitude items, the auto incentive line, the month's
-- Culture trio (ONE item; para ids in meta), the auto knowledge-sharing line,
-- or a manager-only Y/N one-liner.
create table if not exists appraisal_items (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references appraisal_cycles(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade,
  dimension text not null,
  sort_order integer not null default 100,
  area text,
  title text not null,
  measure text,
  sub_weight numeric(6,2) not null default 0,
  is_technical boolean,
  is_manager_only boolean not null default false,
  is_auto boolean not null default false,
  status text not null default 'draft',
  -- KPI-dimension columns (admin fills + approves before publish)
  actual_value text,
  evidence text,
  admin_approved boolean,
  admin_remarks text,
  meta jsonb not null default '{}',
  created_by_id uuid references employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint appraisal_items_dimension_chk check (
    dimension in ('kpi','skill','attitude','incentive','culture',
                  'knowledge_sharing','problem_solving','growth_mindset','ability')
  ),
  constraint appraisal_items_status_chk check (
    status in ('draft','awaiting_self','awaiting_manager','awaiting_management','finalized')
  )
);
create index if not exists appraisal_items_cycle_emp_idx on appraisal_items (cycle_id, employee_id);
create index if not exists appraisal_items_emp_dim_idx on appraisal_items (employee_id, dimension);
create index if not exists appraisal_items_status_idx on appraisal_items (status);

-- ONE score row per item — all three stages + the computed final. Manager
-- explanation is MANDATORY (enforced in the server action, not the DB).
create table if not exists appraisal_scores (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references appraisal_items(id) on delete cascade,
  self_score numeric(6,2),
  self_justification text,
  self_submitted_at timestamptz,
  manager_id uuid references employees(id) on delete set null,
  manager_score numeric(6,2),
  manager_explanation text,
  manager_submitted_at timestamptz,
  management_id uuid references employees(id) on delete set null,
  management_score numeric(6,2),
  management_explanation text,
  management_submitted_at timestamptz,
  max_score numeric(6,2),
  final_score numeric(6,2),
  finalized_by_id uuid references employees(id) on delete set null,
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists appraisal_scores_item_uq on appraisal_scores (item_id);

-- Evidence attachments per item + stage (Supabase `documents` bucket).
create table if not exists appraisal_attachments (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references appraisal_items(id) on delete cascade,
  stage text not null default 'self',
  uploaded_by_id uuid references employees(id) on delete set null,
  storage_path text not null,
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz not null default now(),
  constraint appraisal_attachments_stage_chk check (
    stage in ('self','manager','management','final')
  )
);
create index if not exists appraisal_attachments_item_idx on appraisal_attachments (item_id);

-- Culture rotation: Constitution paragraph → month, serial-wise. The pool +
-- order is pms_constitution_para (position/active — the admin menu-card edits
-- that); this table records which 3 landed in which month.
create table if not exists appraisal_culture_assignments (
  id uuid primary key default gen_random_uuid(),
  period text not null,
  para_id uuid not null references pms_constitution_para(id) on delete cascade,
  serial integer not null,
  created_by_id uuid references employees(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index if not exists appraisal_culture_period_para_uq
  on appraisal_culture_assignments (period, para_id);
create unique index if not exists appraisal_culture_period_serial_uq
  on appraisal_culture_assignments (period, serial);
create index if not exists appraisal_culture_period_idx
  on appraisal_culture_assignments (period);
