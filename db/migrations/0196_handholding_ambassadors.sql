-- Ambassadors take the same Add form as participants, with Product Name as a
-- multi-select. So they gain the same fields, and share the same calls table
-- rather than growing a parallel one.

ALTER TABLE pa_ambassadors ADD COLUMN IF NOT EXISTS products   text[] NOT NULL DEFAULT '{}';
ALTER TABLE pa_ambassadors ADD COLUMN IF NOT EXISTS batch_no   text;
ALTER TABLE pa_ambassadors ADD COLUMN IF NOT EXISTS start_date date;
ALTER TABLE pa_ambassadors ADD COLUMN IF NOT EXISTS end_date   date;
ALTER TABLE pa_ambassadors ADD COLUMN IF NOT EXISTS on_hold    boolean NOT NULL DEFAULT false;

-- A call now belongs to an entry OR an ambassador — exactly one of the two.
ALTER TABLE pa_calls ADD COLUMN IF NOT EXISTS ambassador_id uuid
  REFERENCES pa_ambassadors(id) ON DELETE CASCADE;
ALTER TABLE pa_calls ALTER COLUMN entry_id DROP NOT NULL;

ALTER TABLE pa_calls DROP CONSTRAINT IF EXISTS pa_calls_one_owner;
ALTER TABLE pa_calls ADD CONSTRAINT pa_calls_one_owner
  CHECK ((entry_id IS NULL) <> (ambassador_id IS NULL));

-- The old UNIQUE (entry_id, seq) no longer covers ambassador rows.
-- Drop the constraint first: it owns the index, so the index cannot go alone.
ALTER TABLE pa_calls DROP CONSTRAINT IF EXISTS pa_calls_entry_id_seq_key;
DROP INDEX IF EXISTS pa_calls_entry_id_seq_key;
CREATE UNIQUE INDEX IF NOT EXISTS pa_calls_entry_seq  ON pa_calls (entry_id, seq)      WHERE entry_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS pa_calls_amb_seq    ON pa_calls (ambassador_id, seq) WHERE ambassador_id IS NOT NULL;
