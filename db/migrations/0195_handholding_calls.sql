-- 0195 — Hand-holding: batches, on-hold, and weekly calls.
--
-- An entry gains the two facts the brief adds about it — the batch it belongs to
-- (PS/BSS only) and whether it is on hold — plus a child table for its weekly
-- calls. Calls are a CHILD TABLE rather than columns because the brief allows
-- "add more": two is the starting point, not the limit, and columns would cap it.
--
-- `on_hold` drives both the participant count and the weekly-hours total, so it
-- lives on the entry where those sums read it, not in a separate status table.

ALTER TABLE pa_entries ADD COLUMN IF NOT EXISTS batch_no text;
ALTER TABLE pa_entries ADD COLUMN IF NOT EXISTS on_hold  boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS pa_calls (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id     uuid NOT NULL REFERENCES pa_entries(id) ON DELETE CASCADE,
  -- Ordinal within the entry: Weekly Call 1, 2, 3…
  seq          integer NOT NULL,
  -- hh | tool | checkin
  call_type    text NOT NULL,
  -- mon..sun
  day          text NOT NULL,
  duration_min integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entry_id, seq)
);
CREATE INDEX IF NOT EXISTS pa_calls_entry_idx ON pa_calls (entry_id);
