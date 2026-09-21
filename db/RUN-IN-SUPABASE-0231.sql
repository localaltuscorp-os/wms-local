-- ===========================================================================
--  RUN IN SUPABASE — 0231, the Executive Master Calendar
--  Altus WMS | branch Rudra | generated 2026-09-17
-- ===========================================================================
--
--  WHICH DATABASE: the one .env.local points at — project
--  `ifcdpjbdinvmtewmgceg`, the database localhost:3000 talks to.
--
--  HOW TO RUN IT (the dashboard refuses this account, so use the runner that
--  applied 0225–0230):
--
--      node --env-file=.env.local scripts/apply-pending-migrations.mjs --apply
--
--  ── ENTIRELY ADDITIVE ------------------------------------------------------
--
--  Three NEW tables and nothing else. No DROP TABLE, no DELETE, no TRUNCATE,
--  and not one existing table is altered — `calendar_events`, `event_holidays`
--  and the rest of the archived module keep every row they have. Running it
--  twice changes nothing.
--
--  ── WHAT IT CREATES --------------------------------------------------------
--
--  exec_calendar_events    one executive's blocks: owner, category, day,
--                          start/end minutes, visibility (public|busy|private),
--                          optional link to a Client Engagement record
--  exec_calendar_routines  recurring patterns — the 07:00 exercise block, the
--                          Saturday cohort — stamped across a date range
--  exec_calendar_prefs     the grid window per person (07:00–22:00 by default)
--
--  ── UNTIL IT RUNS ----------------------------------------------------------
--
--  The app already works. `lib/queries/exec-calendar.ts` catches the missing
--  table and renders an empty grid with a banner saying so, rather than a
--  broken page — the same fail-soft the rest of the app uses.
-- ===========================================================================

BEGIN;

-- 0231 — Executive Master Calendar.
-- Additive + idempotent. Nothing is dropped and no existing row is touched.
--
-- WHY NEW TABLES RATHER THAN COLUMNS ON `calendar_events`. The Monthly Events
-- Master is a SHARED COMPANY calendar: batches, obligations and holidays that
-- several other modules read. This is one executive's master schedule, with an
-- owner, a privacy setting and protected time. Bolting an owner and a
-- visibility onto the shared table would have made every existing consumer
-- responsible for filtering rows it never had to think about before — and the
-- first consumer that forgot would leak a private block. Separate tables keep
-- that impossible. `calendar_events` and its five friends are untouched.
--
-- IST: every date is a plain `date` and every time an integer minute-from-
-- midnight, never a timestamptz. The app is one timezone and a stored instant
-- is what makes a 07:00 block render at 01:30 for whoever opens it next.

