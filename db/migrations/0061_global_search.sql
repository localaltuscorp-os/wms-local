-- 0061_global_search — truly-global search infrastructure.
-- Idempotent + additive: extensions, two generated columns on tasks, and
-- GIN trigram / tsvector indexes across every searchable entity. A trigram
-- GIN makes ILIKE '%q%' an index lookup (kills the search table-scan) and
-- enables fuzzy matching; the tsvector GIN gives task word/phrase ranking.

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Generated-column expressions must be IMMUTABLE. Two gotchas on this server:
--   1) to_tsvector(text, text) is only STABLE (it looks up the default text
--      search config at call time) — pinning the config with the
--      'english'::regconfig literal makes to_tsvector(regconfig, text) IMMUTABLE.
--   2) array_to_string(text[], text) is flagged non-IMMUTABLE in this catalog,
--      so it can't be inlined directly. Wrap it in an explicitly-IMMUTABLE SQL
--      helper. CREATE OR REPLACE keeps this additive + idempotent.
CREATE OR REPLACE FUNCTION immutable_array_to_string(arr text[], sep text)
  RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
    SELECT array_to_string(arr, sep)
  $$;

-- Tasks: full-text vector over all task text + the friendly number.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS search_tsv tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english'::regconfig,
      coalesce(title,'')       || ' ' || coalesce(description,'') || ' ' ||
      coalesce(notes,'')       || ' ' || coalesce(client,'')      || ' ' ||
      coalesce(subject,'')     || ' ' ||
      coalesce(immutable_array_to_string(tags,' '),'') || ' ' ||
      coalesce(task_no::text,''))
  ) STORED;

-- Tasks: a plain concatenated text column for trigram (ILIKE + fuzzy).
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS search_text text
  GENERATED ALWAYS AS (
    coalesce(title,'')   || ' ' || coalesce(description,'') || ' ' ||
    coalesce(client,'')  || ' ' || coalesce(subject,'')     || ' ' ||
    coalesce(notes,''))
  STORED;

CREATE INDEX IF NOT EXISTS tasks_search_tsv_idx  ON tasks USING gin (search_tsv);
CREATE INDEX IF NOT EXISTS tasks_search_trgm_idx ON tasks USING gin (search_text gin_trgm_ops);

-- Per-entity trigram GIN indexes (small tables, but keeps everything indexed).
CREATE INDEX IF NOT EXISTS clients_name_trgm_idx        ON clients              USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS project_nodes_name_trgm_idx  ON project_nodes        USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS project_nodes_desc_trgm_idx  ON project_nodes        USING gin (coalesce(description,'') gin_trgm_ops);
CREATE INDEX IF NOT EXISTS employees_name_trgm_idx      ON employees            USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS employees_email_trgm_idx     ON employees            USING gin (email gin_trgm_ops);
CREATE INDEX IF NOT EXISTS outstanding_client_trgm_idx  ON outstanding_contracts USING gin (client_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS documents_title_trgm_idx     ON documents            USING gin (title gin_trgm_ops);
