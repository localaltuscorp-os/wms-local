-- 0248 — A THIRD DB-BACKED CAPABILITY: dcc.coordinator
--
-- WHY. WCC and MCC are administrative checklists: whoever prepares the roster
-- sets them up, records what was done and keeps them right. That person is an
-- HR admin, a coordinator or an intern who has been handed the job — and is
-- usually not the manager of the people on the list.
--
-- Today the ONLY thing that widens a DCC view past your own reporting line is
-- `isSuperAdmin` (lib/auth/super-admin.ts), a hardcoded list of three email
-- addresses that needs a deploy to change. The other lever is the org chart:
-- make somebody the manager of everyone. That lever also decides who approves
-- their attendance and who may hand them tasks, and it records a reporting line
-- that is not true. Neither is the right tool for "keep the compliance rosters
-- up to date".
--
-- `dcc.coordinator` is the narrow alternative. Held by NOBODY by code — it is a
-- row in `capability_grants`, granted by an admin from the employee editor, the
-- same shape as `hr.letters.issue` and for the same reason: this is an
-- operational duty, not a security boundary, and the owner should be able to
-- hand it to somebody without a deploy.
--
-- WHAT IT OPENS, EXACTLY. Within WCC and MCC only:
--
--   · the two boards show every employee, and the person-picker reaches them
--   · marking Done, recording the count, and Doer Notes — for anyone
--   · adding, editing, removing a compliance, and setting its Mins
--
-- WHAT IT DELIBERATELY DOES NOT OPEN:
--
--   · APPROVER RULINGS (Approved / Not Approved). The boards resolve
--     `isDoersManager` from the REPORTING CHAIN, which is never widened — see
--     `ComplianceScope.chainIds` in lib/dcc/access.ts. Running the roster is not
--     the same as being everyone's manager, and collapsing the two would hand a
--     roster-keeper the power to overrule every manager's verdict in the
--     company as a silent side effect.
--   · DAYS THAT HAVE CLOSED. Entries still lock at 11:59 pm IST; backfilling is
--     `dcc.edit_past_entries`, which stays Manan's alone.
--   · EVERYTHING ELSE IN THE MODULE. The DCC board, the call log, the Masters
--     screen, the attendance confirmations and the mobile team dashboard keep
--     the plain reporting-chain scope.
--
-- ── THIS MIGRATION ONLY WIDENS A CHECK CONSTRAINT ──────────────────────────
-- Migration 0226 pinned `capability_grants.capability` to `master_admin.manage`
-- ALONE, on purpose, and the comment there explains why: a database row for a
-- capability whose guards are synchronous would be a grant the application
-- silently ignores — somebody told they hold a power they do not have.
--
-- Adding a name here is therefore only safe because that capability's guards are
-- async and READ this table:
--
--   · lib/dcc/access.ts          — `isComplianceCoordinator`, awaited by
--                                  `loadComplianceScope`, which the WCC / MCC
--                                  board, `guardItemWrite` and the Mins box all
--                                  go through
--   · app/(app)/dcc/compliance-actions.ts — `setComplianceDoer`, which decides
--                                  whether you may record somebody else's work
--
-- The same rule applies to the NEXT capability added here: make its guards
-- asynchronous first, then widen this list.
--
-- Additive and idempotent — the constraint is dropped and recreated, and DROP
-- CONSTRAINT loses no rows.

ALTER TABLE capability_grants
  DROP CONSTRAINT IF EXISTS capability_grants_capability_chk;

ALTER TABLE capability_grants
  ADD CONSTRAINT capability_grants_capability_chk
    CHECK (capability IN ('master_admin.manage', 'hr.letters.issue', 'dcc.coordinator'));

-- Verify (ONE statement — the Supabase editor shows only the last result set):
--
--   select
--     (select count(*) from capability_grants) = 0 as no_grants_yet,
--     pg_get_constraintdef(oid) like '%dcc.coordinator%' as coordinator_allowed,
--     pg_get_constraintdef(oid) like '%hr.letters.issue%' as issue_capability_allowed
--   from pg_constraint where conname = 'capability_grants_capability_chk';