-- ── Who owns a block, and who may see it ────────────────────────────────
-- owner_id      the executive whose schedule this is
-- visibility    public | busy | private  (lib/exec-calendar/privacy.ts)
--               busy = the team sees the SHAPE (day + hours) and nothing else
-- category_key  one of the seven fixed keys in lib/exec-calendar/taxonomy.ts.
--               Text with a CHECK rather than an enum: adding a category should
--               be a code change plus one migration, not a type rewrite, and a
--               CHECK still refuses a typo at the door.
-- client_entry_id  the Client Engagement record this consulting slot is for
--                  (§4A). ON DELETE SET NULL: losing the client must not lose
--                  the history of the time spent on them.
CREATE TABLE IF NOT EXISTS exec_calendar_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  title           text NOT NULL,
  category_key    text NOT NULL,
  event_date      date NOT NULL,
  start_min       integer,
  end_min         integer,
  all_day         boolean NOT NULL DEFAULT false,
  visibility      text NOT NULL DEFAULT 'public',
  location        text,
  notes           text,
  client_entry_id uuid REFERENCES pa_entries(id) ON DELETE SET NULL,
  batch_label     text,
  routine_id      uuid,
  created_by_id   uuid REFERENCES employees(id) ON DELETE SET NULL,
  updated_by_id   uuid REFERENCES employees(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE exec_calendar_events DROP CONSTRAINT IF EXISTS exec_calendar_events_category_chk;
ALTER TABLE exec_calendar_events ADD CONSTRAINT exec_calendar_events_category_chk
  CHECK (category_key IN ('personal','recovery','client','cohort','bizdev','ops','marker'));

ALTER TABLE exec_calendar_events DROP CONSTRAINT IF EXISTS exec_calendar_events_visibility_chk;
ALTER TABLE exec_calendar_events ADD CONSTRAINT exec_calendar_events_visibility_chk
  CHECK (visibility IN ('public','busy','private'));

-- A block is either all-day, or a sane timed range. The window itself is NOT
-- constrained here: 07:00–22:00 is a VIEW setting the user can widen, and a
-- database that refused a 06:00 flight would be wrong about the world.
ALTER TABLE exec_calendar_events DROP CONSTRAINT IF EXISTS exec_calendar_events_time_chk;
ALTER TABLE exec_calendar_events ADD CONSTRAINT exec_calendar_events_time_chk
  CHECK (
    (all_day = true AND start_min IS NULL AND end_min IS NULL)
    OR (start_min IS NULL AND end_min IS NULL)
    OR (start_min >= 0 AND end_min <= 1440 AND end_min > start_min)
  );

-- The calendar always reads a date range for one owner.
CREATE INDEX IF NOT EXISTS exec_calendar_events_owner_date_idx
  ON exec_calendar_events (owner_id, event_date);
CREATE INDEX IF NOT EXISTS exec_calendar_events_date_idx
  ON exec_calendar_events (event_date);
CREATE INDEX IF NOT EXISTS exec_calendar_events_client_idx
  ON exec_calendar_events (client_entry_id);

-- ── Recurring routines (§4B) ────────────────────────────────────────────
-- The 07:00 exercise block, the Saturday cohort, the executive break — stamped
-- across a date range on chosen weekdays. days_of_week holds 0=Mon … 6=Sun; an
-- empty array means every day.
--
-- Routines GENERATE rows in exec_calendar_events (carrying routine_id), rather
-- than being expanded at read time. One deleted Tuesday has to stay deleted,
-- and a rule evaluated on every read cannot remember that.
CREATE TABLE IF NOT EXISTS exec_calendar_routines (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  title         text NOT NULL,
  category_key  text NOT NULL,
  days_of_week  integer[] NOT NULL DEFAULT '{}',
  start_min     integer NOT NULL,
  end_min       integer NOT NULL,
  from_date     date NOT NULL,
  to_date       date NOT NULL,
  visibility    text NOT NULL DEFAULT 'public',
  is_active     boolean NOT NULL DEFAULT true,
  created_by_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE exec_calendar_routines DROP CONSTRAINT IF EXISTS exec_calendar_routines_category_chk;
ALTER TABLE exec_calendar_routines ADD CONSTRAINT exec_calendar_routines_category_chk
  CHECK (category_key IN ('personal','recovery','client','cohort','bizdev','ops','marker'));

ALTER TABLE exec_calendar_routines DROP CONSTRAINT IF EXISTS exec_calendar_routines_time_chk;
ALTER TABLE exec_calendar_routines ADD CONSTRAINT exec_calendar_routines_time_chk
  CHECK (start_min >= 0 AND end_min <= 1440 AND end_min > start_min AND to_date >= from_date);

CREATE INDEX IF NOT EXISTS exec_calendar_routines_owner_idx
  ON exec_calendar_routines (owner_id, is_active);

-- The generated rows point back at their rule, so editing the routine can
-- re-stamp and deleting it can sweep up. Added after both tables exist.
DO $fk$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'exec_calendar_events_routine_fk'
  ) THEN
    ALTER TABLE exec_calendar_events
      ADD CONSTRAINT exec_calendar_events_routine_fk
      FOREIGN KEY (routine_id) REFERENCES exec_calendar_routines(id) ON DELETE SET NULL;
  END IF;
END
$fk$;

CREATE INDEX IF NOT EXISTS exec_calendar_events_routine_idx
  ON exec_calendar_events (routine_id);

-- ── Per-person grid preferences (§2A "configurable") ────────────────────
-- The window and row size, so "configurable" survives a browser change and is
-- the same on the laptop and the phone. Defaults match DEFAULT_GRID in
-- lib/exec-calendar/grid.ts (07:00–22:00, half-hour rows).
CREATE TABLE IF NOT EXISTS exec_calendar_prefs (
  employee_id uuid PRIMARY KEY REFERENCES employees(id) ON DELETE CASCADE,
  start_min   integer NOT NULL DEFAULT 420,
  end_min     integer NOT NULL DEFAULT 1320,
  slot_min    integer NOT NULL DEFAULT 30,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE exec_calendar_prefs DROP CONSTRAINT IF EXISTS exec_calendar_prefs_window_chk;
ALTER TABLE exec_calendar_prefs ADD CONSTRAINT exec_calendar_prefs_window_chk
  CHECK (start_min >= 0 AND end_min <= 1440 AND end_min > start_min AND slot_min IN (30, 60));

COMMIT;
