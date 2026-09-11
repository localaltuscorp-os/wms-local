-- ════════════════════════════════════════════════════════════════════════════
-- RUN THIS IN SUPABASE  ·  migrations 0221 + 0222
--
--   0221 — Operations · Event Checklist   (templates, runs, items, checks)
--   0222 — HR · Job Description           (ranks, positions, JD Bank, …)
--
-- HOW TO RUN
--   Supabase → SQL Editor → New query → paste this whole file → Ctrl+A → Run.
--   ⚠ The editor runs ONLY THE SELECTED TEXT when a selection exists, so a
--     partial selection reports success having done nothing. Press Ctrl+A first.
--
-- SAFETY
--   Everything is additive (CREATE TABLE IF NOT EXISTS) except ONE guarded step,
--   marked below, which drops the Operations checklist tables ONLY IF they exist
--   in the pre-offset shape. That shape was never applied to this database — the
--   Checklist page has been showing "needs its database tables" — so the guard
--   is a precaution, not an expected path.
--
--   NO EXISTING TABLE IS ALTERED. In particular `employees` is untouched:
--   which seat a person holds lives in its own jd_position_holders table,
--   because adding a column to `employees` would make every bare SELECT on it —
--   the sign-in lookup included — fail until this file had been run.
--
--   Wrapped in a single transaction: if any statement fails, nothing is applied.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── GUARDED STEP ────────────────────────────────────────────────────────────
-- An earlier draft of 0221 shipped ops_checklist_items with a `scope` column
-- and no `offset_days`. If that shape is present, CREATE TABLE IF NOT EXISTS
-- would silently skip it and leave the application querying columns that do not
-- exist. Drop it only in that exact case.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'ops_checklist_items'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'ops_checklist_items'
      AND column_name = 'offset_days'
  ) THEN
    RAISE NOTICE 'Dropping pre-offset Operations checklist tables.';
    DROP TABLE IF EXISTS public.ops_checklist_checks CASCADE;
    DROP TABLE IF EXISTS public.ops_checklist_items  CASCADE;
  END IF;
END $$;

