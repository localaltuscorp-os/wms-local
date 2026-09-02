-- 0143 — Goals canvas Phase 8 (AI insight layer, design §4.4 item 7 + §5
-- Phase 8). ADDITIVE + idempotent. DO NOT run against prod from a build
-- session — apply via the usual idempotent-SQL one-off BEFORE flipping
-- GOALS_CANVAS_ON. Every read/write of this table in app code is guarded
-- (try/catch → empty fallback), so nothing breaks while unapplied.

-- ────────────────────────────────────────────────────────────────────────────
-- goal_ai_insights — ONE cached insight row per goal (dual-FK goal_id XOR
-- weekly_goal_id, the goal_reviews pattern; v1 generation writes cascade rows
-- only, the weekly leg is reserved). Generated ASYNC and OFF the read path:
-- the fire-and-forget worker (lib/goals/insights.ts, scheduled via
-- afterResponse) upserts here AFTER a response has flushed; page loads and the
-- lazy loadGoalInsights action only ever SELECT the cache — they never block
-- on a model call.
--
--   narrative    — one-line health narrative for the LEFT panel (§2.2).
--   suggestions  — execution suggestions for the child planners (jsonb string[]).
--   workload     — deterministic workload-balancing flags (jsonb array; the
--                  rebalance amounts reuse suggestDistribution / derive.ts —
--                  never model-invented numbers).
--   source       — 'ai' (Gemini, the repo's existing lib/ai client) or
--                  'heuristic' (the deterministic fallback when no key/model).
--   input_hash   — sha1 of the deterministic numeric facts; unchanged hash +
--                  fresh generated_at ⇒ the worker skips regeneration.
--
-- Insight text derives ONLY from the goal's own subtree (owner's data), and
-- reads are gated by the same viewer-scope authorizeRead as the Phase-7
-- detail bundle — no downline leak to peers.
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists goal_ai_insights (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid references goals(id) on delete cascade,
  weekly_goal_id uuid references weekly_goals(id) on delete cascade,
  narrative text not null default '',
  suggestions jsonb not null default '[]',
  workload jsonb not null default '[]',
  source text not null default 'heuristic',
  model text,
  input_hash text not null default '',
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint goal_ai_insights_one_parent check (
    (goal_id is not null)::int + (weekly_goal_id is not null)::int = 1
  ),
  constraint goal_ai_insights_source check (source in ('ai','heuristic'))
);
-- One cached row per node (NULLs are distinct, so the XOR halves never clash).
create unique index if not exists goal_ai_insights_goal_uq on goal_ai_insights (goal_id);
create unique index if not exists goal_ai_insights_weekly_uq on goal_ai_insights (weekly_goal_id);
