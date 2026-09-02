-- M5.2 — admin-tunable idle session timeout.
--
-- Stored on the single-row org_settings table; the IdleTimer client
-- component reads this and signs users out after N minutes of inactivity.
-- Range is enforced both in SQL (CHECK) and the zod validator.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS + dropped/re-added CHECK so re-runs
-- are safe even if a previous attempt set a non-CHECK column.

alter table org_settings
  add column if not exists idle_timeout_minutes integer not null default 10;

alter table org_settings
  drop constraint if exists org_settings_idle_timeout_minutes_range_chk;

alter table org_settings
  add constraint org_settings_idle_timeout_minutes_range_chk
    check (idle_timeout_minutes between 5 and 60);
