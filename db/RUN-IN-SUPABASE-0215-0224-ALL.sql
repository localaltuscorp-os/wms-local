-- ===========================================================================
--  RUN IN SUPABASE — every migration main needs: 0215 through 0224 (15 files)
--  Generated from origin/main (ae58385). Statements copied verbatim from
--  db/migrations/*.sql via git — nothing retyped.
--
--  Supersedes db/RUN-IN-SUPABASE-0216-0224.sql, which is INCOMPLETE: it has no
--  0215 (either of them) and none of Rudra's or Vinal's 0221/0222 migrations.
--
--  HOW TO RUN: Supabase Dashboard -> SQL Editor -> paste -> Run.
--  CONFIRM THE PROJECT FIRST. Run `select count(*) from information_schema.tables
--  where table_schema='public';` — a real WMS database returns ~270+. Near 0 means
--  you are in the wrong project.
--
--  STRUCTURE
--    PART 0  RLS helper functions (from 0004). Safety net: 0215 creates policies
--            that call app.is_admin() / app.current_employee_id(); if they are
--            missing, the whole Part 1 transaction rolls back.
--    PART 1  14 migrations, filename order, ONE transaction — all or nothing.
--    PART 2  0223 — DELETES every row in mobile_devices. Separate. Optional.
--
--  SAFETY
--    Every statement is idempotent (IF NOT EXISTS / ON CONFLICT / guarded DO
--    blocks) — verified per file. Running twice changes nothing.
--    Row-writing: 0215 (revokes duplicate approved devices), 0217 (payment modes
--    + products), 0220 (manager-history backfill), 0222 x2. Review 0217's values.
--    Duplicate numbers (two 0215, three 0221, three 0222) are separate migrations
--    on different tables — all are required.
--
--  PREREQUISITE TABLES (must already exist): employees, attendance_logs,
--  broadcasts, broadcast_recipients, calendar_events, candidate_intake,
--  departments, holidays, leave_requests, mobile_devices, module_submissions,
--  outstanding_entities, outstanding_payment_modes, outstanding_products,
--  product_options.
-- ===========================================================================


-- ###########################################################################
-- #  PART 0 — RLS helper functions (0004_m2_rls_helpers.sql, verbatim)
-- ###########################################################################


create schema if not exists app;

create or replace function app.current_employee_id()
returns uuid
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select id from employees
  where firebase_uid = (current_setting('request.jwt.claims', true)::jsonb ->> 'sub')
$$;

create or replace function app.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select coalesce(is_admin, false)
  from employees
  where firebase_uid = (current_setting('request.jwt.claims', true)::jsonb ->> 'sub')
$$;

grant execute on function app.current_employee_id() to authenticated, anon;
grant execute on function app.is_admin() to authenticated, anon;


-- ###########################################################################
-- #  PART 1 — 14 migrations, one transaction
-- ###########################################################################

BEGIN;

-- -------------------------------------------------------------------------
--  0215_broadcast_popup_snooze.sql
-- -------------------------------------------------------------------------

-- 0215 — Broadcasts: the centre-screen popup + its snooze.
-- Additive + idempotent.
--
-- A published broadcast now FLASHES as a modal in the middle of the app within
-- ~5s of being sent (a client poller looks for the next popup-eligible one).
-- The recipient closes it two ways, and the difference is the whole point:
--   • the "Read" button  → receipt goes to read/acknowledged, it never returns.
--   • the "X" top-right  → SNOOZED. It comes back at the recipient's NEXT LOGIN.
--
-- "Next login" is tracked by `snooze_session`: the browser tab mints an opaque
-- session id in sessionStorage (cleared when the tab closes and by the login
-- screen). The popup query re-shows a snoozed broadcast as soon as the id it is
-- asked with differs from the one stored here. `snooze_count` is analytics —
-- how many times a message was waved away before it was actually read.

ALTER TABLE broadcast_recipients ADD COLUMN IF NOT EXISTS snoozed_at timestamptz;
ALTER TABLE broadcast_recipients ADD COLUMN IF NOT EXISTS snooze_session text;
ALTER TABLE broadcast_recipients ADD COLUMN IF NOT EXISTS snooze_count integer NOT NULL DEFAULT 0;
ALTER TABLE broadcast_recipients ADD COLUMN IF NOT EXISTS popup_seen_at timestamptz;

-- Per-broadcast opt-out of the popup (default ON — a broadcast is meant to be
-- seen). A low-priority FYI can be sent to the inbox + email only.
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS popup boolean NOT NULL DEFAULT true;

-- The popup poller runs on every authed page for every user, so its query gets
-- its own index: "my receipts that are still pending", newest first.
CREATE INDEX IF NOT EXISTS broadcast_recipient_popup_idx
  ON broadcast_recipients(employee_id, status, snoozed_at);

-- -------------------------------------------------------------------------
--  0215_device_access_and_attendance_audit.sql
-- -------------------------------------------------------------------------

-- 0215 — DEVICE-BASED WMS ACCESS + ATTENDANCE SECURITY.
--
-- Three things, in one migration because they are one feature:
--
--   1. mobile_devices grows the audit columns a revocation needs (who revoked
--      it, why, who registered it) so a revoked device stays in history as a
--      readable record instead of a row that merely stopped working.
--   2. THE CAP CHANGES SHAPE: one approved LAPTOP and one approved PHONE per
--      employee, replacing 0214's "two of any kind".
--   3. attendance_audit_log — the immutable trail every privileged attendance
--      change writes to.
--
-- FULLY IDEMPOTENT — safe to re-apply by hand at any time.

------------------------------------------------------------------------
-- 1. Device audit columns
------------------------------------------------------------------------
-- `approved_by_id` / `approved_at` / `revoked_at` already exist (0205a). What
-- was missing is the other half of a revocation: revoking a device is a
-- privileged act against another person's ability to work, and until now it
-- left no trace of who did it or why.

ALTER TABLE mobile_devices
  ADD COLUMN IF NOT EXISTS revoked_by_id uuid REFERENCES employees(id) ON DELETE SET NULL;

ALTER TABLE mobile_devices
  ADD COLUMN IF NOT EXISTS revoke_reason text;

-- Who ENROLLED the row. NULL for the self-service paths that have always
-- existed (the app's "Register this device" button, the web punch's first-visit
-- adoption); set when a device administrator registers a device on someone's
-- behalf from the admin screen.
ALTER TABLE mobile_devices
  ADD COLUMN IF NOT EXISTS registered_by_id uuid REFERENCES employees(id) ON DELETE SET NULL;

-- The last time this device was seen anywhere in the WMS, as opposed to
-- `last_used_at`, which the punch path stamps. Separate because the question
-- "is this laptop still in use" is now asked of the whole application, not just
-- of attendance, and collapsing the two would make a device that browses daily
-- but never punches look abandoned.
ALTER TABLE mobile_devices
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

-- DELIBERATELY NOT STORED: IP addresses, full user-agent strings, screen
-- fingerprints, canvas/font hashes. None of them is needed to answer "may this
-- device use the WMS" — the device id answers that — and each one is a lasting
-- record of where an employee physically was and what they run. The columns
-- kept (kind, label, platform) are what a person needs to recognise their own
-- device on the approval screen, and nothing more.

------------------------------------------------------------------------
-- 2. The cap: ONE approved laptop + ONE approved phone
------------------------------------------------------------------------
-- 0214 made the cap two approved devices of ANY kind. The device-access rule
-- being implemented now is explicitly one desktop/laptop AND one mobile phone,
-- so the shape goes back to per-kind — but the total stays two, so nobody
-- gains or loses capacity, and every employee holding one of each (the common
-- case, and the only case 0206 ever allowed) is untouched.

-- Data reconciliation, and the ONLY row-affecting statement here. Between 0214
-- and now an employee could have accumulated two approved laptops or two
-- approved phones, which the new rule cannot express. Keep the most recently
-- used of each kind and revoke the rest — recorded as a real revocation with a
-- reason, not a silent status flip, so it appears in device history like any
-- other. Expected to match zero rows on a database where everyone holds one of
-- each.
UPDATE mobile_devices m
   SET status = 'revoked',
       revoked_at = now(),
       revoke_reason = 'Superseded by the one-laptop-one-phone rule (migration 0215)'
 WHERE m.status = 'approved'
   AND m.id <> (
     SELECT k.id
       FROM mobile_devices k
      WHERE k.employee_id = m.employee_id
        AND k.kind = m.kind
        AND k.status = 'approved'
      ORDER BY k.last_used_at DESC NULLS LAST, k.created_at DESC
      LIMIT 1
   );

-- 0214's trigger enforced the old cardinality: "at most two approved rows per
-- employee, kind ignored". It cannot express one-per-kind, so the function body
-- is replaced. Replaced rather than dropped-and-recreated so there is never a
-- window in which the table has no cap at all.
CREATE OR REPLACE FUNCTION mobile_devices_cap_approved() RETURNS trigger AS $fn$
DECLARE
  approved_same_kind int;
BEGIN
  -- Only an approved row consumes a slot. Pending registrations and revoked
  -- history accumulate freely: a replacement must be registerable while the
  -- device it succeeds is still approved.
  IF NEW.status IS DISTINCT FROM 'approved' THEN
    RETURN NEW;
  END IF;

  -- An UPDATE that leaves an already-approved row approved on the same kind for
  -- the same person (stamping last_used_at / last_seen_at, which now happens on
  -- ordinary page loads and not just punches) changes no count and must not pay
  -- for a lock or a scan.
  IF TG_OP = 'UPDATE'
     AND OLD.status = 'approved'
     AND OLD.employee_id = NEW.employee_id
     AND OLD.kind = NEW.kind THEN
    RETURN NEW;
  END IF;

  -- The advisory lock is what makes this a guarantee rather than a check: two
  -- concurrent approvals cannot see each other's uncommitted rows, so without
  -- it both read "0 approved" and both write. Locking on employee+kind
  -- serialises approvals for ONE person's ONE slot and nobody else's.
  PERFORM pg_advisory_xact_lock(
    hashtext('mobile_devices_cap:' || NEW.employee_id::text || ':' || NEW.kind)
  );

  SELECT count(*) INTO approved_same_kind
    FROM mobile_devices
   WHERE employee_id = NEW.employee_id
     AND kind = NEW.kind
     AND status = 'approved'
     AND id <> NEW.id;

  IF approved_same_kind >= 1 THEN
    RAISE EXCEPTION 'mobile_devices_employee_approved_cap'
      USING HINT = 'This employee already has an approved device of this kind. Revoke it first.';
  END IF;

  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS mobile_devices_cap_approved_trg ON mobile_devices;
CREATE TRIGGER mobile_devices_cap_approved_trg
  BEFORE INSERT OR UPDATE ON mobile_devices
  FOR EACH ROW EXECUTE FUNCTION mobile_devices_cap_approved();

-- With the cap back to one per kind the cardinality IS expressible as a partial
-- unique index again — and an index is a stronger guarantee than a trigger,
-- because a session can disable triggers and cannot disable an index. Belt and
-- braces: the trigger raises the readable error, the index makes the rule true
-- regardless. (0206 had this index; 0214 dropped it. It comes back deliberately.)
CREATE UNIQUE INDEX IF NOT EXISTS mobile_devices_employee_kind_approved_uq
  ON mobile_devices (employee_id, kind)
  WHERE status = 'approved';

CREATE INDEX IF NOT EXISTS mobile_devices_employee_status_idx
  ON mobile_devices (employee_id, status);

------------------------------------------------------------------------
-- 3. attendance_audit_log — the immutable trail
------------------------------------------------------------------------
-- Every PRIVILEGED attendance modification lands here: who changed whose
-- attendance, from what to what, on which device, under which authorization.
--
-- SEPARATE FROM employee_events ON PURPOSE. employee_events is a generic
-- admin-activity feed whose payload is jsonb; this table has to answer a
-- specific question quickly ("every change to Om's September attendance, by
-- whom, from which device") and its filter columns — attendance_date, actor,
-- target, device — are exactly those filters. Squeezed into a generic jsonb
-- payload, the change-log screen becomes a table scan with jsonb extraction in
-- the WHERE clause.

CREATE TABLE IF NOT EXISTS attendance_audit_log (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The punch row this concerns. NULLABLE and ON DELETE SET NULL: a delete
  -- action's whole point is that the row is gone, and an audit trail that
  -- vanished with the record it describes would be worthless exactly when it
  -- matters. attendance_date + punch_kind below keep the record identifiable
  -- after the punch itself no longer exists.
  attendance_log_id uuid REFERENCES attendance_logs(id) ON DELETE SET NULL,

  -- WHOSE attendance changed.
  employee_id       uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  -- WHO changed it. ON DELETE RESTRICT — an actor cannot be deleted out of the
  -- audit trail; the same choice employee_events made.
  actor_id          uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,

  -- WHAT changed.
  action            text NOT NULL,           -- create | update | delete | clear
  field             text,                    -- check_in | check_out | punch
  attendance_date   date NOT NULL,           -- the DAY whose attendance changed
  punch_kind        text,                    -- in | out
  old_value         text,                    -- human-readable, e.g. "18:02"
  new_value         text,                    -- human-readable, e.g. "18:27"
  reason            text,

  -- WHICH DEVICE. Kept as BOTH an fk and a denormalised label+kind: the fk is
  -- the live link, the copies are what the log must still be able to say after
  -- the device row is revoked and eventually purged.
  device_row_id     uuid REFERENCES mobile_devices(id) ON DELETE SET NULL,
  device_label      text,
  device_kind       text,

  -- WHY IT WAS ALLOWED. The authorization decision as the server made it: which
  -- capability was used, whether a lock was overridden, whether the 15-minute
  -- window was open. This is the difference between a log that says what
  -- happened and one that can answer whether it should have.
  authorization_context jsonb,

  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS attendance_audit_employee_date_idx
  ON attendance_audit_log (employee_id, attendance_date DESC);
CREATE INDEX IF NOT EXISTS attendance_audit_actor_created_idx
  ON attendance_audit_log (actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS attendance_audit_created_idx
  ON attendance_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS attendance_audit_action_idx
  ON attendance_audit_log (action);

------------------------------------------------------------------------
-- 3a. APPEND-ONLY, ENFORCED IN THE DATABASE
------------------------------------------------------------------------
-- The brief requires that even Ruchita and Rutvisha cannot edit or delete
-- history. Two independent mechanisms, because they fail in different ways:
--
--   · REVOKE (at the bottom) is the pattern employee_events / settings_events
--     already use. It stops the `authenticated` and `anon` Supabase roles —
--     anything reaching the table through PostgREST or a client library.
--
--   · A TRIGGER, which REVOKE cannot replace. The Next.js server connects as
--     the database owner, and an owner's privileges cannot be revoked away — so
--     a REVOKE-only table is fully mutable from the application, which is
--     exactly the actor the brief names. The trigger fires for every role
--     including the owner, so an UPDATE or DELETE issued from application code
--     raises instead of succeeding.
--
-- Neither blocks a superuser at a psql prompt, and nothing in-database could:
-- that is the boundary of what "immutable from the application" can mean.

CREATE OR REPLACE FUNCTION attendance_audit_log_immutable() RETURNS trigger AS $fn$
BEGIN
  RAISE EXCEPTION 'attendance_audit_log is append-only'
    USING HINT = 'Attendance audit records cannot be modified or deleted. Record a corrective entry instead.';
END;
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS attendance_audit_log_no_update_trg ON attendance_audit_log;
CREATE TRIGGER attendance_audit_log_no_update_trg
  BEFORE UPDATE ON attendance_audit_log
  FOR EACH ROW EXECUTE FUNCTION attendance_audit_log_immutable();

DROP TRIGGER IF EXISTS attendance_audit_log_no_delete_trg ON attendance_audit_log;
CREATE TRIGGER attendance_audit_log_no_delete_trg
  BEFORE DELETE ON attendance_audit_log
  FOR EACH ROW EXECUTE FUNCTION attendance_audit_log_immutable();

-- TRUNCATE bypasses row-level triggers entirely, so it needs its own
-- statement-level one. Without it, "immutable" is one TRUNCATE from an empty
-- table — and `wipeAllAttendance` in the dashboard actions truncates the
-- attendance tables by design.
DROP TRIGGER IF EXISTS attendance_audit_log_no_truncate_trg ON attendance_audit_log;
CREATE TRIGGER attendance_audit_log_no_truncate_trg
  BEFORE TRUNCATE ON attendance_audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION attendance_audit_log_immutable();

ALTER TABLE attendance_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "attendance_audit_read_admin"   ON attendance_audit_log;
DROP POLICY IF EXISTS "attendance_audit_insert_actor" ON attendance_audit_log;

-- SELECT: admins. The application narrows this further to the
-- `attendance.view_audit_log` capability before rendering the change-log page;
-- this policy is the floor beneath that, not the rule itself.
CREATE POLICY "attendance_audit_read_admin"
  ON attendance_audit_log FOR SELECT
  TO authenticated
  USING (app.is_admin());

-- INSERT: the actor must be writing as themselves. Server actions already pin
-- actor_id to the resolved session; the WITH CHECK is belt and braces.
CREATE POLICY "attendance_audit_insert_actor"
  ON attendance_audit_log FOR INSERT
  TO authenticated
  WITH CHECK (actor_id = app.current_employee_id());

REVOKE UPDATE, DELETE, TRUNCATE ON attendance_audit_log FROM authenticated;
REVOKE UPDATE, DELETE, TRUNCATE ON attendance_audit_log FROM anon;

-- -------------------------------------------------------------------------
--  0216_module_submission_attachments.sql
-- -------------------------------------------------------------------------

-- 0216 — Reimbursement receipts become FILES the firm holds, not Drive links.
--
-- WHY. The reimbursement request form carried `bill_url`: a free-text link,
-- in practice to something in the claimant's personal Google Drive. That is not
-- a receipt the firm possesses. The link can have its sharing revoked, it dies
-- with the account, and it fails silently — years later, when an audit or a
-- Tally reconciliation actually needs the bill, all that survives is a URL that
-- 404s. Nothing in the app could even tell you the file's name or type.
--
-- WHAT REPLACES IT. One row per uploaded document, pointing at an object in the
-- app's own PRIVATE Supabase `documents` bucket — the same bucket and the same
-- `storage_path` contract `task_attachments` (0048) and
-- `project_node_attachments` (0212) already use. Access is granted per request
-- by minting a short-lived signed URL after the caller's permission has been
-- checked in app code; the bucket itself stays private.
--
-- WHERE THE BYTES GO, AND WHERE THEY DO NOT. The browser uploads straight to a
-- signed Supabase upload URL, so the file never passes through the Next.js
-- server. That is deliberate and not merely an optimisation: on Vercel the
-- serverless request body is capped well below a phone photo of a bill, and the
-- filesystem is ephemeral, so routing receipts through the app server would
-- have meant uploads that fail above a few megabytes and files that vanish on
-- redeploy. Vercel handles this row; Supabase holds the document.
--
-- GENERIC BY DESIGN. `module_submissions` is the shared table behind
-- Reimbursements, Record Reference and Participant Breakthrough, so the foreign
-- key is `submission_id` and the table is named for what it references. Naming
-- it `reimbursement_attachments` would have described the FK inaccurately. Only
-- the reimbursement UI attaches files today.
--
-- BACKWARD COMPATIBLE. `bill_url` is NOT dropped, and no submission is
-- rewritten. Existing claims keep their link and keep rendering it; `bill_url`
-- is simply no longer offered on new requests. The two coexist in the claim
-- card, which shows whichever a claim has.
--
-- Additive and idempotent. Nothing here drops or rewrites data.

CREATE TABLE IF NOT EXISTS module_submission_attachments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES module_submissions (id) ON DELETE CASCADE,
  -- Addresses the object in the private Supabase bucket. Shaped
  -- `reimbursements/<employee_id>/<uuid>/<safe file name>` — the employee
  -- segment is what lets the server refuse a path belonging to someone else.
  storage_path  text NOT NULL,
  -- The uploader's OWN file name, kept verbatim for display and download so a
  -- claim can still say "Uber-receipt-14-Sep.pdf" rather than a bare uuid.
  file_name     text NOT NULL,
  mime          text,
  size_bytes    integer,
  uploaded_by_id uuid REFERENCES employees (id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- The only access pattern: every file on one claim, oldest first.
CREATE INDEX IF NOT EXISTS module_submission_attachments_submission_idx
  ON module_submission_attachments (submission_id, created_at);

-- -------------------------------------------------------------------------
--  0217_masters_payment_modes_and_products.sql
-- -------------------------------------------------------------------------

-- 0217 — MASTER DATA: payment modes (IGV → IJV + the new accounts) and the
--        PRODUCT master gaining a real code.
--
-- Both halves are master-data work on tables that ALREADY EXIST. Nothing new is
-- created here: `outstanding_payment_modes` and `outstanding_products` have been
-- the admin-managed rosters behind the Outstanding module since 0055, they are
-- referenced by FK from `outstanding_contracts` and `outstanding_collections`,
-- and the brief asks for these lists to become canonical rather than for a
-- second set of tables to appear beside them.
--
-- FULLY IDEMPOTENT — safe to re-apply by hand at any time.

------------------------------------------------------------------------
-- 1. IGV → IJV
------------------------------------------------------------------------
-- Migration 0070 renamed "Cash" to "IGV" in BOTH rosters at the founder's
-- request, because the payment mode and the paying entity are the same
-- real-world counterparty. "IJV" is a correction of that spelling, so it is
-- applied to BOTH for the same reason — leaving the entity as "IGV" would put
-- two spellings of one company on adjacent dropdowns.
--
-- A RENAME, NOT AN INSERT-AND-REPOINT. Every historical reference is a uuid FK
-- (`expected_mode_id`, `payment_mode_id`, `entity_id`), so renaming the row
-- carries every past contract and collection with it and no history moves.
-- Inserting a fresh "IJV" row instead would silently strand them under a name
-- the company no longer uses.
--
-- The NOT EXISTS guard mirrors 0070's: if an "IJV" row was already created by
-- hand, renaming into it would violate the unique index on `name`. In that case
-- the rename is skipped and the two rows are left for an admin to merge, which
-- is the safe outcome — no FK is silently repointed.

UPDATE outstanding_payment_modes
   SET name = 'IJV', updated_at = now()
 WHERE name = 'IGV'
   AND NOT EXISTS (SELECT 1 FROM outstanding_payment_modes m WHERE m.name = 'IJV');

UPDATE outstanding_entities
   SET name = 'IJV', updated_at = now()
 WHERE name = 'IGV'
   AND NOT EXISTS (SELECT 1 FROM outstanding_entities e WHERE e.name = 'IJV');

------------------------------------------------------------------------
-- 2. The new payment modes
------------------------------------------------------------------------
-- ON CONFLICT DO NOTHING against the unique `name`, so "Pay U" and "Jodo" —
-- which 0055 already seeded — are left exactly as they are rather than being
-- reset to a default sort order or reactivated behind an admin's back.
--
-- `sort_order` defaults to 100 (the roster default): these sort alphabetically
-- beside the existing modes instead of being pinned above them.

INSERT INTO outstanding_payment_modes (name)
VALUES
  ('Razorpay'),
  ('Altus Kotak'),
  ('Unleashed Kotak'),
  ('KAS Kotak'),
  ('MJV HUF Kotak'),
  ('JSV HUF Kotak'),
  ('JSV HUF ICICI'),
  ('CMV G Pay'),
  ('MJV G Pay'),
  ('Pay U'),
  ('Jodo'),
  ('Parvez Kotak'),
  ('Dattaram Kotak'),
  ('Smita'),
  ('Sunil Kotak')
ON CONFLICT (name) DO NOTHING;

------------------------------------------------------------------------
-- 3. Products gain a CODE
------------------------------------------------------------------------
-- The brief: "Products must contain BOTH Product Code and Product Name. Do not
-- use product name alone as the identifier."
--
-- The identifier was ALREADY neither — it is `id uuid`, and every reference in
-- the schema is that uuid. What was missing is the code as a first-class,
-- separately stored and separately displayed attribute, which is what this adds.
--
-- NULLABLE, and no NOT NULL is added later. A product created before this
-- migration and never edited has no code, and inventing one for it in SQL would
-- put a guessed identifier into a master an accountant reads. The backfill below
-- sets a code only where the product's own name IS a code (an all-caps token
-- like BSS or PSO); everything else is left NULL for an admin to fill in, and
-- the UI shows those as "—".

ALTER TABLE outstanding_products
  ADD COLUMN IF NOT EXISTS code text;

-- Case-insensitive uniqueness, and only over rows that HAVE a code, so any
-- number of un-coded products coexist. A partial unique index is the only way to
-- express that: a plain UNIQUE would be satisfied by many NULLs but would also
-- allow 'bss' to sit beside 'BSS'.
CREATE UNIQUE INDEX IF NOT EXISTS outstanding_products_code_lower_idx
  ON outstanding_products (lower(code))
  WHERE code IS NOT NULL;

-- Backfill: the name IS the code where the name is a short all-caps token.
-- Matches BSS, PS, PSO, BSSO, OS, GP; does not match "Altus Conclave",
-- "Commission", "Rent", "Billing", "Retainer", "Consulting".
UPDATE outstanding_products
   SET code = name, updated_at = now()
 WHERE code IS NULL
   AND name ~ '^[A-Z][A-Z0-9]{1,7}$';

------------------------------------------------------------------------
-- 4. The products the brief lists
------------------------------------------------------------------------
-- Inserted by NAME with ON CONFLICT DO NOTHING, exactly like the payment modes:
-- BSS, PS, Commission, Rent, Billing and Retainer were seeded by 0055 and must
-- keep their existing ids, because `outstanding_contracts.product_id` points at
-- them.
--
-- "GP — Graduate Programs" is the one entry the brief itself writes as
-- code-then-name, so it is stored that way: code 'GP', name 'Graduate Programs'.
-- The others are stored under the name the brief uses, and take a code only when
-- that name is already a code. The multi-word ones — Altus Conclave, Commission,
-- Rent, Billing, Retainer — deliberately arrive with NO code rather than a code
-- this migration invented; an admin sets those on /admin/products, where the
-- value is entered by the person who actually knows it.

INSERT INTO outstanding_products (name, code)
VALUES
  ('BSS',               'BSS'),
  ('PS',                'PS'),
  ('Altus Conclave',    NULL),
  ('PSO',               'PSO'),
  ('BSSO',              'BSSO'),
  ('OS',                'OS'),
  ('Commission',        NULL),
  ('Rent',              NULL),
  ('Billing',           NULL),
  ('Retainer',          NULL),
  ('Graduate Programs', 'GP')
ON CONFLICT (name) DO NOTHING;

-- A product seeded by 0055 that the brief does not list ("Consulting") is left
-- ACTIVE and untouched. It is referenced by existing contracts, and the brief's
-- own rule is that a master row which history references is retired with
-- is_active = false by an admin, never deleted by a migration.

------------------------------------------------------------------------
-- 5. The forms Product-Name dropdown keeps its options
------------------------------------------------------------------------
-- `product_options` is a SEPARATE list: the MCQ behind the `product` form-field
-- type (reimbursements, module intake forms). Its options answer "which product
-- was this enquiry about" and include values that are not products on the
-- revenue master at all — "Don't Know", "Key Note", "Being Arjun".
--
-- lib/forms/server.ts used to fall back to a HARDCODED array
-- (DEFAULT_PRODUCT_OPTIONS) whenever this table was empty, which is exactly the
-- hardcoded dropdown the brief objects to. That constant is being deleted, and
-- the field now reads the PRODUCT MASTER merged with the rows below — so this
-- seed exists to make sure the non-product options survive the constant's
-- removal and no form loses a choice it offers today.
--
-- Historical submissions are unaffected either way: `module_submissions` stores
-- the chosen LABEL as text inside its jsonb payload, so a past answer reads back
-- identically whether or not the option is still offered to new submissions.

INSERT INTO product_options (label, sort_order)
VALUES
  ('Don''t Know',   10),
  ('Collaboration', 110),
  ('Key Note',      110),
  ('Inhouse PSO',   110),
  ('Being Arjun',   110),
  ('2 Days',        110),
  ('Consulting',    110)
ON CONFLICT (label) DO NOTHING;

-- -------------------------------------------------------------------------
--  0218_delegated_access.sql
-- -------------------------------------------------------------------------

-- 0218 — TEMPORARY DELEGATED ACCESS ("Rudra needs to test Rutvisha's account").
--
-- ── WHAT THIS IS NOT ───────────────────────────────────────────────────────
-- It is not a password change, not a password copy, and not a shared login.
-- No column here holds a credential of any kind. The employee's Firebase
-- account, their password and their own sessions are untouched by a grant and
-- by its expiry — they keep signing in normally throughout.
--
-- ── HOW IT WORKS ───────────────────────────────────────────────────────────
-- The delegate signs in AS THEMSELVES, normally. A grant issues one opaque
-- 256-bit token, stored here only as a SHA-256 hash, which the delegate's
-- browser carries in its own cookie beside their real session. While that token
-- resolves to a live row in this table, the server answers "who is the current
-- employee" with the TARGET's row instead of the delegate's — so the delegate
-- sees exactly the permissions of the account being tested and nothing more,
-- through the application's existing authorization model rather than around it.
--
-- Everything about the decision lives server-side: the row, the expiry, the
-- revocation. Deleting the cookie ends the delegation; keeping the cookie past
-- `expires_at` achieves nothing, because the expiry is re-evaluated from this
-- table on every single request.
--
-- FULLY IDEMPOTENT — safe to re-apply by hand at any time.

------------------------------------------------------------------------
-- 1. The grants
------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS delegated_access_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- WHOSE ACCOUNT is being accessed (Rutvisha).
  target_employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,

  -- WHO RECEIVES the access (Rudra). This is the person who must be signed in
  -- for the token to resolve: the token alone is not enough, so a leaked token
  -- is useless to anyone but the one delegate it was issued to.
  delegate_employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,

  -- THE GRANTING MANAGER. Nullable only so an offboarded manager's row can be
  -- anonymised without destroying the grant history that names them.
  granted_by_id uuid REFERENCES employees(id) ON DELETE SET NULL,

  -- Free text, and genuinely optional: the brief asks for a reason "if the
  -- existing system supports reasons". The device-revocation flow (0215) set
  -- the precedent of storing one, so this does too.
  reason text,

  -- What the manager PICKED, kept alongside the computed expiry. Without it the
  -- audit screen cannot distinguish "they chose 1 hour and the 20:30 floor
  -- extended it" from "they chose 4 hours" — the two produce different expiries
  -- from the same duration only because of when they started.
  duration_minutes integer NOT NULL,

  starts_at timestamptz NOT NULL DEFAULT now(),

  -- THE ONE AUTHORITY ON EXPIRY.
  --
  -- Computed server-side at grant time as
  --     max(starts_at + duration_minutes, 20:30 Asia/Kolkata on the start date)
  -- — the LATER of the two, per the brief ("Do not interpret this as whichever
  -- happens first"). Stored rather than recomputed on read so that a change to
  -- the rule, or to the server's clock handling, can never silently extend a
  -- grant that is already running.
  expires_at timestamptz NOT NULL,

  -- Set the moment a manager revokes. Checked on every request alongside
  -- `expires_at`, so revocation is immediate and does not wait for the timer.
  revoked_at timestamptz,
  revoked_by_id uuid REFERENCES employees(id) ON DELETE SET NULL,

  -- SHA-256 of the opaque token, hex. The token itself is shown to the granting
  -- manager once, handed to the delegate, and never stored anywhere: a dump of
  -- this table cannot be used to impersonate anyone, exactly as with a password
  -- hash. UNIQUE both to make the lookup an index hit and to make a hash
  -- collision a constraint error rather than an ambiguity.
  token_hash text NOT NULL UNIQUE,

  -- Bookkeeping the audit screen shows: when the delegate first activated the
  -- grant, when they last used it, and how many requests it has served.
  first_used_at timestamptz,
  last_used_at timestamptz,
  use_count integer NOT NULL DEFAULT 0,

  -- The device the delegate ACTIVATED the grant on ("Rudra's laptop"), recorded
  -- for the audit trail. Deliberately NOT an authorization input: the device
  -- restriction is applied to the delegate's OWN identity before the swap
  -- happens (see lib/auth/current.ts), which is both what the brief describes
  -- and stricter than binding here — it means a grant can never lend the
  -- target's registered devices to anybody.
  device_id text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Nobody delegates to themselves. Harmless, but it would put a meaningless
  -- row in an audit log that people will read during an incident.
  CONSTRAINT delegated_access_no_self CHECK (target_employee_id <> delegate_employee_id),

  CONSTRAINT delegated_access_duration_sane CHECK (duration_minutes > 0 AND duration_minutes <= 1440)
);

-- THE RESOLUTION INDEX. Every authenticated request asks "is there a live grant
-- for this token", so it must be a single index hit on the hottest path in the
-- application.
CREATE INDEX IF NOT EXISTS delegated_access_token_idx
  ON delegated_access_grants (token_hash);

-- AT MOST ONE LIVE GRANT PER DELEGATE.
--
-- Not a tidiness rule — a correctness one. If Rudra held live grants for two
-- accounts at once, "who is Rudra acting as" would have two answers and the
-- resolver would have to pick one, which is precisely the kind of ambiguity an
-- impersonation feature must not contain. The partial index makes a second
-- concurrent grant a constraint violation at the database, so no code path can
-- create one.
--
-- Expired grants are excluded from the predicate only via `revoked_at`, because
-- an index predicate cannot reference now(). The overlap check that uses
-- `expires_at` therefore lives in the grant action; this index is the backstop
-- for the un-revoked case, which is the one that matters.
CREATE UNIQUE INDEX IF NOT EXISTS delegated_access_one_live_per_delegate_idx
  ON delegated_access_grants (delegate_employee_id)
  WHERE revoked_at IS NULL;

-- The admin screen lists by target and by recency.
CREATE INDEX IF NOT EXISTS delegated_access_target_idx
  ON delegated_access_grants (target_employee_id, starts_at DESC);

CREATE INDEX IF NOT EXISTS delegated_access_delegate_idx
  ON delegated_access_grants (delegate_employee_id, starts_at DESC);

------------------------------------------------------------------------
-- 2. The audit trail
------------------------------------------------------------------------
-- A SEPARATE, APPEND-ONLY table rather than more columns on the grant.
--
-- The brief asks for six distinct events to be logged, including "attempted
-- access after expiry" — which can happen many times for one grant, and which
-- has no natural column to live in. It also asks for the record to survive, so
-- these rows carry their own copies of the two employee ids: a grant row that
-- is ever removed, or an employee who is later anonymised, must not take the
-- log of what happened with them.

CREATE TABLE IF NOT EXISTS delegated_access_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The grant this concerns. SET NULL, not CASCADE: the whole point of an audit
  -- row is that it outlives the thing it describes.
  grant_id uuid REFERENCES delegated_access_grants(id) ON DELETE SET NULL,

  /**
   * granted            — a manager created the grant
   * started            — the delegate activated it and first acted as the target
   * expired            — the first request refused because the clock ran out
   * revoked            — a manager ended it early
   * denied_after_expiry— a later request refused on an expired or revoked grant
   * denied             — a token that resolved to no usable grant at all
   */
  kind text NOT NULL,

  -- Denormalised on purpose (see the note above).
  target_employee_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  delegate_employee_id uuid REFERENCES employees(id) ON DELETE SET NULL,

  -- Who caused THIS event: the manager for granted/revoked, the delegate for
  -- started/expired/denied.
  actor_employee_id uuid REFERENCES employees(id) ON DELETE SET NULL,

  -- Readable one-liner for the audit screen; never a token, never a credential.
  detail text,
  device_id text,

  occurred_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT delegated_access_event_kind CHECK (
    kind IN ('granted', 'started', 'expired', 'revoked', 'denied_after_expiry', 'denied')
  )
);

