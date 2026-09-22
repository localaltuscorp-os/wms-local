-- 0226 — MASTER-ADMIN MEMBERSHIP STOPS BEING A CODE CONSTANT.
--
-- Until now the only way to make somebody a master admin was to edit the GRANTS
-- table in lib/security/capabilities.ts and deploy. The owner needs to grant it
-- from the Admin panel's Employee section instead, so it becomes a row here.
--
-- ── WHAT STAYS IN CODE, AND WHY (the important part) ────────────────────────
-- `GRANTS` in lib/security/capabilities.ts REMAINS the authority for every OTHER
-- capability — device.manage, attendance.manage_others, attendance.view_audit_log,
-- daily_start.exempt, delegated_access.grant_any, device.exempt_from_restriction.
-- Their guards are synchronously consulted from render and filter paths, so
-- reading a table to answer them would put a query in the middle of a render.
--
-- Only `master_admin.manage` reads from here, and the CHECK constraint below is
-- what stops a second one being added by accident. A database row for a
-- capability whose guards are synchronous would be a grant the application
-- silently IGNORES — somebody granted a power they do not have, which is worse
-- than no grant at all. Widening this list therefore requires making that
-- capability's guards async: a code change plus a migration, never a row.
--
-- ── THE BOOTSTRAP ───────────────────────────────────────────────────────────
-- The two addresses in the code GRANTS table remain master admins regardless of
-- what is in this table, and the reader falls back to them alone if this table
-- cannot be read. Losing a read can therefore REVOKE an administered grant but
-- can never INVENT one. There is always a way back in.
--
-- Additive and idempotent.

CREATE TABLE IF NOT EXISTS capability_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  -- Snapshot for audit readability, and because the code bootstrap is keyed by
  -- email: an exported or restored dump stays readable without a join.
  employee_email text NOT NULL,
  capability text NOT NULL,
  granted_by_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT capability_grants_capability_chk
    CHECK (capability IN ('master_admin.manage')),
  CONSTRAINT capability_grants_uniq UNIQUE (employee_id, capability)
);

CREATE INDEX IF NOT EXISTS capability_grants_capability_idx
  ON capability_grants (capability);

-- APPEND-ONLY. Both directions of every change, because the question that gets
-- asked about a permission system after an incident is "who gave them that, and
-- when" — and a table that only holds current state cannot answer it.
--
-- Mirrors `module_permission_events` (0219), including the denormalised
-- employee_id ON DELETE SET NULL: an offboarded employee must not take the
-- record of their own privilege with them.
CREATE TABLE IF NOT EXISTS capability_grant_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  employee_email text NOT NULL,
  capability text NOT NULL,
  action text NOT NULL CHECK (action IN ('granted','revoked')),
  actor_employee_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  actor_email text,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS capability_grant_events_employee_idx
  ON capability_grant_events (employee_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS capability_grant_events_recent_idx
  ON capability_grant_events (occurred_at DESC);

-- Verify (ONE statement — the Supabase editor shows only the last result set):
--
--   select
--     (select count(*) from information_schema.tables
--       where table_name in ('capability_grants','capability_grant_events')) = 2
--       as both_tables_exist,
--     (select count(*) from capability_grants) = 0 as no_grants_yet,
--     (select string_agg(distinct capability, ',') from capability_grants) is null
--       as only_the_one_capability_is_possible;
