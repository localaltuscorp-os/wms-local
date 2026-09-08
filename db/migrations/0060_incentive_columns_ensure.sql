-- Belt-and-suspenders (Manan 2026-06): across many folder swaps some databases
-- ended up with only SOME of the incentive_requests ledger columns (the reads
-- touched a subset, but the full INSERT failed on a missing column). Re-assert
-- every ledger column with IF NOT EXISTS so any DB converges to the full shape.
alter table incentive_requests add column if not exists amount     integer not null default 0;
alter table incentive_requests add column if not exists paid       boolean not null default false;
alter table incentive_requests add column if not exists paid_amt   integer not null default 0;
alter table incentive_requests add column if not exists paid_date  date;
alter table incentive_requests add column if not exists conditions jsonb;
alter table incentive_requests add column if not exists label      text;
alter table incentive_requests add column if not exists source     text not null default 'form';
alter table incentive_requests add column if not exists source_ref text;
alter table incentive_requests add column if not exists archived   boolean not null default false;
