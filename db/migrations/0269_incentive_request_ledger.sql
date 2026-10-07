-- Link one legacy incentive ledger row to the request that finalized it.
-- Historical entries remain unlinked (NULL); PostgreSQL permits multiple NULLs
-- in the unique index, while a request can only ever produce one parent row.
ALTER TABLE incentive_entries
  ADD COLUMN IF NOT EXISTS incentive_request_id uuid
  REFERENCES incentive_requests(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS incentive_entries_request_uq
  ON incentive_entries (incentive_request_id);
