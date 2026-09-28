-- 0249 — Incentive Target planning & performance.
-- A granular target system (team/user × week/month/quarter/year × products),
-- ADDITIVE ONLY. The legacy `incentive_targets` table (per-person monthly
-- target amount) is untouched — it still feeds the analytics dashboard's
-- target-vs-actual and warning bar.
--
-- One plan row = one target for one subject over one period. Its products live
-- in `incentive_target_plan_products` (one row per product, rate × quantity).
CREATE TABLE IF NOT EXISTS "incentive_target_plans" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "target_level" text NOT NULL,
  "employee_id" uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "team_owner_id" uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "period_type" text NOT NULL,
  "period_start" date NOT NULL,
  "period_end" date NOT NULL,
  "note" text,
  "created_by" uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "incentive_target_plans_level_chk" CHECK ("target_level" in ('team', 'user')),
  CONSTRAINT "incentive_target_plans_period_chk" CHECK ("period_type" in ('week', 'month', 'quarter', 'year')),
  CONSTRAINT "incentive_target_plans_subject_chk" CHECK (
    ("target_level" = 'user' AND "employee_id" IS NOT NULL AND "team_owner_id" IS NULL)
    OR ("target_level" = 'team' AND "team_owner_id" IS NOT NULL AND "employee_id" IS NULL)
  ),
  CONSTRAINT "incentive_target_plans_window_chk" CHECK ("period_end" > "period_start")
);
CREATE UNIQUE INDEX IF NOT EXISTS "incentive_target_plans_subject_period_uq"
  ON "incentive_target_plans" ("target_level", COALESCE("employee_id", "team_owner_id"), "period_type", "period_start");
CREATE INDEX IF NOT EXISTS "incentive_target_plans_period_idx"
  ON "incentive_target_plans" ("period_start", "period_end");

CREATE TABLE IF NOT EXISTS "incentive_target_plan_products" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "plan_id" uuid NOT NULL REFERENCES "incentive_target_plans"("id") ON DELETE CASCADE,
  "product_id" uuid REFERENCES "outstanding_products"("id") ON DELETE SET NULL,
  "product_name" text NOT NULL,
  "quantity" numeric(14,2) NOT NULL DEFAULT '0',
  "rate" numeric(14,2) NOT NULL DEFAULT '0',
  "target_amount" numeric(14,2) NOT NULL DEFAULT '0',
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "incentive_target_plan_products_uq"
  ON "incentive_target_plan_products" ("plan_id", "product_name");
CREATE INDEX IF NOT EXISTS "incentive_target_plan_products_plan_idx"
  ON "incentive_target_plan_products" ("plan_id");
