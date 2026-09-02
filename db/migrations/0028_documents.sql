-- Manan #27/#28 — Document library. Files live in the private "documents"
-- Storage bucket; this table is the catalogue (title mandatory, description
-- optional) + provenance + optional link to a task. Idempotent.

create table if not exists documents (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  description   text,
  storage_path  text not null,
  mime_type     text,
  size_bytes    integer,
  task_id       uuid references tasks(id) on delete set null,
  uploaded_by_id uuid references employees(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists documents_created_idx on documents(created_at desc);
create index if not exists documents_task_idx on documents(task_id);

------------------------------------------------------------------------
-- RLS — read + insert + update for authenticated. Deletes handled by the
-- server action (service role) which also removes the storage object.
------------------------------------------------------------------------
alter table documents enable row level security;

drop policy if exists "documents_read_authenticated"   on documents;
drop policy if exists "documents_insert_authenticated" on documents;
drop policy if exists "documents_update_authenticated" on documents;

create policy "documents_read_authenticated"
  on documents for select to authenticated using (true);
create policy "documents_insert_authenticated"
  on documents for insert to authenticated with check (true);
create policy "documents_update_authenticated"
  on documents for update to authenticated using (true) with check (true);
