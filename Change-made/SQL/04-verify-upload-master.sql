-- ============================================================================
-- Change-made / SQL / 04-verify-upload-master.sql
--
-- READ-ONLY. Every statement here is a SELECT. Nothing is created, altered or
-- deleted. Run after 03-apply-upload-master.sql to confirm the table landed,
-- and before/after any deploy to confirm overrides are what you expect.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Does the table exist?  EXPECT: one row returned (table_name = template_files).
-- ----------------------------------------------------------------------------
select tablename
from pg_tables
where schemaname = 'public' and tablename = 'template_files';


-- ----------------------------------------------------------------------------
-- 2. Do the columns exist?  EXPECT: zero rows.
-- ----------------------------------------------------------------------------
select t.col as missing_column
from (values
  ('id'),
  ('key'),
  ('storage_path'),
  ('content_type'),
  ('file_name'),
  ('file_size'),
  ('updated_by_id'),
  ('created_at'),
  ('updated_at')
) as t(col)
where not exists (
  select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'template_files'
    and column_name = t.col
);


-- ----------------------------------------------------------------------------
-- 3. Is the unique index in place?  EXPECT: one row (template_files_key_uq).
-- ----------------------------------------------------------------------------
select indexname
from pg_indexes
where schemaname = 'public'
  and tablename = 'template_files'
  and indexname = 'template_files_key_uq';


-- ----------------------------------------------------------------------------
-- 4. Current overrides (which templates have been replaced, and when).
--    EXPECT: at most three rows. An empty result means every template is still
--    on its built-in.
-- ----------------------------------------------------------------------------
select key, file_name, file_size, updated_at
from template_files
order by key;


-- ----------------------------------------------------------------------------
-- 5. Migration ledger corroboration (NOT authoritative — see SQL/README.md).
--    EXPECT: 0241_template_files.sql present after applying via the targeted
--    applier. If you applied the raw SQL above instead, this row will be absent
--    and that is expected — the objects are what matter, not the ledger.
-- ----------------------------------------------------------------------------
select filename, applied_at
from __schema_applied
where filename = '0241_template_files.sql';
