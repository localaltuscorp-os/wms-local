-- ============================================================================
--  RUN IN SUPABASE — what production is missing for code ALREADY on wms-local main
--
--  PROJECT: fjopgyqytfvbudkwhdto  (check the project name in the editor first)
--
--  Built 2026-09-17 (0236 added 2026-09-18) by comparing every table and column the code on main
--  defines against the live production database. Covers:
--    · Vinal's work (DCC calendar/masters/call logs, JD targets/ladder/category/
--      person-specific, Recruitment JDs, Approver + Initiator Status)
--    · Rohan's incentive eligibility
--    · 0204 project status/progress, and the 0221/0222 candidate tables, which
--      never reached production
--
--  NOT INCLUDED: Om's branch. It needs a separate file once his incentive
--  eligibility design is reconciled with Rohan's (both use the same table).
--
--  CHECKED: no statement depends on a table created later; every CREATE is
--  IF NOT EXISTS and every INSERT is guarded; PART 1 + PART 2 were run TWICE
--  against a real Postgres (the local dummy database) without an error.
--  0226 had one statement that failed on a second run — guarded here, marked.
--
--  HOW TO RUN
--    1. Run db/VERIFY-MAIN-MISSING-0204-0236.sql — note what says NOT YET.
--    2. Select ONLY PART 1 → Run.
--    3. Select ONLY PART 2 (its BEGIN through its COMMIT) → Run.
--       One transaction: if any statement fails, NOTHING is changed.
--    4. Optional: select PART 3 → Run (instant broadcast pop-ups).
--    5. Run the VERIFY file again — every row should say PASS.
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
--  PART 1 — RUN THIS ALONE FIRST (two new status values)
-- ────────────────────────────────────────────────────────────────────────────
alter type approval_status add value if not exists 'on_hold';
alter type approval_status add value if not exists 'archived';


-- ────────────────────────────────────────────────────────────────────────────
--  PART 2 — 15 MIGRATIONS, VERBATIM (one guard marked), IN ORDER, ONE TRANSACTION
-- ────────────────────────────────────────────────────────────────────────────
BEGIN;