CREATE INDEX IF NOT EXISTS delegated_access_events_grant_idx
  ON delegated_access_events (grant_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS delegated_access_events_recent_idx
  ON delegated_access_events (occurred_at DESC);

CREATE INDEX IF NOT EXISTS delegated_access_events_target_idx
  ON delegated_access_events (target_employee_id, occurred_at DESC);

-- -------------------------------------------------------------------------
--  0219_permission_matrix.sql
-- -------------------------------------------------------------------------

-- 0219 — THE PERMISSION MATRIX: module → sub-module → sub-sub-module, with
--        SHOW / VIEW / EDIT per employee.
--
-- ── WHY THE TREE IS NOT A TABLE ────────────────────────────────────────────
-- Only the GRANTS live in the database. The tree itself — which modules exist,
-- which sub-modules they contain, which route each one guards — is CODE, in
-- lib/permissions/catalog.ts, derived from the application's real navigation and
-- real routes.
--
-- That is deliberate and it is the most important design decision here. A
-- permission node is only meaningful if something enforces it, and what
-- enforces it is a route handler or a page guard — i.e. code. Storing the tree
-- in a table would let an admin create a node that guards nothing (a permission
-- that silently grants everything) or delete a node that a route still checks
-- (a guard that silently refuses everyone), and neither failure is visible on
-- the screen where it was caused. Keeping the tree in code means the catalogue
-- cannot drift from the app: a test walks the catalogue and asserts every node
-- names a route that exists.
--
-- So this migration stores exactly one thing: for a given employee and a given
-- node key, may they SEE it, READ it, and CHANGE it.
--
-- ── DEFAULT-OPEN, NOT DEFAULT-CLOSED ───────────────────────────────────────
-- The absence of a row means "fall back to the authorization the application
-- already has" — the admin flag, the workspace/department gates, the capability
-- registry, each page's own guard. It does NOT mean "denied".
--
-- This is the only safe way to add a matrix to a live application. Default-deny
-- with an empty table locks all ~40 modules for all ~30 staff the moment the
-- migration lands, and every one of those lockouts looks like a bug rather than
-- a policy. A row is therefore an OVERRIDE, written deliberately by a master
-- admin, and an override can only ever NARROW what the existing model allows —
-- see lib/permissions/resolve.ts, where the effective answer is the AND of the
-- two. Granting through this table alone can never widen someone's reach past
-- the guards that were already there.
--
-- FULLY IDEMPOTENT — safe to re-apply by hand at any time.

------------------------------------------------------------------------
-- 1. The grants
------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS module_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,

  -- A dotted path into the catalogue: 'wms', 'wms.tasks', 'wms.tasks.report'.
  -- Text, not an enum: the catalogue changes with every module that ships, and a
  -- pgEnum would need a migration per node while giving nothing in return —
  -- validity is checked against the code catalogue on write, which an enum
  -- cannot do either (it cannot know whether the route still exists).
  node_key text NOT NULL,

  -- THE THREE ACTIONS, as the brief names them.
  --
  --   can_show — does this appear in their navigation at all
  --   can_view — may they read the data behind it
  --   can_edit — may they change it
  --
  -- Stored as three independent booleans rather than one "level" column,
  -- because the brief's own example (Show: YES, View: YES, Edit: NO) treats them
  -- as independent, and because a hidden-but-readable module is a real
  -- configuration: a surface reached by deep link from an email, deliberately
  -- kept off the rail.
  --
  -- They default to TRUE, matching the default-open rule above: a row created
  -- to deny EDIT on one node must not accidentally deny SHOW and VIEW on it too.
  can_show boolean NOT NULL DEFAULT true,
  can_view boolean NOT NULL DEFAULT true,
  can_edit boolean NOT NULL DEFAULT true,

  updated_by_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- One row per person per node. The write path upserts on this.
  CONSTRAINT module_permissions_employee_node_uniq UNIQUE (employee_id, node_key)
);

