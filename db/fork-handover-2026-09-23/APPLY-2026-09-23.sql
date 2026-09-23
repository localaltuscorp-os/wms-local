-- ════════════════════════════════════════════════════════════════════════════
-- APPLY — the fork's 23 September delivery, 33 steps, in order.
--
-- PROJECT: mwaijzxuyicysvimzspx (ours).
--   https://supabase.com/dashboard/project/mwaijzxuyicysvimzspx/sql/new
--   NOT fjopgyqytfvbudkwhdto — that is the fork team's database, and the
--   handoff that came with this delivery names theirs and calls it production.
--
-- RUN PRE-APPLY-CLASH-CHECK.sql FIRST. An empty result means go. Any row means
-- a table already exists here in an older shape and needs its patch first.
--
-- REVISION 2 (2026-09-23). The first run stopped at PART 8 with:
--     ERROR: 42703: column "outstanding_entity_id" of relation
--     "billing_customers" does not exist
-- That is not a bug in 0229 — your database already carried a `billing_customers`
-- from an earlier billing attempt, so its CREATE TABLE IF NOT EXISTS did nothing
-- and the INSERT that follows named a column the old table lacks. The fork ships
-- `PATCH-BILLING-LEGACY-TABLES.sql` for exactly this; it is now PART 8, ahead of
-- the file that needs it. It is guarded and re-runnable, and it DROPS NOTHING —
-- the five leftover columns are left in place.
--
-- Every step is wrapped in its own BEGIN/COMMIT, so a failure stops there and
-- everything before it stays applied. Each PART names its source file: if
-- something fails, that name is what to report.
--
-- Every step is additive and idempotent — re-running this file from the top
-- after a partial run costs nothing.
--
-- Run VERIFY-2026-09-23.sql before and after.
-- ════════════════════════════════════════════════════════════════════════════

-- ════════════════════════════ PART 1 of 33 · 0215_goal_archive.sql ════════════════════════════

BEGIN;
-- 0215 — Goals: a real ARCHIVE, separate from the Recycle Bin.
--
-- ADDITIVE ONLY. One nullable timestamp per table plus two partial indexes, so
-- this rewrites zero rows and takes only a brief ACCESS EXCLUSIVE lock on the
-- catalogue.
--
-- WHY THIS COLUMN EXISTS
--
-- `goals.archived` / `weekly_goals.archived` are ALREADY taken, and they do not
-- mean what their name suggests: the Goals module sets that flag from its
-- Delete action and the Recycle Bin (/goals/recycle-bin) is the screen that
-- lists them. It is a soft-DELETE marker.
--
-- Sir (2026-09) asked for an Archive option on the goals table's selection bar,
-- beside Delete — the same gesture the WMS task list has, where archiving is
-- "put this away, it is finished with" and NOT "delete this". Overloading
-- `archived` would have made one flag mean two things and put every deleted
-- goal in the Archive: Delete and Archive would have been the same button
-- printed twice.
--
-- So the two states are now distinct and can both be true independently:
--
--   archived = true      the goal was DELETED  → /goals/recycle-bin
--   archived_at IS NOT NULL  the goal was ARCHIVED → /archive/goals
--
-- A TIMESTAMP, NOT A BOOLEAN, matching `tasks.abandoned_at`,
-- `employees.deactivated_at` and the rest of the schema: "when" is free to
-- record and answers the question a boolean cannot.
--
-- The indexes are PARTIAL — the archived rows are the small minority, and a
-- partial index on the non-null half stays tiny while still serving the
-- Archive's "everything this person put away" scan.

ALTER TABLE goals        ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE weekly_goals ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE INDEX IF NOT EXISTS goals_archived_at_idx
  ON goals (employee_id, archived_at)
  WHERE archived_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS weekly_goals_archived_at_idx
  ON weekly_goals (employee_id, archived_at)
  WHERE archived_at IS NOT NULL;

COMMIT;

-- ════════════════════════════ PART 2 of 33 · 0225_doer_initiator_status.sql ════════════════════════════

BEGIN;
-- 0225 — THE TWO STATUS AXES: doer status and initiator status.
--
-- Manan, 2026-09-14. Every row of work is described twice: the doer reports
-- where it is, the initiator rules what to do about it. Those two answers were
-- tangled together — `on_hold` was a DOER value on tasks and an INITIATOR value
-- on project nodes, and goals had no initiator axis at all.
--
-- After this migration, in every module:
--
--   DOER       Not Read · Not Started · Initiated · Follow Up · Need Info ·
--              Done · Abandoned            → `status`
--   INITIATOR  Approved · Not Approved · On Hold · Archived
--                                          → `approval_status` + `archived`
--
-- Archived stays the BOOLEAN each table already has. It has a filter and an
-- index; a second string saying "archived" beside a boolean saying false is a
-- bug waiting to happen. See lib/status/axes.ts.
--
-- FULLY IDEMPOTENT — safe to re-apply by hand at any time.

------------------------------------------------------------------------
-- 1. The two new enum values
------------------------------------------------------------------------
-- Split out on their own because a new enum value cannot be referenced in the
-- transaction that adds it. Both runners (scripts/apply-all-migrations.ts and
-- scripts/dummy-db-setup.ts) lift `alter type ... add value` lines out and run
-- them alone, which is why these sit on one line each.

alter type task_status add value if not exists 'abandoned';
alter type approval_status add value if not exists 'on_hold';

------------------------------------------------------------------------
-- 2. Goals grow an initiator axis
------------------------------------------------------------------------
-- Neither table had one. NULL is the correct default and a meaningful state:
-- "nobody has ruled on this yet", which the board shows as its own No Verdict
-- column rather than folding it into Not Approved.

ALTER TABLE goals
  ADD COLUMN IF NOT EXISTS approval_status approval_status;

ALTER TABLE weekly_goals
  ADD COLUMN IF NOT EXISTS approval_status approval_status;

-- Who ruled, and when. Without these an initiator status is an assertion with
-- no author — the same gap 0215 closed for device revocation.
ALTER TABLE goals
  ADD COLUMN IF NOT EXISTS approval_by_id uuid REFERENCES employees(id) ON DELETE SET NULL;
ALTER TABLE goals
  ADD COLUMN IF NOT EXISTS approval_at timestamptz;

ALTER TABLE weekly_goals
  ADD COLUMN IF NOT EXISTS approval_by_id uuid REFERENCES employees(id) ON DELETE SET NULL;
ALTER TABLE weekly_goals
  ADD COLUMN IF NOT EXISTS approval_at timestamptz;

CREATE INDEX IF NOT EXISTS goals_approval_status_idx
  ON goals (approval_status);
CREATE INDEX IF NOT EXISTS weekly_goals_approval_status_idx
  ON weekly_goals (approval_status);

------------------------------------------------------------------------
-- 3. Tasks: the same authorship columns
------------------------------------------------------------------------
-- `tasks.approval_status` already existed; who set it did not.

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS approval_by_id uuid REFERENCES employees(id) ON DELETE SET NULL;
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS approval_at timestamptz;

------------------------------------------------------------------------
-- 4. Project nodes: authorship too
------------------------------------------------------------------------
-- `project_nodes.approval_status` is TEXT (it pre-dates the shared enum and
-- carries container rows that never had a task), so there is no type change
-- here — only the missing authorship.

ALTER TABLE project_nodes
  ADD COLUMN IF NOT EXISTS approval_by_id uuid REFERENCES employees(id) ON DELETE SET NULL;
ALTER TABLE project_nodes
  ADD COLUMN IF NOT EXISTS approval_at timestamptz;

------------------------------------------------------------------------
-- 5. Move every held task onto the initiator axis
------------------------------------------------------------------------
-- Safe to run here even though section 1 added the value: the runners lift
-- `alter type ... add value` out and commit it in its own transaction BEFORE
-- this block, which is the whole reason they do that.
--
-- THE DOER STATUS WE LEAVE BEHIND. A held row's `status` has to become
-- something, and the row does not record what it was before someone held it.
-- `initiated` is the honest guess — work is put on hold because it had started
-- and then had to stop; a task nobody had opened would have been archived, not
-- held. Only rows with no verdict yet are touched, so an existing ruling is
-- never overwritten by this guess.

UPDATE tasks
   SET approval_status = 'on_hold',
       status          = 'initiated'
 WHERE status = 'on_hold'
   AND approval_status IS NULL;

-- A held task that ALREADY carried a verdict keeps the verdict; only its doer
-- status moves off the retired value, so it stops rendering as a deprecated
-- status in pickers that filter them out.
UPDATE tasks
   SET status = 'initiated'
 WHERE status = 'on_hold';

-- Goals and weekly goals share the task_status enum and so could hold the same
-- retired value. Same treatment, same reasoning.
UPDATE goals
   SET approval_status = 'on_hold',
       status          = 'initiated'
 WHERE status = 'on_hold'
   AND approval_status IS NULL;

UPDATE goals
   SET status = 'initiated'
 WHERE status = 'on_hold';

UPDATE weekly_goals
   SET approval_status = 'on_hold',
       status          = 'initiated'
 WHERE status = 'on_hold'
   AND approval_status IS NULL;

UPDATE weekly_goals
   SET status = 'initiated'
 WHERE status = 'on_hold';

-- Project nodes already treated on_hold as an initiator verdict, so a container
-- holding it in `status` is the drift this migration exists to end.
UPDATE project_nodes
   SET approval_status = 'on_hold',
       status          = 'initiated'
 WHERE status = 'on_hold'
   AND approval_status IS NULL;

UPDATE project_nodes
   SET status = 'initiated'
 WHERE status = 'on_hold';

COMMIT;

-- ════════════════════════════ PART 3 of 33 · 0226_result_is_not_a_task.sql ════════════════════════════

