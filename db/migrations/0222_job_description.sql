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
