-- Supabase objects the migrations reference but a plain Postgres cluster has no
-- idea about. Only needed for the LOCAL dummy database (see .env.local's
-- DATABASE_URL note); on Supabase these are provided by the platform.
--
-- Run AFTER scripts/setup-local-postgres.ts and BEFORE pnpm db:migrate:
--   psql -h 127.0.0.1 -p 55432 -U postgres -d altus_corp_dev -f db/local/supabase-stubs.sql
--
-- Idempotent.

-- 0033_storage_documents_rls.sql puts RLS policies on storage.objects. Nothing
-- in the app reads this table locally (file uploads go to Supabase Storage over
-- HTTP, not through Postgres) — it exists purely so the migration applies.
create schema if not exists storage;

create table if not exists storage.objects (
  id          uuid primary key default gen_random_uuid(),
  bucket_id   text,
  name        text,
  owner       uuid,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now(),
  metadata    jsonb
);

alter table storage.objects enable row level security;