BEGIN;
-- 0226 — A RESULT IS NOT A TASK.
--
-- Manan, 2026-09-14: "only action and sub action will go to task section".
--
-- Result used to be in TASK_KINDS (lib/project-plan/levels.ts) on the opposite
-- request — someone put an owner and a date on a Result and expected to find it
-- in WMS. What settled it the other way is that a Result's PROGRESS is counted
-- from the actions underneath it, so a task of its own put a second,
-- self-reported answer beside a derived one, and put a row in the task list
-- that nobody actually does.
--
-- The code stops creating them. This archives the ones already there.
--
-- ARCHIVED, NOT DELETED. These tasks may carry logged time, comments and
-- history, and a Result that was being worked as a task is a real record of
-- what happened. `archived = true` takes them out of the task list and off the
-- calendar (the app's own archive semantics) and leaves every row intact — so
-- if this turns out to be the wrong call, it is one UPDATE to reverse.
--
-- The plan rows themselves are untouched: a Result keeps its owner, its target
-- date and its derived progress exactly as before. Only its WMS twin goes.
--
-- FULLY IDEMPOTENT — safe to re-apply by hand at any time.

UPDATE tasks
   SET archived   = true,
       updated_at = now()
 WHERE archived = false
   AND project_node_id IN (
     SELECT id FROM project_nodes WHERE kind = 'result'
   );

-- The linked tasks are archived, not unlinked: `project_node_id` is what tells
-- the plan row it once had one, and clearing it would strand the task with no
-- way back to the Result it came from. `syncNodeTask` refuses to touch a row
-- whose kind is no longer in TASK_KINDS, so nothing will resurrect them.

COMMIT;

-- ════════════════════════════ PART 4 of 33 · 0227_hr_address_book_asset_register.sql ════════════════════════════

BEGIN;
-- 0227 — HR module · Address Book of Resources + Asset Register.
--
-- Additive only: three new tables, no change to anything existing.
--
-- ── ADDRESS BOOK ────────────────────────────────────────────────────────────
-- hr_contacts holds the OUTSIDE resources (AC, Aquaguard, Broadband, CCTV,
-- Carpenter, Electrician, Stationery, Computer Repairs, …). Employees are NOT
-- copied in here: the Address Book reads them live from `employees` and their
-- onboarding form, so a changed phone number is never stale in two places.
-- `is_active` separates current resources from ones no longer used; inactive
-- rows are kept (and listed separately), never silently deleted.
--
-- ── ASSET REGISTER ──────────────────────────────────────────────────────────
-- hr_assets.asset_code is PER TYPE: LAP-0001, MON-0001, … Each type's running
-- number lives in hr_asset_counters and is taken with a single
-- INSERT … ON CONFLICT DO UPDATE … RETURNING, which is atomic — two HR people
-- saving a laptop at the same moment cannot receive the same code. Gaps (a
-- deleted asset) are expected: a code identifies an asset, it does not count them.
--
-- password_enc is AES-256-GCM ciphertext (lib/accounts/crypto.ts). The plaintext
-- is never stored and is only decrypted by the editor-gated reveal action.

CREATE TABLE IF NOT EXISTS "hr_contacts" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "company_name"  text,
  "person_name"   text NOT NULL,
  "cell_no"       text,
  "alternate_no"  text,
  "email"         text,
  "service"       text NOT NULL DEFAULT 'Other',
  "notes"         text,
  "is_active"     boolean NOT NULL DEFAULT true,
  "created_by_id" uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "updated_by_id" uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "created_at"    timestamptz NOT NULL DEFAULT now(),
  "updated_at"    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "hr_contacts_active_idx" ON "hr_contacts" ("is_active");
CREATE INDEX IF NOT EXISTS "hr_contacts_service_idx" ON "hr_contacts" ("service");

CREATE TABLE IF NOT EXISTS "hr_asset_counters" (
  "prefix" text PRIMARY KEY,
  "last"   integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS "hr_assets" (
  "id"                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "asset_code"         text NOT NULL UNIQUE,
  "asset_type"         text NOT NULL,
  "asset_name"         text NOT NULL,
  "location"           text,
  "serial_no"          text,
  "model"              text,
  "make"               text,
  "description"        text,
  "specifications"     text,
  "warranty_until"     date,
  "under_amc"          boolean NOT NULL DEFAULT false,
  "vendor_name"        text,
  "photo_path"         text,
  "invoice_path"       text,
  -- 'person' | 'office' | 'none'
  "issued_kind"        text NOT NULL DEFAULT 'none'
                       CHECK ("issued_kind" IN ('person', 'office', 'none')),
  "issued_employee_id" uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "issued_office"      text,
  "notes"              text,
  "username"           text,
  "password_enc"       text,
  "created_by_id"      uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "updated_by_id"      uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "created_at"         timestamptz NOT NULL DEFAULT now(),
  "updated_at"         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "hr_assets_type_idx" ON "hr_assets" ("asset_type");
CREATE INDEX IF NOT EXISTS "hr_assets_issued_employee_idx" ON "hr_assets" ("issued_employee_id");

COMMIT;

-- ════════════════════════════ PART 5 of 33 · 0227_plan_task_client_repair.sql ════════════════════════════

BEGIN;
-- 0227 — REPAIR: a plan task's client is its PROJECT's client, never its own name.
--
-- THE BUG. `createTasksCore` fills `tasks.client` from `tasks.title` when the
-- caller does not supply one — correct for the WMS New Task form, where the
-- first field IS the client. A task created from a plan row has the ACTION's
-- name as its title, so every action scheduled out of a project with no client
-- was filed under a client called "thin", "thesdrv", "Install readers at
-- Plant 2" — the action's own name, staring back out of the Client column.
--
-- The code no longer does this: `client` is now passed explicitly on the plan
-- path, null included, and the title fallback fires only when the caller never
-- mentioned a client at all (see lib/validators/task.ts — the `.default(null)`
-- that made those two cases indistinguishable is gone).
--
-- THIS FIXES THE ROWS ALREADY WRITTEN. Every task linked to a plan row has its
-- client recomputed from the project above it, by the same nearest-ancestor
-- rule `clientForNode` applies. A project with no client yet yields NULL, which
-- shows as "—" — the honest answer, and one that fills in by itself the moment
-- someone sets the client on the project (`resyncBranchClient`).
--
-- ONLY PLAN-LINKED TASKS ARE TOUCHED (`project_node_id IS NOT NULL`). A task
-- created in WMS keeps client = title, which is what it means there.
--
-- FULLY IDEMPOTENT — it recomputes, so re-running changes nothing.

WITH RECURSIVE up AS (
  -- Seed: every plan node, standing for itself at depth 0.
  SELECT id AS node_id, id AS cur, parent_id, client_name, 0 AS depth
    FROM project_nodes
  UNION ALL
  -- Climb: each row's parent, carrying the original node_id along.
  SELECT up.node_id, n.id, n.parent_id, n.client_name, up.depth + 1
    FROM project_nodes n
    JOIN up ON up.parent_id = n.id
),
resolved AS (
  -- The nearest ancestor (smallest depth) that actually holds a client.
  SELECT DISTINCT ON (node_id) node_id, client_name
    FROM up
   WHERE client_name IS NOT NULL AND btrim(client_name) <> ''
   ORDER BY node_id, depth ASC
)
UPDATE tasks t
   SET client     = r.client_name,
       updated_at = now()
  FROM resolved r
 WHERE t.project_node_id = r.node_id
   AND t.client IS DISTINCT FROM r.client_name;

-- And the other half: a plan task whose branch has NO client anywhere must not
-- keep the stale name it was given. Cleared to NULL rather than left, because
-- "thesdrv" is not a client and never was.
UPDATE tasks t
   SET client     = NULL,
       updated_at = now()
 WHERE t.project_node_id IS NOT NULL
   AND t.client IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM project_nodes p
      WHERE p.id = t.project_node_id
        AND EXISTS (
          WITH RECURSIVE chain AS (
            SELECT id, parent_id, client_name FROM project_nodes WHERE id = p.id
            UNION ALL
            SELECT n.id, n.parent_id, n.client_name
              FROM project_nodes n JOIN chain c ON c.parent_id = n.id
          )
          SELECT 1 FROM chain
           WHERE client_name IS NOT NULL AND btrim(client_name) <> ''
        )
   );

COMMIT;

-- ════════════════════════════ PART 6 of 33 · 0228_ops_vendor_directory.sql ════════════════════════════

BEGIN;
-- 0228 — Operations · Vendor Directory.
--
-- Additive only: one new table, no change to anything existing.
--
-- ops_vendors lists every outside vendor Altus Corp works with — category,
-- contact person, full postal address, website and whether they are under an
-- AMC. `is_active` separates current vendors from ones no longer used; inactive
-- rows are kept (and listed separately), never silently deleted.
--
-- Deliberately NOT hr_contacts: that is HR's Address Book of service people
-- (company + one person + service). The directory needs a postal address and an
-- AMC flag, and it belongs to Operations.

CREATE TABLE IF NOT EXISTS "ops_vendors" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "category"      text NOT NULL DEFAULT 'Other',
  "first_name"    text NOT NULL,
  "last_name"     text,
  "cell_no"       text,
  "email"         text,
  "address_line1" text,
  "address_line2" text,
  "address_line3" text,
  "address_line4" text,
  "landmark"      text,
  "city"          text,
  "state"         text,
  "pincode"       text,
  "website"       text,
  "amc"           boolean NOT NULL DEFAULT false,
  "notes"         text,
  "is_active"     boolean NOT NULL DEFAULT true,
  "created_by_id" uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "updated_by_id" uuid REFERENCES "employees"("id") ON DELETE SET NULL,
  "created_at"    timestamptz NOT NULL DEFAULT now(),
  "updated_at"    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "ops_vendors_active_idx" ON "ops_vendors" ("is_active");
CREATE INDEX IF NOT EXISTS "ops_vendors_category_idx" ON "ops_vendors" ("category");

COMMIT;

-- ════════════════════════════ PART 7 of 33 · 0228_plan_task_client_repair_again.sql ════════════════════════════

BEGIN;
-- 0228 — THE 0227 REPAIR, RUN AGAIN.
--
-- Not a new rule and not a new bug: the SAME repair as 0227, re-applied to
-- catch the rows written in the window between them.
--
-- WHY A SECOND FILE. 0227 fixed the tasks that existed when it ran, but the
-- code that CREATED them wrongly was only fully closed afterwards. The New Item
-- dialog builds its task through the ordinary WMS path (`createTasksCore`), not
-- through `syncNodeTask`, and that path had no idea a plan row's project has a
-- client — so it kept falling back to the task's title, which for a plan task
-- is the action's own name. Any Action or Sub-Action created through the dialog
-- in that window is filed under itself.
--
-- The hole is closed at the root now: `createTasksCore` resolves the client
-- from `project_node_id` whenever the caller does not supply one, so every path
-- into it — dialog, inline "+", bulk upload, lazy sync — files a plan task
-- under its project. This is the last sweep behind that change.
--
-- Migrations run once by filename, which is why re-running 0227 is not an
-- option and this is a file of its own rather than an edit to that one.
--
-- FULLY IDEMPOTENT — it recomputes, so a database already correct is unchanged.

WITH RECURSIVE up AS (
  SELECT id AS node_id, id AS cur, parent_id, client_name, 0 AS depth
    FROM project_nodes
  UNION ALL
  SELECT up.node_id, n.id, n.parent_id, n.client_name, up.depth + 1
    FROM project_nodes n
    JOIN up ON up.parent_id = n.id
),
resolved AS (
  SELECT DISTINCT ON (node_id) node_id, client_name
    FROM up
   WHERE client_name IS NOT NULL AND btrim(client_name) <> ''
   ORDER BY node_id, depth ASC
)
UPDATE tasks t
   SET client     = r.client_name,
       updated_at = now()
  FROM resolved r
 WHERE t.project_node_id = r.node_id
   AND t.client IS DISTINCT FROM r.client_name;

-- A plan task whose branch names no client anywhere must not keep the stale
-- name it was handed. Cleared to NULL, which reads as "—".
UPDATE tasks t
   SET client     = NULL,
       updated_at = now()
 WHERE t.project_node_id IS NOT NULL
   AND t.client IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM project_nodes p
      WHERE p.id = t.project_node_id
        AND EXISTS (
          WITH RECURSIVE chain AS (
            SELECT id, parent_id, client_name FROM project_nodes WHERE id = p.id
            UNION ALL
            SELECT n.id, n.parent_id, n.client_name
              FROM project_nodes n JOIN chain c ON c.parent_id = n.id
          )
          SELECT 1 FROM chain
           WHERE client_name IS NOT NULL AND btrim(client_name) <> ''
        )
   );

COMMIT;

-- ════════════════════════════ PART 8 of 33 · PATCH-BILLING-LEGACY-TABLES.sql (patch, runs before 0229) ════════════════════════════

BEGIN;
-- ============================================================================
-- RUN THIS BEFORE SUPABASE-STEP-2-migrations.sql
-- ============================================================================
--
-- THE ERROR THIS FIXES
--
--   ERROR: 42703: column "outstanding_entity_id" of relation
--   "billing_customers" does not exist
--   LINE 387: INSERT INTO billing_customers (name, outstanding_entity_id)
--
-- WHY IT HAPPENS
--
-- This database already carries a billing_customers table and a
-- billing_sac_codes table from an earlier billing attempt, in an older shape.
-- Every CREATE statement in the bundle is written CREATE TABLE IF NOT EXISTS,
-- which is what makes the bundle safe to re-run -- but on a table that is
-- already there it does nothing at all, old shape and all. The bundle then
-- reaches a statement naming a column that the newer definition has and the
-- older table does not, and stops.
--
-- Nothing was applied: the SQL editor runs a script as one transaction, so the
-- failure rolled the whole thing back. Run this file, let it finish, then run
-- SUPABASE-STEP-2-migrations.sql again from the top.
--
-- WHAT THIS DOES
--
--   1. Adds the ten columns billing_customers is missing and the one column
--      billing_sac_codes is missing. Every add is guarded, so running this
--      twice changes nothing the second time.
--   2. Copies the two rows already in billing_customers onto the new columns:
--      the old kind_attn becomes contact_name, contact_no becomes phone,
--      address becomes address_line1, state becomes state_name. The old
--      columns are LEFT ALONE -- nothing is dropped and nothing is lost, and
--      the application simply does not read them.
--   3. Prints what it did, so the result is visible rather than assumed.
--
-- WHAT THIS DOES NOT DO
--
-- It does not drop the five leftover columns (kind_attn, address, state,
-- contact_person, contact_no). They are all nullable, so they cost nothing but
-- a little clutter, and dropping columns that hold live values is not a thing
-- to do in the same breath as a migration. Once the Billing screens have been
-- used for a while and the values above are confirmed to have carried over,
-- they can go in their own small change.
-- ============================================================================


-- ── 1. billing_sac_codes ──────────────────────────────────────────────────
-- The default GST rate the invoice line picks up when a SAC code is chosen.
ALTER TABLE billing_sac_codes
  ADD COLUMN IF NOT EXISTS default_gst_rate numeric(5,2);


-- ── 2. billing_customers ──────────────────────────────────────────────────
-- Ten columns, in the order the newer definition declares them.
ALTER TABLE billing_customers
  ADD COLUMN IF NOT EXISTS legal_name    text,
  -- "Kind Attn." on the printed document.
  ADD COLUMN IF NOT EXISTS contact_name  text,
  -- E.164, +919876543210
  ADD COLUMN IF NOT EXISTS whatsapp      text,
  ADD COLUMN IF NOT EXISTS phone         text,
  ADD COLUMN IF NOT EXISTS address_line1 text,
  ADD COLUMN IF NOT EXISTS address_line2 text,
  -- state_code already exists and drives intra- vs inter-state GST; this is
  -- the readable name printed beside it.
  ADD COLUMN IF NOT EXISTS state_name    text,
  ADD COLUMN IF NOT EXISTS country       text NOT NULL DEFAULT 'India',
  ADD COLUMN IF NOT EXISTS outstanding_entity_id uuid REFERENCES outstanding_entities(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_by_id uuid REFERENCES employees(id) ON DELETE SET NULL;


-- ── 3. Carry the rows already there onto the new columns ──────────────────
-- COALESCE on the left so this is safe to re-run: a value already written by
-- the Billing screens is never overwritten by the older copy of itself.
UPDATE billing_customers
SET contact_name  = COALESCE(contact_name,  NULLIF(btrim(kind_attn), ''), NULLIF(btrim(contact_person), '')),
    phone         = COALESCE(phone,         NULLIF(btrim(contact_no), '')),
    address_line1 = COALESCE(address_line1, NULLIF(btrim(address), '')),
    state_name    = COALESCE(state_name,    NULLIF(btrim(state), ''))
WHERE kind_attn IS NOT NULL
   OR contact_person IS NOT NULL
   OR contact_no IS NOT NULL
   OR address IS NOT NULL
   OR state IS NOT NULL;


-- ── 4. What it looks like now ─────────────────────────────────────────────
SELECT
  count(*)                                                           AS customers,
  count(*) FILTER (WHERE contact_name  IS NOT NULL)                  AS with_contact_name,
  count(*) FILTER (WHERE phone         IS NOT NULL)                  AS with_phone,
  count(*) FILTER (WHERE address_line1 IS NOT NULL)                  AS with_address_line1,
  count(*) FILTER (WHERE country = 'India')                          AS country_defaulted
FROM billing_customers;

-- Every column the bundle is about to use. Each row should read PRESENT.
SELECT needed.column_name AS column_needed,
       CASE WHEN c.column_name IS NULL THEN 'STILL MISSING' ELSE 'PRESENT' END AS status
FROM (VALUES
    ('legal_name'), ('contact_name'), ('whatsapp'), ('phone'),
    ('address_line1'), ('address_line2'), ('state_name'), ('country'),
    ('outstanding_entity_id'), ('updated_by_id')
) AS needed(column_name)
LEFT JOIN information_schema.columns c
  ON c.table_schema = 'public'
 AND c.table_name   = 'billing_customers'
 AND c.column_name  = needed.column_name
ORDER BY status DESC, column_needed;

COMMIT;

-- ════════════════════════════ PART 9 of 33 · 0229_billing_documents.sql ════════════════════════════

BEGIN;
-- 0229 — BILLING: the document engine (Quotation → Proforma Invoice → Tax Invoice).
--
-- WHAT THIS ADDS. `/billing` already renders the Google-Sheets revenue ledger.
-- This migration gives the room its second half: real, numbered, GST-computing
-- documents that can be generated, previewed, emailed and converted forward.
--
-- The design rules that the columns below encode:
--
--   SNAPSHOT, DON'T JOIN. A printed document must never change because someone
--   later edited a master row, so `seller_snapshot` / `customer_snapshot` and
--   the per-line `code` / `name` / `sac_code` carry the values AS THEY WERE at
--   generate time. The FKs beside them are for navigation, not for rendering.
--
--   NEVER DELETE. Cancel is a status, conversion keeps its source, and the
--   lookups soft-delete via `is_active` so historical rows stay joinable.
--
--   NUMBER ON GENERATE. `billing_number_series` is bumped inside the generate
--   transaction, not when a draft is created — an abandoned draft must not burn
--   a tax-invoice number, and a gap in that series is an audit finding.
--
--   EXTEND, DON'T FORK. The product master is `outstanding_products`; it gains
--   five additive, nullable billing columns rather than a second table.
--
-- FULLY IDEMPOTENT — every statement is IF NOT EXISTS / ON CONFLICT guarded.

------------------------------------------------------------------------
-- 1. Lookups (admin-managed)
------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS billing_payment_terms (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label       text NOT NULL,             -- "Immediate", "30 Days", "DP", …
  due_days    integer,                   -- NULL = no computable due date
  is_default  boolean NOT NULL DEFAULT false,
  is_active   boolean NOT NULL DEFAULT true,
  sort_order  integer NOT NULL DEFAULT 100,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS billing_payment_terms_label_uq
  ON billing_payment_terms (lower(label));

CREATE TABLE IF NOT EXISTS billing_sac_codes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code             text NOT NULL,
  description      text NOT NULL,
  default_gst_rate numeric(5,2),
  is_active        boolean NOT NULL DEFAULT true,
  sort_order       integer NOT NULL DEFAULT 100,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS billing_sac_codes_code_uq ON billing_sac_codes (code);

-- Seed terms. All editable, all deactivatable. "Custom" is deliberately NOT a
-- row — it is a free-text override stored on the document itself.
INSERT INTO billing_payment_terms (label, due_days, is_default, sort_order) VALUES
  ('Immediate',  0,    true,  10),
  ('7 Days',     7,    false, 20),
  ('15 Days',    15,   false, 30),
  ('30 Days',    30,   false, 40),
  ('45 Days',    45,   false, 50),
  ('DP',         NULL, false, 60),
  ('Advance',    0,    false, 70)
ON CONFLICT DO NOTHING;

------------------------------------------------------------------------
-- 2. Seller billing profile — one row per issuing entity
--
-- `entity_id` is the canonical slug from lib/hr/entities.ts ("altus-corp",
-- "unleashed", …). Text, not an FK, because that registry is CODE; UNIQUE so an
-- entity can only ever have one profile.
------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS billing_entity_profiles (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id             text NOT NULL UNIQUE,
  paying_entity_id      uuid REFERENCES paying_entities(id) ON DELETE SET NULL,
  legal_name            text,           -- overrides the code registry when set
  pan                   text,
  gstin                 text,
  state_name            text,           -- the SELLER's state
  state_code            text,           -- 2-digit GST state code
  address_line          text,
  email                 text,
  whatsapp              text,
  phone                 text,
  website               text,
  logo_url              text,           -- overrides public/logos/<entity_id>.jpg
  bank_name             text,
  bank_account_name     text,
  bank_account_no       text,
  bank_ifsc             text,
  bank_branch           text,
  upi_id                text,
  default_sac_code      text,
  signatory_name        text,
  signatory_designation text,
  signature_image_url   text,           -- else fall back to public/signatures/*
  default_payment_terms_id uuid REFERENCES billing_payment_terms(id) ON DELETE SET NULL,
  interest_clause       text,           -- "interest @ x% p.a. after due date"
  invoice_footer_note   text,
  is_active             boolean NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  created_by_id         uuid REFERENCES employees(id) ON DELETE SET NULL,
  updated_by_id         uuid REFERENCES employees(id) ON DELETE SET NULL
);

------------------------------------------------------------------------
-- 3. Customer master (bill-to)
--
-- New, but LINKABLE: the optional FKs to clients / outstanding_entities keep
-- one real customer as one row across modules instead of a fourth master.
-- A NULL `gstin` is a first-class case (unregistered customer), not an error.
------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS billing_customers (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  legal_name    text,
  contact_name  text,           -- "Kind Attn." on the printed document
  email         text,
  whatsapp      text,           -- E.164, "+919876543210"
  phone         text,
  pan           text,
  gstin         text,
  address_line1 text,
  address_line2 text,
  city          text,
  state_name    text,
  state_code    text,           -- drives intra- vs inter-state GST
  pincode       text,
  country       text NOT NULL DEFAULT 'India',
  client_id             uuid REFERENCES clients(id) ON DELETE SET NULL,
  outstanding_entity_id uuid REFERENCES outstanding_entities(id) ON DELETE SET NULL,
  notes         text,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  created_by_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  updated_by_id uuid REFERENCES employees(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS billing_customers_name_uq ON billing_customers (lower(name));
CREATE INDEX IF NOT EXISTS billing_customers_active_idx ON billing_customers (is_active, name);

------------------------------------------------------------------------
-- 4. Product master — EXTEND, never fork
--
-- Additive and nullable, so every existing Outstanding query keeps working.
------------------------------------------------------------------------

ALTER TABLE outstanding_products ADD COLUMN IF NOT EXISTS sac_code         text;
ALTER TABLE outstanding_products ADD COLUMN IF NOT EXISTS default_rate     numeric(14,2);
ALTER TABLE outstanding_products ADD COLUMN IF NOT EXISTS default_gst_rate numeric(5,2);
ALTER TABLE outstanding_products ADD COLUMN IF NOT EXISTS description      text;
ALTER TABLE outstanding_products ADD COLUMN IF NOT EXISTS is_billable      boolean NOT NULL DEFAULT true;

------------------------------------------------------------------------
-- 5. Number series — (entity, doc type, financial year) → next sequence
--
-- The base and prefix are admin-configurable. Quotations default to 90001 as a
-- ROW value, not a constant in code, so the observed "90001-26-27" reproduces
-- without hard-coding it anywhere.
------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS billing_number_series (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id  text NOT NULL,
  doc_type   text NOT NULL,       -- quotation | proforma_invoice | tax_invoice
  fin_year   text NOT NULL,       -- "26-27"
  prefix     text NOT NULL DEFAULT '',
  next_seq   integer NOT NULL DEFAULT 1,
  pad_width  integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_id, doc_type, fin_year)
);

-- Per-(entity, type) defaults a new financial year inherits when its series row
-- is auto-created. Seeded per document type; edited from the Admin Panel.
CREATE TABLE IF NOT EXISTS billing_series_defaults (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id   text NOT NULL,
  doc_type    text NOT NULL,
  prefix      text NOT NULL DEFAULT '',
  start_seq   integer NOT NULL DEFAULT 1,
  pad_width   integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_id, doc_type)
);

------------------------------------------------------------------------
-- 6. Documents + lines + events
------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS billing_documents (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_type  text NOT NULL,
  doc_no    text,                      -- NULL while draft; assigned on generate
  fin_year  text NOT NULL,
  seq       integer,
  doc_date  date NOT NULL,
  due_date  date,
  status    text NOT NULL DEFAULT 'draft',

  -- seller
  entity_id         text NOT NULL,
  entity_profile_id uuid REFERENCES billing_entity_profiles(id) ON DELETE SET NULL,
  seller_snapshot   jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- customer
  customer_id           uuid REFERENCES billing_customers(id) ON DELETE SET NULL,
  customer_snapshot     jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Editable-on-the-document copies, so "send to" is visible and overridable in
  -- the list and on the form without digging into the jsonb.
  customer_name         text NOT NULL,
  customer_contact_name text,
  customer_email        text,
  customer_whatsapp     text,
  customer_gstin        text,
  place_of_supply_state text,
  place_of_supply_code  text,

  -- service / terms
  service_description text,
  sac_code            text,
  payment_terms_id    uuid REFERENCES billing_payment_terms(id) ON DELETE SET NULL,
  payment_terms_label text,
  remarks             text,

  -- tax + totals (all computed server-side, all stored for audit)
  gst_mode          text NOT NULL DEFAULT 'cgst_sgst',
  gst_applicable    boolean NOT NULL DEFAULT true,
  is_reverse_charge boolean NOT NULL DEFAULT false,
  subtotal          numeric(14,2) NOT NULL DEFAULT 0,
  discount_total    numeric(14,2) NOT NULL DEFAULT 0,
  taxable_value     numeric(14,2) NOT NULL DEFAULT 0,
  cgst_amount       numeric(14,2) NOT NULL DEFAULT 0,
  sgst_amount       numeric(14,2) NOT NULL DEFAULT 0,
  igst_amount       numeric(14,2) NOT NULL DEFAULT 0,
  round_off         numeric(14,2) NOT NULL DEFAULT 0,
  total             numeric(14,2) NOT NULL DEFAULT 0,
  amount_in_words   text,
  currency          text NOT NULL DEFAULT 'INR',

  -- lineage
  source_document_id uuid REFERENCES billing_documents(id) ON DELETE SET NULL,
  source_doc_no      text,
  source_doc_type    text,

  -- lifecycle
  generated_at     timestamptz,
  sent_at          timestamptz,
  last_sent_to     text,
  paid_at          timestamptz,
  paid_amount      numeric(14,2),
  cancelled_at     timestamptz,
  cancel_reason    text,
  pdf_storage_path text,

  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  created_by_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  updated_by_id uuid REFERENCES employees(id) ON DELETE SET NULL
);

-- A number is unique within its series. Partial, because drafts have no number.
CREATE UNIQUE INDEX IF NOT EXISTS billing_documents_no_uq
  ON billing_documents (entity_id, doc_type, fin_year, doc_no)
  WHERE doc_no IS NOT NULL;
CREATE INDEX IF NOT EXISTS billing_documents_list_idx
  ON billing_documents (doc_type, status, doc_date DESC);
CREATE INDEX IF NOT EXISTS billing_documents_customer_idx
  ON billing_documents (customer_id, doc_date DESC);
CREATE INDEX IF NOT EXISTS billing_documents_source_idx
  ON billing_documents (source_document_id);
-- Forward-convert ONCE. A cancelled child frees its source again.
CREATE UNIQUE INDEX IF NOT EXISTS billing_documents_one_child_uq
  ON billing_documents (source_document_id)
  WHERE source_document_id IS NOT NULL AND status <> 'cancelled';

CREATE TABLE IF NOT EXISTS billing_document_lines (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES billing_documents(id) ON DELETE CASCADE,
  product_id  uuid REFERENCES outstanding_products(id) ON DELETE SET NULL,
  code        text,                                     -- snapshot
  name        text NOT NULL,                            -- snapshot
  description text,
  sac_code    text,
  hsn_code    text,
  quantity    numeric(12,3)  NOT NULL DEFAULT 1,
  unit        text,
  rate        numeric(14,2)  NOT NULL DEFAULT 0,
  discount_pct    numeric(5,2),
  discount_amount numeric(14,2) NOT NULL DEFAULT 0,
  amount      numeric(14,2) NOT NULL DEFAULT 0,         -- qty × rate − discount
  gst_rate    numeric(5,2)  NOT NULL DEFAULT 0,
  cgst_amount numeric(14,2) NOT NULL DEFAULT 0,
  sgst_amount numeric(14,2) NOT NULL DEFAULT 0,
  igst_amount numeric(14,2) NOT NULL DEFAULT 0,
  line_total  numeric(14,2) NOT NULL DEFAULT 0,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS billing_document_lines_doc_idx
  ON billing_document_lines (document_id, sort_order);

CREATE TABLE IF NOT EXISTS billing_document_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES billing_documents(id) ON DELETE CASCADE,
  actor_id    uuid REFERENCES employees(id) ON DELETE SET NULL,
  event_type  text NOT NULL,
  meta        jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS billing_document_events_doc_idx
  ON billing_document_events (document_id, created_at DESC);

------------------------------------------------------------------------
-- 7. Email log — what was actually sent, to whom, and whether it landed
------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS billing_email_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES billing_documents(id) ON DELETE CASCADE,
  recipient   text NOT NULL,
  cc          text,
  bcc         text,
  subject     text NOT NULL,
  body        text,
  attachment  text,                     -- the PDF filename that was attached
  status      text NOT NULL DEFAULT 'sent',   -- sent | failed
  error       text,
  sent_at     timestamptz NOT NULL DEFAULT now(),
  sent_by_id  uuid REFERENCES employees(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS billing_email_log_doc_idx
  ON billing_email_log (document_id, sent_at DESC);

------------------------------------------------------------------------
-- 8. Backfill the customer master from the names already in the app
--
-- Names only — nothing here invents an email, a PAN or a GSTIN. The rows arrive
-- linked, so filling one in later enriches the same customer everywhere.
------------------------------------------------------------------------

INSERT INTO billing_customers (name, client_id)
SELECT DISTINCT ON (lower(c.name)) c.name, c.id FROM clients c
WHERE c.name IS NOT NULL AND btrim(c.name) <> ''
ORDER BY lower(c.name), c.created_at
ON CONFLICT DO NOTHING;

INSERT INTO billing_customers (name, outstanding_entity_id)
SELECT DISTINCT ON (lower(e.name)) e.name, e.id FROM outstanding_entities e
WHERE e.name IS NOT NULL AND btrim(e.name) <> ''
ORDER BY lower(e.name), e.created_at
ON CONFLICT DO NOTHING;

COMMIT;

-- ════════════════════════════ PART 10 of 33 · 0229_broadcast_recurrence_whatsapp.sql ════════════════════════════

BEGIN;
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

COMMIT;

-- ════════════════════════════ PART 11 of 33 · 0230_client_engagement.sql ════════════════════════════

BEGIN;
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

-- ════════════════════════════ PART 12 of 33 · 0230_daily_checklist_initiator_status.sql ════════════════════════════

BEGIN;
-- 0230 — DAILY GOALS join the two status axes.
--
-- Manan, 2026-09-15: "in goals section there is a weekly goals and daily goals
-- please add doer and initiator status there also".
--
-- Weekly goals got both axes in 0225. Daily goals did not, and the asymmetry
-- was invisible until someone looked for the column: `daily_checklist` has
-- carried a `status` (the DOER axis) since it was created, but nothing an
-- initiator could rule with. So a commitment could report where it was and
-- never be approved, declined, held or filed.
--
--   DOER       Not Read · Not Started · Initiated · Follow Up · Need Info ·
--              Done · Abandoned            → `status`        (already present)
--   INITIATOR  Approved · Not Approved · On Hold · Archived
--                                          → `approval_status` + `archived_at`
--
-- ── WHY `archived_at` AND NOT A BOOLEAN ───────────────────────────────────
--
-- 0225 used the boolean each table already had. This table's only archive-ish
-- column is `abandoned_at`, and that is the RECYCLE BIN (migration 0186): every
-- planner read filters `abandoned_at IS NULL`, and a cancelled card lands there
-- to be restored. Wiring the initiator's Archived to it would DELETE a
-- commitment when someone meant to file it — exactly the mistake lib/status/
-- axes.ts warns about for `goals.archived` vs `goals.archived_at`.
--
-- So daily goals get their own `archived_at`, matching `goals` and
-- `weekly_goals`, where "put away" and "soft-deleted" are already two columns.
--
-- NULL IS THE CORRECT DEFAULT and a meaningful state: nobody has ruled on this
-- yet, which the control shows as "No Verdict" rather than folding into Not
-- Approved.
--
-- FULLY IDEMPOTENT — safe to re-apply by hand at any time. No enum values are
-- added (0225 already added `on_hold` to approval_status), so this file has
-- nothing that must run alone in its own transaction.

------------------------------------------------------------------------
-- 1. The verdict, and who made it
------------------------------------------------------------------------
-- Authorship is not optional: an initiator status with no author is an
-- assertion nobody signed, which is the gap 0225 closed for the other tables.

ALTER TABLE daily_checklist
  ADD COLUMN IF NOT EXISTS approval_status approval_status;

ALTER TABLE daily_checklist
  ADD COLUMN IF NOT EXISTS approval_by_id uuid REFERENCES employees(id) ON DELETE SET NULL;

ALTER TABLE daily_checklist
  ADD COLUMN IF NOT EXISTS approval_at timestamptz;

------------------------------------------------------------------------
-- 2. "Put away" — distinct from the Recycle Bin above it
------------------------------------------------------------------------

ALTER TABLE daily_checklist
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

------------------------------------------------------------------------
-- 3. Indexes
------------------------------------------------------------------------
-- The verdict index mirrors goals_approval_status_idx / weekly_goals_…, for the
-- same reason: the initiator board groups by this column.
--
-- The archive index is PARTIAL. Almost every row is live, so an index over the
-- whole column would be one enormous all-NULL entry; `WHERE archived_at IS NOT
-- NULL` indexes only the filed ones, which is the set the Archive screen reads.

CREATE INDEX IF NOT EXISTS daily_checklist_approval_status_idx
  ON daily_checklist (approval_status);

CREATE INDEX IF NOT EXISTS daily_checklist_archived_at_idx
  ON daily_checklist (archived_at)
  WHERE archived_at IS NOT NULL;

COMMIT;

-- ════════════════════════════ PART 13 of 33 · 0231_billing_pms_archive.sql ════════════════════════════

BEGIN;
-- 0231 — ARCHIVE for billing documents and monthly performance reviews.
--
-- Manan, 2026-09-15, pointing at Billing › Documents and at Performance:
-- "give archive for this as well".
--
-- Both screens list records that accumulate forever and had no way to be put
-- away — only a Cancel (billing) or nothing at all (reviews). Archive is the
-- app's standing answer to that: the row leaves the working list, keeps every
-- field, and comes back from Archive.
--
-- ── WHY TWO COLUMNS AND NOT ONE ───────────────────────────────────────────
--
-- `archived` is the flag every read filters on and every index is built for;
-- `archived_at` says WHEN, which is what an archive screen sorts by and what
-- makes "put away last March" answerable. The rest of the app carries both
-- (tc_materials, dcc_kpi_items, tasks) and the Archive browser reads the flag,
-- so a new table joining that set needs to look like the others.
--
-- ── BILLING: ARCHIVE IS NOT CANCEL, AND NEVER DELETES ─────────────────────
--
-- `billing_documents.status` already has 'cancelled', and it means something
-- else entirely: the document was withdrawn and is void. Archiving says only
-- "stop showing me this" — a paid invoice from two years ago is still a valid
-- legal record and must stay exactly as issued. So this is a separate flag
-- rather than a seventh status, and nothing here removes a row.
--
-- FULLY IDEMPOTENT — safe to re-apply by hand at any time.

------------------------------------------------------------------------
-- 1. Billing documents
------------------------------------------------------------------------

ALTER TABLE billing_documents
  ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;

ALTER TABLE billing_documents
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- PARTIAL, like daily_checklist's in 0230: almost every document is live, so an
-- index over the whole column would be one enormous all-false entry. This
-- indexes only the filed ones, which is the set the archived view reads.
CREATE INDEX IF NOT EXISTS billing_documents_archived_idx
  ON billing_documents (archived)
  WHERE archived = true;

------------------------------------------------------------------------
-- 2. Monthly performance reviews
------------------------------------------------------------------------
-- `pms_monthly_review` is the LIVE review table — the 360 one /pms/review and
-- /pms/v3 write, keyed by 'YYYY-MM'. (`pms_review` is a different, older table
-- that nothing writes any more; only the Archive browser still reads it, so it
-- is deliberately left alone here.)
--
-- Archiving is per ROW rather than per period: a period is not a record, it is
-- a string on a set of rows, and "archive September" is therefore "archive the
-- rows whose period is September" — which the action does in one statement.

ALTER TABLE pms_monthly_review
  ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;

ALTER TABLE pms_monthly_review
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE INDEX IF NOT EXISTS pms_monthly_review_archived_idx
  ON pms_monthly_review (archived)
  WHERE archived = true;

COMMIT;

-- ════════════════════════════ PART 14 of 33 · 0231_exec_calendar.sql ════════════════════════════

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

-- ════════════════════════════ PART 15 of 33 · 0232_team_performance_archive.sql ════════════════════════════

BEGIN;
-- 0232 — ARCHIVE a row on Productivity › Team Performance.
--
-- Manan, 2026-09-15, pointing at the Team Performance table: "give archive
-- option to archive the team performance table".
--
-- ── WHAT IS BEING ARCHIVED, AND WHAT IS NOT ───────────────────────────────
--
-- The rows on that board are not records. Every number in them — goal score,
-- goals done, overdue, status — is computed live from tasks, goals, DCC and
-- attendance at render time, and nothing about the row is stored anywhere. So
-- there is nothing to file away. What CAN be put away is the row's PLACE ON
-- THE BOARD: "stop listing this person here".
--
-- Hence a flag on `employees` rather than a new table. It says one thing —
-- this person is off the Team Performance list — and it says it in the only
-- place the board reads its population from.
--
-- ── WHY NOT is_active, AND WHY NOT employment_status ──────────────────────
--
-- Both already exist and both mean something this must not: `is_active` is the
-- LOGIN GATE (0212's note is explicit), and `employment_status` answers "do
-- they still work here". Archiving a board row must not sign anybody out or
-- mark them a leaver, so it gets its own column and touches neither.
--
-- Nothing else reads it. The person keeps their Productivity Dashboard, keeps
-- their Goals row (/goals/weekly/team renders the same board component and is
-- deliberately left alone), keeps every task and goal they own. One list, one
-- flag.
--
-- `performance_archived_at` is the WHEN — what the Archive sorts by and what
-- makes "put away in March" answerable — matching the pair every other
-- archivable table in this app carries (tasks, dcc_kpi_items, tc_materials,
-- and billing_documents / pms_monthly_review in 0231).
--
-- FULLY IDEMPOTENT — safe to re-apply by hand at any time.

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS performance_archived boolean NOT NULL DEFAULT false;

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS performance_archived_at timestamptz;

-- PARTIAL, like 0230's and 0231's: almost every employee is on the board, so
-- an index over the whole column would be one enormous all-false entry. This
-- indexes only the filed rows, which is the set the Archive reads.
CREATE INDEX IF NOT EXISTS employees_performance_archived_idx
  ON employees (performance_archived)
  WHERE performance_archived = true;

COMMIT;

-- ════════════════════════════ PART 16 of 33 · 0233_customer_kyc.sql ════════════════════════════

BEGIN;
-- 0233 — CUSTOMER KYC, the address book, the dropdown master and the recycle bin.
--
-- Manan, 2026-09-17: "First we have to create Customer in Customer KYC form
-- inside Billing Module" — with Customer Master, Customer Address Book,
-- Customer Master DD and a recycle bin beside it in the Billing rail.
--
-- ── ONE CUSTOMER, NOT TWO ─────────────────────────────────────────────────
--
-- The KYC record EXTENDS `billing_customers` rather than standing beside it as
-- a second CRM table. That was a decision, and it is the important one here:
-- `billing_documents.customer_id` already points at `billing_customers`, and a
-- separate `client_kyc` table would mean every company existed twice — once as
-- the thing you KYC and once as the thing you invoice — with somebody
-- responsible for keeping the GSTIN on both in step. Extending means a
-- freshly onboarded client is immediately billable and its GSTIN, address and
-- payment terms flow into an invoice without a second entry.
--
-- ── WHAT IS A COLUMN AND WHAT IS A ROW ────────────────────────────────────
--
-- Single-valued facts about the company (grade, industry, credit limit) are
-- columns. Anything the form can hold MORE THAN ONE of — contacts, addresses,
-- documents — is a child table, because the form has "+ Add contact" and
-- "+ Add address" buttons and a column cannot grow.
--
-- ── THE DROPDOWN MASTER IS ONE TABLE, KEYED BY LIST ───────────────────────
--
-- `billing_lookups` follows `accounts_lookups`, which the Accounts module has
-- used for the same job: one row per option, `kind` naming the list it belongs
-- to. Twelve tables for twelve dropdowns would mean twelve migrations the next
-- time somebody wants a thirteenth list; this way a new list is a new `kind`
-- and no schema change at all.
--
-- ── THE RECYCLE BIN IS A TIMESTAMP, NOT A TABLE ───────────────────────────
--
-- `deleted_at` on each table, and the bin is a view over the rows that carry
-- one. A separate "deleted rows" table would have to mirror every column of
-- every table it accepts and would break the moment one of them gained a
-- field. Nothing here removes a row; restoring is clearing the timestamp.
--
-- Deliberately NOT reusing `is_active`: that already means "do not offer this
-- customer on new documents" and is a live business state. Deleted is not
-- inactive, and conflating them would make a restore ambiguous.

-- ── BILLING CUSTOMERS: the KYC fields ─────────────────────────────────────
ALTER TABLE billing_customers ADD COLUMN IF NOT EXISTS client_code        text;
ALTER TABLE billing_customers ADD COLUMN IF NOT EXISTS grade              text;
ALTER TABLE billing_customers ADD COLUMN IF NOT EXISTS tags              text[] NOT NULL DEFAULT '{}';
ALTER TABLE billing_customers ADD COLUMN IF NOT EXISTS customer_types    text[] NOT NULL DEFAULT '{}';
ALTER TABLE billing_customers ADD COLUMN IF NOT EXISTS industry_types    text[] NOT NULL DEFAULT '{}';
ALTER TABLE billing_customers ADD COLUMN IF NOT EXISTS product_types     text[] NOT NULL DEFAULT '{}';
ALTER TABLE billing_customers ADD COLUMN IF NOT EXISTS sales_person_id    uuid REFERENCES employees(id) ON DELETE SET NULL;
ALTER TABLE billing_customers ADD COLUMN IF NOT EXISTS is_export          boolean NOT NULL DEFAULT false;
ALTER TABLE billing_customers ADD COLUMN IF NOT EXISTS msme_no            text;
ALTER TABLE billing_customers ADD COLUMN IF NOT EXISTS gst_reg_type       text;
ALTER TABLE billing_customers ADD COLUMN IF NOT EXISTS currency           text NOT NULL DEFAULT 'INR';
ALTER TABLE billing_customers ADD COLUMN IF NOT EXISTS payment_terms      text;
ALTER TABLE billing_customers ADD COLUMN IF NOT EXISTS freight_charges    text;
ALTER TABLE billing_customers ADD COLUMN IF NOT EXISTS credit_days        text;
ALTER TABLE billing_customers ADD COLUMN IF NOT EXISTS credit_limit       text;
ALTER TABLE billing_customers ADD COLUMN IF NOT EXISTS transporter        text;
ALTER TABLE billing_customers ADD COLUMN IF NOT EXISTS quantity_deviation text;
ALTER TABLE billing_customers ADD COLUMN IF NOT EXISTS other_references   text;
-- The recycle bin. See the header note on why this is not `is_active`.
ALTER TABLE billing_customers ADD COLUMN IF NOT EXISTS deleted_at         timestamptz;
ALTER TABLE billing_customers ADD COLUMN IF NOT EXISTS deleted_by_id      uuid REFERENCES employees(id) ON DELETE SET NULL;

-- Partial, because every working list filters `deleted_at is null` and the bin
-- is the rare read. Indexing only the live rows keeps it small.
CREATE INDEX IF NOT EXISTS billing_customers_live_idx
  ON billing_customers (name) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS billing_customers_deleted_idx
  ON billing_customers (deleted_at) WHERE deleted_at IS NOT NULL;
-- Client codes are shown as an identifier (CL-0144), so two customers must not
-- share one. Partial so a deleted row does not hold its code hostage.
CREATE UNIQUE INDEX IF NOT EXISTS billing_customers_code_uq
  ON billing_customers (client_code) WHERE client_code IS NOT NULL AND deleted_at IS NULL;

-- ── CONTACT PEOPLE ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS billing_customer_contacts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id  uuid NOT NULL REFERENCES billing_customers(id) ON DELETE CASCADE,
  first_name   text,
  last_name    text,
  phone        text,
  email        text,
  designation  text,
  department   text,
  notes        text,
  -- The form says the FIRST contact is the client's primary and is the one
  -- auto-fetched on enquiries, so which one that is has to be stored rather
  -- than inferred from insert order, which an edit would scramble.
  is_primary   boolean NOT NULL DEFAULT false,
  sort_order   integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS billing_customer_contacts_cust_idx
  ON billing_customer_contacts (customer_id, sort_order);

-- ── ADDRESSES — what the Customer Address Book reads ──────────────────────
CREATE TABLE IF NOT EXISTS billing_customer_addresses (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id  uuid NOT NULL REFERENCES billing_customers(id) ON DELETE CASCADE,
  -- 'billing' | 'shipping'. Free text rather than an enum: the form lets you
  -- add further addresses, and a new kind should not need a migration.
  kind         text NOT NULL DEFAULT 'billing',
  label        text,
  line1        text,
  line2        text,
  line3        text,
  line4        text,
  city         text,
  state_name   text,
  state_code   text,
  country      text NOT NULL DEFAULT 'India',
  pincode      text,
  sort_order   integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS billing_customer_addresses_cust_idx
  ON billing_customer_addresses (customer_id, kind, sort_order);

-- ── DOCUMENTS — business card front/back and anything else attached ───────
CREATE TABLE IF NOT EXISTS billing_customer_documents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id   uuid NOT NULL REFERENCES billing_customers(id) ON DELETE CASCADE,
  slot          text NOT NULL DEFAULT 'other',   -- 'front' | 'back' | 'other'
  file_name     text NOT NULL,
  storage_path  text NOT NULL,
  content_type  text,
  size_bytes    integer,
  uploaded_at   timestamptz NOT NULL DEFAULT now(),
  uploaded_by_id uuid REFERENCES employees(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS billing_customer_documents_cust_idx
  ON billing_customer_documents (customer_id, slot);

-- ── THE DROPDOWN MASTER ───────────────────────────────────────────────────
-- One row per option. `kind` is the list: 'designation', 'payment_terms',
-- 'freight_charges', 'credit_days', 'credit_limit', 'quantity_deviation',
-- 'account_type', 'bank_name', 'transporter', 'state', 'country', 'currency',
-- and the two new ones: 'product_description', 'service_description'.
CREATE TABLE IF NOT EXISTS billing_lookups (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind        text NOT NULL,
  value       text NOT NULL,
  sort_order  integer NOT NULL DEFAULT 0,
  active      boolean NOT NULL DEFAULT true,
  deleted_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by_id uuid REFERENCES employees(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS billing_lookups_kind_idx
  ON billing_lookups (kind, sort_order) WHERE deleted_at IS NULL;
-- The same option twice in one list is always a mistake, and the master's
-- "add" box is easy to submit twice.
CREATE UNIQUE INDEX IF NOT EXISTS billing_lookups_kind_value_uq
  ON billing_lookups (kind, lower(value)) WHERE deleted_at IS NULL;

COMMIT;

-- ════════════════════════════ PART 17 of 33 · 0234_billing_contracts.sql ════════════════════════════

BEGIN;
-- 0234 — BILLING CONTRACTS: the agreement a run of invoices is raised under.
--
-- Billing → Create Contract / All Contracts. A contract fixes a Total Contract
-- Value with a customer and says HOW it is billed — Retainer, Milestone based,
-- Subscription or Full Payment — and carries the post-dated cheques (PDCs) the
-- customer handed over with it.
--
-- ── A CONTRACT DOES NOT ISSUE INVOICES OF ITS OWN ─────────────────────────
--
-- "Raise Bill" creates an ordinary draft TAX INVOICE in `billing_documents`
-- through the existing document engine (lib/billing/documents.ts), and the
-- schedule row keeps a pointer to it. Numbering, GST, the PDF, email, Mark
-- Paid and Cancel are therefore all the engine's, unchanged — and so is the
-- paid / unpaid / due status the Contracts view reports. A second invoice
-- table for contract bills would have meant two sets of numbers, two PDFs and
-- two ideas of "paid".
--
-- ── ONE SCHEDULE TABLE, NOT THREE ─────────────────────────────────────────
--
-- Milestones, subscription instalments, the single Full Payment and each
-- retainer period are the same thing — a sequenced, amount-bearing line that
-- becomes one invoice — so they are rows of `billing_contract_items` with a
-- `kind`, the arrangement `billing_lookups` already uses for dropdown lists.
--
-- ── THE CONTRACT VALUE IS A CEILING ───────────────────────────────────────
--
-- All schedule amounts are PRE-GST (the invoice adds tax on top), and their sum
-- may never exceed `total_value`. The application enforces that on every save
-- and every Raise Bill; the CHECKs below only stop the impossible values.
--
-- FULLY IDEMPOTENT — every statement is IF NOT EXISTS guarded. Additive only.

CREATE TABLE IF NOT EXISTS billing_contracts (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The billing entity (lib/hr/entities.ts slug), as on billing_documents.
  entity_id          text NOT NULL,
  customer_id        uuid NOT NULL REFERENCES billing_customers(id) ON DELETE RESTRICT,
  -- Snapshot for lists, so a renamed customer does not rename old contracts.
  customer_name      text NOT NULL,
  total_value        numeric(14,2) NOT NULL CHECK (total_value > 0),
  start_date         date NOT NULL,
  end_date           date NOT NULL,
  billing_date       date NOT NULL,
  -- retainer | milestone | subscription | full_payment
  payment_type       text NOT NULL,
  -- Retainer only: monthly | quarterly, and the amount billed each period.
  billing_frequency  text,
  retainer_amount    numeric(14,2) CHECK (retainer_amount IS NULL OR retainer_amount > 0),
  -- "Stop when Contract Value is completed" — on by default.
  stop_when_complete boolean NOT NULL DEFAULT true,
  -- active | completed | stopped | cancelled
  status             text NOT NULL DEFAULT 'active',
  stopped_at         timestamptz,
  stopped_by_id      uuid REFERENCES employees(id) ON DELETE SET NULL,
  cancelled_at       timestamptz,
  cancel_reason      text,
  notes              text,
  -- The signed contract, in the `documents` storage bucket.
  attachment_path    text,
  attachment_name    text,
  attachment_type    text,
  attachment_size    integer,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  created_by_id      uuid REFERENCES employees(id) ON DELETE SET NULL,
  updated_by_id      uuid REFERENCES employees(id) ON DELETE SET NULL,
  CONSTRAINT billing_contracts_dates_chk CHECK (end_date >= start_date)
);
CREATE INDEX IF NOT EXISTS billing_contracts_customer_idx ON billing_contracts (customer_id, start_date DESC);
CREATE INDEX IF NOT EXISTS billing_contracts_status_idx ON billing_contracts (status, created_at DESC);

CREATE TABLE IF NOT EXISTS billing_contract_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id  uuid NOT NULL REFERENCES billing_contracts(id) ON DELETE CASCADE,
  -- milestone | subscription | full_payment | retainer
  kind         text NOT NULL,
  seq          integer NOT NULL,
  due_date     date,
  description  text,
  amount       numeric(14,2) NOT NULL CHECK (amount >= 0),
  -- pending | billed | stopped. "Paid" is not stored here: it is the linked
  -- invoice's status, read live, so the two can never disagree.
  status       text NOT NULL DEFAULT 'pending',
  document_id  uuid REFERENCES billing_documents(id) ON DELETE SET NULL,
  raised_at    timestamptz,
  stopped_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS billing_contract_items_contract_idx ON billing_contract_items (contract_id, seq);
-- One invoice belongs to at most one schedule row.
CREATE UNIQUE INDEX IF NOT EXISTS billing_contract_items_document_uq
  ON billing_contract_items (document_id) WHERE document_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS billing_contract_pdcs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id  uuid NOT NULL REFERENCES billing_contracts(id) ON DELETE CASCADE,
  sr_no        integer NOT NULL,
  cheque_date  date,
  cheque_no    text,
  bank_name    text,
  amount       numeric(14,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  drawer_name  text,
  -- received | deposited | cleared | bounced
  status       text NOT NULL DEFAULT 'received',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS billing_contract_pdcs_contract_idx ON billing_contract_pdcs (contract_id, sr_no);

COMMIT;

-- ════════════════════════════ PART 18 of 33 · 0235_customer_kyc_business_whatsapp.sql ════════════════════════════

BEGIN;
-- 0235 — Customer KYC: Business Category, Nature of Business, contact WhatsApp.
--
-- Manan, 2026-09-19: the Identity section gains "Business Category" (a
-- dropdown from the Customer Master DD list `business_category`) and "Nature
-- of Business" (optional free text); every contact person gains a WhatsApp
-- number, which the form can fill with "same as contact no".
--
-- ADDITIVE AND IDEMPOTENT: three nullable columns, IF NOT EXISTS. Nothing is
-- dropped or rewritten; a re-run is a no-op. The removed form fields (freight
-- charges, transporter, quantity deviation, credit limit, export, grade) keep
-- their columns — saved clients keep their values.

ALTER TABLE billing_customers ADD COLUMN IF NOT EXISTS business_category text;
ALTER TABLE billing_customers ADD COLUMN IF NOT EXISTS nature_of_business text;
ALTER TABLE billing_customer_contacts ADD COLUMN IF NOT EXISTS whatsapp text;

COMMIT;

-- ════════════════════════════ PART 19 of 33 · 0236_customer_kyc_social_payment_options.sql ════════════════════════════

BEGIN;
-- 0236 — Customer KYC: LinkedIn, Instagram, and the three payment options.
--
-- Manan, 2026-09-19: the Documents box gains a LinkedIn address and an
-- Instagram handle (alongside new Brochure and Videos uploads, which need no
-- schema — billing_customer_documents.slot is free text), and a new section
-- below it asks Subscription / EMI / Module Wise Payment, each one of
-- 'Yes' | 'No' | 'Not Applicable'.
--
-- ADDITIVE AND IDEMPOTENT: five nullable text columns, IF NOT EXISTS.

ALTER TABLE billing_customers ADD COLUMN IF NOT EXISTS linkedin_url text;
ALTER TABLE billing_customers ADD COLUMN IF NOT EXISTS instagram_handle text;
ALTER TABLE billing_customers ADD COLUMN IF NOT EXISTS subscription text;
ALTER TABLE billing_customers ADD COLUMN IF NOT EXISTS emi text;
ALTER TABLE billing_customers ADD COLUMN IF NOT EXISTS module_wise_payment text;

COMMIT;

-- ════════════════════════════ PART 20 of 33 · 0237_customer_kyc_introducer.sql ════════════════════════════

BEGIN;
-- 0237 — Customer KYC: the Introducer box.
--
-- Manan, 2026-09-19: a new box above Documents records who introduced the
-- client — website, introducer's name, social media (Yes/No), city, email,
-- WhatsApp number, company / organisation, designation / role, nature of
-- business / work, business category, how they came to know about us
-- (Yes / No / Through WhatsApp / Friend / Colleague / Other), and the name of
-- the person who introduced them.
--
-- ONE jsonb column rather than thirteen: the fields are only ever read and
-- written together, as the client's introducer, and a new question next month
-- is then a form change, not a migration. ADDITIVE and IDEMPOTENT.

ALTER TABLE billing_customers ADD COLUMN IF NOT EXISTS introducer jsonb;

COMMIT;

-- ════════════════════════════ PART 21 of 33 · 0237_exec_calendar_categories_markers.sql ════════════════════════════

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

-- ════════════════════════════ PART 22 of 33 · 0238_client_engagement_v2.sql ════════════════════════════

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

-- ════════════════════════════ PART 23 of 33 · 0239_wcc_mcc_completed_quantity.sql ════════════════════════════

BEGIN;
-- 0239 — WCC / MCC: how many were actually done (account holder, 2026-09-19).
--
-- A compliance with a target above one ("Send 25 emails", or a DCC Target of
-- 50 calls) asks the doer, when they mark it Done, how many they completed —
-- 18 of 25, say. That count is recorded here, on the fill.
--
--   completed_quantity  whole number, 0 or more; NULL for a compliance with no
--                       quantity (no target, or a target of 1), and for any
--                       fill that is not Done
--
-- The target itself is NOT new: it is dcc_kpi_items.target_number (and unit),
-- which the DCC Masters already set. Every WCC/MCC save also writes the count to
-- dcc_entries.value_number — DCC's own "value" — so the 10 pm DCC report and
-- the Android app show the same number without changing.
--
-- ADDITIVE and idempotent — this repository applies migrations by hand. The app
-- reads around a database without it (lib/queries/compliance.ts), so the order
-- of deploy and migration does not matter; only recording a quantity waits for it.

alter table dcc_entries add column if not exists completed_quantity integer;

alter table dcc_entries drop constraint if exists dcc_entries_completed_quantity_chk;
alter table dcc_entries add constraint dcc_entries_completed_quantity_chk
  check (completed_quantity is null or completed_quantity >= 0);

COMMIT;

-- ════════════════════════════ PART 24 of 33 · 0240_mcc_frequencies.sql ════════════════════════════

BEGIN;
-- 0240 — MCC frequencies (account holder, 2026-09-19).
--
-- The Monthly Compliance Checklist took one deadline a month. It now takes the
-- frequencies compliance work actually runs on:
--
--   Monthly · 2 times/month · 3 times/month · Alternate Month · Quarterly ·
--   Half Yearly · Annually
--
-- Every MCC compliance stays schedule_kind = 'monthly', which is what puts it
-- on MCC and keeps it out of DCC's daily counts; these columns say how often
-- within that (lib/compliance/mcc-frequency.ts):
--
--   mcc_frequency    the code — monthly, twice_monthly, thrice_monthly,
--                    alternate_month, quarterly, half_yearly, annually.
--                    NULL = monthly (every MCC compliance before this).
--   mcc_days         2 times/month and 3 times/month: each deadline day, in
--                    order (31 = the month's last day, as a 31st clamps).
--                    NULL otherwise — one deadline stays in month_day.
--   mcc_start_month  Alternate Month, Quarterly, Half Yearly, Annually: a month
--                    it is due in (1–12); the rest follow every 2, 3, 6 or 12
--                    months from it. NULL otherwise.
--
-- `frequency` (text) carries the label beside them, as it always has.
--
-- ADDITIVE and idempotent — this repository applies migrations by hand.
-- RUN IT BEFORE DEPLOYING: db/schema.ts names these columns, so until they
-- exist every Drizzle insert into dcc_kpi_items (adding a compliance on DCC,
-- WCC or MCC, and the DCC Master sync) fails. The WCC and MCC pages themselves
-- read around a database without them.

alter table dcc_kpi_items add column if not exists mcc_frequency text;
alter table dcc_kpi_items add column if not exists mcc_days smallint[];
alter table dcc_kpi_items add column if not exists mcc_start_month smallint;

alter table dcc_kpi_items drop constraint if exists dcc_kpi_items_mcc_frequency_chk;
alter table dcc_kpi_items add constraint dcc_kpi_items_mcc_frequency_chk
  check (mcc_frequency is null
         or mcc_frequency in ('monthly', 'twice_monthly', 'thrice_monthly', 'alternate_month',
                              'quarterly', 'half_yearly', 'annually'));

alter table dcc_kpi_items drop constraint if exists dcc_kpi_items_mcc_days_chk;
alter table dcc_kpi_items add constraint dcc_kpi_items_mcc_days_chk
  check (mcc_days is null
         or (cardinality(mcc_days) between 2 and 3 and 1 <= all(mcc_days) and 31 >= all(mcc_days)));

alter table dcc_kpi_items drop constraint if exists dcc_kpi_items_mcc_start_month_chk;
alter table dcc_kpi_items add constraint dcc_kpi_items_mcc_start_month_chk
  check (mcc_start_month is null or mcc_start_month between 1 and 12);

COMMIT;

-- ════════════════════════════ PART 25 of 33 · 0241_wcc_mcc_abandoned.sql ════════════════════════════

BEGIN;
-- 0241 — WCC / MCC: the Doer Status "Abandoned" (account holder, 2026-09-19).
--
-- The Doer Status on a WCC / MCC fill is the WMS six — Not Read, Not Started,
-- Initiated, Follow Up, Need Info, Done — and now Abandoned: the doer has
-- given the compliance up. It is WCC / MCC's own; WMS Tasks are unchanged.
-- The old `status` column written beside it reads "Not done", so DCC's own
-- readers (the 10 pm report, the dashboard, the Android app) see what they
-- always saw for work that was not done.
--
-- Additive and idempotent — this repository applies migrations by hand. Until
-- it has run, picking Abandoned is refused by the old check; nothing else is.

alter table dcc_entries drop constraint if exists dcc_entries_doer_status_chk;
alter table dcc_entries add constraint dcc_entries_doer_status_chk
  check (doer_status is null
         or doer_status in ('dont_know', 'not_started', 'initiated', 'follow_up', 'need_info', 'done', 'abandoned'));

COMMIT;

-- ════════════════════════════ PART 26 of 33 · 0242_visibility_grants.sql ════════════════════════════

BEGIN;
-- Access Control — grants of ELEVATED visibility, by domain.
--
-- Two domains share this table and one rule:
--   domain = 'tasks'      → whose work a person may read (lib/tasks/scope.ts)
--   domain = 'incentive'  → whose incentive earnings they may read
--                           (lib/incentive/analytics/scope.ts)
--
-- Both modules are scoped to the signed-in person plus their downline by
-- default. A row here widens that for one person: target_id NULL means the whole
-- organisation, a target means that person and their downline. Rows are written
-- only from Admin Panel → Access Control, by a master admin.
CREATE TABLE IF NOT EXISTS visibility_grants (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain        text NOT NULL CHECK (domain IN ('tasks', 'incentive')),
  employee_id   uuid NOT NULL REFERENCES employees (id) ON DELETE CASCADE,
  target_id     uuid REFERENCES employees (id) ON DELETE CASCADE,
  note          text,
  granted_by_id uuid NOT NULL REFERENCES employees (id) ON DELETE RESTRICT,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- One grant per (domain, person, target) pair. Postgres treats NULLs as distinct
-- in a plain unique index, so the organisation-wide grant (target NULL) needs
-- its own partial index to stay single as well.
CREATE UNIQUE INDEX IF NOT EXISTS visibility_grants_domain_employee_target_uq
  ON visibility_grants (domain, employee_id, target_id);

CREATE UNIQUE INDEX IF NOT EXISTS visibility_grants_domain_employee_org_uq
  ON visibility_grants (domain, employee_id)
  WHERE target_id IS NULL;

CREATE INDEX IF NOT EXISTS visibility_grants_employee_idx
  ON visibility_grants (employee_id);

COMMIT;

-- ════════════════════════════ PART 27 of 33 · 0242_wcc_minutes.sql ════════════════════════════

BEGIN;
-- 0242 — WCC: Mins (account holder, 2026-09-19).
--
-- "Insert Mins — I want to see total Compliance Mins also of all Dailys + all
-- Mondays + all Tuesdays etc. Remove Deadline, but add Mins."
--
-- How many minutes a compliance takes each time it is due. The Weekly
-- Compliance Checklist shows it in its Mins column, where Deadline was, and
-- adds it up for each group — all the Dailys of a day, all the Mondays, all
-- the Tuesdays… — and for the whole view (lib/compliance/minutes.ts).
--
--   minutes   a whole number of minutes, 1 to 1440. NULL = not set yet.
--
-- ADDITIVE and idempotent — this repository applies migrations by hand.
-- RUN IT BEFORE DEPLOYING: db/schema.ts names the column, so until it exists
-- every Drizzle insert into dcc_kpi_items (adding a compliance on DCC, WCC or
-- MCC, and the DCC Master sync) fails. The WCC and MCC pages themselves read
-- around a database without it.

alter table dcc_kpi_items add column if not exists minutes integer;

alter table dcc_kpi_items drop constraint if exists dcc_kpi_items_minutes_chk;
alter table dcc_kpi_items add constraint dcc_kpi_items_minutes_chk
  check (minutes is null or minutes between 1 and 1440);

COMMIT;

-- ════════════════════════════ PART 28 of 33 · 0243_incentive_product_master_rows.sql ════════════════════════════

BEGIN;
-- PRODUCT MASTER — the three products the Sales Pitch form names that the
-- master did not have yet.
--
-- The brief lists seven products: PS, BSS, OS, Retainer, Key Note,
-- 2-Day Workshop, Inhouse PS. Five were already rows in `outstanding_products`
-- (PS/BSS/OS carry their own code; Retainer arrived in 0217 with a NULL code and
-- is left exactly as it is). The other three existed only in `product_options`
-- — the non-revenue MCQ list the module forms use — so a Sales Pitch could not
-- name them as a SOLD product at all.
--
-- Additive and idempotent. Codes are the short forms the brief shows
-- ("KN", "2-Day"), which is what the incentive tables print in the Product Code
-- column; "Inhouse PS" takes "IPS" because "IP" reads as internet protocol on a
-- money screen and the longer form does not fit the column.
--
-- This migration creates rows ONLY. Nothing is activated or retired: an admin
-- still manages the master at /admin/products, and the Sales Pitch form reads
-- whatever is active there.
INSERT INTO outstanding_products (name, code, is_active, sort_order)
VALUES
  ('Key Note',       'KN',    true, 100),
  ('2-Day Workshop', '2-Day', true, 100),
  ('Inhouse PS',     'IPS',   true, 100)
ON CONFLICT (name) DO NOTHING;

-- The same three, reached by their old MCQ spellings: if an admin had already
-- added "Inhouse PSO" or "2 Days" to the master by hand, those rows keep their
-- own names and codes and simply coexist — no rename, no data movement.

COMMIT;

-- ════════════════════════════ PART 29 of 33 · 0244_incentive_applicability_and_intern_type.sql ════════════════════════════

BEGIN;
-- 0244 · Incentive applicability (All / Function / Selected employees),
--        two new request types, and Employee Type (intern) as the source of
--        truth for who may earn an incentive.
--
-- ADDITIVE AND IDEMPOTENT, with ONE statement that can change who earns money
-- (§2 below). Nothing is dropped; no column is retyped. Every guard is
-- `if not exists` / `where`-qualified so a re-run is a no-op.
--
-- ════════════════════════════════════════════════════════════════════════════
-- WHAT THIS REPLACES
-- ════════════════════════════════════════════════════════════════════════════
-- Until now the audience of an Incentive Master scheme was decided by two group
-- flags — `sales_eligible` / `interns_eligible` — unless the scheme had EVER had
-- a row in `incentive_eligibility`, in which case those named rows governed
-- outright (lib/incentive/master.ts, `windows.length > 0 ? named : groups`).
--
-- That rule becomes an explicit, stored choice: `applicability` ∈
-- {ALL_EMPLOYEES, FUNCTION, SELECTED_EMPLOYEES}. §2 translates the old rule into
-- the new column so that NOT ONE scheme changes audience on the day this ships.
-- The two flag columns are left in place as legacy (they are still carried by
-- every pre-0244 `incentive_catalog_events` snapshot) but nothing reads them for
-- a decision any more.
--
-- ════════════════════════════════════════════════════════════════════════════
-- RUN THE PRE-FLIGHT FIRST
-- ════════════════════════════════════════════════════════════════════════════
-- §2 is the only statement here that can move money. Before applying, run and
-- read these two counts on the target database — they are exactly the sets §2
-- will touch, and both must be reviewed rather than assumed empty:
--
--   -- (a) schemes that today govern by NAMED rows, incl. removed ones
--   select c.id, c.name, c.active, c.sales_eligible, c.interns_eligible,
--          (select count(*) from incentive_eligibility e where e.catalog_id = c.id) as grants
--     from incentive_catalog c
--    where exists (select 1 from incentive_eligibility e where e.catalog_id = c.id)
--    order by c.name;
--
--   -- (b) schemes that reach NOBODY today (`sales_eligible` false or NULL,
--   --     which after §8's intern rule includes interns-only schemes)
--   select id, name, active, sales_eligible, interns_eligible
--     from incentive_catalog
--    where coalesce(sales_eligible, false) = false
--    order by name;
--
--   -- (c) designations §7 will mark as intern, so the list can be eyeballed
--   select id, name, is_active from designations
--    where lower(name) ~ '\m(intern|trainee|apprentice)\M'
--    order by name;
--
--   -- (d) active employees who will be blocked from their next save (§8)
--   select id, name, employee_code from employees
--    where probation_end is null and is_active = true
--    order by name;

-- ════════════════════════════════════════════════════════════════════════════
-- 0 · REPAIR: `incentive_eligibility` never received 0232's shape
-- ════════════════════════════════════════════════════════════════════════════
-- 0232 defines this table with `create table if not exists` — but by the time it
-- ran, an OLDER `incentive_eligibility` (from 0216, since deleted from the tree)
-- already existed, built around `incentive_id`, with no foreign key and a
-- different unique index. The `if not exists` therefore did nothing at all, and
-- every read of the column that `db/schema.ts` and the application code both
-- name has failed at runtime since:
--
--   Error [PostgresError]: column "catalog_id" does not exist   (code 42703)
--
-- §2 below reads `incentive_eligibility.catalog_id`, so the drift is repaired
-- here or this file cannot apply. Every statement is guarded, and the table is
-- empty on the databases this ships to — the repair moves a NAME, not data.
--
-- On a database built from the migrations in order, 0232 already produced the
-- correct shape and every block below skips itself.
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'incentive_eligibility'
       and column_name = 'incentive_id'
  ) and not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'incentive_eligibility'
       and column_name = 'catalog_id'
  ) then
    alter table incentive_eligibility rename column incentive_id to catalog_id;
  end if;
end $$;

-- The old table carried no foreign key on that column; 0232's definition does.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'incentive_eligibility_catalog_id_fkey'
  ) and not exists (
    select 1 from incentive_eligibility
     where catalog_id is not null
       and catalog_id not in (select id from incentive_catalog)
  ) then
    alter table incentive_eligibility
      add constraint incentive_eligibility_catalog_id_fkey
      foreign key (catalog_id) references incentive_catalog (id) on delete cascade;
  end if;
end $$;

-- 0232's unique index is PARTIAL — one live row per (scheme, employee) while the
-- person is eligible — so somebody removed can be added again later. The old
-- table indexed the bare pair, which forbids exactly that.
-- Bring the legacy 0216 table up to the dated-eligibility shape used by the
-- application. Existing live grants become effective on the repair date; no
-- employee loses eligibility.
alter table incentive_eligibility
  add column if not exists effective_from date,
  add column if not exists removed_effective_from date,
  add column if not exists added_by_id uuid,
  add column if not exists removed_by_id uuid,
  add column if not exists updated_at timestamptz default now();

update incentive_eligibility
   set effective_from = current_date
 where effective_from is null;

update incentive_eligibility
   set updated_at = coalesce(updated_at, created_at, now())
 where updated_at is null;

alter table incentive_eligibility
  alter column effective_from set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'incentive_eligibility_added_by_id_fkey'
       and conrelid = 'incentive_eligibility'::regclass
  ) then
    alter table incentive_eligibility
      add constraint incentive_eligibility_added_by_id_fkey
      foreign key (added_by_id) references employees (id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
     where conname = 'incentive_eligibility_removed_by_id_fkey'
       and conrelid = 'incentive_eligibility'::regclass
  ) then
    alter table incentive_eligibility
      add constraint incentive_eligibility_removed_by_id_fkey
      foreign key (removed_by_id) references employees (id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
     where conname = 'incentive_eligibility_window_chk'
       and conrelid = 'incentive_eligibility'::regclass
  ) then
    alter table incentive_eligibility
      add constraint incentive_eligibility_window_chk
      check (removed_effective_from is null or removed_effective_from >= effective_from);
  end if;

  if not exists (
    select 1 from pg_constraint
     where conname = 'incentive_eligibility_removed_chk'
       and conrelid = 'incentive_eligibility'::regclass
  ) then
    alter table incentive_eligibility
      add constraint incentive_eligibility_removed_chk
      check (removed_effective_from is not null or removed_by_id is null);
  end if;
end $$;

drop index if exists incentive_eligibility_pair_uq;
create unique index if not exists incentive_eligibility_current_uq
  on incentive_eligibility (catalog_id, employee_id)
  where removed_effective_from is null;
create index if not exists incentive_eligibility_catalog_idx
  on incentive_eligibility (catalog_id, removed_effective_from);

-- `catalog_id` is NOT NULL in the declaration. A no-op on an empty table today,
-- and a guard against a database that somehow has rows without a scheme.
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'incentive_eligibility'
       and column_name = 'catalog_id' and is_nullable = 'YES'
  ) and not exists (
    select 1 from incentive_eligibility where catalog_id is null
  ) then
    alter table incentive_eligibility alter column catalog_id set not null;
  end if;
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 1 · APPLICABILITY on the Incentive Master
-- ════════════════════════════════════════════════════════════════════════════
-- NOT NULL DEFAULT 'ALL_EMPLOYEES' is the safe landing state for a row nobody
-- has classified yet; §2 immediately corrects the rows for which that default
-- would be wrong. Single-valued on purpose: a scheme cannot be both
-- Function-scoped and Selected-employees-scoped, so a mapping table for the
-- enum would only allow contradictory states.
alter table incentive_catalog
  add column if not exists applicability text not null default 'ALL_EMPLOYEES';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'incentive_catalog_applicability_chk'
  ) then
    alter table incentive_catalog
      add constraint incentive_catalog_applicability_chk
      check (applicability in ('ALL_EMPLOYEES', 'FUNCTION', 'SELECTED_EMPLOYEES'));
  end if;
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 2 · KEEP EVERY EXISTING AUDIENCE EXACTLY AS IT IS
-- ════════════════════════════════════════════════════════════════════════════
-- (a) A scheme with ANY eligibility row — live OR removed — is governed by its
--     named rows today, including after the last person was removed. Saying
--     SELECTED_EMPLOYEES keeps that meaning; leaving it ALL_EMPLOYEES would
--     fall back to the group flags and hand the scheme to everybody, which is
--     the opposite of what the removals meant.
update incentive_catalog c
   set applicability = 'SELECTED_EMPLOYEES'
 where c.applicability = 'ALL_EMPLOYEES'
   and exists (select 1 from incentive_eligibility e where e.catalog_id = c.id);

-- (b) The flag that still means something is `sales_eligible`. The old groups
--     are BINARY and read off the designation — everybody is either "sales" or
--     "interns" — so `sales_eligible = true` already meant "every non-intern
--     employee", which is exactly what ALL_EMPLOYEES now means.
--
--     `sales_eligible` false/NULL therefore reaches NOBODY today, whether or
--     not `interns_eligible` is set: an interns-only scheme (interns true,
--     sales false) is the one case where the flag did reach people, and from
--     this migration on interns cannot earn an incentive at all (the brief's
--     intern rule, §8). SELECTED_EMPLOYEES with zero grants resolves to nobody,
--     which is the truthful translation of both.
--
-- Idempotent: any row (a) already moved is no longer 'ALL_EMPLOYEES'.
update incentive_catalog c
   set applicability = 'SELECTED_EMPLOYEES'
 where c.applicability = 'ALL_EMPLOYEES'
   and c.sales_eligible is not true;

-- `sales_eligible` / `interns_eligible` are DELIBERATELY NOT dropped: dropping
-- is irreversible, and every pre-0244 change-log snapshot carries them.

-- ════════════════════════════════════════════════════════════════════════════
-- 3 · FUNCTION SCOPE — which functions a FUNCTION-scoped scheme covers
-- ════════════════════════════════════════════════════════════════════════════
-- A mapping table rather than a uuid[] on the catalog: `functions` is an
-- admin-managed master (/admin/functions), array elements cannot carry a
-- foreign key, and an incentive must not keep scoping a function that was
-- deleted. The reverse index answers "which incentives apply to Sales", which
-- the function master needs before it lets that function be deactivated.
create table if not exists incentive_function_scope (
  catalog_id  uuid not null references incentive_catalog(id) on delete cascade,
  function_id uuid not null references functions(id)         on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (catalog_id, function_id)
);

create index if not exists incentive_function_scope_function_idx
  on incentive_function_scope (function_id);

-- ════════════════════════════════════════════════════════════════════════════
-- 4 · THE TWO NEW REQUEST TYPES
-- ════════════════════════════════════════════════════════════════════════════
-- 0232 pinned the type vocabulary in a CHECK. `incentive_type` is still NULL-
-- able (schemes that map to no request form — project, sheet, weekly-goal
-- incentives — carry NULL), and the two new keys are APPENDED: existing values
-- are untouched, so no row needs rewriting.
do $$
begin
  if exists (
    select 1 from pg_constraint where conname = 'incentive_catalog_type_chk'
  ) then
    alter table incentive_catalog drop constraint incentive_catalog_type_chk;
  end if;

  alter table incentive_catalog
    add constraint incentive_catalog_type_chk
    check (
      incentive_type is null
      or incentive_type in (
        'bss_conversion', 'sales_pitch', 'client_happiness',
        'group_intro', 'leads_referrals',
        'breakthrough_idea', 'employment_referral'
      )
    );
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 5 · EMPLOYEE TYPE on the DESIGNATION master
-- ════════════════════════════════════════════════════════════════════════════
-- A designation is a row an administrator maintains, so this is where the
-- company rule belongs — not in a substring of a name, which a rename would
-- silently change.
alter table designations
  add column if not exists employee_type text not null default 'employee';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'designations_employee_type_chk'
  ) then
    alter table designations
      add constraint designations_employee_type_chk
      check (employee_type in ('employee', 'intern'));
  end if;
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 6 · EMPLOYEE TYPE override, per person
-- ════════════════════════════════════════════════════════════════════════════
-- NULL is the common case and means "follow the designation". A value is the
-- exception, for the person the company rule does not fit. Effective type is
-- `coalesce(employees.employee_type, designations.employee_type, 'employee')`
-- — written once, in `resolveEmployeeType` (lib/incentive/master.ts).
alter table employees
  add column if not exists employee_type text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'employees_employee_type_chk'
  ) then
    alter table employees
      add constraint employees_employee_type_chk
      check (employee_type is null or employee_type in ('employee', 'intern'));
  end if;
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 7 · INTERNSHIP DATES
-- ════════════════════════════════════════════════════════════════════════════
-- Two statements, so the generated expression cannot reference a base column in
-- the same ALTER TABLE that creates it.
--
-- The END date is a STORED GENERATED column, computed by Postgres from the
-- start. The app never writes it, so a start and an end can never disagree —
-- no action, import or script can set a pair that does not match. 31 Aug + 6
-- months clamps to 28/29 Feb, which is the correct reading of "six months";
-- a NULL start gives a NULL end.
--
-- NOT backfilled: an internship start date is an HR fact that is not derivable
-- from anything already stored, and inventing one would corrupt the record it
-- is meant to preserve.
alter table employees
  add column if not exists internship_start date;

alter table employees
  add column if not exists internship_end date
  generated always as ((internship_start + interval '6 months')::date) stored;

-- ════════════════════════════════════════════════════════════════════════════
-- 8 · THE ONE PLACE DESIGNATION TEXT IS EVER MATCHED
-- ════════════════════════════════════════════════════════════════════════════
-- Materialises the old heuristic ONCE, so that after this migration no runtime
-- code has to read designation text to decide intern status. The pattern is the
-- same one lib/employees/employee-code.ts used (`\m`/`\M` = word boundaries).
--
-- Idempotent by construction: rows it has already marked are no longer
-- 'employee'. Compare the affected count against pre-flight query (c), then set
-- any designation this got wrong at /admin/designations — it is an editable
-- master field, not a migration's last word.
update designations
   set employee_type = 'intern'
 where employee_type = 'employee'
   and lower(name) ~ '\m(intern|trainee|apprentice)\M';

-- ════════════════════════════════════════════════════════════════════════════
-- 9 · WHAT THIS MIGRATION DOES **NOT** DO
-- ════════════════════════════════════════════════════════════════════════════
-- * No `probation_end` backfill and no NOT NULL. Required-ness is enforced where
--   the employee's effective type is known (the `editEmployee` action), because
--   two unrelated features — the leave cycle and the HR-confirmation cron —
--   treat NULL as a real state ("no anchor yet", "not scheduled").
-- * No grant rows are deleted. Switching a scheme away from SELECTED_EMPLOYEES
--   makes its rows unread, not gone; switching back restores the same audience.
-- * No new incentive amount, target or rate column. The rate stays
--   `incentive_catalog.amount`, which is what every screen already reads.

COMMIT;

-- ════════════════════════════ PART 30 of 33 · 0244_module_backup.sql ════════════════════════════

BEGIN;
-- 0244 — module-wise export to Google Drive
--
-- Every module gets an Export button, and once a night at 03:00 IST each module
-- is saved into Google Drive: one folder per module, a dated folder per run,
-- an Excel workbook (one tab per dataset) and the files its rows point at.
--
-- FIRST RUN IS EVERYTHING, AFTER THAT ONLY WHAT CHANGED. module_backup_modules
-- .exported_through is the watermark: the next run exports what came after it.
-- Without that, a nightly export of every module would copy the whole company
-- into Drive every night.
--
-- SEPARATE FROM THE PER-PERSON HR BACKUP (0225). Different Google account
-- (MODULE_BACKUP_DRIVE_ACCOUNT, not hr.altuscorp@gmail.com), different folder,
-- different permission list. Connecting or disconnecting one leaves the other
-- alone — asked for on 21 Sep.
--
-- ADDITIVE ONLY: four new tables, no change to any existing one. Apply BEFORE
-- deploying the code.

CREATE TABLE IF NOT EXISTS module_backup_settings (
  id                 integer PRIMARY KEY DEFAULT 1,
  account_email      text,
  -- Ciphertext (lib/accounts/crypto). Never selected into a browser response.
  refresh_token_enc  text,
  connected_by_id    uuid REFERENCES employees(id) ON DELETE SET NULL,
  connected_at       timestamptz,
  -- The app creates its own root folder: the drive.file scope cannot see a
  -- folder someone made by hand, so looking one up by name would find nothing.
  root_folder_id     text,
  schedule_enabled   boolean NOT NULL DEFAULT true,
  -- 03:00 IST. Stored rather than hardcoded so the hour can move without a deploy.
  run_hour_ist       integer NOT NULL DEFAULT 3,
  last_error         text,
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT module_backup_settings_one_row CHECK (id = 1),
  CONSTRAINT module_backup_settings_hour CHECK (run_hour_ist BETWEEN 0 AND 23)
);

INSERT INTO module_backup_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS module_backup_modules (
  -- A workspace id from lib/workspaces.ts. Text, not an enum: a new module is a
  -- code change, and an enum would make it a migration as well.
  module_id          text PRIMARY KEY,
  enabled            boolean NOT NULL DEFAULT true,
  -- THE WATERMARK. NULL = never exported, so the next run is the full one.
  exported_through   timestamptz,
  last_full_at       timestamptz,
  last_run_at        timestamptz,
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS module_backup_runs (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id          text NOT NULL,
  kind               text NOT NULL,          -- full | incremental | manual
  status             text NOT NULL DEFAULT 'pending',  -- pending | running | done | failed
  -- The window: after `since`, up to `until`. `until` is fixed when the run
  -- starts, so rows written mid-run belong to the next one instead of being
  -- half-caught by this one.
  since              timestamptz,
  until              timestamptz NOT NULL,
  -- Where a resumed run continues: which dataset, how many files copied, and
  -- the Drive folder already created for it.
  cursor             jsonb,
  counts             jsonb,
  folder_name        text,
  requested_by_id    uuid REFERENCES employees(id) ON DELETE SET NULL,
  -- Held while a chunk is in flight: two invocations must not run one export.
  lock_until         timestamptz,
  error              text,
  started_at         timestamptz NOT NULL DEFAULT now(),
  finished_at        timestamptz
);

CREATE INDEX IF NOT EXISTS module_backup_runs_module_idx
  ON module_backup_runs (module_id, started_at);
CREATE INDEX IF NOT EXISTS module_backup_runs_status_idx
  ON module_backup_runs (status);

-- WHO MAY PRESS EXPORT, per module. Access to a module is not access to its
-- export: reading one screen is a different thing from carrying the whole
-- module out of the building.
CREATE TABLE IF NOT EXISTS module_backup_grants (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id          text NOT NULL,
  employee_id        uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  granted_by_id      uuid REFERENCES employees(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS module_backup_grants_uniq
  ON module_backup_grants (module_id, employee_id);
CREATE INDEX IF NOT EXISTS module_backup_grants_module_idx
  ON module_backup_grants (module_id);

-- Record in the ledger the runner reads.
CREATE TABLE IF NOT EXISTS __schema_applied (
  filename    text PRIMARY KEY,
  applied_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO __schema_applied (filename) VALUES ('0244_module_backup.sql')
ON CONFLICT DO NOTHING;

COMMIT;

-- ════════════════════════════ PART 31 of 33 · 0245_global_logs.sql ════════════════════════════

BEGIN;
-- ════════════════════════════════════════════════════════════════════════════
-- GLOBAL WMS LOGS (0245) — the append-only activity log + daily activity sessions
--
-- WHAT THIS IS
--   An immutable, server-authoritative record of activity across the whole WMS:
--   login/logout/session lifecycle, module & page visits, record views,
--   creates/updates/deletes, approvals/rejections/reversals, exports, searches,
--   filters, access-denied attempts and configuration changes. It backs
--   Admin Panel → Logs.
--
-- TWO TABLES, TWO JOBS
--   daily_sessions  — one row per employee per IST calendar date. A rollup of
--                     the day's activity (first login, last activity, logout,
--                     counters, estimated minutes). System-writable only.
--   activity_logs   — the log itself. Append-only; enforced by a trigger.
--
-- SAFETY
--   Additive + idempotent. Every statement is `if not exists` / guarded.
--   The ONLY destruction is `drop trigger if exists` + `drop function if exists`
--   before recreating them (a trigger has no data). No DROP TABLE, no DELETE,
--   no TRUNCATE.
--
-- NAMING NOTE
--   The brief's activity_logs field called `timestamp` is stored as `event_at`
--   because `timestamp` is an SQL reserved word that would need quoting at every
--   call site. The UI column is labelled "Time".
-- ════════════════════════════════════════════════════════════════════════════

-- ── DAILY SESSIONS ──────────────────────────────────────────────────────────
create table if not exists daily_sessions (
  id                       uuid primary key default gen_random_uuid(),
  employee_id              uuid not null references employees (id) on delete cascade,
  date_ist                 date not null,
  first_login_at           timestamptz,
  last_activity_at         timestamptz,
  logout_at                timestamptz,
  logout_type              text,
  total_estimated_minutes  integer not null default 0,
  total_event_count        integer not null default 0,
  modules_visited_count    integer not null default 0,
  pages_visited_count      integer not null default 0,
  records_viewed_count     integer not null default 0,
  actions_performed_count  integer not null default 0,
  status                   text not null default 'active',
  finalized_at             timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),

  constraint daily_sessions_logout_type_chk
    check (logout_type is null or logout_type in
      ('NORMAL', 'INACTIVITY_TIMEOUT', 'SESSION_EXPIRED', 'FORCED_LOGOUT', 'NOT_RECORDED')),
  constraint daily_sessions_status_chk
    check (status in ('active', 'closed', 'finalized'))
);

create unique index if not exists daily_sessions_employee_date_uq
  on daily_sessions (employee_id, date_ist);
create index if not exists daily_sessions_date_status_idx
  on daily_sessions (date_ist, status);

-- ── ACTIVITY LOGS ───────────────────────────────────────────────────────────
create table if not exists activity_logs (
  id                uuid primary key default gen_random_uuid(),
  daily_session_id  uuid references daily_sessions (id) on delete set null,
  -- Nullable on purpose: a LOGIN_FAILED for an unknown email and pure SYSTEM
  -- events have no employee row to point at. Everything a real user did has one.
  employee_id       uuid references employees (id) on delete set null,
  event_at          timestamptz not null default now(),
  event_type        text not null,
  module            text,
  page              text,
  route             text,
  resource_type     text,
  resource_id       text,
  resource_name     text,
  action            text,
  status            text,
  reason            text,
  changes           jsonb,
  metadata          jsonb,
  request_id        text,
  operation_id      text,
  -- Idempotent-ingest dedupe key, minted on the client. A replayed batch that
  -- repeats this id is a no-op (the unique index rejects it).
  client_event_id   text,
  actor_type        text,
  created_at        timestamptz not null default now()
);

create index if not exists activity_logs_employee_event_idx
  on activity_logs (employee_id, event_at desc);
create index if not exists activity_logs_session_idx
  on activity_logs (daily_session_id);
create index if not exists activity_logs_event_at_idx
  on activity_logs (event_at desc);
create index if not exists activity_logs_module_event_idx
  on activity_logs (module, event_at desc);
create index if not exists activity_logs_event_type_event_idx
  on activity_logs (event_type, event_at desc);
create index if not exists activity_logs_status_event_idx
  on activity_logs (status, event_at desc);
create index if not exists activity_logs_resource_idx
  on activity_logs (resource_type, resource_id);
create index if not exists activity_logs_request_id_idx
  on activity_logs (request_id);
create index if not exists activity_logs_operation_id_idx
  on activity_logs (operation_id);
create index if not exists activity_logs_module_page_event_idx
  on activity_logs (module, page, event_at desc);
create unique index if not exists activity_logs_client_event_id_uq
  on activity_logs (client_event_id)
  where client_event_id is not null;

-- ── IMMUTABILITY ────────────────────────────────────────────────────────────
-- The log is append-only. No application code may UPDATE or DELETE a row; this
-- trigger makes that true at the database level, so even a bug or a direct SQL
-- write is refused. Corrections, if ever needed, are a separate system-level
-- process — never normal WMS functionality.
create or replace function activity_logs_no_mutate() returns trigger as $$
begin
  raise exception 'activity_logs is append-only (no UPDATE, no DELETE)';
end;
$$ language plpgsql;

drop trigger if exists activity_logs_no_mutate on activity_logs;
create trigger activity_logs_no_mutate
  before update or delete on activity_logs
  for each row execute function activity_logs_no_mutate();

COMMIT;

-- ════════════════════════════ PART 32 of 33 · 0246_control_panel.sql ════════════════════════════

BEGIN;
-- ════════════════════════════════════════════════════════════════════════════
-- CONTROL PANEL (0246) — a configurable Roles template layer over the existing
-- permission architecture.
--
-- WHAT THIS IS
--   Roles are reusable permission templates that administrators assign to users.
--   Enforcement is UNCHANGED: it remains `module_permissions` (per-employee
--   show/view/edit) + capabilities + delegated access + visibility grants. These
--   three tables are the authoring surface behind Admin Panel → Control Panel's
--   Users / Roles / Permissions / Effective Access.
--
--   · roles            a named template (e.g. "HR Admin", "Reporting Viewer").
--   · role_permissions one (module node, action, scope) a role grants.
--   · employee_roles   the many-to-many user ↔ role assignment.
--
-- SAFETY
--   Additive + idempotent. Every statement is `if not exists`. No DROP, no
--   DELETE, no TRUNCATE.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists roles (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  description  text,
  -- A system role cannot be deleted or renamed from the Control Panel (it is
  -- the seeded "Super Admin"). Writable only by a system-level process.
  is_system    boolean not null default false,
  created_by_id uuid references employees (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create unique index if not exists roles_name_uq on roles (lower(name));

create table if not exists role_permissions (
  id         uuid primary key default gen_random_uuid(),
  role_id    uuid not null references roles (id) on delete cascade,
  node_key   text not null,
  action     text not null,
  scope      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists role_permissions_uq
  on role_permissions (role_id, node_key, action, scope);
create index if not exists role_permissions_role_idx
  on role_permissions (role_id);
create index if not exists role_permissions_node_idx
  on role_permissions (node_key);

create table if not exists employee_roles (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid not null references employees (id) on delete cascade,
  role_id       uuid not null references roles (id) on delete cascade,
  assigned_by_id uuid references employees (id) on delete set null,
  created_at    timestamptz not null default now()
);

create unique index if not exists employee_roles_uq
  on employee_roles (employee_id, role_id);
create index if not exists employee_roles_employee_idx
  on employee_roles (employee_id);
create index if not exists employee_roles_role_idx
  on employee_roles (role_id);

-- The seeded, non-deletable "Super Admin" template. Idempotent: skips itself
-- when a role named "Super Admin" already exists.
insert into roles (name, description, is_system)
select 'Super Admin', 'Unrestricted access to the Control Panel and every module.', true
where not exists (select 1 from roles where lower(name) = 'super admin');

COMMIT;

-- ════════════════════════════ PART 33 of 33 · 0247_activity_logs_allow_fk_null.sql ════════════════════════════

BEGIN;
-- ════════════════════════════════════════════════════════════════════════════
-- 0247 — let the append-only activity_logs trigger pass FK "set null" actions
--
-- WHY
--   0245 made activity_logs immutable with a `before update or delete` trigger
--   that raises on every write. But the table also carries two foreign keys with
--   ON DELETE SET NULL: employee_id (→ employees) and daily_session_id
--   (→ daily_sessions). Deleting an employee therefore issues
--
--       UPDATE activity_logs SET employee_id = NULL WHERE employee_id = …
--
--   which the trigger refuses with "activity_logs is append-only" — so
--   `deleteEmployee` fails for anyone who has ever produced a log row (i.e.
--   everyone). The delete never reaches the employees row; the whole transaction
--   rolls back. Same trap when daily_sessions cascade on that delete.
--
--   That UPDATE is not a mutation of the record — it is anonymisation, the exact
--   thing the set-null action exists to do. This migration teaches the trigger
--   the difference, so deletes work again while every other write stays refused.
--
-- Idempotent: create-or-replace + the trigger still calls the function by name.
-- ════════════════════════════════════════════════════════════════════════════

create or replace function activity_logs_no_mutate() returns trigger as $$
begin
  -- Permit ONLY the referential set-null. Every column other than the two FKs is
  -- byte-identical, and each FK column is either left alone or cleared to NULL —
  -- never repointed at a value. The two set-null actions fire separately (one
  -- UPDATE for employee_id, one for daily_session_id), so each must pass while
  -- the other column still holds its value.
  if tg_op = 'UPDATE'
     and (to_jsonb(old) - 'employee_id' - 'daily_session_id')
         = (to_jsonb(new) - 'employee_id' - 'daily_session_id')
     and (new.employee_id is null or old.employee_id is not distinct from new.employee_id)
     and (new.daily_session_id is null or old.daily_session_id is not distinct from new.daily_session_id)
  then
    return new;
  end if;
  raise exception 'activity_logs is append-only (no UPDATE, no DELETE)';
end;
$$ language plpgsql;

COMMIT;

