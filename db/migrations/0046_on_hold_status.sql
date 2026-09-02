-- Add 'on_hold' to the task_status enum + seed its status_settings display row.
--
-- IMPORTANT: Postgres cannot use a new enum value in the same transaction that
-- adds it. The apply runner MUST execute statement (1) and statement (2) as
-- SEPARATE db.execute() calls (the ALTER must commit before the INSERT runs).
-- Idempotent: ADD VALUE IF NOT EXISTS + ON CONFLICT DO NOTHING.

-- (1) Add the enum value. Run this FIRST, on its own.
alter type task_status add value if not exists 'on_hold';

-- (2) Seed the display row. Run this SECOND, after (1) has committed.
--     display_order 26 slots it just after the Tier-3 statuses.
insert into status_settings (status, label, color_token, display_order)
  values ('on_hold', 'On Hold', 'slate', 26)
  on conflict (status) do nothing;