-- ════════ 0221 ════════
-- 0221 — Operations module · Event Checklist.
--
-- ── WHAT THIS SUPERSEDES ────────────────────────────────────────────────────
-- An earlier draft of this same migration (never applied, never committed)
-- stored `scope` on the ITEM and addressed a tick by (event) or (person,month).
-- The Event Checklist specification replaced that model, for one reason that
-- decides everything else: DATES ARE DRIVEN BY AN OFFSET FROM THE EVENT.
--
-- An offset means nothing without an event date, so "is this an event
-- checklist?" cannot be a per-row property — every row in a list has to share
-- one anchor or half of them have no computable target date. The flag moved up
-- to the checklist, and once it did, a checklist became a thing in its own
-- right rather than a filter over one global item list.
--
-- ── TEMPLATE vs RUN ─────────────────────────────────────────────────────────
-- Two levels, because "Save as Master Checklist" and "Duplicate onto another
-- event" are the whole point of the feature:
--   · TEMPLATE — a reusable named list. No event, no dates, only offsets.
--   · RUN      — one template applied to one event on one date. Carries ticks.
-- Items belong to exactly one of the two (CHECK-enforced): a template's items
-- are the pattern, a run's items are the copy that was actually worked.
--
-- ── WHY THE RUN COPIES event_date ───────────────────────────────────────────
-- Joining to calendar_events would be tidier, and wrong: moving an event in the
-- calendar would silently rewrite every target date and every variance figure
-- on checklists people had already worked against, including closed ones. The
-- run owns its date. The UI offers "the event moved — recalculate?" as a
-- decision instead of a side effect.

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Templates — the reusable master checklists.
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ops_checklist_templates" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name"          text NOT NULL UNIQUE,
  -- THE HEADER TOGGLE. true  → offsets + an event anchor (Before/During/After).
  --                   false → a standing operational list; each row carries its
  --                           own target date and there is no phase grouping.
  "is_event"      boolean NOT NULL DEFAULT true,
  "description"   text,
  "is_active"     boolean NOT NULL DEFAULT true,
  "created_by_id" uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "updated_by_id" uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "created_at"    timestamptz NOT NULL DEFAULT now(),
  "updated_at"    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "ops_checklist_templates_active_idx"
  ON "ops_checklist_templates" ("is_active", "name");

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Runs — one checklist, for one event.
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ops_checklist_runs" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Nullable: a run can be built from scratch and saved as a template later.
  "template_id"   uuid REFERENCES "ops_checklist_templates"("id") ON DELETE SET NULL,
  "title"         text NOT NULL,
  "is_event"      boolean NOT NULL DEFAULT true,
  -- The Monthly Events Master record this hangs off. SET NULL, not CASCADE:
  -- deleting an event must not delete the record of the work done for it.
  "event_id"      uuid REFERENCES "calendar_events"("id") ON DELETE SET NULL,
  -- COPIED from the event, not joined. See the header note.
  "event_date"    date,
  "status"        text NOT NULL DEFAULT 'active',
  "notes"         text,
  "created_by_id" uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "updated_by_id" uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "created_at"    timestamptz NOT NULL DEFAULT now(),
  "updated_at"    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "ops_checklist_runs_status_chk"
    CHECK ("status" IN ('active', 'completed', 'cancelled')),
  -- An event run with no date cannot compute a single target date, so the
  -- database refuses it rather than the grid rendering a column of blanks.
  CONSTRAINT "ops_checklist_runs_event_date_chk"
    CHECK ("is_event" = false OR "event_date" IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS "ops_checklist_runs_event_idx"
  ON "ops_checklist_runs" ("event_id");
CREATE INDEX IF NOT EXISTS "ops_checklist_runs_status_date_idx"
  ON "ops_checklist_runs" ("status", "event_date" DESC);

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Items — the rows of the grid.
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ops_checklist_items" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Exactly one of these two is set — the item is either part of the reusable
  -- pattern or part of one worked copy of it.
  "template_id"   uuid REFERENCES "ops_checklist_templates"("id") ON DELETE CASCADE,
  "run_id"        uuid REFERENCES "ops_checklist_runs"("id") ON DELETE CASCADE,

  "code"          text,
  "title"         text NOT NULL,                      -- the Activity column
  "category"      text,

  -- DAYS RELATIVE TO THE EVENT. -3 = three days before, 0 = event day,
  -- +1 = the day after. NULL = undated, which is NOT the same as 0: an
  -- imported row that nobody has scheduled yet sorts into its own group rather
  -- than silently claiming the event day.
  "offset_days"   integer,
  -- Non-event runs only: the date typed directly, since there is no anchor to
  -- offset from. Event runs leave this NULL and compute from the run's date.
  "target_date"   date,

  "doer_id"       uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "backup_id"     uuid REFERENCES "employees"("id") ON DELETE SET NULL,

  "instructions"  text,
  "file_link"     text,
  -- Provenance for a row pulled in from the HR Job Description Bank. No FK yet
  -- — jd_entries ships in 0222 — so this is a bare uuid until then.
  "jd_entry_id"   uuid,

  "sort_order"    integer NOT NULL DEFAULT 100,
  "is_active"     boolean NOT NULL DEFAULT true,
  "created_by_id" uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "updated_by_id" uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "created_at"    timestamptz NOT NULL DEFAULT now(),
  "updated_at"    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT "ops_checklist_items_parent_chk" CHECK (
    ("template_id" IS NOT NULL AND "run_id" IS NULL)
    OR
    ("template_id" IS NULL AND "run_id" IS NOT NULL)
  ),
  -- A two-year offset is a typo, not a plan.
  CONSTRAINT "ops_checklist_items_offset_chk"
    CHECK ("offset_days" IS NULL OR ("offset_days" BETWEEN -365 AND 365)),
  -- A backup who is also the doer is no backup at all.
  CONSTRAINT "ops_checklist_items_backup_chk"
    CHECK ("backup_id" IS NULL OR "backup_id" <> "doer_id")
);

CREATE INDEX IF NOT EXISTS "ops_checklist_items_template_idx"
  ON "ops_checklist_items" ("template_id", "sort_order");
