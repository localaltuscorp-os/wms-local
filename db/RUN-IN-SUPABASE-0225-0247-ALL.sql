-- ============================================================================
--  RUN IN SUPABASE — every migration missing from production as of 2026-09-23
--
--  Generated after discovering the live DB (project ifcdpjbdinvmtewmgceg) was
--  38 migrations behind db/migrations/, going back to 0225. This is why HR
--  screens (Management Assessment candidate picker, etc.) showed no data:
--  the app queries a column/table these add, the query throws, and the
--  calling page swallows the error into an empty list instead of an error.
--
--  Contains, in order:
--    0225_candidate_intake_merge.sql
--    0225_candidate_policy_signature_image.sql
--    0225_hr_records_drive.sql
--    0226_employee_policy_typed_signatures.sql
--    0226_result_is_not_a_task.sql
--    0227_permission_node_settings.sql
--    0227_plan_task_client_repair.sql
--    0228_letter_issue_capability.sql
--    0228_ops_vendor_directory.sql
--    0228_plan_task_client_repair_again.sql
--    0229_broadcast_recurrence_whatsapp.sql
--    0229_dcc_calendar_events.sql
--    0230_client_engagement.sql
--    0230_dcc_master_items.sql
--    0231_approver_initiator_status.sql
--    0231_exec_calendar.sql
--    0232_recruitment_jds.sql
--    0234_billing_contracts.sql
--    0234_initiator_status_archived.sql
--    0235_customer_kyc_business_whatsapp.sql
--    0235_dcc_call_logs.sql
--    0236_customer_kyc_social_payment_options.sql
--    0236_recruitment_jd_roles.sql
--    0237_account_lockouts.sql
--    0237_checklist_wms_columns_jd_client.sql
--    0237_customer_kyc_introducer.sql
--    0237_exec_calendar_categories_markers.sql
--    0238_client_engagement_v2.sql
--    0238_wcc_mcc.sql
--    0239_declaration_compliance.sql
--    0239_wcc_mcc_completed_quantity.sql
--    0240_mcc_frequencies.sql
--    0241_wcc_mcc_abandoned.sql
--    0242_two_step_verification.sql
--    0242_wcc_minutes.sql
--    0243_device_per_person.sql
--    0245_dd_options.sql
--    0247_activity_logs_allow_fk_null.sql
--
--  Every statement here is additive and idempotent (CREATE ... IF NOT
--  EXISTS / ADD COLUMN IF NOT EXISTS / guarded constraints) — confirmed by
--  scanning all 38 files for unguarded CREATE TABLE, ADD COLUMN, DROP,
--  DELETE and TRUNCATE before bundling. Safe to run even if some of these
--  already partially landed via an earlier ad-hoc bundle. One transaction:
--  if anything fails, nothing changes.
--
--  Press Ctrl+A before Run: the editor runs only the selected text.
-- ============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- db/migrations/0225_candidate_intake_merge.sql
-- ─────────────────────────────────────────────────────────────────────────
-- 0225 — ONE CANDIDATE, ONE RECORD.
--
-- WHY THIS EXISTS. A candidate can now be created on the spot from the
-- evaluation form, before they have filled anything (`createQuickCandidate`).
-- That row holds the INTERVIEWER's assessment. When the candidate later fills
-- the interview form they get a DIFFERENT row, because `saveCandidateDraft`
-- matches on id only and `inviteCandidateByLink` matches on email — nothing
-- joins the two. So "what the candidate wrote" and "what the interviewer
-- thought" end up on two records, and nobody can read both in one place.
--
-- The merge keeps ONE of them. The survivor is always the candidate's own form
-- row: it owns their guest login, their access links, their policy signatures
-- and their `hr_form_submissions` index rows, and its name is the one they
-- typed correctly themselves. The placeholder is RETIRED, not deleted.
--
-- ── READ THIS BEFORE FILTERING ON `merged_into_id` ──────────────────────────
-- It is a TOMBSTONE, NOT A PERMANENT ONE, and that is deliberate. The FK is
-- ON DELETE SET NULL, so if the surviving row is ever deleted the retired row
-- becomes visible again — which is the behaviour we want, because the retired
-- row still holds its OWN COPY of the evaluation (the merge copies; it never
-- nulls the source). An interviewer's assessment can therefore never be
-- orphaned by a delete on either side of a merge.
--
-- The merge never destroys anything. Undoing one is a single statement:
--   update candidate_intake set merged_into_id = null where id = <retired id>;
--
-- Additive and idempotent. Nothing existing is read, altered or deleted.

ALTER TABLE candidate_intake
  ADD COLUMN IF NOT EXISTS merged_into_id uuid
    REFERENCES candidate_intake(id) ON DELETE SET NULL;

-- Every candidate picker filters on this, so it is the hot predicate.
CREATE INDEX IF NOT EXISTS candidate_intake_merged_into_idx
  ON candidate_intake (merged_into_id);

-- NOTE: no functional index on the normalised phone. The matching query runs
-- against <=200 rows and the planner seq-scans regardless; a functional index
-- here would be a write cost on every autosave for no read benefit.

