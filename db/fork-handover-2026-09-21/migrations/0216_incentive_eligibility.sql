-- ─────────────────────────────────────────────────────────────────────────────
-- 0216 — PER-PERSON INCENTIVE ELIGIBILITY
--
-- Until now an incentive was visible to everyone, with two coarse flags
-- (`sales_eligible`, `interns_eligible`) that nothing actually enforced. The
-- admin now decides, per incentive, exactly who it applies to — everyone, a
-- whole department, or a named list — and an employee never sees an incentive
-- they were not picked for, nor has it counted in their attainment.
--
-- `applies_to_all` DEFAULTS TO TRUE, which is the whole safety story of this
-- migration: the moment it runs, every existing incentive keeps being visible
-- to exactly the people who could see it a second earlier. Nothing disappears
-- from anyone's screen until an admin deliberately narrows it.
--
-- Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE incentive_catalog
  ADD COLUMN IF NOT EXISTS applies_to_all boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS incentive_eligibility (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incentive_id uuid NOT NULL REFERENCES incentive_catalog(id) ON DELETE CASCADE,
  employee_id  uuid NOT NULL REFERENCES employees(id)         ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- One row per (incentive, person). The upsert path relies on this.
CREATE UNIQUE INDEX IF NOT EXISTS incentive_eligibility_pair_uq
  ON incentive_eligibility (incentive_id, employee_id);

-- "What am I eligible for?" runs on every load of /incentive for every
-- employee, so it gets its own index rather than riding the unique one, whose
-- leading column is the incentive.
CREATE INDEX IF NOT EXISTS incentive_eligibility_employee_idx
  ON incentive_eligibility (employee_id);

-- ── verify ───────────────────────────────────────────────────────────────────
-- Expect: applies_to_all = true on every existing row, and an empty
-- eligibility table. Both mean "nothing has changed for anybody yet".
--
--   SELECT count(*) FILTER (WHERE applies_to_all) AS open_to_all,
--          count(*)                               AS total
--     FROM incentive_catalog;
--   SELECT count(*) AS eligibility_rows FROM incentive_eligibility;
