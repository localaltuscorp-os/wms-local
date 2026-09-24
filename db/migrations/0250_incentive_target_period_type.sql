-- 0250 — Incentive targets gain a PERIOD TYPE, so a quarterly target can exist
-- beside the monthly one that shares its first month.
--
-- WHY A COLUMN AND NOT A NEW TABLE
-- `incentive_targets` keys on (emp_name, period_month), and the whole module
-- reads a target for a period by taking the rows whose month falls inside it.
-- A quarter target therefore has nowhere to live: written on its first month it
-- collides with that month's own target on the unique index, and — once it
-- existed — every month-range reader in the app would count it a second time
-- (earnings, the status report, the weekly report, target-vs-actual, the
-- dashboard's own sum).
--
-- Adding the discriminator is the smallest change that makes the two coexist:
--   · every EXISTING row keeps `period_type = 'month'`, which is the default,
--     so every existing read returns exactly what it returned before;
--   · a QUARTER row is tagged 'quarter' and is excluded from every month-range
--     reader by an explicit `period_type <> 'quarter'` filter, and read only by
--     the dashboard when the selected period is that quarter.
--
-- 'year' IS DELIBERATELY NOT A VALUE HERE. A year target has always been stored
-- as the JANUARY row of that year (`setIncentiveYearTarget`), which is what
-- makes it sum into YTD and into January. Re-tagging those rows as 'year' would
-- change what YTD returns, which is the one thing this migration must not do.
-- Year targeting therefore continues exactly as it did.
ALTER TABLE "incentive_targets"
  ADD COLUMN IF NOT EXISTS "period_type" text NOT NULL DEFAULT 'month';

ALTER TABLE "incentive_targets"
  DROP CONSTRAINT IF EXISTS "incentive_targets_period_type_chk";
ALTER TABLE "incentive_targets"
  ADD CONSTRAINT "incentive_targets_period_type_chk"
  CHECK ("period_type" IN ('month', 'quarter'));

-- The unique key widens by the discriminator, so a July target and a Q3 target
-- (which both anchor on 2026-07-01) are two rows, not a conflict.
DROP INDEX IF EXISTS "incentive_targets_name_period_uq";
CREATE UNIQUE INDEX IF NOT EXISTS "incentive_targets_name_period_type_uq"
  ON "incentive_targets" ("emp_name", "period_month", "period_type");
