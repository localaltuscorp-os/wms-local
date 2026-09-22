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
