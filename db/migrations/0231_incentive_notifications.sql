-- 0231 · Incentive notifications & emails
--
-- Two ADDITIVE tables. No existing table, column or constraint is altered.
--
-- incentive_catalog_events — one append-only row per material change to the
--   Incentive Master (`incentive_catalog`, the "Incentive Table"): created,
--   updated or deleted, with the before / after snapshots and the field-level
--   changes. It is written in the same transaction as the change itself, so an
--   Incentive Master change cannot happen without its event.
--     · created_at IS the effective date of any eligibility change the row
--       carries ("no longer eligible with effect from …").
--     · id IS the event version used to de-duplicate what it sends.
--     · catalog_id is deliberately NOT a foreign key: a "deleted" event has to
--       outlive the incentive it describes.
--
-- incentive_notification_deliveries — the idempotency ledger. One row per
--   (event type, subject, recipient, version). A delivery is claimed with
--   INSERT … ON CONFLICT DO NOTHING before anything is sent, so a retried
--   action, a page refresh or a replayed event cannot notify or email the same
--   person about the same thing twice.
--
-- Deleting an incentive from the master never touched requests, approvals or
-- payments (incentive_requests / incentive_entries do not reference
-- incentive_catalog; weekly_goals' reference is ON DELETE SET NULL) and this
-- migration keeps it that way.

create table if not exists incentive_catalog_events (
  id           uuid primary key default gen_random_uuid(),
  catalog_id   uuid,
  catalog_name text not null,
  event_type   text not null,
  before       jsonb,
  after        jsonb,
  changes      jsonb not null default '[]'::jsonb,
  actor_id     uuid references employees(id) on delete set null,
  created_at   timestamptz not null default now(),
  constraint incentive_catalog_events_type_chk
    check (event_type in ('created', 'updated', 'deleted')),
  constraint incentive_catalog_events_snapshot_chk check (
    (event_type = 'created' and after is not null)
    or (event_type = 'updated' and before is not null and after is not null)
    or (event_type = 'deleted' and before is not null)
  )
);

create index if not exists incentive_catalog_events_catalog_idx
  on incentive_catalog_events (catalog_id, created_at);

create or replace function incentive_catalog_events_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'incentive_catalog_events is append-only';
end;
$$;

drop trigger if exists incentive_catalog_events_no_update on incentive_catalog_events;
create trigger incentive_catalog_events_no_update
  before update on incentive_catalog_events
  for each row execute function incentive_catalog_events_immutable();

create table if not exists incentive_notification_deliveries (
  id           uuid primary key default gen_random_uuid(),
  event_type   text not null,
  subject_id   uuid not null,
  recipient_id uuid not null references employees(id) on delete cascade,
  version_key  text not null,
  created_at   timestamptz not null default now()
);

create unique index if not exists incentive_notification_deliveries_uq
  on incentive_notification_deliveries (event_type, subject_id, recipient_id, version_key);

create index if not exists incentive_notification_deliveries_recipient_idx
  on incentive_notification_deliveries (recipient_id, created_at);