CREATE INDEX IF NOT EXISTS "ops_checklist_items_run_idx"
  ON "ops_checklist_items" ("run_id", "offset_days", "sort_order");
CREATE INDEX IF NOT EXISTS "ops_checklist_items_doer_idx"
  ON "ops_checklist_items" ("doer_id");

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Checks — one tick per item per run.
-- ───────────────────────────────────────────────────────────────────────────
-- Four states, not a boolean, and the same four the Accounts weekly checklist
-- uses (migration 0080): two checklists in one app that grade work differently
-- make "Done" mean two things. "Not Applicable" is what stops people ticking
-- Done on work that never needed doing — the difference between a checklist you
-- can trust and one everybody clears to 100%.
CREATE TABLE IF NOT EXISTS "ops_checklist_checks" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "run_id"        uuid NOT NULL REFERENCES "ops_checklist_runs"("id") ON DELETE CASCADE,
  "item_id"       uuid NOT NULL REFERENCES "ops_checklist_items"("id") ON DELETE CASCADE,
  "status"        text NOT NULL DEFAULT 'Pending',
  "notes"         text,
  -- THE ACTUAL DATE. Written on the transition into Done, cleared on the way
  -- out. Variance is (done_at::date - target_date) and is never stored — it
  -- derives from two columns, and a stored third could disagree with both.
  "done_at"       timestamptz,
  "updated_by_id" uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "created_at"    timestamptz NOT NULL DEFAULT now(),
  "updated_at"    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "ops_checklist_checks_status_chk"
    CHECK ("status" IN ('Done', 'Pending', 'Need Help', 'Not Applicable'))
);

-- One tick per item per run. Plain unique, not partial — there is a single
-- addressing shape now, which is the simplification the run model bought.
CREATE UNIQUE INDEX IF NOT EXISTS "ops_checklist_checks_uq"
  ON "ops_checklist_checks" ("run_id", "item_id");

CREATE INDEX IF NOT EXISTS "ops_checklist_checks_run_idx"
  ON "ops_checklist_checks" ("run_id");

-- ════════ 0222 ════════
-- 0222 — HR module · Job Description.
--
-- A Job Description belongs to a POSITION, never to a person. People come and
-- go; the tea still needs making. Everything below follows from that: the JD
-- Bank is keyed on a seat, assignment to a human is a separate join table, and
-- a vacant seat escalates up the ladder rather than losing its work.
--
-- ── THE LADDER IS BEHAVIOUR, NOT DISPLAY ────────────────────────────────────
-- jd_ranks.rank_order is walked upward by the vacancy resolver. Changing a
-- number reroutes live work, so the column is UNIQUE and seeded in steps of ten
-- — a rank can be inserted later without renumbering the ones around it.
--
-- ── NAMING TRAP ─────────────────────────────────────────────────────────────
-- This repo already has `pg_designations`. It is UNRELATED: `pg_` is the
-- Prospect Generation module and that column holds the designation of a sales
-- prospect. The salary module's `designations` table is the payroll-facing
-- title. Employee RANK, for escalation purposes, is jd_ranks and nothing else.

