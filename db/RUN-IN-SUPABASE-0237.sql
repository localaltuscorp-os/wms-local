-- ===========================================================================
--  RUN IN SUPABASE — 0237, exec calendar: new categories, fixed clients,
--  Day Markers
--  Altus WMS | branch Rudra | generated 2026-09-18
-- ===========================================================================
--
--  WHICH DATABASE: the one .env.local points at — project
--  `ifcdpjbdinvmtewmgceg`, the database localhost:3000 talks to.
--
--  HOW TO RUN IT (from wms-local):
--
--      node --env-file=.env.local scripts/apply-pending-migrations.mjs db/RUN-IN-SUPABASE-0237.sql           (dry run)
--      node --env-file=.env.local scripts/apply-pending-migrations.mjs db/RUN-IN-SUPABASE-0237.sql --apply
--
--  ── WHAT IT CHANGES ---------------------------------------------------------
--
--  * exec_calendar_events / exec_calendar_routines: every block and routine on
--    one of the 7 OLD category keys is moved to the matching NEW key (mapping
--    in the migration header below). No row is deleted. The two category
--    CHECKs are replaced with the 14 new keys.
--  * exec_calendar_events: new nullable column `client_key`.
--  * new table exec_calendar_day_markers.
--
--  One transaction: it lands whole or not at all. Safe to run twice.
--
--  RUN IT BEFORE the new calendar code reaches the running server: that code
--  reads `client_key` and the markers table, and /events errors until both
--  exist.
-- ===========================================================================

BEGIN;

-- 0237 — Executive calendar: the new category set, fixed clients, Day Markers.
-- Asked 2026-09-18. Idempotent: safe to run twice.
--
-- 1. CATEGORIES. The seven original keys are replaced by the fourteen the team
--    actually plans with (lib/exec-calendar/taxonomy.ts). Existing blocks and
--    routines are MOVED to the nearest new key first - nothing is deleted:
--        personal  → personal          recovery → wkly_off
--        client    → consulting        ops      → staff_time
--        marker    → festival
--        cohort    → cq / ps when the title says so, otherwise grad_workshop
--        bizdev    → lead_gen when the title says "lead gen", otherwise sales
--    The UPDATEs only touch rows still on an old key, so a second run is a
--    no-op. The CHECKs are dropped BEFORE the remap (the old CHECK would refuse
--    the new keys) and re-added after it.
--
-- 2. CLIENTS. The client picker is now a fixed list in code
--    (lib/exec-calendar/clients.ts); `client_key` stores which one. The old
--    `client_entry_id` link to Client Engagement is left as it was, with every
--    value it holds, and is simply no longer written.
--
-- 3. DAY MARKERS. "Final exam", "Exam week", "Diwali": a label on one day, a
--    run of days, or a hand-picked set of days. Stored as the expanded list of
--    dates, which is what every view needs; `mode` remembers how it was entered
--    so the editor can reopen it the same way.


-- ── 1. Categories ───────────────────────────────────────────────────────
ALTER TABLE exec_calendar_events DROP CONSTRAINT IF EXISTS exec_calendar_events_category_chk;
ALTER TABLE exec_calendar_routines DROP CONSTRAINT IF EXISTS exec_calendar_routines_category_chk;

UPDATE exec_calendar_events SET category_key = CASE category_key
    WHEN 'recovery' THEN 'wkly_off'
    WHEN 'client'   THEN 'consulting'
    WHEN 'ops'      THEN 'staff_time'
    WHEN 'marker'   THEN 'festival'
    WHEN 'cohort'   THEN CASE
                           WHEN title ~* '(^|[^a-z])cq([^a-z]|$)' THEN 'cq'
                           WHEN title ~* '(^|[^a-z])ps([^a-z]|$)' THEN 'ps'
                           ELSE 'grad_workshop'
                         END
    WHEN 'bizdev'   THEN CASE WHEN title ~* 'lead[ -]?gen' THEN 'lead_gen' ELSE 'sales' END
  END
  WHERE category_key IN ('recovery','client','ops','marker','cohort','bizdev');

UPDATE exec_calendar_routines SET category_key = CASE category_key
    WHEN 'recovery' THEN 'wkly_off'
    WHEN 'client'   THEN 'consulting'
    WHEN 'ops'      THEN 'staff_time'
    WHEN 'marker'   THEN 'festival'
    WHEN 'cohort'   THEN CASE
                           WHEN title ~* '(^|[^a-z])cq([^a-z]|$)' THEN 'cq'
                           WHEN title ~* '(^|[^a-z])ps([^a-z]|$)' THEN 'ps'
                           ELSE 'grad_workshop'
                         END
    WHEN 'bizdev'   THEN CASE WHEN title ~* 'lead[ -]?gen' THEN 'lead_gen' ELSE 'sales' END
  END
  WHERE category_key IN ('recovery','client','ops','marker','cohort','bizdev');

ALTER TABLE exec_calendar_events ADD CONSTRAINT exec_calendar_events_category_chk
  CHECK (category_key IN ('sales','fixed','consulting','cq','ps','staff_time','lead_gen',
                          'grad_workshop','flexible_time','festival','wkly_off','family_time',
                          'personal','siaa_exam'));
ALTER TABLE exec_calendar_routines ADD CONSTRAINT exec_calendar_routines_category_chk
  CHECK (category_key IN ('sales','fixed','consulting','cq','ps','staff_time','lead_gen',
                          'grad_workshop','flexible_time','festival','wkly_off','family_time',
                          'personal','siaa_exam'));

-- ── 2. Clients ──────────────────────────────────────────────────────────
-- Text, not a CHECK: the list lives in code and grows by a code change; the
-- save action validates the key against it.
ALTER TABLE exec_calendar_events ADD COLUMN IF NOT EXISTS client_key text;

-- ── 3. Day Markers ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS exec_calendar_day_markers (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  label         text NOT NULL,
  mode          text NOT NULL DEFAULT 'day',
  dates         date[] NOT NULL DEFAULT '{}',
  created_by_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE exec_calendar_day_markers DROP CONSTRAINT IF EXISTS exec_calendar_day_markers_mode_chk;
ALTER TABLE exec_calendar_day_markers ADD CONSTRAINT exec_calendar_day_markers_mode_chk
  CHECK (mode IN ('day','range','dates'));

ALTER TABLE exec_calendar_day_markers DROP CONSTRAINT IF EXISTS exec_calendar_day_markers_shape_chk;
ALTER TABLE exec_calendar_day_markers ADD CONSTRAINT exec_calendar_day_markers_shape_chk
  CHECK (char_length(label) BETWEEN 1 AND 120 AND cardinality(dates) BETWEEN 1 AND 366);

CREATE INDEX IF NOT EXISTS exec_calendar_day_markers_owner_idx
  ON exec_calendar_day_markers (owner_id);
-- "Which markers touch this week/month/year" is an array-overlap question.
CREATE INDEX IF NOT EXISTS exec_calendar_day_markers_dates_idx
  ON exec_calendar_day_markers USING gin (dates);


COMMIT;
