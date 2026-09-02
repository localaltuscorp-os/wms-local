-- 0202 — Hand-holding · All Participants: the Duration column.
--
-- One column on the EXISTING pa_entries table, beside the Call it belongs to
-- (migration 0201). Stored as MINUTES, an integer — not the "HH:MM" the field
-- shows. A duration is a quantity, and storing the display string would mean
-- every reader re-parsing it, and "1:5" and "01:05" disagreeing about what they
-- mean. The UI formats minutes into HH:MM on the way out and parses HH:MM back
-- into minutes on the way in.
--
-- Nullable, no default: null is "not entered yet", which the field shows empty.
-- No data is written by this migration.

ALTER TABLE pa_entries ADD COLUMN IF NOT EXISTS duration_min integer;
