-- ============================================================================
-- Change-made / SQL / 03-apply-upload-master.sql
--
-- Additive, idempotent SQL for the Upload Master change (Change-made/08).
--
-- One new table, `template_files`, records the admin's uploaded override for a
-- bulk-import template (Tasks, Goals, Accounts). No row = the built-in template
-- is served. The file bytes live in Supabase Storage; this table records where.
--
-- Safe to run more than once: every statement is `if not exists`.
--
-- Run with:
--   psql "$DATABASE_URL" -f Change-made/SQL/03-apply-upload-master.sql
-- or paste into Supabase Dashboard -> SQL Editor -> New query -> Run.
--
-- Nothing here drops, truncates or deletes a row.
-- ============================================================================


-- ============================================================================
-- template_files
--
-- `key` is the template registry key (lib/templates/registry.ts):
--   'tasks'               Tasks bulk-import workbook
--   'goals'               Goals bulk-import workbook
--   'accounts-task-list'  Accounts task-list workbook
-- ============================================================================

create table if not exists template_files (
  id            uuid primary key default gen_random_uuid(),
  key           text not null,
  storage_path  text not null,
  content_type  text not null,
  file_name     text not null,
  file_size     integer not null,
  updated_by_id uuid not null references employees (id) on delete restrict,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create unique index if not exists template_files_key_uq
  on template_files (key);
