-- 0164 — Candidate Evaluation v2: structured two-instance blob + per-designation
-- weight profiles. Idempotent. Safe to re-run.

ALTER TABLE candidate_intake ADD COLUMN IF NOT EXISTS evaluation_v2 jsonb;

CREATE TABLE IF NOT EXISTS evaluation_weight_profiles (
  designation   text PRIMARY KEY,
  weights       jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Seed the base (default) profile from the spec's default section weights.
INSERT INTO evaluation_weight_profiles (designation, weights)
VALUES (
  'default',
  '{"communication":10,"presence":5,"character":10,"culture":15,"thinking":15,"execution":10,"getthingsdone":5,"technical":10,"experience":5,"sales":20}'::jsonb
)
ON CONFLICT (designation) DO NOTHING;
