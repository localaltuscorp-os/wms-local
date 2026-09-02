-- Migration 0153 — Appraisal v2 (fresh module; appr_* tables).
-- ADDITIVE + idempotent: all NEW tables, safe to re-run. Load-neutral (no
-- existing table touched). The old appraisal_* tables + lib/pms/appraisal stay
-- as-is; this module OWNS the /appraisal route with a fresh data model.
--   pnpm tsx --env-file=.env.local scripts/apply-0153-appraisal-v2.ts
--
-- ONE LIVE ROLLING SCORECARD per employee (no cycles / no archive).
-- Management is the FINAL authority: every item carries Self (advisory) +
-- Manager (advisory) + Management (FINAL) scores. All item scores are 0-100 %.
-- 6 dimensions, admin-adjustable weights summing to 100:
--   Incentive 30 · KPI 30 · Skill 10 · Attitude 20 · Culture 5 · Knowledge 5.

-- ── appr_config — per-employee standing config ──────────────────────────────
create table if not exists appr_config (
  id                 uuid primary key default gen_random_uuid(),
  employee_id        uuid not null unique references employees(id) on delete cascade,
  manager_id         uuid references employees(id) on delete set null,
  management_id      uuid references employees(id) on delete set null,
  dimension_weights  jsonb not null default '{"incentive":30,"kpi":30,"skill":10,"attitude":20,"culture":5,"knowledge":5}'::jsonb,
  incentive_target   numeric(14,2),
  knowledge_do       int not null default 1,
  knowledge_give     int not null default 1,
  updated_by_id      uuid references employees(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- ── appr_kpi — up to 5 KPI rows / employee ──────────────────────────────────
create table if not exists appr_kpi (
  id             uuid primary key default gen_random_uuid(),
  employee_id    uuid not null references employees(id) on delete cascade,
  sr_no          int,
  area           text,
  measure        text,
  sub_weight     int not null default 20,
  created_by_id  uuid references employees(id) on delete set null,
  created_at     timestamptz not null default now()
);

-- ── appr_skill — up to 3 skills-to-learn / employee ─────────────────────────
create table if not exists appr_skill (
  id             uuid primary key default gen_random_uuid(),
  employee_id    uuid not null references employees(id) on delete cascade,
  name           text,
  technical      boolean not null default false,
  sub_weight     int not null default 33,
  created_by_id  uuid references employees(id) on delete set null,
  created_at     timestamptz not null default now()
);

-- ── appr_attitude — the 4 fixed Attitude & Mindset items / employee ─────────
create table if not exists appr_attitude (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references employees(id) on delete cascade,
  -- 'problem_solving' | 'growth_mindset' | 'get_things_done' | 'empower_work'
  key          text not null,
  label        text,
  weight       int not null default 5,
  created_at   timestamptz not null default now()
);

-- ── appr_scorecard — ONE live row / employee ────────────────────────────────
create table if not exists appr_scorecard (
  id               uuid primary key default gen_random_uuid(),
  employee_id      uuid not null unique references employees(id) on delete cascade,
  incentive_score  int,
  incentive_note   text,
  culture_score    int,
  -- 'in_progress' | 'finalized'
  status           text not null default 'in_progress',
  finalized_at     timestamptz,
  updated_by_id    uuid references employees(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ── appr_item_score — one row per scored item (kpi|skill|attitude) ──────────
create table if not exists appr_item_score (
  id                 uuid primary key default gen_random_uuid(),
  employee_id        uuid not null references employees(id) on delete cascade,
  -- 'kpi' | 'skill' | 'attitude'
  item_kind          text not null,
  item_id            uuid not null,
  actual             text,
  evidence_url       text,
  approved           boolean,
  remarks            text,
  self_score         int,
  self_note          text,
  manager_score      int,
  manager_note       text,
  management_score   int,
  management_note    text,
  updated_by_id      uuid references employees(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- ── Indexes ─────────────────────────────────────────────────────────────────
create index if not exists appr_kpi_employee_idx        on appr_kpi (employee_id);
create index if not exists appr_skill_employee_idx      on appr_skill (employee_id);
create index if not exists appr_attitude_employee_idx   on appr_attitude (employee_id);
create index if not exists appr_item_score_employee_idx on appr_item_score (employee_id);
create unique index if not exists appr_item_score_item_uq
  on appr_item_score (item_kind, item_id);
