-- source_ref was originally appended to 0057 AFTER that file had already been
-- applied on some databases. The filename-keyed applier won't re-run an edited
-- migration, so the column was missing there (project + sheet incentives query
-- it). Add it in its own migration. Idempotent.
alter table incentive_requests add column if not exists source_ref text;
create index if not exists incentive_requests_source_ref_idx on incentive_requests (source, source_ref);
