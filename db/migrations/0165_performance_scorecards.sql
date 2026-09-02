-- 0165 — Monthly Performance & Incentive scorecards (Altus HR Intelligence Engine).
-- Idempotent. Safe to re-run.

CREATE TABLE IF NOT EXISTS performance_scorecards (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id    uuid REFERENCES employees(id) ON DELETE SET NULL,
  person_key     text NOT NULL,
  person_name    text NOT NULL DEFAULT '',
  period_month   text NOT NULL,
  role_class     text NOT NULL DEFAULT 'non-manager',
  kpi_actuals    jsonb NOT NULL DEFAULT '{}'::jsonb,
  bucket_scores  jsonb NOT NULL DEFAULT '{}'::jsonb,
  computed       jsonb,
  total_score    numeric(6,2),
  incentive_pct  numeric(6,2),
  narrative      text,
  created_by_id  uuid REFERENCES employees(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS perf_scorecard_person_month_uk
  ON performance_scorecards (person_key, period_month);
