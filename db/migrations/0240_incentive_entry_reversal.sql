-- WS-6 · Incentive entry REVERSAL (financial). Additive + idempotent.
--
-- Adds a `reversed` flag to the money ledger row (incentive_entries) so a paid
-- incentive can be reversed without losing its payment history. The paid
-- amount stays as-is (it is the historical record); the reversal itself is
-- written as a NEGATIVE salary_payments row (method='reversal') plus an
-- incentive_payout_events audit row, so the employee's net paid reconciles to
-- zero while the original + reversal lines remain individually auditable.
--
-- `reversed` is the duplicate-guard: the reversal action re-checks it under a
-- FOR UPDATE lock and only writes the negative adjustment on the false->true
-- edge, so a repeat reversal can never double-adjust.
alter table incentive_entries
  add column if not exists reversed       boolean     not null default false,
  add column if not exists reversed_at    timestamptz,
  add column if not exists reversed_by_id uuid references employees(id) on delete set null;

create index if not exists incentive_entries_reversed_idx on incentive_entries (reversed);