-- ════════ 0204_project_status_progress.sql ════════
-- 0204 — Project Module: status, approval verdict and partial progress.
--
-- ADDITIVE ONLY. All three columns are nullable with no default, so this is a
-- metadata-only change on modern Postgres: it rewrites zero rows and takes only
-- a brief ACCESS EXCLUSIVE lock to update the catalogue.
--
-- WHY THESE THREE AND NOTHING ELSE
--
-- The brief asks for Project No, Name, Description, Status, Start Date, End
-- Date, Duration (days), Progress and Milestone completion. Most of that is
-- already on the table and is deliberately NOT duplicated here:
--
--   Project No       DERIVED from sibling position (lib/project-plan/levels.ts
--                    refFor / fullRefFor). Never stored — a stored label drifts
--                    from the tree the first time a row is deleted.
--   Name             project_nodes.name          (migration 0027)
--   Description      project_nodes.description   (#13)
--   Start Date       project_nodes.starts_at     (migration 0203)
--   End Date         project_nodes.ends_at       (migration 0203)
--   Duration (days)  DERIVED from starts_at → ends_at. Storing it would let it
--                    disagree with its own two endpoints.
--   Progress %       DERIVED from milestone completion, except where a person
--                    has recorded a partial — that is `progress_percent` below.
--   Archived         project_nodes.is_archived   (existing boolean + index)
--
-- On an EXECUTABLE row (action / sub_action / sub_sub_action) the status of
-- record stays on the linked WMS task (tasks.status), exactly as it is today —
-- those rows are one shared record with WMS and the calendar, and a second
-- status column on the node would be a copy free to disagree with it. The two
-- columns below therefore describe CONTAINER rows (project / milestone /
-- result), which have no task to carry a status.

ALTER TABLE "project_nodes"
  -- The WORKING flow — the same six values as DOER_TASK_STATUSES in db/enums.ts
  -- ('dont_know' displays as "Not Read"). Plain text, matching the existing
  -- `kind` column's choice: an enum would need a lock plus a follow-up
  -- migration every time a status is added, and the app-side zod enum in
  -- lib/project-plan/status.ts is what actually validates writes.
  ADD COLUMN IF NOT EXISTS "status" text,

  -- The RESTRICTED flow — not_approved / approved / on_hold / cancelled.
  -- Separate from `status` on purpose, mirroring what tasks.approval_status
  -- already does: a verdict is layered ON TOP of a progress report rather than
  -- overwriting it, so "approved" does not erase the fact that the work was
  -- at Follow Up when it was approved.
  --
  -- 'archived' from the brief's restricted list is NOT a value here — archiving
  -- is project_nodes.is_archived, which already has a column, an index and a
  -- filter on every read. A parallel status string could disagree with it.
  ADD COLUMN IF NOT EXISTS "approval_status" text,

  -- Recorded partial completion, 0–100, for ONE milestone (or any container).
  -- NULL means "derive it from the executable rows underneath" — which is the
  -- normal case. A number here is a human overruling the derived figure, and
  -- lib/project-plan/progress.ts honours it over the derivation.
  --
  -- integer, not numeric: the input is whole percents (40%, 75%), and the
  -- DECIMAL part of the brief is in the ROLLUP (3.5/10), which is computed, not
  -- stored. 10 milestones at whole percents still sum to 3.5.
  ADD COLUMN IF NOT EXISTS "progress_percent" integer;

-- Guard the two vocabularies at the database, not only in zod. A bad write from
-- a script or a psql session must fail here rather than leave a row the app
-- cannot render. NOT VALID: the check applies to every new and updated row
-- immediately but does not scan the existing table, so this stays a fast
-- metadata-only change. Existing rows are all NULL in these columns anyway —
-- they were created by this migration.
ALTER TABLE "project_nodes"
  DROP CONSTRAINT IF EXISTS "project_nodes_status_check";
ALTER TABLE "project_nodes"
  ADD CONSTRAINT "project_nodes_status_check"
  CHECK (
    "status" IS NULL OR "status" IN (
      'dont_know', 'not_started', 'initiated', 'follow_up', 'need_info', 'done'
    )
  ) NOT VALID;

ALTER TABLE "project_nodes"
  DROP CONSTRAINT IF EXISTS "project_nodes_approval_status_check";
ALTER TABLE "project_nodes"
  ADD CONSTRAINT "project_nodes_approval_status_check"
  CHECK (
    "approval_status" IS NULL OR "approval_status" IN (
      'not_approved', 'approved', 'on_hold', 'cancelled'
    )
  ) NOT VALID;

ALTER TABLE "project_nodes"
  DROP CONSTRAINT IF EXISTS "project_nodes_progress_percent_check";
ALTER TABLE "project_nodes"
  ADD CONSTRAINT "project_nodes_progress_percent_check"
  CHECK ("progress_percent" IS NULL OR ("progress_percent" >= 0 AND "progress_percent" <= 100))
  NOT VALID;

-- The Projects list filters to kind='project' and orders by sort_order. The
-- existing project_nodes_kind_idx covers (kind, is_archived); this adds the
-- ordering so the top-level list needs no sort. Cheap; the table is small.
CREATE INDEX IF NOT EXISTS "project_nodes_kind_sort_idx"
  ON "project_nodes" ("kind", "is_archived", "sort_order");

-- ════════ 0216_incentive_eligibility.sql ════════
-- ─────────────────────────────────────────────────────────────────────────────
-- 0216 — PER-PERSON INCENTIVE ELIGIBILITY
--
-- Until now an incentive was visible to everyone, with two coarse flags
-- (`sales_eligible`, `interns_eligible`) that nothing actually enforced. The
-- admin now decides, per incentive, exactly who it applies to — everyone, a
-- whole department, or a named list — and an employee never sees an incentive
-- they were not picked for, nor has it counted in their attainment.
--
-- `applies_to_all` DEFAULTS TO TRUE, which is the whole safety story of this
-- migration: the moment it runs, every existing incentive keeps being visible
-- to exactly the people who could see it a second earlier. Nothing disappears
-- from anyone's screen until an admin deliberately narrows it.
--
-- Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE incentive_catalog
  ADD COLUMN IF NOT EXISTS applies_to_all boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS incentive_eligibility (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incentive_id uuid NOT NULL REFERENCES incentive_catalog(id) ON DELETE CASCADE,
  employee_id  uuid NOT NULL REFERENCES employees(id)         ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- One row per (incentive, person). The upsert path relies on this.
CREATE UNIQUE INDEX IF NOT EXISTS incentive_eligibility_pair_uq
  ON incentive_eligibility (incentive_id, employee_id);

-- "What am I eligible for?" runs on every load of /incentive for every
-- employee, so it gets its own index rather than riding the unique one, whose
-- leading column is the incentive.
CREATE INDEX IF NOT EXISTS incentive_eligibility_employee_idx
  ON incentive_eligibility (employee_id);

-- ── verify ───────────────────────────────────────────────────────────────────
-- Expect: applies_to_all = true on every existing row, and an empty
-- eligibility table. Both mean "nothing has changed for anybody yet".
--
--   SELECT count(*) FILTER (WHERE applies_to_all) AS open_to_all,
--          count(*)                               AS total
--     FROM incentive_catalog;
--   SELECT count(*) AS eligibility_rows FROM incentive_eligibility;

-- ════════ 0221_candidate_access_links.sql ════════
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

-- ════════ 0222_candidate_policy_signing.sql ════════
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

-- ════════ 0225_jd_assignment_targets.sql ════════
-- 0225 — Job Description assignments become PER DESTINATION.
--
-- The JD form now has three boxes: Daily Compliance Checklist, Work Management
-- System and Event Checklist, each with its own list of people. An assignment
-- therefore has to say WHICH destination it is for — "Dattaram does this job"
-- is no longer a complete answer when the job goes to three places and he only
-- covers one of them.
--
-- THREE FLAGS ON ONE ROW, not one row per destination. A person who does the
-- job for two destinations is one assignment with two flags, so the existing
-- partial unique index on (jd_id, employee_id) WHERE is_active still holds —
-- and that index is what stops somebody being assigned twice and receiving the
-- same task twice. One row per destination would have required dropping it.
--
-- Idempotent: this repository applies migrations by hand, and a migration that
-- cannot be run twice gets run twice.

alter table jd_assignments
  add column if not exists for_dcc   boolean not null default false,
  add column if not exists for_wms   boolean not null default false,
  add column if not exists for_event boolean not null default false;

-- Existing rows were written before destinations were separable: they meant
-- "this person does this job", full stop. They inherit whichever destinations
-- the JD itself pushes to, which is what that used to mean in practice.
--
-- Guarded on all-three-false so a re-run cannot undo a real edit made after the
-- first run.
update jd_assignments a
   set for_dcc   = e.push_dcc,
       for_wms   = e.push_wms,
       for_event = e.push_event
  from jd_entries e
 where e.id = a.jd_id
   and a.for_dcc = false
   and a.for_wms = false
   and a.for_event = false;

-- Reading "who is assigned for the DCC" is the query the push job will run once
-- per JD per day, so it is worth an index rather than a scan per row.
create index if not exists jd_assignments_target_idx
  on jd_assignments (jd_id, is_active, for_dcc, for_wms, for_event);

-- ════════ 0226_jd_rank_ladder_26.sql ════════
-- 0226 — the Job Description rank ladder becomes the account holder's 26.
--
-- Replaces the fourteen seeded by 0222. Twelve ranks are new, the orders of the
-- ones that stay are renumbered, and ONE old rank — DGM — has no equivalent in
-- the new list.
--
-- `rank_order` IS BEHAVIOUR: the vacancy resolver climbs it, so a job
-- description on an empty seat goes to the next filled rung above. Renumbering
-- therefore reroutes live work, which is why this is a migration with a report
-- at the end rather than a seed script.
--
-- Idempotent: this repository applies migrations by hand, and a migration that
-- cannot be run twice gets run twice.

-- Orders are rewritten in two passes. Doing it in one would collide with the
-- unique index on rank_order the moment a new number lands on a row that has
-- not moved yet — 'Executive' going from 30 to 40 while 40 is still 'Sr.
-- Executive'. Parking every existing rank in a range nothing else uses makes
-- the second pass unconditional.
-- GUARDED FOR RE-RUNS (added in this bundle): shifting the ladder a second time
-- collides with the ranks the first run parked at 10000+. Skip once the new ladder exists.
update jd_ranks set rank_order = rank_order + 10000 where rank_order < 10000
  and not exists (select 1 from jd_ranks where name = 'Chairman' and rank_order = 260);

insert into jd_ranks (name, rank_order, band, is_active) values
  ('Intern - First Year',         10,  'Trainee',            true),
  ('Intern - Second Year',        20,  'Trainee',            true),
  ('Intern - Third Year',         30,  'Trainee',            true),
  ('Executive',                   40,  'Individual',         true),
  ('Sr. Executive',               50,  'Individual',         true),
  ('Consultant',                  60,  'Individual',         true),
  ('Sr. Consultant',              70,  'Individual',         true),
  ('Assistant Manager',           80,  'Management',         true),
  ('Deputy Manager',              90,  'Management',         true),
  ('Manager',                     100, 'Management',         true),
  ('Associate Vice President',    110, 'Leadership',         true),
  ('Deputy Vice President',       120, 'Leadership',         true),
  ('Vice President',              130, 'Leadership',         true),
  ('Senior Vice President',       140, 'Leadership',         true),
  ('President',                   150, 'Leadership',         true),
  ('Sr President',                160, 'Leadership',         true),
  ('Assistant General Manager',   170, 'General Management', true),
  ('General Manager',             180, 'General Management', true),
  ('Sr. General Manager',         190, 'General Management', true),
  ('Associate Director',          200, 'Director',           true),
  ('Deputy Director',             210, 'Director',           true),
  ('Director',                    220, 'Director',           true),
  ('Senior Director',             230, 'Director',           true),
  ('CEO',                         240, 'Board',              true),
  ('Managing Director',           250, 'Board',              true),
  ('Chairman',                    260, 'Board',              true)
on conflict (name) do update
  set rank_order = excluded.rank_order,
      band       = excluded.band,
      is_active  = true,
      updated_at = now();

-- The four renamed intern rungs. Their old names were parked above, so the seats
-- pointing at them move across intact rather than being orphaned.
update jd_ranks r set is_active = false
 where r.rank_order >= 10000
   and r.name in ('Intern (2nd Yr)', 'Intern (3rd Yr)');

-- DGM IS LEFT ALONE, DELIBERATELY. It has no equivalent in the new list, and
-- guessing between Deputy Director and General Manager would reroute whatever
-- work sits on those seats. It stays active, parked above the ladder, and the
-- notice below asks a human to decide.
do $$
declare
  stranded int;
begin
  select count(*) into stranded
    from jd_positions p
    join jd_ranks r on r.id = p.rank_id
   where r.rank_order >= 10000 and r.is_active;

  if stranded > 0 then
    raise notice 'Migration 0226: % position(s) still sit on a rank outside the new ladder (DGM or similar). Re-point them by hand — they will escalate above every new rank until you do.', stranded;
  end if;
end $$;

-- ════════ 0228_jd_entries_category.sql ════════
-- 0228 — a Category on every Job Description.
--
-- Free text, not a lookup table: the account holder asked for a column the
-- author can simply write in — Housekeeping, Internet, Vendors — and the set is
-- not known up front. The form suggests categories already in use, so the same
-- word is not spelled three ways, without refusing a new one.
--
-- The Event Checklist already has its own `ops_checklist_items.category` from
-- 0221; only the JD Bank needs the column.
--
-- Idempotent: this repository applies migrations by hand, and a migration that
-- cannot be run twice gets run twice.

alter table jd_entries add column if not exists category text;

-- ════════ 0229_dcc_calendar_events.sql ════════
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

-- ════════ 0230_dcc_master_items.sql ════════
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

-- ════════ 0231_approver_initiator_status.sql ════════
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
-- MOVED TO PART 1 (an enum value cannot be added and used in one transaction): alter type approval_status add value if not exists 'on_hold';

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

-- ════════ 0232_recruitment_jds.sql ════════
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

-- ════════ 0233_jd_person_specific.sql ════════
-- 0233 — Job Description for a SPECIFIC PERSON.
--
-- The account holder asked (2026-09-15) for the JD module to hold, beside the
-- General JD (a position's job descriptions), tasks written for ONE person that
-- belong to no seat. A person's full JD is then: what their seat carries + what
-- is assigned to them by name + these.
--
-- A task now belongs to EXACTLY ONE owner — a position OR a person — and the
-- CHECK below makes that a database fact, not a convention: a row with neither
-- would be nobody's work, and a row with both would be counted twice.
--
-- Idempotent: this repository applies migrations by hand.

alter table jd_entries alter column position_id drop not null;

alter table jd_entries
  add column if not exists owner_employee_id uuid references employees(id) on delete cascade;

alter table jd_entries drop constraint if exists jd_entries_owner_chk;
alter table jd_entries
  add constraint jd_entries_owner_chk check ((position_id is null) <> (owner_employee_id is null));

create index if not exists jd_entries_owner_employee_idx on jd_entries (owner_employee_id, is_active);

-- ════════ 0234_initiator_status_archived.sql ════════
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
-- MOVED TO PART 1 (an enum value cannot be added and used in one transaction): alter type approval_status add value if not exists 'archived';

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

-- ════════ 0235_dcc_call_logs.sql ════════
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

-- ════════ 0236_recruitment_jd_roles.sql ════════
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

COMMIT;


-- ────────────────────────────────────────────────────────────────────────────
--  PART 3 — OPTIONAL: instant broadcast pop-ups (db/ENABLE-REALTIME-BROADCASTS.sql)
-- ────────────────────────────────────────────────────────────────────────────
-- ===========================================================================
--  LET BROADCASTS PUSH INSTEAD OF BEING POLLED
--
--  One statement. Adds the `broadcasts` table to Supabase's realtime
--  publication, so a published broadcast is pushed to every open tab over the
--  websocket the browser already holds, instead of every tab asking for one
--  every four seconds.
--
--  WHAT IT CHANGES ON THE BILL. <BroadcastPopup> is mounted on every
--  authenticated page. At 4s that is 900 requests an hour PER OPEN TAB, and
--  each one costs a session verification (crypto — billed CPU, not the cheap
--  I/O wait) plus three queries. With push carrying the news the poll drops to
--  60s: 60 requests an hour. That is the Fluid Active CPU alert.
--
--  AND IT IS FASTER, not a trade. Push arrives when the row is written;
--  polling arrives up to a full interval later. Delivery goes from
--  "within ~4 seconds" to "immediately".
--
--  SAFE TO SKIP, AND SAFE TO DELAY. The client's poll rate is ADAPTIVE: it
--  runs at 4s until the realtime channel reports SUBSCRIBED and only then
--  slows to 60s. So until this runs, the popup behaves exactly as it always
--  did. There is no window in which it is slower than before.
--
--  Safe to re-run — the DO block checks first, because
--  `alter publication ... add table` errors if the table is already in it.
-- ===========================================================================

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'broadcasts'
  ) then
    alter publication supabase_realtime add table broadcasts;
    raise notice 'broadcasts added to supabase_realtime';
  else
    raise notice 'broadcasts already in supabase_realtime - nothing to do';
  end if;
end
$$;


-- ── CONFIRM (run on its own; the editor shows only the last result set) ────
-- Expect one row. `tasks` is listed too — it is what the Live indicator in the
-- header already uses, and is the proof this mechanism works here.
--
-- select tablename
--   from pg_publication_tables
--  where pubname = 'supabase_realtime' and schemaname = 'public'
--  order by tablename;


-- ── WHAT IS AND IS NOT SENT ───────────────────────────────────────────────
-- The client subscribes to `broadcasts` only, never `broadcast_recipients`.
-- Publishing writes ONE broadcast row and one recipient row PER PERSON, so
-- subscribing to the recipients table would wake every tab in the company once
-- for every colleague as well as once for itself.
--
-- The push is only a NUDGE. The browser learns "a broadcast row changed" and
-- then calls /api/broadcasts/popup exactly once, which is where all the
-- per-person logic still lives — who the recipient is, whether they snoozed
-- it, whether it is lock-mode. No broadcast content travels over the realtime
-- channel and none of the filtering moves to the client.