-- ───────────────────────────────────────────────────────────────────────────
-- 1. The rank ladder.
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "jd_ranks" (
  "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name"       text NOT NULL UNIQUE,
  -- Escalation climbs this. Unique so "the next rank up" is never ambiguous.
  "rank_order" integer NOT NULL UNIQUE,
  "band"       text,
  "is_active"  boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- The fourteen, in the order the business gave them. Note Consultant sits
-- BELOW Assistant Manager here — the candidate-facing list in
-- interview_positions puts it above Deputy Manager, and the two lists are
-- deliberately not merged: one describes seats we hire into, this one decides
-- who covers a vacancy.
INSERT INTO "jd_ranks" ("name", "rank_order", "band") VALUES
  ('Intern (2nd Yr)',   10,  'Trainee'),
  ('Intern (3rd Yr)',   20,  'Trainee'),
  ('Executive',         30,  'Individual'),
  ('Sr. Executive',     40,  'Individual'),
  ('Consultant',        50,  'Individual'),
  ('Assistant Manager', 60,  'Management'),
  ('Deputy Manager',    70,  'Management'),
  ('Manager',           80,  'Management'),
  ('Sr. Manager',       90,  'Management'),
  ('DGM',               100, 'Senior'),
  ('GM',                110, 'Senior'),
  ('AVP',               120, 'Executive'),
  ('VP',                130, 'Executive'),
  ('President',         140, 'Executive')
ON CONFLICT ("name") DO NOTHING;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Positions — the seats. Function × Rank (+ an optional variant).
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "jd_positions" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- One of the eight keys from lib/org/functions.ts. Stored as the STABLE key,
  -- never the display label, so renaming a label never orphans a record.
  "function_key"  text NOT NULL,
  "rank_id"       uuid NOT NULL REFERENCES "jd_ranks"("id") ON DELETE RESTRICT,
  -- For genuine exceptions that do not decompose into function × rank —
  -- "Back Office", "Front Desk". Part of the seat's identity.
  "variant"       text,
  "title"         text NOT NULL,
  "department_id" uuid REFERENCES "departments"("id") ON DELETE SET NULL,
  "is_active"     boolean NOT NULL DEFAULT true,
  "created_by_id" uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "created_at"    timestamptz NOT NULL DEFAULT now(),
  "updated_at"    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "jd_positions_function_chk" CHECK ("function_key" IN
    ('sales','marketing','operations','handholding','hr','admin','accounts','apps'))
);

-- One seat per function-rank-variant triple. EXPRESSION index, because a plain
-- UNIQUE over a nullable `variant` would let unlimited duplicate NULL rows
-- through — NULLs are distinct to a unique index.
CREATE UNIQUE INDEX IF NOT EXISTS "jd_positions_uq"
  ON "jd_positions" ("function_key", "rank_id", COALESCE("variant", ''));

CREATE INDEX IF NOT EXISTS "jd_positions_active_idx"
  ON "jd_positions" ("is_active", "function_key");

-- ───────────────────────────────────────────────────────────────────────────
-- 3. The JD Bank.
-- ───────────────────────────────────────────────────────────────────────────
-- Serial numbers come from a SEQUENCE, not from application code: two people
-- saving at once would otherwise collide on a max()+1 read. Gaps are expected
-- and harmless — a serial identifies a JD, it does not count them.
CREATE SEQUENCE IF NOT EXISTS "jd_entries_serial_seq" START 1;

CREATE TABLE IF NOT EXISTS "jd_entries" (
  "id"                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "serial_no"         text NOT NULL UNIQUE
                        DEFAULT ('JD-' || lpad(nextval('jd_entries_serial_seq')::text, 4, '0')),
  "position_id"       uuid NOT NULL REFERENCES "jd_positions"("id") ON DELETE RESTRICT,
  -- Denormalised from the position so the Bank can filter without a join.
  -- The write path keeps it in step; nothing else may write it.
  "function_key"      text NOT NULL,
  "task"              text NOT NULL,
  "notes_html"        text,
  -- STRUCTURED, never a label string: "Monthly on 2nd Saturday" has to become a
  -- date, and string-matching it at push time is how the DCC frequency parser
  -- ended up needing a needs_review escape hatch. Shape in lib/jd/recurrence.ts.
  "recurrence"        jsonb NOT NULL DEFAULT '{"kind":"daily"}'::jsonb,
  "estimated_minutes" integer NOT NULL DEFAULT 15,
  "video_url"         text,
  "guidelines_url"    text,
  "template_url"      text,
  -- The three target destinations.
  "push_dcc"          boolean NOT NULL DEFAULT false,
  "push_wms"          boolean NOT NULL DEFAULT false,
  "push_event"        boolean NOT NULL DEFAULT false,
  "is_active"         boolean NOT NULL DEFAULT true,
  "created_by_id"     uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "updated_by_id"     uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "created_at"        timestamptz NOT NULL DEFAULT now(),
  "updated_at"        timestamptz NOT NULL DEFAULT now(),
  -- A 16-hour ceiling. A data-entry guard, not a policy statement.
  CONSTRAINT "jd_entries_minutes_chk"
    CHECK ("estimated_minutes" BETWEEN 1 AND 960),
  CONSTRAINT "jd_entries_task_chk"
    CHECK (length(btrim("task")) > 0)
);