-- The resolver loads every override for ONE employee in one go and caches it for
-- the request, so this index is the whole read pattern.
CREATE INDEX IF NOT EXISTS module_permissions_employee_idx
  ON module_permissions (employee_id);

-- The matrix screen also reads a whole COLUMN: "who has been denied this node".
CREATE INDEX IF NOT EXISTS module_permissions_node_idx
  ON module_permissions (node_key);

------------------------------------------------------------------------
-- 2. The audit trail
------------------------------------------------------------------------
-- Changing who can see payroll is exactly the kind of change that needs to be
-- answerable six months later. `module_permissions` holds only the CURRENT
-- state, so the history goes here.
--
-- Append-only, and it records both sides of the change: a row saying "edit was
-- switched off" is nearly useless without "…and it had been on".

CREATE TABLE IF NOT EXISTS module_permission_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Denormalised, like the delegated-access log: an anonymised employee must not
  -- take the record of permission decisions with them.
  employee_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  node_key text NOT NULL,

  -- NULL = there was no override before / after (i.e. the node fell back to the
  -- application's own authorization). Distinct from false, which is an explicit
  -- deny, and the distinction is the whole point of default-open.
  prev_show boolean,
  prev_view boolean,
  prev_edit boolean,
  next_show boolean,
  next_view boolean,
  next_edit boolean,

  actor_employee_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS module_permission_events_employee_idx
  ON module_permission_events (employee_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS module_permission_events_recent_idx
  ON module_permission_events (occurred_at DESC);

-- -------------------------------------------------------------------------
--  0220_manager_hierarchy_history.sql
-- -------------------------------------------------------------------------

-- 0220 — REPORTING-MANAGER HISTORY.
--
-- ── WHAT STAYS CANONICAL ───────────────────────────────────────────────────
-- `employees.manager_id` remains THE reporting relationship, and this migration
-- does not touch it. It is already the single source of truth: the audit found
-- ~20 modules (tasks, goals, DCC, KPI, PMS, appraisal, attendance analytics,
-- manager dashboards, approvals) and every one of them resolves the manager by
-- reading that column at query time. None of them stores its own copy. So
-- changing an employee's manager already propagates everywhere, immediately,
-- with no fan-out writes — which is why this migration adds no triggers and
-- rewrites no rows.
--
-- ── WHAT WAS MISSING ───────────────────────────────────────────────────────
-- The opposite: HISTORY. Because the current manager is a single mutable column,
-- moving Rudra from Rohan to Rutvisha in September silently rewrites August too
-- — every "my team last month" report, every past approval trail and every
-- historical KPI roll-up re-reads the NEW manager. The brief asks for exactly
-- this not to happen: "August historical records should continue reflecting the
-- historical relationship where appropriate. September onward should use
-- Rutvisha."
--
-- This table is that record. It does not replace `manager_id`; it remembers what
-- `manager_id` used to be, and when, so a report about a past period can ask who
-- the manager WAS on that date instead of who it is now.
--
-- ── INTERVALS, NOT EVENTS ──────────────────────────────────────────────────
-- One row per period, with an open end for the current one. A log of change
-- events would need every reader to reconstruct the intervals itself — sort by
-- date, pair consecutive rows, handle the first and last — and "who managed X on
-- 2026-08-15" is the only question anyone asks. Storing the answer directly
-- makes that a single indexed row lookup.
--
-- FULLY IDEMPOTENT — safe to re-apply by hand at any time.

CREATE TABLE IF NOT EXISTS employee_manager_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,

  -- NULLABLE, and null is meaningful: it records a period during which the
  -- person reported to NOBODY. That is a real state here — managers themselves
  -- currently have no manager assigned (see lib/auth/founder.ts, which exists
  -- precisely because `manager_id IS NULL` must not be read as "is a founder").
  -- Recording the gap is what lets a later report tell "unassigned" apart from
  -- "we have no data for that month".
  manager_id uuid REFERENCES employees(id) ON DELETE SET NULL,

  -- DATES, not timestamps. Every consumer of the hierarchy works in whole days
  -- or whole months — attendance is keyed by `log_date`, goals by week start,
  -- KPI and salary by month — so a mid-day boundary could only ever create
  -- disagreement between two readers of the same change.
  effective_from date NOT NULL,

  -- NULL = the CURRENT period. Exactly one open row per employee (enforced
  -- below), and it is the one that must agree with `employees.manager_id`.
  effective_to date,

  changed_by_id uuid REFERENCES employees(id) ON DELETE SET NULL,

  -- Why the move happened, if whoever made it said so. Same reasoning as the
  -- reason field on a device revocation (0215).
  note text,

  created_at timestamptz NOT NULL DEFAULT now(),

  -- An interval must not end before it starts. `effective_to = effective_from`
  -- is allowed: a manager assigned and moved again the same day leaves a
  -- single-day period, and refusing to record it would lose the fact that it
  -- happened.
  CONSTRAINT employee_manager_history_range CHECK (
    effective_to IS NULL OR effective_to >= effective_from
  ),

  -- Nobody reports to themselves.
  CONSTRAINT employee_manager_history_no_self CHECK (
    manager_id IS NULL OR manager_id <> employee_id
  )
);

-- EXACTLY ONE OPEN PERIOD PER EMPLOYEE.
--
-- The invariant the whole table rests on: if two rows were open, "who is their
-- manager now" would have two answers in the history while `manager_id` had
-- one, and the two stores would disagree with no way to tell which was right.
-- A partial unique index makes that state unrepresentable.
CREATE UNIQUE INDEX IF NOT EXISTS employee_manager_history_one_open_idx
  ON employee_manager_history (employee_id)
  WHERE effective_to IS NULL;

-- "Who managed this person on this date" — the only read pattern.
CREATE INDEX IF NOT EXISTS employee_manager_history_lookup_idx
  ON employee_manager_history (employee_id, effective_from DESC);

-- "Who reported to this manager during this period" — the team-level read, for
-- historical roll-ups and manager dashboards asked about a past month.
CREATE INDEX IF NOT EXISTS employee_manager_history_manager_idx
  ON employee_manager_history (manager_id, effective_from DESC);

------------------------------------------------------------------------
-- Backfill: one open period per employee, from what we can actually know
------------------------------------------------------------------------
-- The current `manager_id` is all the truth that exists today — there is no
-- record of any earlier arrangement, and this migration will not invent one.
--
-- `effective_from` is therefore the earliest date at which we can honestly say
-- the relationship held: the employee's joining date, falling back to when their
-- row was created. That is EARLIER than the relationship may actually have
-- started, which is the safe direction: a historical query about August returns
-- the only manager we ever knew about, rather than nothing at all.
--
-- Employees with NO manager are given a row too, with manager_id NULL. Without
-- it, their first assignment would open a period starting mid-history and every
-- date before it would read as "unknown" rather than "unassigned".
--
-- The WHERE NOT EXISTS makes the whole thing idempotent AND makes re-running it
-- harmless after real history has accumulated: an employee who already has an
-- open period is skipped entirely, so a re-apply cannot overwrite a recorded
-- move with the current column value.

INSERT INTO employee_manager_history (employee_id, manager_id, effective_from, note)
SELECT
  e.id,
  e.manager_id,
  COALESCE(e.joined_at::date, e.created_at::date, CURRENT_DATE),
  'Backfilled from employees.manager_id when reporting history was introduced (0220). The start date is the joining date, which is the earliest date this relationship can be asserted from — it is not evidence of when the reporting line actually began.'
FROM employees e
WHERE NOT EXISTS (
  SELECT 1
    FROM employee_manager_history h
   WHERE h.employee_id = e.id
     AND h.effective_to IS NULL
);

-- -------------------------------------------------------------------------
--  0221_candidate_access_links.sql
-- -------------------------------------------------------------------------

-- 0221 — Candidate access links: the HR forms, without a login.
-- Additive + idempotent.
--
-- THE PROBLEM. A person applying to the company is not an employee yet, but the
-- two things we need from them — their own details, and their signatures on the
-- policies — both live behind `requireCandidate()`, i.e. behind a Firebase
-- sign-in. Asking an outsider to create an account on os.altuscorp.in before
-- they have been hired is the wrong order, and it is the reason these forms were
-- being filled by HR on their behalf.
--
-- WHAT THIS CHANGES, AND WHAT IT DELIBERATELY DOES NOT. It replaces the SIGN-IN
-- step only. A candidate still has a real `employees` row (account_type
-- 'candidate', linked by `candidate_intake_id`) and every downstream write still
-- targets it — `document_signatures.signer_employee_id`, the intake row, the
-- policy compliance rows. So identity, ownership and audit are unchanged; only
-- the way the caller PROVES who they are is different.
--
-- THE TOKEN. 256 random bits, handed out once in a URL. Only its SHA-256 is
-- stored here, so this table leaking does not let anybody in — the same shape as
-- `delegated_access_grants` (lib/auth/delegated-access.ts), and for the same
-- reason. Every fact about a link is re-read from this row on every request:
-- the URL carries an opaque string and nothing else, not the intake id, not the
-- expiry, not a flag.
--
-- LIFETIME. 30 days, so "let me check what I filled in" keeps working for as
-- long as a hiring round realistically runs. Expired or lost links are not
-- re-sent by guessing: the candidate re-enters their personal email on a public
-- page and a fresh link is mailed ONLY if it matches a real record — the page
-- says the same thing either way, so it cannot be used to discover who applied.
--
-- REVOCATION is a column, not a delete: `revoked_at` keeps the row for the audit
-- trail. HR revoking a link takes effect on the very next request because
-- nothing about it is cached client-side.

CREATE TABLE IF NOT EXISTS candidate_access_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The one intake row this link opens. CASCADE: if the intake record is
  -- deleted the link must die with it, never outlive its subject.
  intake_id uuid NOT NULL REFERENCES candidate_intake(id) ON DELETE CASCADE,

  -- SHA-256 of the token, hex. UNIQUE because lookup is an indexed equality on
  -- exactly this column; the plaintext token is never stored, logged or echoed.
  token_hash text NOT NULL UNIQUE,

  expires_at timestamptz NOT NULL,
  -- Set instead of deleting, so a revoked link stays auditable.
  revoked_at timestamptz,
  -- Throttled write (see lib/hr/candidate/access-link.ts) — "has this link ever
  -- actually been opened" is what tells HR whether the candidate got the email.
  last_used_at timestamptz,

  -- Who issued it. SET NULL rather than CASCADE: an HR person leaving must not
  -- silently delete the links they issued.
  created_by_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Every request on a public link does exactly one lookup, on this column.
CREATE INDEX IF NOT EXISTS candidate_access_links_intake_idx
  ON candidate_access_links(intake_id, created_at DESC);

-- -------------------------------------------------------------------------
--  0221_holiday_note.sql
-- -------------------------------------------------------------------------

-- 0221 — an optional NOTE on a holiday, and a record of who last changed it.
--
-- ── WHY THIS IS THE WHOLE MIGRATION ────────────────────────────────────────
-- Ad-hoc holidays already exist and already work. The `holidays` table has been
-- the calendar since migration 0009, `/hr/holidays` has had an ad-hoc panel
-- gated to Ruchita and Rutvisha, and `lib/queries/holidays.listHolidayDateSet`
-- already merges it into attendance grading — so declaring a day off already
-- shows up as a Holiday on everyone's attendance with no sync step.
--
-- Two things were genuinely missing against the brief:
--   1. the OPTIONAL NOTE ("Holiday name/reason, Date, Optional note"), and
--   2. an EDIT path — the HR panel could only add and remove, so correcting a
--      typo in a holiday's name meant deleting it and re-adding it, which
--      repriced the month twice and left two audit rows describing one fix.
--
-- This migration is the column the first needs, plus the two columns that let
-- an edit be attributed. The edit action itself is code.
--
-- No new table. There is one holiday calendar in the database and there must
-- not be a second.
--
-- FULLY IDEMPOTENT — safe to re-apply by hand at any time.

------------------------------------------------------------------------
-- 1. The note
------------------------------------------------------------------------
-- NULLABLE and with no default. The brief says optional, and "optional" has to
-- mean the column can be absent rather than an empty string that every reader
-- then has to treat as absent anyway. The write path stores NULL for a blank
-- field, so there is one representation of "no note".
--
-- Deliberately NOT shown to employees on the public Holiday List: a note is
-- HR's own record of why a day was declared ("Ganpati visarjan — office shut at
-- client request"), and the company-facing calendar shows the holiday's NAME.
-- The HR panel that writes it is the surface that reads it back.

ALTER TABLE holidays
  ADD COLUMN IF NOT EXISTS note text;

------------------------------------------------------------------------
-- 2. Who last changed it
------------------------------------------------------------------------
-- `created_by_id` and `created_at` already exist. An edit needs the other half,
-- or the row records who declared the holiday and says nothing about who
-- renamed or moved it — and moving a holiday changes the month's target hours
-- for everybody, which is exactly the kind of change that has to be
-- attributable.
--
-- The append-only trail in `employee_events` (`holiday_added` /
-- `holiday_removed`, now also `holiday_edited`) remains the history. These two
-- columns are the CURRENT state, so the admin screen can show "last changed by"
-- without joining the event log on every render.

ALTER TABLE holidays
  ADD COLUMN IF NOT EXISTS updated_by_id uuid REFERENCES employees(id) ON DELETE SET NULL;

ALTER TABLE holidays
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

-- DELIBERATELY NOT DEFAULTED to now(). A row that has never been edited must
-- read as never edited; defaulting would make every pre-existing holiday claim
-- it was changed the moment this migration ran.

-- -------------------------------------------------------------------------
--  0221_operations_checklist.sql
-- -------------------------------------------------------------------------

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

-- -------------------------------------------------------------------------
--  0222_candidate_policy_signing.sql
-- -------------------------------------------------------------------------

-- 0222 — Post-Interview: the policies, signed without a login.
-- Additive + idempotent. Nothing existing is read, altered or deleted.
--
-- THE PROBLEM. 0221 let an outsider fill their own INTERVIEW FORM from an
-- emailed link, with no account on os.altuscorp.in. The other half of what a
-- candidate owes us is their acknowledgement of the firm's policies, and that
-- still sat behind `requireUser()` — so HR was either creating a login for
-- somebody who has not been hired, or chasing signatures on paper.
--
-- TWO CHANGES, BOTH ADDITIVE.
--
-- 1. `candidate_access_links.purpose` — one link now knows what it was issued
--    FOR, so `/c/<token>` can land the candidate on their form or on their
--    policies. It is only ever a LANDING decision: both surfaces belong to the
--    same person and the same intake row, and the token proves identity for
--    both. Defaulting to 'form' leaves every link issued by 0221 behaving
--    exactly as it did.
--
-- 2. `candidate_policy_signatures` — one row per (intake, policy) recording
--    that this candidate accepted this version, when, and under what typed
--    name.
--
-- WHY A SEPARATE TABLE AND NOT `document_signatures`. That table is the
-- DigiLocker flow: an Aadhaar-verified signature that produces an archived
-- signed PDF. A candidate has no DigiLocker session and no account, so
-- recording their acceptance there would file an unverified consent in the same
-- place as verified ones and let the two be mistaken for each other later. This
-- table says exactly what it is: typed acceptance of a named policy version by
-- a named candidate at a known time. `policy_compliance` is still mirrored
-- alongside it, so HR's existing ledger shows these candidates without needing
-- to learn about a new table.
--
-- EDITABLE AFTER SIGNING, like the interview form: the unique constraint is on
-- (intake_id, policy_key), so returning to re-accept a policy UPDATES the row
-- rather than stacking a second one. `signed_at` moves to the latest acceptance
-- and `version` records which published version they accepted.

ALTER TABLE candidate_access_links
  ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'form';

CREATE TABLE IF NOT EXISTS candidate_policy_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The intake row this acceptance belongs to. CASCADE: deleting a candidate's
  -- record must not leave their acknowledgements behind it.
  intake_id uuid NOT NULL REFERENCES candidate_intake(id) ON DELETE CASCADE,

  -- The candidate's own employees row — the SAME subject every other write in
  -- this flow targets, so HR's ledger and this table agree about who signed.
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,

  policy_key text NOT NULL,
  -- Which published version was on screen when they accepted. A later version
  -- must not be able to claim a signature made against the older text.
  version integer NOT NULL DEFAULT 1,

  -- What they typed as their signature, kept verbatim.
  signed_name text NOT NULL,
  signed_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- One acceptance per policy per candidate; re-accepting updates it.
  CONSTRAINT candidate_policy_signature_uq UNIQUE (intake_id, policy_key)
);

