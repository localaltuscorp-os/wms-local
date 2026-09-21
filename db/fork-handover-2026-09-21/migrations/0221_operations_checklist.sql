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
