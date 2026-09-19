-- ============================================================================
--  PART 1 — RUN IN SUPABASE: migrations 0225, 0226, 0237 and 0238.
--
--  Run PART 0 (db/PREFLIGHT-0225-0226-0237-0238.sql) first and read its
--  results. Then paste this whole file into the SQL editor and run it ONCE.
--
--  WHAT IT ADDS
--    0225  Rudra  · a candidate's uploaded signature IMAGE, beside the typed
--                   name they already gave
--    0226  Rudra  · employee_policy_signatures — printed name + date + a photo
--                   of the signature, for policy sign-off without DigiLocker
--    0237  Vinal  · the Event Checklist in WMS Tasks column order (Client,
--                   Initiator, repeat rule, Approver Status / Notes, the WMS
--                   Doer Status) · a Client on every JD · per-person JD notes
--    0238  Vinal  · DCC becomes WCC / MCC — month_day on a compliance, and the
--                   WMS Doer Status, actual date and Approver columns on fills
--
--  WHY BEFORE THE CODE SHIPS: Drizzle writes every column the schema declares.
--  Until these run, saving a checklist row, a JD, a WCC/MCC fill or a policy
--  sign-off fails. The pages still open — their reads fall back — but nothing
--  can be saved. Staging reads this same database, so this must go first.
--
--  ONE TRANSACTION: if any statement fails, nothing at all changes.
--  ALL FOUR ARE IDEMPOTENT: running it twice is harmless.
--
--  AFTERWARDS run PART 2 (db/VERIFY-0225-0226-0237-0238.sql). Every row must
--  say PASS.
-- ============================================================================

BEGIN;

-- ── GUARD: refuse rather than half-translate ───────────────────────────────
-- 0237 constrains ops_checklist_checks.status to the WMS six after translating
-- the checklist's own four. A word it has no rule for would break the
-- constraint at the end of this transaction, naming the constraint and not the
-- cause. This stops first, and says what to look for.
DO $guard$
DECLARE
  stray text;
BEGIN
  IF to_regclass('public.ops_checklist_checks') IS NOT NULL THEN
    SELECT string_agg(DISTINCT quote_literal(status), ', ')
      INTO stray
      FROM ops_checklist_checks
     WHERE status IS NOT NULL
       AND status NOT IN ('Pending', 'Done', 'Need Help', 'Not Applicable')
       AND status NOT IN ('dont_know','not_started','initiated','follow_up','need_info','done');
    IF stray IS NOT NULL THEN
      RAISE EXCEPTION
        'STOP: ops_checklist_checks holds status values 0237 cannot translate: %. Nothing has been changed. Send this message to Claude.', stray;
    END IF;
  END IF;
END
$guard$;


-- ════════════════════════ 0225_candidate_policy_signature_image.sql ════════════════════════

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

-- ════════════════════════ 0226_employee_policy_typed_signatures.sql ════════════════════════

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

-- ════════════════════════ 0237_checklist_wms_columns_jd_client.sql ════════════════════════

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

-- ════════════════════════ 0238_wcc_mcc.sql ════════════════════════

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

COMMIT;
