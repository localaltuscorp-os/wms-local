-- 0233 — Job Description for a SPECIFIC PERSON.
--
-- The account holder asked (2026-09-15) for the JD module to hold, beside the
-- General JD (a position's job descriptions), tasks written for ONE person that
-- belong to no seat. A person's full JD is then: what their seat carries + what
-- is assigned to them by name + these.
--
-- A task now belongs to EXACTLY ONE owner — a position OR a person — and the
-- CHECK below makes that a database fact, not a convention: a row with neither
-- would be nobody's work, and a row with both would be counted twice.
--
-- Idempotent: this repository applies migrations by hand.

alter table jd_entries alter column position_id drop not null;

alter table jd_entries
  add column if not exists owner_employee_id uuid references employees(id) on delete cascade;

alter table jd_entries drop constraint if exists jd_entries_owner_chk;
alter table jd_entries
  add constraint jd_entries_owner_chk check ((position_id is null) <> (owner_employee_id is null));

create index if not exists jd_entries_owner_employee_idx on jd_entries (owner_employee_id, is_active);
