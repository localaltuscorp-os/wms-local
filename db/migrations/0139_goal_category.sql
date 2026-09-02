-- 0139 — Goal category tag (Kanban colour-coding). ADDITIVE + idempotent.
-- 'target' | 'milestone' | 'operational' | 'goal' (spillover derived from cloned_from_id).

alter table goals
  add column if not exists category text not null default 'goal';
