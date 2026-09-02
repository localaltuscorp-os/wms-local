-- 0201 — Hand-holding · All Participants: the Call column.
--
-- One column on the EXISTING pa_entries table. The All Participants list shows
-- Module · Participant · Call · Day per row, and Day already lives here
-- (migration 0199) rather than on pa_calls: the list edits ONE value per row,
-- and reaching into a child table to change it would mean deciding which of a
-- participant's calls the row means.
--
-- `call_type` follows Day exactly — nullable text, no default, no FK. Null is
-- "not chosen yet", which the column renders as None; a code from
-- HH_CALL_TYPES otherwise. Text rather than an enum type so adding a call type
-- stays a one-line change in db/enums.ts, as it is for Day.
--
-- No data is written by this migration.

ALTER TABLE pa_entries ADD COLUMN IF NOT EXISTS call_type text;
