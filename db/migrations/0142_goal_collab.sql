-- 0142 — Goals canvas Phase 7 (linked entities + collaboration, design §4.4
-- items 1–3 + §7). ADDITIVE + idempotent. DO NOT run against prod from a build
-- session — apply via the usual idempotent-SQL one-off BEFORE flipping
-- GOALS_CANVAS_ON. Every read/write of these tables/columns in app code is
-- guarded (try/catch → empty fallback), so nothing breaks while unapplied.

-- ────────────────────────────────────────────────────────────────────────────
-- goal_links (§4.4 item 1) — polymorphic link from a goal (cascade `goals`
-- row via goal_id, or weekly leaf via weekly_goal_id — exactly the
-- goal_reviews dual-FK pattern) to another entity: task / project / KPI /
-- incentive / calendar event / department. `ref_id`/`ref_table` point at the
-- linked row when it exists; `label` is a display snapshot taken at link time
-- so the lazy detail bundle NEVER joins six tables (read-budget rule §3.3).
-- `meta` carries kind-specific extras (e.g. a URL) as jsonb.
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists goal_links (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid references goals(id) on delete cascade,
  weekly_goal_id uuid references weekly_goals(id) on delete cascade,
  kind text not null,
  ref_table text,
  ref_id uuid,
  label text not null default '',
  meta jsonb not null default '{}',
  created_by_id uuid references employees(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint goal_links_one_parent check (
    (goal_id is not null)::int + (weekly_goal_id is not null)::int = 1
  ),
  constraint goal_links_kind check (
    kind in ('task','project','kpi','incentive','calendar','department')
  )
);
create index if not exists goal_links_goal_idx on goal_links (goal_id);
create index if not exists goal_links_weekly_idx on goal_links (weekly_goal_id);

-- ────────────────────────────────────────────────────────────────────────────
-- goal_comments (§4.4 item 2) — threaded comments on a goal / weekly goal.
-- One-level threading via parent_id (reply-to). Soft edit trail via edited_at
-- (mirrors the task 'commented' event semantics + 15-min author edit window
-- enforced in the action layer).
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists goal_comments (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid references goals(id) on delete cascade,
  weekly_goal_id uuid references weekly_goals(id) on delete cascade,
  parent_id uuid references goal_comments(id) on delete cascade,
  author_id uuid references employees(id) on delete set null,
  body text not null,
  edited_at timestamptz,
  created_at timestamptz not null default now(),
  constraint goal_comments_one_parent check (
    (goal_id is not null)::int + (weekly_goal_id is not null)::int = 1
  )
);
create index if not exists goal_comments_goal_idx on goal_comments (goal_id, created_at);
create index if not exists goal_comments_weekly_idx on goal_comments (weekly_goal_id, created_at);

-- ────────────────────────────────────────────────────────────────────────────
-- goal_dependencies (§4.4 item 4) — goal↔goal edges + FIRST-CLASS blockers
-- (upgrades the free-text placeholder / team_dependency_pct int). The SOURCE
-- side is polymorphic (goal_id XOR weekly_goal_id). The TARGET side is
-- either another goal (on_goal_id / on_weekly_goal_id) or an external blocker
-- carried as plain text in `label` (both target FKs null). `label` always
-- holds the display snapshot. kind: 'depends_on' (this goal needs the target)
-- or 'blocked_by' (a hard blocker — feeds health). resolved_at closes it.
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists goal_dependencies (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid references goals(id) on delete cascade,
  weekly_goal_id uuid references weekly_goals(id) on delete cascade,
  on_goal_id uuid references goals(id) on delete cascade,
  on_weekly_goal_id uuid references weekly_goals(id) on delete cascade,
  kind text not null default 'depends_on',
  label text not null default '',
  resolved_at timestamptz,
  created_by_id uuid references employees(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint goal_dependencies_one_source check (
    (goal_id is not null)::int + (weekly_goal_id is not null)::int = 1
  ),
  constraint goal_dependencies_kind check (kind in ('depends_on','blocked_by'))
);
create index if not exists goal_dependencies_goal_idx on goal_dependencies (goal_id);
create index if not exists goal_dependencies_weekly_idx on goal_dependencies (weekly_goal_id);
create index if not exists goal_dependencies_on_goal_idx on goal_dependencies (on_goal_id);

-- ────────────────────────────────────────────────────────────────────────────
-- documents reuse (§4.4 item 3) — attachments GALLERY. Nullable FKs onto the
-- existing documents catalogue upgrade the single `evidence_url` slot to
-- many files per goal; storage stays the private `documents` bucket and reads
-- keep the signEvidence 30-min signed-URL semantics.
-- ────────────────────────────────────────────────────────────────────────────
alter table documents
  add column if not exists goal_id uuid references goals(id) on delete set null;
alter table documents
  add column if not exists weekly_goal_id uuid references weekly_goals(id) on delete set null;
create index if not exists documents_goal_idx on documents (goal_id);
create index if not exists documents_weekly_goal_idx on documents (weekly_goal_id);
