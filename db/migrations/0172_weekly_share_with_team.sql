-- 0172 — weekly_goals column parity with goals.
--
-- Adds share_with_team so the Weekly board's inline table has the SAME columns as
-- the Year/Quarter/Month tables (goalType/status/reviewedById/delegatedTo already
-- exist on weekly_goals; only the share flag was missing). Additive + nullable-safe
-- (NOT NULL DEFAULT false), so bare selects and existing rows stay valid.
ALTER TABLE weekly_goals ADD COLUMN IF NOT EXISTS share_with_team boolean NOT NULL DEFAULT false;