-- The page lists every policy for one candidate on each render.
CREATE INDEX IF NOT EXISTS candidate_policy_signatures_intake_idx
  ON candidate_policy_signatures(intake_id);

-- -------------------------------------------------------------------------
--  0222_device_registration_consent.sql
-- -------------------------------------------------------------------------

-- 0222 — FIRST-LOGIN DEVICE REGISTRATION: BIOS serial, and a consent audit.
--
-- ── WHAT CHANGES ───────────────────────────────────────────────────────────
-- `mobile_devices` gains four descriptive columns and one new table joins it.
-- No existing column changes type, nothing is dropped, and the device-access
-- rule itself (one approved laptop AND one approved phone, enforced by
-- `mobile_devices_employee_kind_approved_uq` and `mobile_devices_cap_approved_trg`
-- since 0215) is untouched. Registration is a step BEFORE that cap, not a
-- replacement for it.
--
-- ── WHY registered_at EXISTS ───────────────────────────────────────────────
-- The modal has to fire on a device the employee has never registered, and
-- must NOT fire on the ones already in the table. A row's existence cannot
-- answer that: `enroll()` (device-access.ts:452) already writes a row on first
-- sight and, with DEVICE_AUTO_ADOPT on, marks it `approved` immediately. So a
-- device can be approved and yet never have been through a registration form.
--
-- `registered_at` records that a HUMAN completed the form. Existing rows are
-- backfilled below, which is what keeps every device already in use from
-- suddenly demanding registration from the person using it.
--
-- ── WHY THE BIOS SERIAL IS NOT THE DEVICE IDENTITY ─────────────────────────
-- `device_id` remains the technical identifier — server-minted, unique, and
-- what every lookup in device-access.ts keys on. The BIOS serial is an
-- ATTRIBUTE the employee types in, used to prove one physical laptop is not
-- being registered twice across two accounts. Making it the identity would mean
-- trusting a value the employee can retype at will.
--
-- Uniqueness is scoped to laptops and to non-NULL values: phones never carry
-- one, and a partial index lets any number of rows leave it empty.