CREATE INDEX IF NOT EXISTS "jd_entries_position_idx"
  ON "jd_entries" ("position_id", "is_active");
CREATE INDEX IF NOT EXISTS "jd_entries_function_idx"
  ON "jd_entries" ("function_key", "is_active");

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Attachments — same shape as module_submission_attachments (0216).
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "jd_attachments" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "jd_id"         uuid NOT NULL REFERENCES "jd_entries"("id") ON DELETE CASCADE,
  -- video | guidelines | template — so the three groups render separately.
  -- Guidelines and Templates are DOCUMENTS, never a checklist: a checklist
  -- implies items to tick and generates completion state they must not have.
  "kind"          text NOT NULL,
  "storage_path"  text NOT NULL,
  "file_name"     text NOT NULL,
  "mime"          text,
  "size_bytes"    integer,
  "uploaded_by_id" uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "created_at"    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "jd_attachments_kind_chk"
    CHECK ("kind" IN ('video', 'guidelines', 'template'))
);

CREATE INDEX IF NOT EXISTS "jd_attachments_jd_idx"
  ON "jd_attachments" ("jd_id", "created_at");

-- ───────────────────────────────────────────────────────────────────────────
-- 5. Assignments — which people hold which JD.
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "jd_assignments" (
  "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "jd_id"          uuid NOT NULL REFERENCES "jd_entries"("id") ON DELETE CASCADE,
  "employee_id"    uuid NOT NULL REFERENCES "employees"("id") ON DELETE CASCADE,
  -- 'position' = inherited from holding the seat, revoked when they leave it.
  -- 'manual'   = HR picked this person deliberately; a holder change leaves it.
  "source"         text NOT NULL DEFAULT 'position',
  "assigned_by_id" uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "effective_from" date NOT NULL DEFAULT CURRENT_DATE,
  "effective_to"   date,
  "is_active"      boolean NOT NULL DEFAULT true,
  "created_at"     timestamptz NOT NULL DEFAULT now(),
  "updated_at"     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "jd_assignments_source_chk"
    CHECK ("source" IN ('position', 'manual'))
);

-- One LIVE assignment per person per JD. Partial, so a revoked assignment can
-- sit alongside a fresh one without the history having to be deleted.
CREATE UNIQUE INDEX IF NOT EXISTS "jd_assignments_active_uq"
  ON "jd_assignments" ("jd_id", "employee_id") WHERE "is_active";

CREATE INDEX IF NOT EXISTS "jd_assignments_employee_idx"
  ON "jd_assignments" ("employee_id", "is_active");

-- ───────────────────────────────────────────────────────────────────────────
-- 6. Delegations — leave handover.
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "jd_delegations" (
  "id"                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "jd_id"             uuid NOT NULL REFERENCES "jd_entries"("id") ON DELETE CASCADE,
  "from_employee_id"  uuid NOT NULL REFERENCES "employees"("id") ON DELETE CASCADE,
  "to_employee_id"    uuid NOT NULL REFERENCES "employees"("id") ON DELETE CASCADE,
  -- Nullable: a same-day absence has no approved leave row to point at.
  "leave_request_id"  uuid REFERENCES "leave_requests"("id") ON DELETE SET NULL,
  "start_date"        date NOT NULL,
  "end_date"          date NOT NULL,
  "status"            text NOT NULL DEFAULT 'active',
  "acknowledged_at"   timestamptz,
  "created_by_id"     uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "created_at"        timestamptz NOT NULL DEFAULT now(),
  "updated_at"        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "jd_delegations_status_chk"
    CHECK ("status" IN ('active', 'completed', 'revoked')),
  CONSTRAINT "jd_delegations_people_chk"
    CHECK ("from_employee_id" <> "to_employee_id"),
  CONSTRAINT "jd_delegations_dates_chk"
    CHECK ("end_date" >= "start_date")
);

