-- Migration 0131 — Goals Cascade + Daily Execution (ADDITIVE, load-neutral).
-- NEW tables only + additive `add column if not exists` on weekly_goals.
-- Idempotent: safe to re-run. Apply path (drizzle journal is stale by design):
--   pnpm tsx --env-file=.env.local scripts/apply-0131-goals-cascade.ts
--
-- Tables:  goals (Year/Quarter/Month cascade tree),
--          goal_reviews (append-only dual-rating audit),
--          whatsapp_media_log (media send dedupe + audit).
-- Extends: weekly_goals (month_goal_id link + cascade fields + commit/approve
--          stamps) — the Weekly layer stays on the mature weekly_goals engine.

-- ── goals (Year / Quarter / Month cascade) ──────────────────────────────────
create table if not exists goals (
  id                  uuid primary key default gen_random_uuid(),
  employee_id         uuid not null references employees(id) on delete cascade,
  -- 'year' | 'quarter' | 'month'
  period              text not null,
  -- canonical bucket keyed to the financial year (Apr–Mar):
  --   year '2026' · quarter '2026-Q1' (Q1=Apr–Jun) · month '2026-07'
  period_key          text not null,
  parent_goal_id      uuid references goals(id) on delete set null,
  position            integer not null default 1,
  area                text,
  title               text not null,
  uom                 text,
  target_qty          numeric(14,2),
  actual_qty          numeric(14,2),
  target_amount       numeric(14,2),
  actual_amount       numeric(14,2),
  notes               text,
  -- array of { employeeId? , name? }
  team_involved       jsonb,
  team_dependency_pct integer,
  -- owner self-rating 0..100
  pct_done            integer not null default 0,
  -- reviewer rating; null → effective % falls back to pct_done
  accept_pct          integer,
  review_notes        text,
  evidence_url        text,
  weight              integer not null default 100,
  -- reuses the app-wide task_status enum
  status              task_status not null default 'not_started',
  -- opt-in per period; false = crossed-out (drops node + cascade-drops children)
  adopted             boolean not null default true,
  -- 'manual' | 'cascade' (cascade = auto-generated from parent by ÷)
  source              text not null default 'manual',
  -- carry-over footprint / audit link to the origin row
  cloned_from_id      uuid references goals(id) on delete set null,
  reviewed_by_id      uuid references employees(id) on delete set null,
  reviewed_at         timestamptz,
  created_by_id       uuid references employees(id) on delete set null,
  updated_by_id       uuid references employees(id) on delete set null,
  archived            boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists goals_emp_period_key_idx on goals (employee_id, period, period_key);
create index if not exists goals_parent_idx on goals (parent_goal_id);
create index if not exists goals_period_key_idx on goals (period_key);
create index if not exists goals_cloned_from_idx on goals (cloned_from_id);

-- ── weekly_goals (EXTEND — the Weekly layer) ────────────────────────────────
alter table weekly_goals add column if not exists month_goal_id uuid references goals(id) on delete set null;
alter table weekly_goals add column if not exists area text;
alter table weekly_goals add column if not exists uom text;
alter table weekly_goals add column if not exists target_qty numeric(14,2);
alter table weekly_goals add column if not exists target_amount numeric(14,2);
alter table weekly_goals add column if not exists actual_qty numeric(14,2);
alter table weekly_goals add column if not exists actual_amount numeric(14,2);
alter table weekly_goals add column if not exists team_involved jsonb;
alter table weekly_goals add column if not exists team_dependency_pct integer;
alter table weekly_goals add column if not exists evidence_url text;
alter table weekly_goals add column if not exists adopted boolean not null default true;
alter table weekly_goals add column if not exists committed_at timestamptz;
alter table weekly_goals add column if not exists approved_by_manager_at timestamptz;
create index if not exists weekly_goals_month_goal_idx on weekly_goals (month_goal_id);

-- ── goal_reviews (append-only dual-rating audit, all levels) ─────────────────
create table if not exists goal_reviews (
  id              uuid primary key default gen_random_uuid(),
  goal_id         uuid references goals(id) on delete cascade,
  weekly_goal_id  uuid references weekly_goals(id) on delete cascade,
  period          text,
  self_pct        integer,
  manager_pct     integer,
  reviewer_id     uuid references employees(id) on delete set null,
  note            text,
  evidence_url    text,
  created_at      timestamptz not null default now()
);
create index if not exists goal_reviews_goal_idx on goal_reviews (goal_id);
create index if not exists goal_reviews_weekly_goal_idx on goal_reviews (weekly_goal_id);

-- ── whatsapp_media_log (media send dedupe + audit) ──────────────────────────
create table if not exists whatsapp_media_log (
  id              uuid primary key default gen_random_uuid(),
  recipient_phone text not null,
  -- 'document' | 'image'
  media_kind      text not null,
  template_name   text,
  -- e.g. 'goals_weekly'
  context         text not null,
  -- person+week idempotency key
  ref_key         text not null,
  meta_message_id text,
  status          text,
  error           text,
  created_at      timestamptz not null default now()
);
-- one send per (context, ref_key) → prevents double-send
create unique index if not exists whatsapp_media_log_context_ref_uq on whatsapp_media_log (context, ref_key);