ALTER TABLE mobile_devices
  ADD COLUMN IF NOT EXISTS bios_serial_number text;

ALTER TABLE mobile_devices
  ADD COLUMN IF NOT EXISTS manufacturer text;

ALTER TABLE mobile_devices
  ADD COLUMN IF NOT EXISTS model text;

ALTER TABLE mobile_devices
  ADD COLUMN IF NOT EXISTS registered_at timestamptz;

-- One physical laptop cannot be registered twice, in either direction: not by
-- two employees, and not twice by one. Case-insensitive because the employee
-- types it — "5CD1234ABC" and "5cd1234abc" are the same machine.
CREATE UNIQUE INDEX IF NOT EXISTS mobile_devices_bios_serial_uq
  ON mobile_devices (lower(bios_serial_number))
  WHERE bios_serial_number IS NOT NULL AND kind = 'laptop';

-- Every device that predates this migration counts as already registered.
-- Without this, everyone in the roster meets a registration modal on their next
-- page load for a laptop they have been using for months.
UPDATE mobile_devices
   SET registered_at = COALESCE(approved_at, created_at, now())
 WHERE registered_at IS NULL;

-- ── CONSENT AUDIT ──────────────────────────────────────────────────────────
-- A row per act of consent, never updated and never deleted — the point of an
-- audit record is that it says what was agreed to, when, and under which
-- wording. `consent_version` is what makes a future terms change enforceable:
-- bump it to 'device-registration-v2' and every employee whose newest row still
-- reads v1 is due to re-consent.
--
-- device_id is stored alongside device_row_id on purpose. The row reference can
-- go NULL if a device record is ever removed; the text id keeps the audit
-- legible after that.
--
-- Deliberately NOT stored: user agent, IP, screen, fonts, timezone or any other
-- fingerprint. The record exists to prove consent, not to profile the person.
CREATE TABLE IF NOT EXISTS device_consent_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees (id) ON DELETE CASCADE,
  device_row_id uuid REFERENCES mobile_devices (id) ON DELETE SET NULL,
  device_id text,
  consent_version text NOT NULL,
  consent_type text NOT NULL DEFAULT 'device-registration',
  actor_employee_id uuid REFERENCES employees (id) ON DELETE SET NULL,
  consented_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS device_consent_events_employee_idx
  ON device_consent_events (employee_id, consented_at DESC);

