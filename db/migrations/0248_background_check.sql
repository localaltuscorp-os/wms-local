-- 0248 — Employee Background Check status on HR Record.
--
-- New section on the person's HR Record page: Yes/No, confirmed before either
-- commits. "No" stays changeable (the buttons remain). "Yes" is a one-way door —
-- once confirmed the section becomes a static "Background Check Done" line with
-- no buttons, so the record of a completed check can't be casually reversed.
--
-- Three states, not two, so `background_check_status` is text ('yes'/'no'),
-- NULL meaning "not decided yet" — a plain boolean can't tell "No, decided" apart
-- from "never asked". `background_check_at` is the WHEN, same pairing every
-- other status flag on this table carries.
--
-- Deliberately NOT added to the `employees` pgTable in db/schema.ts — see
-- lib/productivity/archive.ts's note on `performance_archived`: Drizzle expands
-- a full-row select() of `employees` into an explicit column list, and
-- localSessionEmployee runs exactly that query on every request. Naming a new
-- column there before this migration has run everywhere would not cost a
-- feature, it would cost sign-in. This flag is read/written by raw SQL instead
-- (lib/hr/background-check.ts), guarded against 42703, until 0248 is confirmed
-- applied everywhere — then it can move onto the schema like any other column.
--
-- FULLY IDEMPOTENT — safe to re-apply by hand at any time.

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS background_check_status text;

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS background_check_at timestamptz;

ALTER TABLE employees
  DROP CONSTRAINT IF EXISTS employees_background_check_status_check;

ALTER TABLE employees
  ADD CONSTRAINT employees_background_check_status_check
  CHECK (background_check_status IN ('yes', 'no') OR background_check_status IS NULL);
