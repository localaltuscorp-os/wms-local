-- 0212 — goals.client
--
-- The Goals bulk-import template gains a Client column, matching the Tasks
-- template. `tasks.client` already exists as free text; goals had no equivalent,
-- so the column had nowhere to land.
--
-- FREE TEXT, exactly like tasks.client — deliberately not a foreign key to
-- `clients`. That table is the dropdown's source, not a constraint: new client
-- names are created by typing them, and an FK would reject the first import
-- naming a client nobody had registered yet. Same trade the Tasks side already
-- makes.
--
-- Nullable with no default: existing goals have no client and must not be
-- retro-fitted with a guess.
--
-- IF NOT EXISTS so re-running the migration set is a no-op.
ALTER TABLE goals ADD COLUMN IF NOT EXISTS client text;

-- Partial index: the filter people will actually run is "goals for client X",
-- and the overwhelming majority of rows are NULL. Indexing only the non-null
-- ones keeps it small.
CREATE INDEX IF NOT EXISTS goals_client_idx ON goals (client) WHERE client IS NOT NULL;
