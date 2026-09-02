-- 0199 — Hand-holding: a participant carries a Day of its own.
--
-- The All Participants table shows one weekday per participant and lets it be
-- changed inline. A participant's weekly CALLS each have their own day, so the
-- row-level day is a separate fact: which day that participant sits on, not
-- which day any one call falls.
--
-- Nullable: existing rows have no answer yet, and "—" is honest where a guess
-- would not be. Schema-only; no data is written or removed.

ALTER TABLE pa_entries ADD COLUMN IF NOT EXISTS day text;
