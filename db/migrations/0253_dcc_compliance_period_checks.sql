-- 0253 — Accounts-style editable period summaries beside the WCC/MCC tables.
-- This is separate from dcc_entries: entries are individual scheduled work
-- occurrences; these cells are the Wk1–Wk5 / Apr–Mar checklist summaries.
CREATE TABLE IF NOT EXISTS dcc_compliance_period_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES dcc_kpi_items(id) ON DELETE CASCADE,
  kind text NOT NULL,
  period_year integer NOT NULL,
  period_month integer NOT NULL,
  week_no integer NOT NULL DEFAULT 0,
  status text NOT NULL,
  updated_by_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dcc_compliance_period_checks_kind_chk CHECK (kind IN ('wcc', 'mcc')),
  CONSTRAINT dcc_compliance_period_checks_month_chk CHECK (period_month BETWEEN 1 AND 12),
  CONSTRAINT dcc_compliance_period_checks_week_chk CHECK (
    (kind = 'wcc' AND week_no BETWEEN 1 AND 5) OR (kind = 'mcc' AND week_no = 0)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS dcc_compliance_period_checks_uq
  ON dcc_compliance_period_checks (item_id, kind, period_year, period_month, week_no);
CREATE INDEX IF NOT EXISTS dcc_compliance_period_checks_period_idx
  ON dcc_compliance_period_checks (kind, period_year, period_month);