CREATE INDEX IF NOT EXISTS device_consent_events_device_idx
  ON device_consent_events (device_row_id);

CREATE INDEX IF NOT EXISTS device_consent_events_version_idx
  ON device_consent_events (consent_version);

-- -------------------------------------------------------------------------
--  0222_job_description.sql
-- -------------------------------------------------------------------------

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

-- -------------------------------------------------------------------------
--  0224_device_name_replaces_bios_serial.sql
-- -------------------------------------------------------------------------

-- 0224 — THE REGISTRATION FIELD BECOMES THE DEVICE NAME, not the BIOS serial.
--
-- ── WHY ────────────────────────────────────────────────────────────────────
-- 0222 asked every employee for their laptop's BIOS serial at first login. On
-- the roster this is being rolled out to, that was the wrong ask twice over:
--
--   1. THE INSTRUCTIONS WERE DEAD. The modal's primary command was
--      `wmic bios get serialnumber`, and `wmic.exe` no longer exists on
--      Windows 11 24H2 and later (build 26100+). Verified on the account
--      holder's own machine, build 26200: the binary is simply absent. The
--      PowerShell fallback works, but it was printed second and most people
--      stopped at the first line that failed.
--
--   2. EVEN WORKING, IT IS A COMMAND. Most of this roster is non-technical.
--      "Open PowerShell and run this" is a support ticket per employee.
--
-- The DEVICE NAME is visible with no command at all — Settings › System ›
-- About, or Win+Pause, where it is the first row on the page. That is the
-- difference between a form somebody can complete and one they cannot.
--
-- ── WHAT IS TRADED AWAY, HONESTLY ──────────────────────────────────────────
-- A BIOS serial is unique and unchangeable. A device name is neither:
--
--   · the employee can rename it at any time (Settings › Rename this PC), and
--   · corporately imaged or cloned machines routinely SHARE one, which a
--     random consumer install ("DESKTOP-2874MGH") does not.
--
-- The second is the one that bites: under the unique index below, the second
-- person carrying a duplicate name is refused. That is why the collision
-- message names the remedy instead of just saying no.
--
-- This is an acceptable trade because of what the field is FOR. It is not the
-- device identity and never was — `device_id` is, server-minted and unique, and
-- it is what every lookup in lib/security/device-access.ts keys on. Nor is it
-- the access boundary: the `att_device` cookie plus the one-approved-laptop cap
-- (`mobile_devices_employee_kind_approved_uq`) do the enforcing. This column's
-- only job is to make it awkward to register one physical laptop under two
-- accounts, and a device name does that nearly as well as a serial while being
-- something people can actually find.
--
-- ── A RENAME, NOT A NEW COLUMN ─────────────────────────────────────────────
-- One identifier, not two. Keeping both would mean the same laptop could be
-- registered twice — once by serial, once by name — under two accounts, which
-- is precisely the thing the unique index exists to prevent.
--
-- No data is migrated because there is none: 0223 emptied `mobile_devices`, and
-- this lands in the same rollout, so the column is empty at rename time
-- (verified: 0 rows, 0 device_consent_events). The rename is written to be safe
-- anyway if that is ever not true — an existing serial simply carries over as
-- the stored value and its owner is never re-prompted.
--
-- FULLY IDEMPOTENT — safe to re-apply by hand at any time.

