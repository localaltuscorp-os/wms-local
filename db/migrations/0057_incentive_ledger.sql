-- Incentive ledger (Manan 2026-06) — extend `incentive_requests` (migration
-- 0053) into the full payout ledger: per-row ₹ amount (admin-overridable),
-- paid tracking, a per-scheme manual `conditions` blob, a display label, and
-- a `source` so project incentives can share the same table. Approval reuses
-- the existing `status` column ('approved'); unpaid is derived in code.
-- Idempotent: add-column-if-not-exists throughout.

alter table incentive_requests add column if not exists amount    integer not null default 0;
alter table incentive_requests add column if not exists paid      boolean not null default false;
alter table incentive_requests add column if not exists paid_amt  integer not null default 0;
alter table incentive_requests add column if not exists paid_date date;
alter table incentive_requests add column if not exists conditions jsonb;
alter table incentive_requests add column if not exists label     text;
alter table incentive_requests add column if not exists source    text not null default 'form';

alter table incentive_requests add column if not exists source_ref text;
