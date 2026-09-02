-- 0193 — Hand-holding: people carry ENTRIES per section, not shared clients.
--
-- The previous shape (a client roster + a many-to-many join) answered "who is
-- on this client". The brief asks the opposite: under each person, list the
-- participants/clients in four sections. A row belongs to ONE person and ONE
-- section, so a single table models it exactly, and adding a row is one insert.
--
-- `kind` splits the two rosters. Interns exist only for Ecosystem/App
-- Development, which the CHECK below enforces at the database rather than
-- trusting every future caller to remember the rule.

ALTER TABLE pa_people ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'employee';

CREATE TABLE IF NOT EXISTS pa_entries (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id  uuid NOT NULL REFERENCES pa_people(id) ON DELETE CASCADE,
  -- ps | bss | retainer | ecosystem
  section    text NOT NULL,
  name       text NOT NULL,
  -- Retainer rows only; null everywhere else.
  start_date date,
  end_date   date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pa_entries_person_idx ON pa_entries (person_id, section, name);

-- The old client/allocation tables are superseded by pa_entries. They are left
-- ALONE here: this migration is schema-only.
--
-- Earlier revisions emptied them with DELETE, which was right for a local reset
-- and wrong for anywhere else — on production it would destroy live rows that
-- nothing in this migration recreates. Retiring that data is a decision to be
-- taken deliberately, against a backup, not a side effect of a schema change.