CREATE TABLE IF NOT EXISTS candidate_intake_merge_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Denormalised names and numbers: an offboarded employee, or a later edit to
  -- either record, must not rewrite what the merge actually did.
  retired_intake_id  uuid REFERENCES candidate_intake(id) ON DELETE SET NULL,
  survivor_intake_id uuid REFERENCES candidate_intake(id) ON DELETE SET NULL,
  retired_name text,  retired_mobile text,
  survivor_name text, survivor_mobile text,
  -- Which blobs were written onto the survivor, and which were skipped because
  -- the survivor already had them. jsonb arrays of strings, e.g.
  -- ["evaluationV2:interviewer"].
  transferred jsonb NOT NULL DEFAULT '[]'::jsonb,
  skipped     jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- The bytes as they were on the retired row at merge time. The merge COPIES
  -- rather than moves, so this is redundancy by design: it makes the operation
  -- recoverable even if the retired row is later deleted outright.
  restore_payload jsonb,
  actor_employee_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  undone_at timestamptz,
  undone_by_id uuid REFERENCES employees(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS candidate_intake_merge_events_retired_idx
  ON candidate_intake_merge_events (retired_intake_id);
CREATE INDEX IF NOT EXISTS candidate_intake_merge_events_recent_idx
  ON candidate_intake_merge_events (occurred_at DESC);

-- Verify (ONE statement — the Supabase editor shows only the last result set):
--
--   select
--     (select count(*) from information_schema.columns
--       where table_name = 'candidate_intake' and column_name = 'merged_into_id')
--       = 1 as column_added,
--     (select count(*) from information_schema.tables
--       where table_name = 'candidate_intake_merge_events') = 1 as audit_table_added,
--     (select count(*) from candidate_intake where merged_into_id is not null)
--       = 0 as nothing_retired_yet;

-- ─────────────────────────────────────────────────────────────────────────
-- db/migrations/0225_candidate_policy_signature_image.sql
-- ─────────────────────────────────────────────────────────────────────────
-- CANDIDATE POLICY SIGNING — the signature IMAGE.
--
-- A typed name was the whole signature (see 0222). The candidate now also
-- uploads a photo of their handwritten signature, and the policy cannot be
-- signed without it, so the storage key is recorded next to the name it backs.
--
-- NULLABLE on purpose, even though the app requires it from here on: rows
-- signed before this column existed were validly signed under the rule that
-- applied then, and back-filling them with an empty string would forge a
-- signature that was never collected. A null therefore means "typed-only,
-- signed before images were required" — a real distinction worth keeping.
--
-- The path is a key into the PRIVATE documents bucket, never a public URL, and
-- lives under `candidate-intake/<employee id>/` so the ownership check that
-- guards every other candidate upload also guards this one.
ALTER TABLE candidate_policy_signatures
  ADD COLUMN IF NOT EXISTS signature_path text;

-- ─────────────────────────────────────────────────────────────────────────
-- db/migrations/0225_hr_records_drive.sql
-- ─────────────────────────────────────────────────────────────────────────
-- 0225 — HR RECORDS: per-person export + scheduled Google Drive save.
--
-- ── WHAT THIS IS ───────────────────────────────────────────────────────────
-- HR can download one ZIP per person (every filled form as a PDF, every scanned
-- document, every letter), and the same set is saved on a schedule into an
-- "HR Records" folder in the HR Google account's Drive — one folder per person,
-- kept up to date rather than duplicated each month.
--
-- The ZIP needs no storage at all. The Drive save needs two things remembered:
--
--   1. hr_records_drive_settings — ONE row (id = 1): which Google account is
--      connected, its refresh token (ENCRYPTED by the app, never plain), the
--      schedule, and the progress of the pass that is running. A pass walks
--      people in id order and records the last one finished in `run_cursor`, so
--      a pass that outlives one serverless invocation resumes where it stopped.
--
--   2. hr_records_drive_items — what has already been put in Drive: logical key
--      → Drive file id + the version that was uploaded. It is what makes the
--      monthly save an UPDATE (unchanged files are skipped, changed ones are
--      overwritten in place) instead of a fresh copy of everything.
--
-- ── SAFETY ─────────────────────────────────────────────────────────────────
-- Additive only: two new tables, one seeded settings row. No existing table is
-- touched, no row is updated or deleted. Idempotent — safe to run twice.
--
-- RLS is ENABLED with NO policies. The app connects as the table owner and is
-- unaffected; the Supabase REST roles (anon / authenticated) get nothing, which
-- is the point for a table that holds an OAuth refresh token.

CREATE TABLE IF NOT EXISTS hr_records_drive_settings (
  id integer PRIMARY KEY DEFAULT 1,
  -- The Google account the files go to. Lower-cased.
  account_email text,
  -- AES-GCM ciphertext from lib/accounts/crypto.ts encryptSecret(). NULL = not connected.
  refresh_token_enc text,
  connected_by_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  connected_at timestamptz,

  -- Schedule: every `interval_months` month(s), on `day_of_month` (IST).
  schedule_enabled boolean NOT NULL DEFAULT false,
  interval_months integer NOT NULL DEFAULT 1,
  day_of_month integer NOT NULL DEFAULT 1,

  -- Progress. run_cursor: NULL = idle, '' = a pass started and nobody is done
  -- yet, otherwise the employees.id of the last person finished.
  run_cursor text,
  last_run_started_at timestamptz,
  last_completed_at timestamptz,
  last_run_summary jsonb,
  last_error text,
  -- A pass holds this while it runs, so a cron run and a manual "save now"
  -- can never write the same folder at the same time. Expires by itself if
  -- the function running it is killed.
  lock_until timestamptz,

  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT hr_records_drive_settings_singleton CHECK (id = 1),
  CONSTRAINT hr_records_drive_settings_interval_chk CHECK (interval_months BETWEEN 1 AND 12),
  -- 28, not 31: every month has a 28th, so "day 31" can never silently skip February.
  CONSTRAINT hr_records_drive_settings_day_chk CHECK (day_of_month BETWEEN 1 AND 28)
);

INSERT INTO hr_records_drive_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS hr_records_drive_items (
  -- "folder:root" | "folder:<employee id>" | "folder:<employee id>/Forms"
  -- | "file:<employee id>/<entry key>"
  key text PRIMARY KEY,
  employee_id uuid REFERENCES employees(id) ON DELETE CASCADE,
  drive_id text NOT NULL,
  -- What was uploaded (a storage path, an updated_at …). NULL for folders.
  version text,
  -- The name it was given in Drive, so a rename is noticed.
  name text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hr_records_drive_items_employee_idx
  ON hr_records_drive_items (employee_id);

ALTER TABLE hr_records_drive_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_records_drive_items ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────────────────
-- db/migrations/0226_employee_policy_typed_signatures.sql
-- ─────────────────────────────────────────────────────────────────────────
-- EMPLOYEE POLICY SIGN-OFF: printed name + date + signature image.
--
-- Employees already had a way to sign a policy: DigiLocker, which yields an
-- Aadhaar-verified identity, an archived signed PDF and a `document_signatures`
-- row. This table is the SECOND, always-available way - the same three things a
-- candidate provides (a printed name, the moment, and an image of their actual
-- signature) - for the many cases where DigiLocker is not to hand.
--
-- ── WHY ITS OWN TABLE AND NOT `document_signatures` ──────────────────────
-- Filing a typed-and-uploaded signature among the DigiLocker-verified ones
-- would make the two indistinguishable to anyone reading the ledger later, and
-- they are NOT equivalent evidence. Kept separate for the same reason
-- candidate_policy_signatures (0222) is separate, and mirrored into
-- `policy_compliance` with a null doc_instance_id, which is what every HR
-- screen already reads to answer "who has acknowledged what".
--
-- One row per employee per policy: signing again UPDATES it (re-stamping the
-- version), which is what happens when a policy is republished.
CREATE TABLE IF NOT EXISTS employee_policy_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  policy_key text NOT NULL,
  -- The published version that was on screen when they signed.
  version integer NOT NULL DEFAULT 1,
  -- What they printed, verbatim.
  signed_name text NOT NULL,
  -- Storage key of the signature image in the PRIVATE documents bucket.
  signature_path text NOT NULL,
  signed_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT employee_policy_signature_uq UNIQUE (employee_id, policy_key)
);

CREATE INDEX IF NOT EXISTS employee_policy_signatures_employee_idx
  ON employee_policy_signatures (employee_id);

-- ─────────────────────────────────────────────────────────────────────────
-- db/migrations/0226_result_is_not_a_task.sql
-- ─────────────────────────────────────────────────────────────────────────
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

-- ─────────────────────────────────────────────────────────────────────────
-- db/migrations/0227_permission_node_settings.sql
-- ─────────────────────────────────────────────────────────────────────────
-- 0227 — THE PERMISSION TREE'S PRESENTATION BECOMES EDITABLE.
--
-- The permission matrix's tree is generated from the application's real routes
-- and validated against them by tests/unit/permission-catalog.test.ts. That
-- validation is a FEATURE, not an obstacle: a permission node is only meaningful
-- if something enforces it, and what enforces it is a route guard, i.e. code.
--
-- So the tree keeps its SHAPE in code and gains a PRESENTATION layer here: a
-- master admin can rename a node, rewrite its one-line note, reorder it, or hide
-- it from the matrix screen. Nothing here can grant access — the resolver only
-- ever narrows, and there is no column in this table that a guard reads.
--
-- ── WHAT CANNOT BE MADE EDITABLE, AND WHY (do not "fix" these later) ────────
--   node_key   Persisted in module_permissions.node_key. Renaming one would
--              orphan every stored grant silently, leaving rows that govern
--              nothing.
--   routes     Validated against real page files on disk. A route added here
--              would be a switch wired to nothing: it renders as "denied" on
--              screen while the module stays wide open. That is the single
--              failure mode the matrix exists to prevent.
--   structure  flatten() THROWS past depth 3 and nodeChain() derives inheritance
--              from the code tree, so a database-parented node would change what
--              a denial cascades to, invisibly.
--   new nodes  There is no route to guard a new node and no guard to satisfy a
--              deleted one.
--
-- ── THE INVARIANT, AND IT IS LOAD-BEARING ───────────────────────────────────
-- `hidden_in_matrix` curates THE MATRIX SCREEN ONLY. It must NEVER be read by
-- `hiddenModuleKeys()` or `requireModuleView()` in lib/permissions/resolve.ts.
-- If it is, "hidden in the matrix" silently becomes "hidden in the application"
-- — a permission change made through a presentation control, with no audit row
-- saying so. There is a unit test asserting this; do not delete it.
--
-- Additive and idempotent.

CREATE TABLE IF NOT EXISTS permission_node_settings (
  node_key text PRIMARY KEY,                   -- must exist in the code catalogue
  label_override text,                         -- admin-facing display name
  note_override  text,                         -- the one-line explanation on the matrix
  hidden_in_matrix boolean NOT NULL DEFAULT false,  -- curate the matrix, NOT the app
  sort_order integer,                          -- present the tree in house order
  updated_by_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- APPEND-ONLY, mirroring module_permission_events (0219): the trail must show
-- every rename and every hide, not just the current label.
CREATE TABLE IF NOT EXISTS permission_catalog_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  node_key text NOT NULL,
  prev_label text,  next_label text,
  prev_note  text,  next_note  text,
  prev_hidden boolean, next_hidden boolean,
  prev_sort integer,   next_sort integer,
  actor_employee_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS permission_catalog_events_node_idx
  ON permission_catalog_events (node_key, occurred_at DESC);

-- Verify (ONE statement — the Supabase editor shows only the last result set):
--
--   select
--     (select count(*) from information_schema.tables
--       where table_name in ('permission_node_settings','permission_catalog_events')) = 2
--       as both_tables_exist,
--     (select count(*) from permission_node_settings) = 0 as tree_unchanged_yet;

-- ─────────────────────────────────────────────────────────────────────────
-- db/migrations/0227_plan_task_client_repair.sql
-- ─────────────────────────────────────────────────────────────────────────
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

-- ─────────────────────────────────────────────────────────────────────────
-- db/migrations/0228_letter_issue_capability.sql
-- ─────────────────────────────────────────────────────────────────────────
-- 0228 — A SECOND DB-BACKED CAPABILITY: hr.letters.issue
--
-- WHY. Creating, issuing and emailing an HR letter was gated on `isAdmin` — in
-- three separate places, each with its own copy of the test. So "can send an
-- appointment letter" and "can manage every employee and setting in the
-- application" were the same bit, and the only way to let an HR person send a
-- letter was to make them a full admin. That is a far larger grant than the job.
--
-- `hr.letters.issue` is the narrow alternative: admins and super-admins hold it
-- automatically (their behaviour is unchanged), and anybody else gets it as a
-- grant on their employee record.
--
-- ── THIS MIGRATION ONLY WIDENS A CHECK CONSTRAINT ──────────────────────────
-- Migration 0226 pinned `capability_grants.capability` to `master_admin.manage`
-- ALONE, on purpose, and the comment there explains why: a database row for a
-- capability whose guards are synchronous would be a grant the application
-- silently ignores — somebody told they hold a power they do not have.
--
-- Adding a name here is therefore only safe because that capability's guards are
-- async and now READ this table:
--
--   · app/(app)/hr/letters/[key]/page.tsx     — the page gate
--   · lib/hr/letters/issue-core.ts            — issuing (two call sites)
--   · app/api/hr/letters/email-pdf/route.ts   — emailing
--
-- all three now route through `canIssueLetters()` in
-- lib/hr/letters/issue-access.ts. The same rule applies to the NEXT capability
-- added here: make its guards asynchronous first, then widen this list.
--
-- Additive and idempotent — the constraint is dropped and recreated, and DROP
-- CONSTRAINT loses no rows.

ALTER TABLE capability_grants
  DROP CONSTRAINT IF EXISTS capability_grants_capability_chk;

ALTER TABLE capability_grants
  ADD CONSTRAINT capability_grants_capability_chk
    CHECK (capability IN ('master_admin.manage', 'hr.letters.issue'));

-- Verify (ONE statement — the Supabase editor shows only the last result set):
--
--   select
--     (select count(*) from capability_grants) = 0 as no_grants_yet,
--     pg_get_constraintdef(oid) like '%hr.letters.issue%' as issue_capability_allowed
--   from pg_constraint where conname = 'capability_grants_capability_chk';

-- ─────────────────────────────────────────────────────────────────────────
-- db/migrations/0228_ops_vendor_directory.sql
-- ─────────────────────────────────────────────────────────────────────────
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

-- ─────────────────────────────────────────────────────────────────────────
-- db/migrations/0228_plan_task_client_repair_again.sql
-- ─────────────────────────────────────────────────────────────────────────
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

-- ─────────────────────────────────────────────────────────────────────────
-- db/migrations/0229_broadcast_recurrence_whatsapp.sql
-- ─────────────────────────────────────────────────────────────────────────
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

-- ─────────────────────────────────────────────────────────────────────────
-- db/migrations/0229_dcc_calendar_events.sql
-- ─────────────────────────────────────────────────────────────────────────
-- 0229 — Daily Compliance in every employee's Google Calendar.
--
-- The account holder asked (2026-09-15) for every DCC entry to sit in each
-- employee's Altus Google Calendar. lib/dcc/calendar-sync.ts keeps ONE all-day
-- event per person per day; this table remembers which Google event that is and
-- what was last sent, so an unchanged day costs no API call and a changed one is
-- updated in place instead of duplicated.
--
--   google_event_id  null once the day's event has been removed
--   synced_hash      fingerprint of the event body last sent
--   snapshot_at      when the data behind that sync was read — a slower sync
--                    that read older data never overwrites a newer one
--   last_error       the last Google failure, retried by the next run
--
-- A new table rather than columns on `employees` or `dcc_entries`: the event is
-- per person-DAY, which neither of those rows is.
--
-- Idempotent: this repository applies migrations by hand.

create table if not exists dcc_calendar_events (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  event_date date not null,
  google_event_id text,
  synced_hash text,
  snapshot_at timestamptz,
  synced_at timestamptz,
  last_error text,
  attempts integer not null default 0,
  updated_at timestamptz not null default now()
);

create unique index if not exists dcc_calendar_events_uq
  on dcc_calendar_events (employee_id, event_date);

-- ─────────────────────────────────────────────────────────────────────────
-- db/migrations/0230_client_engagement.sql
-- ─────────────────────────────────────────────────────────────────────────
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

-- ─────────────────────────────────────────────────────────────────────────
-- db/migrations/0230_dcc_master_items.sql
-- ─────────────────────────────────────────────────────────────────────────
-- 0230 — DCC Masters: a Daily Compliance template per POSITION.
--
-- The account holder asked (2026-09-15) for DCC to work the way the Job
-- Description does — a master for a position, plus a specific DCC for an
-- employee. "Position" is the employee's DESIGNATION (employees.designation_id),
-- the one already set for 20 of 23 people.
--
-- LIVE-LINKED. Every active employee holding a designation carries one real KPI
-- (`dcc_kpi_items`) per active master item of that designation, so filling,
-- history, the dashboard, the 10 PM report and the calendar all work unchanged.
-- lib/dcc/master-sync.ts keeps them in step: a master edit updates every holder,
-- a retired master KPI is archived (history kept), and a change of designation
-- swaps one master's KPIs for the other's.
--
-- THE LINK IS ITS OWN TABLE, not a column on `dcc_kpi_items`: Drizzle names every
-- declared column in an INSERT, so a new column there would break adding a KPI
-- anywhere until this migration had been applied by hand. A KPI with no row here
-- is the employee's SPECIFIC DCC — including all ~260 that exist today.
--
-- Idempotent: this repository applies migrations by hand.

create table if not exists dcc_master_items (
  id uuid primary key default gen_random_uuid(),
  designation_id uuid not null references designations(id) on delete cascade,
  section text,
  code text,
  title text not null,
  frequency text,
  target_number numeric(14, 2),
  unit text,
  sort_order integer not null default 100,
  is_active boolean not null default true,
  created_by_id uuid references employees(id) on delete set null,
  updated_by_id uuid references employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists dcc_master_items_designation_idx
  on dcc_master_items (designation_id, is_active, sort_order);

create table if not exists dcc_master_links (
  item_id uuid primary key references dcc_kpi_items(id) on delete cascade,
  master_item_id uuid not null references dcc_master_items(id) on delete cascade,
  owner_employee_id uuid not null references employees(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- One linked KPI per person per master item: what stops a double sync from
-- giving somebody the same KPI twice.
create unique index if not exists dcc_master_links_owner_master_uq
  on dcc_master_links (owner_employee_id, master_item_id);

-- ─────────────────────────────────────────────────────────────────────────
-- db/migrations/0231_approver_initiator_status.sql
-- ─────────────────────────────────────────────────────────────────────────
-- 0231 — Approver / Initiator Status beside Doer Status, in WMS Tasks, Goals
-- and Projects (account holder, 2026-09-15).
--
-- Every piece of work now carries two statuses:
--   Doer Status                  Not Read · Not Started · Initiated · Follow Up ·
--                                Need Info · Done
--   Approver / Initiator Status  Pending · Approved · Not Approved · On Hold ·
--                                Cancelled      (Pending = no ruling = NULL)
-- The vocabulary and the rule for who may rule live in
-- lib/status/approver-status.ts.
--
-- Idempotent: this repository applies migrations by hand.

-- ── TASKS ──────────────────────────────────────────────────────────────────
-- On Hold becomes a ruling. tasks.approval_status gains the value.
-- (ADD VALUE cannot run inside a transaction block together with a statement
-- that uses the new value — run this file statement by statement, or apply
-- this line on its own first.)
alter type approval_status add value if not exists 'on_hold';

-- ── GOALS ──────────────────────────────────────────────────────────────────
-- A SIDE TABLE, not a column on goals / weekly_goals: much of the Goals module
-- reads those tables with a bare `select()` / `returning()`, which name every
-- declared column — a new column there would break the whole module until this
-- migration had run. No row = Pending.
create table if not exists goal_approver_statuses (
  goal_id uuid primary key references goals(id) on delete cascade,
  approval_status text not null check (approval_status in ('approved', 'not_approved', 'on_hold', 'cancelled')),
  set_by_id uuid references employees(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists weekly_goal_approver_statuses (
  weekly_goal_id uuid primary key references weekly_goals(id) on delete cascade,
  approval_status text not null check (approval_status in ('approved', 'not_approved', 'on_hold', 'cancelled')),
  set_by_id uuid references employees(id) on delete set null,
  updated_at timestamptz not null default now()
);

-- ── PROJECTS ───────────────────────────────────────────────────────────────
-- project_nodes.approval_status already exists (0204) with exactly these
-- values; nothing to add.

-- ─────────────────────────────────────────────────────────────────────────
-- db/migrations/0231_exec_calendar.sql
-- ─────────────────────────────────────────────────────────────────────────
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

-- NOTE: the original 0231 category_chk (old 7-key taxonomy) is deliberately
-- NOT replayed here — 0237 below (already applied on this DB in a prior
-- ad-hoc run, before this bundle existed) remapped the data to the new
-- 14-key taxonomy and re-added this same constraint with the new keys.
-- Re-asserting the old constraint here would reject already-migrated rows
-- ('festival', 'consulting', etc. are not in the old 7-key list) and abort
-- the whole transaction. 0237's ADD CONSTRAINT is the one that takes effect.

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

-- Same reason as exec_calendar_events above: skip the old-taxonomy
-- category_chk here, 0237 re-adds it with the new keys further down.

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

-- ─────────────────────────────────────────────────────────────────────────
-- db/migrations/0232_recruitment_jds.sql
-- ─────────────────────────────────────────────────────────────────────────
-- 0232 — Recruitment JDs: the job descriptions recruiters send to candidates.
--
-- The account holder asked (2026-09-15) for a Job Description section for
-- recruiters, for every position we hire into, that can be sent to anyone by
-- WhatsApp or email, inside the HR module. It is NOT the internal Job
-- Description module (/operations/job-description, the JD Bank of recurring
-- duties per seat) — that answers "who does this job"; this answers "what do
-- we tell a candidate about this job".
--
-- One row per candidate position (`interview_positions`, the list the Candidate
-- Interview Form already uses), holding two versions:
--   master_content     the original — Rutvisha's JD. Changed only deliberately.
--   recruiter_content  what recruiters edit and send. NULL = identical to the
--                      master, so a master update flows through until someone
--                      edits the recruiter copy. "Reset to master" sets it NULL.
-- Content is jsonb in the shape lib/operations/recruitment-jd.ts defines, so the fields
-- can grow once the real JDs arrive without another migration.
--
-- recruitment_jd_sends records every send — what was sent (a snapshot, since
-- the JD can change afterwards), to whom, how, and by whom. A WhatsApp send is
-- 'opened': the WMS opens WhatsApp with the JD typed in; the recruiter presses
-- Send there, which the WMS cannot see.
--
-- Idempotent: this repository applies migrations by hand.

create table if not exists recruitment_jds (
  id uuid primary key default gen_random_uuid(),
  position_id uuid not null unique references interview_positions(id) on delete restrict,
  master_content jsonb,
  master_updated_by_id uuid references employees(id) on delete set null,
  master_updated_at timestamptz,
  recruiter_content jsonb,
  recruiter_updated_by_id uuid references employees(id) on delete set null,
  recruiter_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists recruitment_jd_sends (
  id uuid primary key default gen_random_uuid(),
  jd_id uuid references recruitment_jds(id) on delete set null,
  position_label text not null,
  channel text not null check (channel in ('whatsapp', 'email')),
  recipient_name text,
  recipient_phone text,
  recipient_email text,
  content jsonb not null,
  status text not null check (status in ('opened', 'sent', 'failed')),
  error text,
  sent_by_id uuid references employees(id) on delete set null,
  sent_at timestamptz not null default now()
);

create index if not exists recruitment_jd_sends_jd_idx on recruitment_jd_sends (jd_id, sent_at desc);

-- ─────────────────────────────────────────────────────────────────────────
-- db/migrations/0234_billing_contracts.sql
-- ─────────────────────────────────────────────────────────────────────────
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

-- ─────────────────────────────────────────────────────────────────────────
-- db/migrations/0234_initiator_status_archived.sql
-- ─────────────────────────────────────────────────────────────────────────
-- 0234 — "Archived" joins the Initiator Status verdicts, in WMS Tasks, Goals
-- and Projects (account holder, 2026-09-16).
--
-- The column was renamed in the UI at the same time: "Approver / Initiator
-- Status" is now just "Initiator Status". That is a label, not data — nothing
-- here renames anything.
--
--   Initiator Status  Pending · Approved · Not Approved · On Hold · Archived ·
--                     Cancelled        (Pending = no ruling = NULL)
--
-- The vocabulary and the rule for who may rule live in
-- lib/status/approver-status.ts.
--
-- Idempotent, and SAFE TO RUN BEFORE OR AFTER 0231: the two goal side tables
-- are only touched if they exist, so this does not fail on a database where
-- 0231 has not been applied yet. Apply 0231 first where you can — running this
-- one first simply leaves those two constraints for 0231 to create correctly.

-- ── TASKS ──────────────────────────────────────────────────────────────────
-- tasks.approval_status is a Postgres ENUM, so the value is added to the type.
-- (ADD VALUE cannot run inside a transaction block together with a statement
-- that uses the new value — run this file statement by statement, or apply
-- this line on its own first.)
alter type approval_status add value if not exists 'archived';

-- ── GOALS ──────────────────────────────────────────────────────────────────
-- Side tables from 0231, guarded by a CHECK rather than an enum. Widen it.
do $$
begin
  if to_regclass('public.goal_approver_statuses') is not null then
    alter table goal_approver_statuses
      drop constraint if exists goal_approver_statuses_approval_status_check;
    alter table goal_approver_statuses
      add constraint goal_approver_statuses_approval_status_check
      check (approval_status in ('approved', 'not_approved', 'on_hold', 'archived', 'cancelled'));
  end if;

  if to_regclass('public.weekly_goal_approver_statuses') is not null then
    alter table weekly_goal_approver_statuses
      drop constraint if exists weekly_goal_approver_statuses_approval_status_check;
    alter table weekly_goal_approver_statuses
      add constraint weekly_goal_approver_statuses_approval_status_check
      check (approval_status in ('approved', 'not_approved', 'on_hold', 'archived', 'cancelled'));
  end if;
end $$;

-- ── PROJECTS ───────────────────────────────────────────────────────────────
-- project_nodes.approval_status is text with a CHECK from 0204, which allows
-- exactly ('not_approved', 'approved', 'on_hold', 'cancelled'). This widens it
-- by one value.
--
-- NOT VALID, as 0204 wrote it. That is deliberate: 0204 never validated the
-- constraint, so rows older than it were never checked and may hold anything.
-- Adding a VALIDATING constraint here would scan the whole table and fail on
-- one such row — turning a one-word addition into a failed migration.
do $$
begin
  if to_regclass('public.project_nodes') is not null then
    alter table project_nodes
      drop constraint if exists project_nodes_approval_status_check;
    alter table project_nodes
      add constraint project_nodes_approval_status_check
      check (
        approval_status is null
        or approval_status in ('approved', 'not_approved', 'on_hold', 'archived', 'cancelled')
      ) not valid;
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────
-- db/migrations/0235_customer_kyc_business_whatsapp.sql
-- ─────────────────────────────────────────────────────────────────────────
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

-- ─────────────────────────────────────────────────────────────────────────
-- db/migrations/0235_dcc_call_logs.sql
-- ─────────────────────────────────────────────────────────────────────────
-- 0235 — the SP1 call log (DCC-SPEC §7, §13).
--
-- The compliance board records whether a duty was DONE. SP1 records, of the
-- calls a person made on a day, HOW MANY landed on each of fifteen outcomes —
-- Registered, Verbal Yes, DND, Ringing and the rest. That is a count per
-- outcome per person per day, and it is not a compliance: there is no
-- Done/Not-done here, only numbers.
--
-- ── WHY A NARROW LOG AND NOT FIFTEEN COLUMNS ───────────────────────────────
-- Fifteen columns on dcc_entries would widen a table much of the module reads
-- with a bare select(), and every new outcome would then be a migration PLUS a
-- code change everywhere that table is read. Keyed by outcome, a sixteenth
-- outcome is a data row.
--
-- NO CHECK ON `disposition` — deliberately. The vocabulary lives in
-- lib/dcc/sp1.ts, the write path validates against it, and the grid drops
-- anything it does not recognise. A constraint here would mean a migration
-- every time Jeevan's sheet gains a row.
--
-- IDEMPOTENT: this repository applies migrations by hand, in the Supabase SQL
-- editor, and a file that cannot be run twice is a file that gets run once and
-- then half-run.

create table if not exists dcc_call_logs (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  log_date date not null,
  disposition text not null,
  -- A count, never negative. ZERO IS MEANINGFUL and different from no row:
  -- zero means "asked, none landed here", no row means nobody said.
  count integer not null default 0 check (count >= 0),
  note text,
  filled_by_id uuid references employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ONE row per person per day per outcome. This is what lets the fill screen
-- upsert a cell without reading it first, and what stops a double-submit
-- doubling a day's numbers.
create unique index if not exists dcc_call_logs_uq
  on dcc_call_logs (employee_id, log_date, disposition);

-- The grid reads a date window for a set of people; the 10 pm report reads one
-- day for everybody. Both are served by this.
create index if not exists dcc_call_logs_date_idx
  on dcc_call_logs (log_date, employee_id);

-- ─────────────────────────────────────────────────────────────────────────
-- db/migrations/0236_customer_kyc_social_payment_options.sql
-- ─────────────────────────────────────────────────────────────────────────
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

-- ─────────────────────────────────────────────────────────────────────────
-- db/migrations/0236_recruitment_jd_roles.sql
-- ─────────────────────────────────────────────────────────────────────────
-- 0236 — Recruitment JDs get their own role list.
--
-- 0232 keyed one JD to one row of `interview_positions`. That list is the
-- INTERVIEW GRADE ladder — Executive, Senior Manager, Consultant, First-Year
-- Intern — and it is the wrong key for this: the JDs Rutvisha wrote are per
-- HIRING ROLE (Sales Manager, Creative Intern, Back Office Executive), several
-- of them span two grades at once ("Senior Sales Manager / Sales Manager"), and
-- a grade like "Deputy Vice President" has no JD and never will.
--
-- So a recruitment JD is now identified by its own `slug`, carries its own
-- `title`, and `position_id` becomes an OPTIONAL link to the grade for anyone
-- who wants to tie the two together later.
--
-- Written as one self-contained, idempotent script because 0232 may or may not
-- have been applied in a given database — this repository applies migrations by
-- hand, and at the time of writing neither table existed in the live one.
--
--   master_content     the original — Rutvisha's JD. Changed only deliberately.
--   recruiter_content  what recruiters edit and send. NULL = identical to the
--                      master, so a master update flows through until someone
--                      edits the recruiter copy. "Reset to master" sets it NULL.

create table if not exists recruitment_jds (
  id uuid primary key default gen_random_uuid(),
  position_id uuid references interview_positions(id) on delete set null,
  master_content jsonb,
  master_updated_by_id uuid references employees(id) on delete set null,
  master_updated_at timestamptz,
  recruiter_content jsonb,
  recruiter_updated_by_id uuid references employees(id) on delete set null,
  recruiter_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The new identity. Added separately so a database that already ran 0232 is
-- carried forward rather than rebuilt.
alter table recruitment_jds add column if not exists slug text;
alter table recruitment_jds add column if not exists title text;
alter table recruitment_jds add column if not exists sort_order integer not null default 100;
alter table recruitment_jds add column if not exists is_active boolean not null default true;

-- 0232 made position_id NOT NULL UNIQUE. Both have to go: a JD no longer needs
-- a grade, and two JDs may point at the same one.
alter table recruitment_jds alter column position_id drop not null;
do $$
declare c text;
begin
  for c in
    select con.conname from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
     where rel.relname = 'recruitment_jds' and con.contype = 'u'
       and pg_get_constraintdef(con.oid) like '%(position_id)%'
  loop
    execute format('alter table recruitment_jds drop constraint %I', c);
  end loop;
end $$;

-- Backfill any row written under 0232 so the NOT NULL below can be taken.
update recruitment_jds jd
   set slug = coalesce(jd.slug, 'position-' || replace(jd.id::text, '-', '')),
       title = coalesce(jd.title, p.label, 'Untitled role')
  from interview_positions p
 where p.id = jd.position_id and (jd.slug is null or jd.title is null);
update recruitment_jds
   set slug = coalesce(slug, 'position-' || replace(id::text, '-', '')),
       title = coalesce(title, 'Untitled role')
 where slug is null or title is null;

alter table recruitment_jds alter column slug set not null;
alter table recruitment_jds alter column title set not null;

create unique index if not exists recruitment_jds_slug_uq on recruitment_jds (slug);
create index if not exists recruitment_jds_order_idx on recruitment_jds (sort_order, title);

-- Every send, recorded: what went out (a snapshot, since the JD can change
-- afterwards), to whom, how, and by whom. A WhatsApp send is 'opened' — the WMS
-- opens WhatsApp with the JD typed in and the recruiter presses Send there,
-- which the WMS cannot observe.
create table if not exists recruitment_jd_sends (
  id uuid primary key default gen_random_uuid(),
  jd_id uuid references recruitment_jds(id) on delete set null,
  position_label text not null,
  channel text not null check (channel in ('whatsapp', 'email')),
  recipient_name text,
  recipient_phone text,
  recipient_email text,
  content jsonb not null,
  status text not null check (status in ('opened', 'sent', 'failed')),
  error text,
  sent_by_id uuid references employees(id) on delete set null,
  sent_at timestamptz not null default now()
);

create index if not exists recruitment_jd_sends_jd_idx on recruitment_jd_sends (jd_id, sent_at desc);

-- ─────────────────────────────────────────────────────────────────────────
-- db/migrations/0237_account_lockouts.sql
-- ─────────────────────────────────────────────────────────────────────────
-- 0236 — account lockout after consecutive failed sign-ins
--
-- Locks an account after MAX_FAILED_ATTEMPTS (5) consecutive wrong passwords.
-- While locked, the person can neither sign in NOR use Forgot Password; only
-- the four named in lib/auth/unlock-permission.ts can clear it.
--
-- ADDITIVE ONLY. One new table, no change to any existing one. Nothing reads it
-- until the server-side sign-in route ships, so applying this early is safe and
-- is the intended order: migration first, code second. Shipping code that reads
-- a column the database lacks is exactly what caused the 2026-09-09 login
-- outage (see docs/SCHEMA_DRIFT_FIX_2026-09-10.sql).
--
--
-- ── WHY KEYED BY EMAIL, NOT employee_id ────────────────────────────────────
--
-- Failures arrive BEFORE we know who is typing. A wrong password proves only
-- that someone entered an address; it does not authenticate them, and the
-- address may belong to nobody. Keying on employees.id would mean either
-- resolving the address to a row first — which turns every failed attempt into
-- a lookup that leaks existence through timing — or dropping attempts against
-- unknown addresses, which is precisely the traffic worth counting.
--
-- So the key is the raw lower-cased address, and `employee_id` below is a
-- nullable CONVENIENCE for the admin screen, filled in when the address happens
-- to match a row. It is not the identity of this record.
--
--
-- ── WHY NO AUTO-EXPIRY COLUMN ──────────────────────────────────────────────
--
-- A lock ends when a human ends it. There is no `locked_until`, and that is the
-- product decision, not an omission: a timed unlock would let a brute-force
-- attempt simply wait, and the requirement is that the four approve each
-- release. `failed_count` DOES age out — see FAILED_ATTEMPT_WINDOW_MS — but the
-- lock itself does not.

CREATE TABLE IF NOT EXISTS account_lockouts (
  -- Lower-cased at every call site. The application normalises; this is not
  -- enforced by a constraint because a CHECK on lower(email) = email would
  -- reject rows a future importer might legitimately want to repair.
  email           text PRIMARY KEY,

  -- Consecutive failures inside FAILED_ATTEMPT_WINDOW_MS. Reset to 0 by a
  -- successful sign-in and by an unlock.
  failed_count    integer NOT NULL DEFAULT 0,

  -- When the most recent failure landed. Read together with failed_count to
  -- decide whether the window has lapsed and the count should restart.
  last_failed_at  timestamptz,

  -- NULL means NOT LOCKED. This single nullable timestamp is the lock, rather
  -- than a boolean plus a date that can disagree with each other.
  locked_at       timestamptz,

  -- Audit of the last release. Kept after unlocking rather than deleting the
  -- row, so "this account has been locked before" stays answerable — a repeat
  -- lockout is a different conversation from a first one.
  unlocked_at     timestamptz,
  unlocked_by_id  uuid REFERENCES employees(id) ON DELETE SET NULL,

  -- Convenience only; see the note above. SET NULL rather than CASCADE: an
  -- employee leaving must not erase the record that their account was locked.
  employee_id     uuid REFERENCES employees(id) ON DELETE SET NULL,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- A count cannot be negative, and nothing should be able to write a value that
-- would make remainingAttempts() return a nonsense number.
ALTER TABLE account_lockouts DROP CONSTRAINT IF EXISTS account_lockouts_count_nonneg;
ALTER TABLE account_lockouts ADD CONSTRAINT account_lockouts_count_nonneg
  CHECK (failed_count >= 0);

-- The admin screen's only query: "show me everyone currently locked, newest
-- first". Partial, because locked rows are a handful and unlocked ones are the
-- rest of the table.
CREATE INDEX IF NOT EXISTS account_lockouts_locked_idx
  ON account_lockouts (locked_at DESC)
  WHERE locked_at IS NOT NULL;

-- Supports the admin screen joining back to the employee, and stays small.
CREATE INDEX IF NOT EXISTS account_lockouts_employee_idx
  ON account_lockouts (employee_id)
  WHERE employee_id IS NOT NULL;


-- ── PER-IP THROTTLE ────────────────────────────────────────────────────────
--
-- The per-email counter alone makes a denial-of-service trivial: typing a
-- colleague's address with junk five times locks them out, and with only four
-- unlockers that is disruptive by design. This table makes SWEEPING addresses
-- expensive, which is the attack the email counter cannot see — one failure
-- each against fifty addresses trips no per-email threshold at all.
--
-- Deliberately NOT a lockout: an IP is shared (an office NAT is one address for
-- everybody), so this feeds a delay and a refusal-to-count, never a lock on a
-- person. Rows are disposable; prune anything older than the window.
CREATE TABLE IF NOT EXISTS login_attempt_ips (
  ip              text NOT NULL,
  window_start    timestamptz NOT NULL DEFAULT now(),
  failed_count    integer NOT NULL DEFAULT 0,
  last_failed_at  timestamptz,
  PRIMARY KEY (ip, window_start)
);

CREATE INDEX IF NOT EXISTS login_attempt_ips_window_idx
  ON login_attempt_ips (window_start);


-- Record in the ledger the runner reads.
CREATE TABLE IF NOT EXISTS __schema_applied (
  filename    text PRIMARY KEY,
  applied_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO __schema_applied (filename) VALUES ('0237_account_lockouts.sql')
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────
-- db/migrations/0237_checklist_wms_columns_jd_client.sql
-- ─────────────────────────────────────────────────────────────────────────
-- 0237 — The Event Checklist reads like WMS Tasks; a JD gets a Client and
-- per-person Doer Notes (account holder, 2026-09-18).
--
-- The checklist grid now runs in the WMS Tasks column order:
--   S. No. · Client · Subject · Task · Doer · Initiator · Target Date ·
--   Frequency · Doer Status · Doer Notes · Actual Date · +/- Days ·
--   Approver Status · Approver Notes
-- and a person's JD reads:
--   S. No. · Client · Subject · Job Description · Target Date · Doer Notes
--
-- "Category" becomes "Subject", picked from the same `subjects` roster WMS
-- Tasks uses (Admin Panel → Subjects). The column is NOT renamed: the stored
-- words are the same thing under a new heading, and a rename would break every
-- deployed reader until this ran.
--
-- ADDITIVE, apart from the Doer Status values below. Idempotent — this
-- repository applies migrations by hand, and a migration that cannot be run
-- twice gets run twice.

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Checklist rows — Client, Initiator, and the repeat rule.
-- ───────────────────────────────────────────────────────────────────────────
alter table ops_checklist_items add column if not exists client text;
alter table ops_checklist_items add column if not exists initiator_id uuid
  references employees(id) on delete set null;
-- Google Calendar's RRULE (FREQ=WEEKLY;BYDAY=FR …), the same grammar a WMS
-- task's `recurrence_rule` holds. NULL = does not repeat. The Frequency column
-- (Daily / Weekly / Monthly / Quarterly / Yearly) is read from it, so the two
-- can never disagree.
alter table ops_checklist_items add column if not exists recurrence_rule text;

-- Whoever put a row on the checklist is who asked for it.
update ops_checklist_items
   set initiator_id = created_by_id
 where initiator_id is null and created_by_id is not null;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Ticks — Approver Status and Approver Notes, beside the doer's own.
-- ───────────────────────────────────────────────────────────────────────────
-- NULL approver_status is "Pending" — no ruling yet — exactly as on a task.
alter table ops_checklist_checks add column if not exists approver_status text;
alter table ops_checklist_checks add column if not exists approver_notes text;
alter table ops_checklist_checks add column if not exists approver_id uuid
  references employees(id) on delete set null;
alter table ops_checklist_checks add column if not exists approver_at timestamptz;

alter table ops_checklist_checks drop constraint if exists ops_checklist_checks_approver_chk;
alter table ops_checklist_checks add constraint ops_checklist_checks_approver_chk
  check (approver_status is null
         or approver_status in ('approved', 'not_approved', 'on_hold', 'archived', 'cancelled'));

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Doer Status — the WMS Tasks six, replacing the checklist's own four.
-- ───────────────────────────────────────────────────────────────────────────
--   Pending        → not_started
--   Done           → done
--   Need Help      → need_info      (WMS retired need_help into need_info)
--   Not Applicable → not_started, with the Approver Status "Cancelled"
--
-- WMS has no "Not Applicable" doer status: work that did not need doing is a
-- RULING on the work, and Cancelled is that ruling. It keeps such rows out of
-- the progress figure the way Not Applicable did.
alter table ops_checklist_checks drop constraint if exists ops_checklist_checks_status_chk;

update ops_checklist_checks
   set approver_status = coalesce(approver_status, 'cancelled'),
       status = 'not_started'
 where status = 'Not Applicable';

update ops_checklist_checks
   set status = case status
                  when 'Pending' then 'not_started'
                  when 'Done' then 'done'
                  when 'Need Help' then 'need_info'
                end
 where status in ('Pending', 'Done', 'Need Help');

alter table ops_checklist_checks alter column status set default 'not_started';
alter table ops_checklist_checks add constraint ops_checklist_checks_status_chk
  check (status in ('dont_know', 'not_started', 'initiated', 'follow_up', 'need_info', 'done'));

-- ───────────────────────────────────────────────────────────────────────────
-- 4. A Client on every Job Description — free text, like tasks.client, picked
--    from the `clients` roster.
-- ───────────────────────────────────────────────────────────────────────────
alter table jd_entries add column if not exists client text;

-- ───────────────────────────────────────────────────────────────────────────
-- 5. Doer Notes — what the PERSON doing a JD writes against it.
-- ───────────────────────────────────────────────────────────────────────────
-- Per person, not per JD: a seat's JD is shared by everyone in the seat, and
-- one holder's notes are not another's. Its own table rather than a column on
-- jd_assignments, because a person holds their seat's JDs without any
-- assignment row, and an assignment is retired and re-created as seats change —
-- the notes must survive both.
create table if not exists jd_doer_notes (
  jd_id uuid not null references jd_entries(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade,
  notes text,
  updated_by_id uuid references employees(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (jd_id, employee_id)
);

create index if not exists jd_doer_notes_employee_idx on jd_doer_notes (employee_id);

-- ─────────────────────────────────────────────────────────────────────────
-- db/migrations/0237_customer_kyc_introducer.sql
-- ─────────────────────────────────────────────────────────────────────────
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

-- ─────────────────────────────────────────────────────────────────────────
-- db/migrations/0237_exec_calendar_categories_markers.sql
-- ─────────────────────────────────────────────────────────────────────────
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


-- ─────────────────────────────────────────────────────────────────────────
-- db/migrations/0238_client_engagement_v2.sql
-- ─────────────────────────────────────────────────────────────────────────
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

-- ─────────────────────────────────────────────────────────────────────────
-- db/migrations/0238_wcc_mcc.sql
-- ─────────────────────────────────────────────────────────────────────────
-- 0238 — DCC becomes the Weekly and Monthly Compliance Checklists (WCC / MCC)
-- (account holder, 2026-09-18).
--
-- Built the way the Accounts checklists are: one row per compliance per
-- deadline, the WMS Doer Status, the actual date captured when it is marked
-- Done, the +/- days against the deadline, Doer Notes, and the WMS Approver
-- Status with Approver Notes.
--
-- The compliances themselves stay in dcc_kpi_items and each fill in
-- dcc_entries, so everything already in DCC — the position masters, the JD
-- "Add to DCC" push, four weeks of history — carries straight into WCC and MCC.
--   WCC  = schedule_kind 'scheduled' (due on its weekdays) and 'weekly'
--          (once a week, on any of its days)
--   MCC  = schedule_kind 'monthly', due on `month_day` (NULL = the month's end)
--
-- ADDITIVE. The old `status` column (Done / Not done / NA / Pending) is kept and
-- written alongside the new columns, because the DCC dashboard, the 10 pm
-- report, PMS and the Android app still read it. Idempotent — this repository
-- applies migrations by hand.

-- ───────────────────────────────────────────────────────────────────────────
-- 1. MCC deadline: which day of the month a monthly compliance is due.
-- ───────────────────────────────────────────────────────────────────────────
alter table dcc_kpi_items add column if not exists month_day smallint;
alter table dcc_kpi_items drop constraint if exists dcc_kpi_items_month_day_chk;
alter table dcc_kpi_items add constraint dcc_kpi_items_month_day_chk
  check (month_day is null or month_day between 1 and 31);

-- ───────────────────────────────────────────────────────────────────────────
-- 2. The WMS columns on every fill.
-- ───────────────────────────────────────────────────────────────────────────
-- doer_status  the WMS six: dont_know · not_started · initiated · follow_up ·
--              need_info · done
-- done_at      THE ACTUAL DATE, stamped by the server when the doer marks Done
-- approver_*   the WMS Approver Status (NULL = Pending) and its notes
alter table dcc_entries add column if not exists doer_status text;
alter table dcc_entries add column if not exists done_at timestamptz;
alter table dcc_entries add column if not exists approver_status text;
alter table dcc_entries add column if not exists approver_notes text;
alter table dcc_entries add column if not exists approver_id uuid
  references employees(id) on delete set null;
alter table dcc_entries add column if not exists approver_at timestamptz;

alter table dcc_entries drop constraint if exists dcc_entries_doer_status_chk;
alter table dcc_entries add constraint dcc_entries_doer_status_chk
  check (doer_status is null
         or doer_status in ('dont_know', 'not_started', 'initiated', 'follow_up', 'need_info', 'done'));

alter table dcc_entries drop constraint if exists dcc_entries_approver_status_chk;
alter table dcc_entries add constraint dcc_entries_approver_status_chk
  check (approver_status is null
         or approver_status in ('approved', 'not_approved', 'on_hold', 'archived', 'cancelled'));

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Carry the history across.
-- ───────────────────────────────────────────────────────────────────────────
--   Done     → done         (actual date: when the entry was last saved — the
--                            best record there is of when it was marked)
--   Pending  → initiated    (begun, not finished)
--   Not done → not_started
--   NA       → not_started, Approver Status "Cancelled" — WMS has no "Not
--              Applicable" doer status; work that did not apply is a ruling
update dcc_entries
   set doer_status = case status
                       when 'Done' then 'done'
                       when 'Pending' then 'initiated'
                       when 'Not done' then 'not_started'
                       when 'NA' then 'not_started'
                     end,
       done_at = case when status = 'Done' then coalesce(done_at, updated_at) else done_at end,
       approver_status = case when status = 'NA' then coalesce(approver_status, 'cancelled') else approver_status end
 where doer_status is null and status in ('Done', 'Pending', 'Not done', 'NA');

-- Manan Sir's grid and the 10 pm reminder read a whole team's fills for a
-- window of days at a time.
create index if not exists dcc_entries_item_date_idx on dcc_entries (item_id, entry_date);

-- ─────────────────────────────────────────────────────────────────────────
-- db/migrations/0239_declaration_compliance.sql
-- ─────────────────────────────────────────────────────────────────────────
-- 0239 — The signed Declaration Letter: one record per person, per wording.
-- Asked 2026-09-21. Idempotent: safe to run twice.
--
-- Every person working at the firm signs one declaration by hand, confirming
-- they have read the joining documents and the six policies and agree to abide
-- by them. The paper original is filed in a hard copy in HR's custody; this
-- table is the firm's record that it happened, and the thing the tracker at
-- /hr/declaration reads to show who is outstanding.
--
-- TWO KINDS OF EVIDENCE, TWO COLUMNS. `acknowledged_at` is the employee ticking
-- a box in the WMS. `scan_path` is the wet-signed sheet, scanned and uploaded by
-- whoever holds the file. They arrive at different times, from different people,
-- and only the second is worth anything in a dispute — so they are deliberately
-- NOT collapsed into one `status` column, which would let a tick stand in for
-- the paper. "Done" means both are present.
--
-- KEYED ON (employee, version), NOT employee alone. Re-wording the declaration
-- bumps DECLARATION_VERSION in lib/hr/letters/templates/declaration.ts. Old rows
-- stay, at the old version — so the firm can still show what somebody signed in
-- 2026 after the wording changes — and the tracker, which joins on the current
-- version, correctly shows everyone as outstanding again.
--
-- The scan itself lives in the private `documents` bucket under
-- `hr-declaration/<employee_id>/…`, a prefix no existing reader globs. It is
-- deliberately NOT an `employee_documents` row: that table is read by the
-- Dossier, the Letters workspace, the mobile route and the Records ZIP, all of
-- which are open to any admin, and this scan is for the employee plus two named
-- people only (lib/hr/declaration/access.ts).
--
-- NOT a replacement for `policy_compliance`, which remains the per-policy,
-- per-version ledger. This records one signature over the set as a whole.

CREATE TABLE IF NOT EXISTS declaration_compliance (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id      uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  version          text NOT NULL,
  acknowledged_at  timestamptz,
  scan_path        text,
  scan_file_name   text,
  scan_mime        text,
  scan_size_bytes  bigint,
  -- set null, not cascade: an uploader leaving the firm must not delete the
  -- evidence that somebody else's declaration was signed.
  uploaded_by_id   uuid REFERENCES employees(id) ON DELETE SET NULL,
  uploaded_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- One row per person per wording. The upserts in
-- app/(app)/hr/declaration/actions.ts target this constraint by name.
CREATE UNIQUE INDEX IF NOT EXISTS declaration_compliance_emp_version_uk
  ON declaration_compliance (employee_id, version);

-- The tracker reads every row at the current version in one go.
CREATE INDEX IF NOT EXISTS declaration_compliance_version_idx
  ON declaration_compliance (version);

-- ─────────────────────────────────────────────────────────────────────────
-- db/migrations/0239_wcc_mcc_completed_quantity.sql
-- ─────────────────────────────────────────────────────────────────────────
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

-- ─────────────────────────────────────────────────────────────────────────
-- db/migrations/0240_mcc_frequencies.sql
-- ─────────────────────────────────────────────────────────────────────────
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

-- ─────────────────────────────────────────────────────────────────────────
-- db/migrations/0241_wcc_mcc_abandoned.sql
-- ─────────────────────────────────────────────────────────────────────────
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

-- ─────────────────────────────────────────────────────────────────────────
-- db/migrations/0242_two_step_verification.sql
-- ─────────────────────────────────────────────────────────────────────────
-- 0242 — two-step sign-in by emailed code
--
-- After the password is accepted, a 6-digit code is emailed to the person and
-- must be entered before a session is issued. Once entered, that browser is not
-- asked again until the next midnight IST (a signed cookie carries that; see
-- lib/auth/two-step-pass.ts). These tables are the server's record:
--
--   two_step_challenges    every code sent. The code and the browser's handle
--                          are stored HASHED; the plain code only exists in
--                          the email.
--   two_step_verifications who verified, when, from which IP / browser, and
--                          until when. Audit only — nothing in the app shows it
--                          yet.
--
-- ADDITIVE ONLY: two new tables, no change to any existing one. Apply BEFORE
-- deploying the code — the sign-in route writes to these tables, and a missing
-- table would stop everyone signing in.
--
-- Numbered 0242 because 0237/0238 are taken twice already and Om's branch holds
-- 0240/0241.

CREATE TABLE IF NOT EXISTS two_step_challenges (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id  uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  token_hash   text NOT NULL,
  code_hash    text NOT NULL,
  expires_at   timestamptz NOT NULL,
  attempts     integer NOT NULL DEFAULT 0,
  consumed_at  timestamptz,
  ip           text,
  user_agent   text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS two_step_challenges_token_uniq
  ON two_step_challenges (token_hash);

-- The send throttle's query: codes sent to this person in the last N minutes.
CREATE INDEX IF NOT EXISTS two_step_challenges_employee_created_idx
  ON two_step_challenges (employee_id, created_at);

CREATE TABLE IF NOT EXISTS two_step_verifications (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id   uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  email         text NOT NULL,
  method        text NOT NULL DEFAULT 'email',
  challenge_id  uuid REFERENCES two_step_challenges(id) ON DELETE SET NULL,
  verified_at   timestamptz NOT NULL DEFAULT now(),
  valid_until   timestamptz NOT NULL,
  ip            text,
  user_agent    text
);

CREATE INDEX IF NOT EXISTS two_step_verifications_employee_idx
  ON two_step_verifications (employee_id, verified_at);

-- Record in the ledger the runner reads.
CREATE TABLE IF NOT EXISTS __schema_applied (
  filename    text PRIMARY KEY,
  applied_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO __schema_applied (filename) VALUES ('0242_two_step_verification.sql')
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────
-- db/migrations/0242_wcc_minutes.sql
-- ─────────────────────────────────────────────────────────────────────────
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

-- ─────────────────────────────────────────────────────────────────────────
-- db/migrations/0243_device_per_person.sql
-- ─────────────────────────────────────────────────────────────────────────
-- 0243 — ONE MACHINE, SEVERAL PEOPLE: a device row is one person's registration
-- of a machine, not the machine itself.
--
-- ── THE BUG THIS ENDS ──────────────────────────────────────────────────────
-- `device_id` was unique on its own (0063), so one browser could hold ONE
-- person's row. When a second person signed in on that browser, the sign-in
-- replaced the cookie with a fresh id — erasing the first person's identity —
-- and at their next sign-in the first person was a "new laptop" too. Each came
-- back pending, their one laptop slot already taken, day after day. Production
-- showed it: 17 laptop rows for one person in a fortnight, their new rows
-- alternating minute by minute with a colleague's.
--
-- Now the pair (device_id, employee_id) is unique, so each colleague on a shared
-- PC keeps their own row under the machine's one id, and nobody's cookie is
-- replaced (lib/security/device-access.ts). The machine being used by more than
-- one person becomes a recorded fact — the proxy-punching signal.
--
-- ── WHAT STAYS SINGLE-OWNER ────────────────────────────────────────────────
-- A PHONE id is the punch device: one phone presenting for two people is the
-- proxy case. So a native id (anything not minted as `web_…` by the browser
-- gate) keeps a unique index of its own, and the database still refuses a phone
-- belonging to two people even if the code forgot to.
--
-- ── THE LAPTOP NAME ────────────────────────────────────────────────────────
-- 0224 made a typed Windows device name unique across EVERYONE ("one physical
-- laptop, one registration"). A shared PC has one name, so the second colleague
-- could never register it. It is now unique per PERSON: the same person cannot
-- register the same name twice.
--
-- ── SAFE ON EXISTING DATA ──────────────────────────────────────────────────
-- Every existing row already has a globally unique device_id and a globally
-- unique laptop name, so every new, NARROWER-or-equal index builds on the data
-- as it stands. Idempotent — safe to run twice. Additive to the limits: the
-- one-laptop-one-phone cap (0215, per employee) is untouched.

-- 1 · device_id: unique per person, and still unique for phones.
DROP INDEX IF EXISTS mobile_devices_device_id_uq;

CREATE UNIQUE INDEX IF NOT EXISTS mobile_devices_device_employee_uq
  ON mobile_devices (device_id, employee_id);

CREATE UNIQUE INDEX IF NOT EXISTS mobile_devices_native_device_id_uq
  ON mobile_devices (device_id)
  WHERE device_id NOT LIKE 'web\_%';

-- The gate looks a machine up by id alone to ask "is this phone someone
-- else's?"; the composite index above leads with device_id and serves that too.

-- 2 · the laptop name: unique per person.
DROP INDEX IF EXISTS mobile_devices_device_name_uq;

CREATE UNIQUE INDEX IF NOT EXISTS mobile_devices_device_name_employee_uq
  ON mobile_devices (employee_id, lower(device_name))
  WHERE device_name IS NOT NULL AND kind = 'laptop';

-- ─────────────────────────────────────────────────────────────────────────
-- db/migrations/0245_dd_options.sql
-- ─────────────────────────────────────────────────────────────────────────
-- DD Master (0245) — the app-wide dropdown-options table. Additive + idempotent.
--
-- One category is every row sharing a `list_key`; adding a category later
-- needs no migration, only new rows. `code` is what a record stores and is
-- never touched by a retire (`is_active = false`), so hiding an option from
-- new selections can never corrupt a record that already holds it.
--
-- Not the same table as `ce_dropdown_options` (0230) — that one stays
-- scoped to Client Engagement's own product/call_type/batch lists.
create table if not exists dd_options (
  id          uuid primary key default gen_random_uuid(),
  list_key    text not null,
  code        text not null,
  label       text not null,
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_by  uuid references employees(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index if not exists dd_options_key_code_uidx on dd_options (list_key, code);
create index if not exists dd_options_key_active_idx on dd_options (list_key, is_active, sort_order);

-- Seed data — realistic starter categories, editable/extendable from the UI.
insert into dd_options (list_key, code, label, sort_order)
select 'batch_number', n::text, n::text, n
from generate_series(78, 110) as n
on conflict (list_key, code) do nothing;

insert into dd_options (list_key, code, label, sort_order) values
  ('handholding_calls', 'onboarding_call', 'Onboarding Call', 1),
  ('handholding_calls', 'check_in_call', 'Check-in Call', 2),
  ('handholding_calls', 'review_call', 'Review Call', 3)
on conflict (list_key, code) do nothing;

insert into dd_options (list_key, code, label, sort_order) values
  ('product_names', 'ps', 'PS', 1),
  ('product_names', 'bss', 'BSS', 2),
  ('product_names', 'consulting', 'Consulting', 3)
on conflict (list_key, code) do nothing;

-- ─────────────────────────────────────────────────────────────────────────
-- db/migrations/0247_activity_logs_allow_fk_null.sql
-- ─────────────────────────────────────────────────────────────────────────
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