CREATE INDEX IF NOT EXISTS "jd_delegations_to_idx"
  ON "jd_delegations" ("to_employee_id", "status", "start_date");
CREATE INDEX IF NOT EXISTS "jd_delegations_from_idx"
  ON "jd_delegations" ("from_employee_id", "status", "start_date");

-- ───────────────────────────────────────────────────────────────────────────
-- 7. Push log — idempotency for the auto-push.
-- ───────────────────────────────────────────────────────────────────────────
-- Without this the nightly job duplicates every task it has already written.
-- The push inserts ON CONFLICT DO NOTHING and reads a zero row count as
-- "already pushed", which makes the job safe to re-run and safe to run twice
-- concurrently — both of which will happen.
CREATE TABLE IF NOT EXISTS "jd_push_log" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "jd_id"       uuid NOT NULL REFERENCES "jd_entries"("id") ON DELETE CASCADE,
  "target"      text NOT NULL,
  "employee_id" uuid NOT NULL REFERENCES "employees"("id") ON DELETE CASCADE,
  -- '2026-09-11' for a daily push, '2026-09' for monthly, the event id for an
  -- event push. One string, because its only job is to be distinct per slot.
  "period_key"  text NOT NULL,
  -- The row created in the target system, so a push can be traced or undone.
  "external_id" uuid,
  "created_at"  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "jd_push_log_target_chk"
    CHECK ("target" IN ('dcc', 'wms', 'event'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "jd_push_log_uq"
  ON "jd_push_log" ("jd_id", "target", "employee_id", "period_key");

-- ───────────────────────────────────────────────────────────────────────────
-- 8. Which seat each employee occupies.
-- ───────────────────────────────────────────────────────────────────────────
-- WITHOUT THIS THERE IS NO VACANCY RULE. "Is this seat empty?" has to be
-- answerable, and nothing existing answers it: `employees.designation_id` points
-- at the salary module's payroll title roster, and `department_id` gives the
-- function but never the rank.
--
-- A SEPARATE TABLE, NOT A COLUMN ON `employees`. Adding jd_position_id to
-- employees would make every bare SELECT on that table — including the sign-in
-- lookup — request a column that does not exist until this migration has been
-- applied. The symptom would not be a broken JD page; it would be nobody able to
-- log in, presenting as "Email or password didn't match". That is precisely the
-- 9 September outage. A join table is read only by code that already needs 0222,
-- so the deploy-before-migrate window costs nothing.
CREATE TABLE IF NOT EXISTS "jd_position_holders" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "position_id"   uuid NOT NULL REFERENCES "jd_positions"("id") ON DELETE CASCADE,
  "employee_id"   uuid NOT NULL REFERENCES "employees"("id") ON DELETE CASCADE,
  "is_active"     boolean NOT NULL DEFAULT true,
  "created_by_id" uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "created_at"    timestamptz NOT NULL DEFAULT now(),
  "updated_at"    timestamptz NOT NULL DEFAULT now()
);

-- One LIVE seat per person. Partial, so moving somebody between seats keeps the
-- record of where they were rather than requiring a delete.
CREATE UNIQUE INDEX IF NOT EXISTS "jd_position_holders_active_uq"
  ON "jd_position_holders" ("employee_id") WHERE "is_active";

CREATE INDEX IF NOT EXISTS "jd_position_holders_position_idx"
  ON "jd_position_holders" ("position_id", "is_active");

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- VERIFY — run these after the COMMIT above succeeds.
-- ════════════════════════════════════════════════════════════════════════════
-- Expect 12 rows: 4 ops_checklist_* and 8 jd_*.
-- SELECT table_name FROM information_schema.tables
--  WHERE table_schema = 'public'
--    AND (table_name LIKE 'ops_checklist%' OR table_name LIKE 'jd_%')
--  ORDER BY table_name;
--
-- Expect the 14 ranks, Intern (2nd Yr) → President.
-- SELECT name, rank_order, band FROM jd_ranks ORDER BY rank_order;
--
-- Expect one row — the offset model is in place.
-- SELECT column_name FROM information_schema.columns
--  WHERE table_name = 'ops_checklist_items' AND column_name = 'offset_days';
