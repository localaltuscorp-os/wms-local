-- 0174 — Post-joining workflow columns on employees (additive, idempotent).
-- official_email      : logged company address firstname.lastname@<domain>
-- personal_email      : where the welcome / credentials mail is sent
-- email_provisioned_at: stamped when HR creates the official mailbox (gates a step)
-- assets_allocated_at : stamped when HR completes asset allocation (gates a step)
-- All nullable, no default → instant metadata-only change, safe on the live table.
alter table employees add column if not exists official_email       text;
alter table employees add column if not exists personal_email        text;
alter table employees add column if not exists email_provisioned_at  timestamptz;
alter table employees add column if not exists assets_allocated_at   timestamptz;
