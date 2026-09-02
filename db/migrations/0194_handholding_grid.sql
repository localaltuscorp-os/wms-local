-- 0194 — Hand-holding as the working sheet: employees are COLUMNS.
--
-- The sheet this replaces is a grid — one column per person, one numbered row
-- per entry, split into Active and Inactive tables per section, with colour
-- carrying a status (revenue share / recover from reference / HH not started /
-- HH on hold). Two columns is all that needs adding:
--
--   status     active | inactive — which of the paired tables the row sits in.
--   highlight  the colour band, or null for a plain row.
--
-- `section` widens to carry the sheet's five blocks rather than the previous
-- four, so Ambassadors and References to Collect live in the same grid.

ALTER TABLE pa_entries ADD COLUMN IF NOT EXISTS status    text NOT NULL DEFAULT 'active';
ALTER TABLE pa_entries ADD COLUMN IF NOT EXISTS highlight text;
ALTER TABLE pa_entries ADD COLUMN IF NOT EXISTS note      text;
CREATE INDEX IF NOT EXISTS pa_entries_section_status_idx ON pa_entries (section, status);
