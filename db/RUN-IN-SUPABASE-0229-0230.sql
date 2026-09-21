-- ===========================================================================
--  RUN IN SUPABASE - the pending migrations, 0229 and 0230
--  Altus WMS | branch Rudra | generated 2026-09-16
-- ===========================================================================
--
--  Paste the whole file into the Supabase SQL editor and Run, or:
--      psql "$DATABASE_URL" -f db/RUN-IN-SUPABASE-0229-0230.sql
--
--  Every statement below is copied VERBATIM from db/migrations/*.sql. Nothing
--  was retyped, so nothing can have drifted from the repo.
--
--  -- IT IS ENTIRELY ADDITIVE ------------------------------------------------
--
--  No DROP TABLE, no TRUNCATE, no DELETE. Running it twice changes nothing:
--  every statement is IF NOT EXISTS or guarded by a DO block that checks first.
--
--  The DROPs in 0230 are CONSTRAINTS, never data:
--
--    * `pa_entries.person_id` loses its NOT NULL, so a participant or client
--      can sit in the unassigned pool. Every existing row keeps its owner.
--    * `pa_entries_status_chk`, `pa_entries_highlight_chk`,
--      `pa_ambassadors_status_chk` and `pa_calls_time_window` are each dropped
--      and immediately recreated, which is how a CHECK is changed in place.
--      `pa_entries_status_chk` is the one that is NOT recreated: it came from
--      0194 and allowed only 'active' | 'inactive' on a column Client
--      Engagement does not write, the colour band having moved to `highlight`.
--
--  -- WHAT THEY DO -----------------------------------------------------------
--
--  0229  Broadcasts: annual and custom-date recurrences, a publishing claim so
--        a scheduled broadcast cannot go out twice, and per-recipient channel
--        outcomes for WhatsApp.
--
--  0230  Client Engagement: participants and clients may sit unassigned,
--        ambassadors gain an owner and a status, calls gain a 10:00-20:00
--        window, plus the assignment log and the DD Master option table.
--
--  -- AFTERWARDS -------------------------------------------------------------
--
--  Nothing else to run. The app reads these columns defensively, so it keeps
--  working against a database where this file has NOT been run yet - the new
--  screens simply have nothing to show.
--
-- ===========================================================================

BEGIN;

-- ---------------------------------------------------------------------------
--  0229_broadcast_recurrence_whatsapp.sql
-- ---------------------------------------------------------------------------

-- 0229 — Broadcasts: annual + custom-date repeats, on-time publishing, automatic WhatsApp.
-- Additive + idempotent.
--
-- recurrence_dates   The instants a "custom" repeat goes out on (ISO strings).
--                    `recurrence` is plain text with no CHECK (0180), so the two
--                    new values, "annually" and "custom", need no constraint work.
-- recurrence_anchor  The first send of a monthly / annual repeat. Its day of the
--                    month is kept, so 31 Jan → 28 Feb → 31 Mar instead of
--                    drifting to the 28th for good.
-- publish_claimed_at Set while a sweep publishes a due broadcast. Scheduled sends
--                    are now picked up within about a minute (the popup poll
--                    triggers a sweep), so several sweeps can run at once; the
--                    claim is what stops two of them publishing the same one.
-- channel_outcomes   Per recipient, per channel: what happened. Today only
--                    WhatsApp — {"whatsapp":{"status":"sent|skipped|failed",...}}.

ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS recurrence_dates jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS recurrence_anchor timestamptz;
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS publish_claimed_at timestamptz;

ALTER TABLE broadcast_recipients ADD COLUMN IF NOT EXISTS channel_outcomes jsonb NOT NULL DEFAULT '{}'::jsonb;

-- The sweep asks "anything scheduled and due?" on every run.
CREATE INDEX IF NOT EXISTS broadcasts_due_idx ON broadcasts (scheduled_for) WHERE status = 'scheduled';

-- ---------------------------------------------------------------------------
--  0230_client_engagement.sql
-- ---------------------------------------------------------------------------

-- 0230 — Client Engagement, built on the Hand-holding tables.
-- Additive + idempotent. Nothing is dropped and no row is deleted.
--
-- The brief (Manan, 2026-09-15) adds to what Hand-holding already stores:
--
--   · an UNASSIGNED POOL — anyone may add a participant / client / ambassador,
--     and only Manan, Rashmi and Ruchita may assign it to a lead. So an entry
--     may now exist with no owner: person_id becomes nullable.
--   · STATUSES — active / barter / revenue share, beside the existing on-hold
--     flag; "not started" is derived from a future start date, never stored.
--   · CALL TIMES — calls carry a start and end time (10:00–20:00), not just a
--     duration, so a commitment calendar can draw them.
--   · LEADS — pa_people rows that are Client Engagement team leads.
--   · a TRANSFER LOG, and the DD MASTER (editable dropdown lists).
--
-- `pa_calls.call_type` and `pa_entries.section` are plain text with no CHECK
-- (0193 / 0195), so the new call types (courtesy, reference) and the new product
-- (os) need no constraint changes. The only CHECK on pa_calls is
-- pa_calls_one_owner, which is untouched.

-- ── The unassigned pool ─────────────────────────────────────────────────
ALTER TABLE pa_entries ALTER COLUMN person_id DROP NOT NULL;

-- ── Statuses ────────────────────────────────────────────────────────────
-- pa_entries already HAS the right column: migration 0194 added `highlight`
-- for exactly this — "the colour band, or null for a plain row" — alongside a
-- `status` column meaning active | inactive (which paired table a row sits in).
-- 0194 shipped without a UI, so nothing reads either one yet. Client Engagement
-- fills `highlight` and leaves `status` to mean what 0194 said it means.
-- Null = no band = a plain active row. On hold and not started are DERIVED (the
-- on_hold flag and a future start date), never stored.
-- An earlier revision of THIS migration constrained `status` to the Client
-- Engagement values, which would refuse 0194's own 'inactive'. Drop it wherever
-- it was already applied; `status` belongs to 0194 and is not ours to narrow.
ALTER TABLE pa_entries DROP CONSTRAINT IF EXISTS pa_entries_status_chk;

ALTER TABLE pa_entries DROP CONSTRAINT IF EXISTS pa_entries_highlight_chk;
ALTER TABLE pa_entries ADD CONSTRAINT pa_entries_highlight_chk
  CHECK (highlight IS NULL OR highlight IN ('active','barter','revenue_share'));

-- Ambassadors have no highlight column of their own, so they get one field.
ALTER TABLE pa_ambassadors ADD COLUMN IF NOT EXISTS status text;
ALTER TABLE pa_ambassadors DROP CONSTRAINT IF EXISTS pa_ambassadors_status_chk;
ALTER TABLE pa_ambassadors ADD CONSTRAINT pa_ambassadors_status_chk
  CHECK (status IS NULL OR status IN ('active','barter','revenue_share'));

-- Ambassadors get an owner of their own; entries already have person_id.
ALTER TABLE pa_ambassadors ADD COLUMN IF NOT EXISTS owner_person_id uuid
  REFERENCES pa_people(id) ON DELETE SET NULL;

-- ── A batch that is over is ARCHIVED, not deleted ───────────────────────
-- sweepExpiredEntries used to DELETE rows (and their calls, by cascade) on page
-- load. Archiving keeps the history the grids and the transfer log refer to.
ALTER TABLE pa_entries ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- ── Team leads ──────────────────────────────────────────────────────────
ALTER TABLE pa_people ADD COLUMN IF NOT EXISTS is_ce_lead boolean NOT NULL DEFAULT false;
-- NOT unique: legacy rows may duplicate a person, and a migration must not fail
-- on data that predates the rule.
CREATE INDEX IF NOT EXISTS pa_people_employee_idx ON pa_people (employee_id);

-- ── Call times ──────────────────────────────────────────────────────────
ALTER TABLE pa_calls ADD COLUMN IF NOT EXISTS start_time time;
ALTER TABLE pa_calls ADD COLUMN IF NOT EXISTS end_time   time;
ALTER TABLE pa_calls DROP CONSTRAINT IF EXISTS pa_calls_time_window;
ALTER TABLE pa_calls ADD CONSTRAINT pa_calls_time_window
  CHECK (
    (start_time IS NULL AND end_time IS NULL)
    OR (start_time >= '10:00' AND end_time <= '20:00' AND end_time > start_time)
  );

-- ── Who moved what, and when ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pa_assignment_events (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type    text NOT NULL CHECK (entity_type IN ('entry','ambassador')),
  entity_id      uuid NOT NULL,
  from_person_id uuid REFERENCES pa_people(id) ON DELETE SET NULL,
  to_person_id   uuid REFERENCES pa_people(id) ON DELETE SET NULL,
  actor_id       uuid REFERENCES employees(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pa_assignment_events_entity_idx
  ON pa_assignment_events (entity_type, entity_id, created_at);

-- ── DD Master — the dropdown lists, editable in the app ─────────────────
-- list_key: 'product' | 'call_type' | 'batch'. The code constants remain the
-- fallback, so an empty table changes nothing.
CREATE TABLE IF NOT EXISTS ce_dropdown_options (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  list_key   text NOT NULL,
  code       text NOT NULL,
  label      text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active  boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ce_dropdown_options_key_code_uidx
  ON ce_dropdown_options (list_key, code);

COMMIT;

-- ===========================================================================
--  A quick look at what landed:
--
--    select column_name from information_schema.columns
--     where table_name = 'broadcasts' and column_name like 'recurrence%';
--
--    select column_name from information_schema.columns
--     where table_name = 'pa_calls' and column_name in ('start_time','end_time');
--
--    select count(*) from ce_dropdown_options;   -- 0 is correct: the lists
--                                                -- start from the code
-- ===========================================================================