------------------------------------------------------------------------
-- 1. The column
------------------------------------------------------------------------
-- Rename when the old name is present and the new one is not. Guarded on both
-- sides so a re-run, or a database that already has `device_name`, is a no-op
-- rather than an error.
DO $$
BEGIN
  IF EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_name = 'mobile_devices' AND column_name = 'bios_serial_number'
     )
     AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_name = 'mobile_devices' AND column_name = 'device_name'
     )
  THEN
    ALTER TABLE mobile_devices RENAME COLUMN bios_serial_number TO device_name;
  END IF;
END $$;

-- Belt and braces: a database that never ran 0222 gets the column outright,
-- so this migration alone is enough to bring the schema into line.
ALTER TABLE mobile_devices
  ADD COLUMN IF NOT EXISTS device_name text;

------------------------------------------------------------------------
-- 2. The uniqueness guarantee, moved with it
------------------------------------------------------------------------
-- 0222's index named the old column. Dropping it is not optional: left in
-- place against a renamed column it would keep enforcing uniqueness under a
-- name nothing in the application reads any more.
DROP INDEX IF EXISTS mobile_devices_bios_serial_uq;

-- One physical laptop, one registration. Partial and lower-cased for the same
-- two reasons as before: phones never carry this value, and the employee types
-- it, so "desktop-2874mgh" and "DESKTOP-2874MGH" must be one machine.
--
-- Windows device names are case-insensitive by definition (NetBIOS), and a Mac's
-- friendly name is whatever the owner typed, so case is the LAST thing that can
-- be trusted to be stable here.
CREATE UNIQUE INDEX IF NOT EXISTS mobile_devices_device_name_uq
  ON mobile_devices (lower(device_name))
  WHERE device_name IS NOT NULL AND kind = 'laptop';

COMMIT;

-- ===========================  END OF PART 1  ==============================
-- Stop here unless you have decided to wipe registered devices.


-- ###########################################################################
-- #  PART 2 — 0223_clear_registered_devices.sql
-- #
-- #  WARNING: DELETES EVERY ROW IN mobile_devices. Everyone re-registers a
-- #  device on next sign-in. Device HISTORY is lost unless the backup below is
-- #  kept. Consent records survive (device_consent_events is ON DELETE SET NULL).
-- #
-- #  Guarded: backs up to mobile_devices_pre_0223 first, and does nothing if
-- #  that backup already exists — so a second run cannot wipe devices people
-- #  registered since.
-- ###########################################################################

BEGIN;

DO $wipe$
BEGIN
  IF to_regclass('public.mobile_devices_pre_0223') IS NULL THEN
    CREATE TABLE mobile_devices_pre_0223 AS SELECT * FROM mobile_devices;
    DELETE FROM mobile_devices;
    RAISE NOTICE 'mobile_devices cleared; previous rows kept in mobile_devices_pre_0223';
  ELSE
    RAISE NOTICE 'mobile_devices_pre_0223 already exists - skipping the wipe';
  END IF;
END
$wipe$;

COMMIT;
