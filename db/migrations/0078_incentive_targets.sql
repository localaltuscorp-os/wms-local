-- 0078 — Incentive slice C: per-person monthly target (Target-vs-Actual).
CREATE TABLE IF NOT EXISTS "incentive_targets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "emp_name" text NOT NULL,
  "employee_id" uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "period_month" date NOT NULL,
  "target_amount" numeric(14,2) NOT NULL DEFAULT '0',
  "note" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "incentive_targets_name_period_uq" ON "incentive_targets" ("emp_name", "period_month");
