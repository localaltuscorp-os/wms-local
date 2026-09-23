-- ===========================================================================
--  RUN IN SUPABASE — everything this database is missing (0225 → 0230)
--  Altus WMS | branch Rudra | generated 2026-09-17
-- ===========================================================================
--
--  WHICH DATABASE: the one .env.local points at — project
--  `ifcdpjbdinvmtewmgceg`. That is the database localhost:3000 talks to.
--
--      https://supabase.com/dashboard/project/ifcdpjbdinvmtewmgceg/sql/new
--
--  WHY THIS FILE EXISTS. Measured against that database on 17 September by
--  reading information_schema — not guessed from notes:
--
--      MISSING   0225  hr_records_drive_items, hr_records_drive_settings
--      MISSING   0226  employee_policy_signatures
--      present   0227  hr_contacts, hr_assets, hr_asset_counters
--      MISSING   0228  ops_vendors
--      MISSING   0229  broadcasts.recurrence_dates / publish_claimed_at, …
--      MISSING   0230  ce_dropdown_options, pa_assignment_events, …
--
--  0227 is already applied and is left out.
--
--  SEPARATE, OLDER DRIFT — NOT addressed here and NOT caused by this work.
--  These tables are declared in db/schema.ts but absent from this database:
--  ai_usage, punch_nonces, candidate_policy_signatures and the seven rev_*
--  tables. Any screen that reads them was already broken here before today. Everything else is here, verbatim
--  from db/migrations/, in order, inside ONE transaction: it lands whole or
--  not at all.
--
--  WHAT BREAKS WITHOUT IT, on localhost:3000:
--    · Hand-holding — lib/queries/people-allocation.ts reads pa_entries
--      .archived_at, pa_people.is_ce_lead and pa_ambassadors.owner_person_id
--    · Client Engagement — every screen
--    · Operations → Directory — ops_vendors does not exist
--    · HR Records Backup — its two tables do not exist
--    · Broadcast detail pages — findFirst expands recurrence_dates
--
--  IT IS ADDITIVE. No DROP TABLE, no DELETE, no TRUNCATE. Re-running it
--  changes nothing. The only constraint work is in 0230 and is described in
--  its own header below; a pre-flight on 17 September confirmed all 8
--  pa_entries rows have highlight = null, so the new CHECK cannot reject
--  existing data.
-- ===========================================================================

BEGIN;

-- ---------------------------------------------------------------------------
--  0225_candidate_policy_signature_image.sql
-- ---------------------------------------------------------------------------

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
-- GUARDED 2026-09-17: `candidate_policy_signatures` does not exist on this
-- database (its own migration was never applied here), and a bare ALTER on a
-- missing table would abort this whole transaction. This applies the column
-- if the table is there and does nothing if it is not.
DO $guard$
BEGIN
  IF to_regclass('public.candidate_policy_signatures') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE candidate_policy_signatures ADD COLUMN IF NOT EXISTS signature_path text';
  END IF;
END
$guard$;


-- ---------------------------------------------------------------------------
--  0225_hr_records_drive.sql
-- ---------------------------------------------------------------------------

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


-- ---------------------------------------------------------------------------
--  0226_employee_policy_typed_signatures.sql
-- ---------------------------------------------------------------------------

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


-- ---------------------------------------------------------------------------
--  0228_ops_vendor_directory.sql
-- ---------------------------------------------------------------------------

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
