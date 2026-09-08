-- Incentive archive (Manan 2026-06) — soft-archive flag for incentive ledger
-- entries. Archived rows drop out of the main list into the Archived view;
-- delete is a hard remove (handled in the action). Idempotent.
alter table incentive_requests add column if not exists archived boolean not null default false;
create index if not exists incentive_requests_archived_idx on incentive_requests (archived, created_at);
