-- 0040 — achievements_earned
-- Tracks which badges each employee has unlocked. Definitions live in
-- code (lib/achievements/definitions.ts) so no separate `achievements`
-- table is needed. `progress` JSONB lets the evaluator stash partial
-- progress for badges that haven't yet been earned.

CREATE TABLE IF NOT EXISTS achievements_earned (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  achievement_key text NOT NULL,
  earned_at       timestamptz NOT NULL DEFAULT now(),
  progress        jsonb,
  UNIQUE (employee_id, achievement_key)
);

CREATE INDEX IF NOT EXISTS achievements_earned_employee_idx
  ON achievements_earned (employee_id);
