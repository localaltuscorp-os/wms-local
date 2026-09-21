-- ===========================================================================
--  RUN IN SUPABASE — 0238, Client Engagement (rebuild)
--  Altus WMS | branch Rudra | generated 2026-09-18
-- ===========================================================================
--
--  WHICH DATABASE: the one .env.local points at — project
--  `ifcdpjbdinvmtewmgceg`, the database localhost:3000 talks to.
--
--  HOW TO RUN IT (from wms-local):
--
--      node --env-file=.env.local scripts/apply-pending-migrations.mjs db/RUN-IN-SUPABASE-0238.sql           (dry run)
--      node --env-file=.env.local scripts/apply-pending-migrations.mjs db/RUN-IN-SUPABASE-0238.sql --apply
--
--  ── WHAT IT CHANGES ---------------------------------------------------------
--
--  * FIVE NEW TABLES: ce_team_members, ce_accounts, ce_engagements,
--    ce_references, ce_audit_log.
--  * Seeds ce_team_members with the eight people the brief names (Manan,
--    Ruchita, Rashmi, Jeevan, Rutvisha, Rohan, Mishtie, Devraj), linked to their
--    login by email where one exists. Skips anyone already there.
--  * NOTHING EXISTING IS ALTERED, DROPPED OR DELETED. The old Client Engagement
--    leftovers (0230's pa_* columns, ce_dropdown_options, pa_assignment_events)
--    and every Hand-holding table stay exactly as they are.
--
--  One transaction: it lands whole or not at all. Safe to run twice.
--
--  Until it runs, every Client Engagement tab shows a "needs its tables" notice
--  instead of an error; nothing else in the app is affected.
-- ===========================================================================

BEGIN;

-- 0238 — Client Engagement, rebuilt on its own tables (2026-09-18).
-- Additive + idempotent. Nothing existing is altered, dropped or deleted.
--
-- The first Client Engagement (0230) was built on Hand-holding's pa_* tables and
-- was not approved. Its screens are quarantined in
-- _archive/client-engagement-2026-09-18. Its database leftovers (the 0230
-- columns on pa_*, ce_dropdown_options, pa_assignment_events) are left exactly
-- as they are: Hand-holding still reads pa_*, and nothing here depends on them.
--
-- The rebuild keeps its own records and LINKS to Hand-holding instead of sharing
-- its rows:
--   · ce_team_members.employee_id → the employee whose Hand-holding calls the
--     calendar overlays (pa_people.employee_id → pa_entries → pa_calls), read-only.
--   · ce_accounts.hh_entry_id → an optional pointer at the pa_entries row the
--     account corresponds to.
--
--   ce_team_members  the coaches / account managers who carry accounts, with a
--                    capacity cap. employee_id is optional because some people
--                    the team plans around (Rutvisha, Devraj) have no login.
--   ce_accounts      one participant / client / ambassador. assigned_to NULL is
--                    the Unassigned pool.
--   ce_engagements   a WEEKLY call slot: a weekday, a from/to inside 10:00–20:00,
--                    and the date range it repeats over. The calendar and both
--                    grids are built from these rows.
--   ce_references    the Reference Pipeline: a quota of referrals to collect
--                    from one account.
--   ce_audit_log     every assignment, transfer, status change and referral
--                    count change, with who and when.
--
-- WHAT IS DERIVED, NOT STORED
--   · Duration = end_time − start_time. Storing it as well would let the two
--     disagree; the CHECK below keeps the window honest instead.
--   · Whether an account shows in the Inactive view: lifecycle_status is not
--     'active', OR hh_status is 'on_hold'. Putting a client on hold therefore
--     moves them to Inactive automatically and keeps assigned_to (their coach)
--     untouched; taking them off hold brings them straight back.
--   · Reference status (pending / in progress / completed / overdue) from the
--     counts and the due date. An 'overdue' that was stored would go stale the
--     day after it was written.

-- ── Team members ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ce_team_members (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text NOT NULL,
  employee_id         uuid REFERENCES employees(id) ON DELETE SET NULL,
  email               text,
  role                text NOT NULL DEFAULT 'coach',
  active_client_limit integer NOT NULL DEFAULT 20,
  is_active           boolean NOT NULL DEFAULT true,
  sort_order          integer NOT NULL DEFAULT 0,
  created_by          uuid REFERENCES employees(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ce_team_members_role_chk
    CHECK (role IN ('coach','consultant','account_manager','admin')),
  CONSTRAINT ce_team_members_limit_chk CHECK (active_client_limit >= 0)
);
-- One team-member row per employee login; people without a login are unconstrained.
CREATE UNIQUE INDEX IF NOT EXISTS ce_team_members_employee_uidx
  ON ce_team_members (employee_id) WHERE employee_id IS NOT NULL;

-- ── Accounts (participants, clients, ambassadors) ──────────────────────
CREATE TABLE IF NOT EXISTS ce_accounts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name        text NOT NULL,
  organization     text,
  category         text NOT NULL,
  batch_code       text,
  assigned_to      uuid REFERENCES ce_team_members(id) ON DELETE SET NULL,
  lifecycle_status text NOT NULL DEFAULT 'active',
  hh_status        text NOT NULL DEFAULT 'standard',
  start_date       date,
  end_date         date,
  tags             text[] NOT NULL DEFAULT '{}',
  notes            text,
  hh_entry_id      uuid REFERENCES pa_entries(id) ON DELETE SET NULL,
  created_by       uuid REFERENCES employees(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ce_accounts_category_chk
    CHECK (category IN ('ps','bss','retainer','corporate','ambassador')),
  -- A batch belongs to PS and BSS only.
  CONSTRAINT ce_accounts_batch_chk
    CHECK (batch_code IS NULL OR category IN ('ps','bss')),
  CONSTRAINT ce_accounts_lifecycle_chk
    CHECK (lifecycle_status IN ('active','inactive','churned','completed')),
  CONSTRAINT ce_accounts_hh_status_chk
    CHECK (hh_status IN ('standard','revenue_share','fee_recovery','not_started','on_hold')),
  CONSTRAINT ce_accounts_dates_chk
    CHECK (start_date IS NULL OR end_date IS NULL OR end_date >= start_date)
);
CREATE INDEX IF NOT EXISTS ce_accounts_assigned_idx ON ce_accounts (assigned_to, category);
CREATE INDEX IF NOT EXISTS ce_accounts_category_idx ON ce_accounts (category, batch_code);

-- ── Engagements (weekly call slots) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS ce_engagements (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id     uuid NOT NULL REFERENCES ce_accounts(id) ON DELETE CASCADE,
  team_member_id uuid NOT NULL REFERENCES ce_team_members(id) ON DELETE CASCADE,
  call_type      text NOT NULL,
  day_of_week    text NOT NULL,
  start_time     time NOT NULL,
  end_time       time NOT NULL,
  start_date     date NOT NULL,
  end_date       date,
  notes          text,
  created_by     uuid REFERENCES employees(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ce_engagements_call_type_chk
    CHECK (call_type IN ('hh','tool','checkin','reference')),
  CONSTRAINT ce_engagements_day_chk
    CHECK (day_of_week IN ('mon','tue','wed','thu','fri','sat','sun')),
  -- The calendar runs 10:00–20:00 and nothing outside it.
  CONSTRAINT ce_engagements_window_chk
    CHECK (start_time >= '10:00' AND end_time <= '20:00' AND end_time > start_time),
  CONSTRAINT ce_engagements_dates_chk
    CHECK (end_date IS NULL OR end_date >= start_date)
);
CREATE INDEX IF NOT EXISTS ce_engagements_member_idx
  ON ce_engagements (team_member_id, day_of_week, start_time);
CREATE INDEX IF NOT EXISTS ce_engagements_account_idx ON ce_engagements (account_id);

-- ── Reference pipeline ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ce_references (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id       uuid NOT NULL REFERENCES ce_accounts(id) ON DELETE CASCADE,
  collector_id     uuid REFERENCES ce_team_members(id) ON DELETE SET NULL,
  target_program   text NOT NULL DEFAULT 'general',
  target_count     integer NOT NULL,
  actual_collected integer NOT NULL DEFAULT 0,
  frequency        text NOT NULL DEFAULT 'one_time',
  due_date         date,
  notes            text,
  -- The weekly reminder cron stamps this so a re-run in the same week is a no-op.
  last_reminded_on date,
  created_by       uuid REFERENCES employees(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ce_references_program_chk CHECK (target_program IN ('bss','bss_c','general')),
  CONSTRAINT ce_references_frequency_chk CHECK (frequency IN ('one_time','every_week')),
  CONSTRAINT ce_references_counts_chk CHECK (target_count > 0 AND actual_collected >= 0)
);
CREATE INDEX IF NOT EXISTS ce_references_collector_idx ON ce_references (collector_id);
CREATE INDEX IF NOT EXISTS ce_references_account_idx ON ce_references (account_id);

-- ── Audit log ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ce_audit_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id   uuid NOT NULL,
  -- create | update | assign | transfer | status | reference_count | delete
  action      text NOT NULL,
  summary     text NOT NULL,
  before      jsonb,
  after       jsonb,
  actor_id    uuid REFERENCES employees(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ce_audit_log_entity_chk
    CHECK (entity_type IN ('account','engagement','reference','team_member'))
);
CREATE INDEX IF NOT EXISTS ce_audit_log_entity_idx ON ce_audit_log (entity_type, entity_id, created_at);
CREATE INDEX IF NOT EXISTS ce_audit_log_recent_idx ON ce_audit_log (created_at DESC);

-- ── Starting roster ────────────────────────────────────────────────────
-- The people the brief names, linked to their login where one exists (matched
-- by email, the identity a namesake cannot borrow). Guarded by NOT EXISTS so a
-- re-run adds nobody twice, and a rename made in the app is never overwritten.
INSERT INTO ce_team_members (name, employee_id, email, role, sort_order)
SELECT v.name, e.id, v.email, v.role, v.sort_order
FROM (VALUES
  ('Manan',    'manan@unleashed.in',                  'admin',           10),
  ('Ruchita',  'ruchitaambre.altuscorp@gmail.com',    'admin',           20),
  ('Rashmi',   'rashmitripathi.altuscorp@gmail.com',  'coach',           30),
  ('Jeevan',   'jeevanbharambe.altuscorp@gmail.com',  'coach',           40),
  ('Rutvisha', NULL,                                  'coach',           50),
  ('Rohan',    'rohanchoudhary.altuscorp@gmail.com',  'coach',           60),
  ('Mishtie',  'mishtiekanani.altuscorp@gmail.com',   'coach',           70),
  ('Devraj',   NULL,                                  'account_manager', 80)
) AS v(name, email, role, sort_order)
LEFT JOIN employees e ON lower(e.email) = v.email
WHERE NOT EXISTS (
  SELECT 1 FROM ce_team_members t
  WHERE lower(t.name) = lower(v.name)
     OR (e.id IS NOT NULL AND t.employee_id = e.id)
);


COMMIT;
