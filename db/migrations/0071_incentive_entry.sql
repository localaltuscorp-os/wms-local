-- 0071_incentive_entry — Phase 4 (structured incentive entry on Weekly Goals).
-- Idempotent + additive. Classifies each goal's incentive as Ad-hoc / One-time
-- (manual amount) or Routine (amount sourced from incentive_catalog).

ALTER TABLE weekly_goals
  ADD COLUMN IF NOT EXISTS incentive_type text;          -- 'adhoc' | 'onetime' | 'routine' | null

ALTER TABLE weekly_goals
  ADD COLUMN IF NOT EXISTS incentive_catalog_id uuid;    -- set only for 'routine'

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'weekly_goals_incentive_catalog_id_fkey'
  ) THEN
    ALTER TABLE weekly_goals
      ADD CONSTRAINT weekly_goals_incentive_catalog_id_fkey
      FOREIGN KEY (incentive_catalog_id) REFERENCES incentive_catalog(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS weekly_goals_incentive_catalog_idx ON weekly_goals(incentive_catalog_id);

-- Backfill: existing goals that had the old flat `incentive=true` flag become
-- 'adhoc' so they keep showing as incentivised (their manual amount is preserved).
UPDATE weekly_goals
  SET incentive_type = 'adhoc'
  WHERE incentive = true AND incentive_type IS NULL;
