-- Phase 3.5 — Document mutation audit log.
--
-- Documents currently leave no trail: an admin can replace or delete a
-- file with nothing to point to who/when. This table mirrors
-- task_events / employee_events / settings_events — append-only audit
-- rows, one per mutation.
--
-- event_type: 'created' | 'renamed' | 'description_changed' |
--             'file_replaced' | 'deleted'
-- The `document_id` FK is nullable because the row outlives the document
-- (a delete-event references a doc that no longer exists). On delete of
-- the document the FK is set null but the audit row stays.
--
-- Idempotent.

create table if not exists document_events (
  id           uuid primary key default gen_random_uuid(),
  document_id  uuid references documents(id) on delete set null,
  document_title text not null,  -- snapshotted so deleted-doc rows still read sensibly
  actor_id     uuid not null references employees(id) on delete restrict,
  event_type   text not null,
  from_value   jsonb,
  to_value     jsonb,
  note         text,
  created_at   timestamptz not null default now()
);

create index if not exists document_events_doc_created_idx
  on document_events(document_id, created_at desc);
create index if not exists document_events_actor_created_idx
  on document_events(actor_id, created_at desc);
create index if not exists document_events_created_idx
  on document_events(created_at desc);

-- RLS — admin-read (will surface in the /admin/activity feed later);
-- writes happen as the DB owner from server actions, so no insert policy
-- is exposed to PostgREST.
alter table document_events enable row level security;

drop policy if exists "document_events_read_admin" on document_events;
create policy "document_events_read_admin"
  on document_events for select
  to authenticated
  using (app.is_admin());

revoke insert, update, delete on document_events from authenticated, anon;
