-- 0271 — A FOURTH DB-BACKED CAPABILITY: employee_pay.manage
--
-- WHY. Viewing and editing an employee's pay (CTC, its component split, TDS, PT
-- exemption, hourly / fixed-fee rates, banking ids) in the Employee Master, and
-- setting a salary while inviting a new employee, was gated on `isSuperAdmin`
-- (lib/auth/super-admin.ts): an email allow-list in code. Changing who may see
-- pay therefore needed a deploy and kept personal addresses in the repository.
--
-- `employee_pay.manage` replaces that test with a row in `capability_grants`,
-- the same shape as `hr.letters.issue` and `dcc.coordinator`. It is held by
-- NOBODY by code: a super-admin grants it from the Employee Master (Access
-- section) and every grant / revoke is written to `capability_grant_events`.
-- No employee is named in this migration and none is granted by it.
--
-- ── BEHAVIOUR CHANGE ───────────────────────────────────────────────────────
-- Once the application code using this capability is deployed, pay in the
-- Employee Master is hidden from EVERYONE until the grant is made — including
-- the super-admins who could see it before. Grant it first, or accept a window
-- in which nobody can open the Payroll section.
--
-- ── THIS MIGRATION ONLY WIDENS A CHECK CONSTRAINT ──────────────────────────
-- See 0248 for why a name may only be added here once that capability's guards
-- are asynchronous and READ this table. `canManageEmployeePay`
-- (lib/employees/pay-access.ts) is async and does.
--
-- Additive and idempotent — the constraint is dropped and recreated, and DROP
-- CONSTRAINT loses no rows. To roll back: recreate the constraint without
-- 'employee_pay.manage' after deleting any rows that use it.

ALTER TABLE capability_grants
  DROP CONSTRAINT IF EXISTS capability_grants_capability_chk;

ALTER TABLE capability_grants
  ADD CONSTRAINT capability_grants_capability_chk
    CHECK (capability IN ('master_admin.manage', 'hr.letters.issue', 'dcc.coordinator', 'employee_pay.manage'));

-- Verify (ONE statement — the Supabase editor shows only the last result set):
--
--   select
--     pg_get_constraintdef(oid) like '%employee_pay.manage%' as pay_capability_allowed,
--     pg_get_constraintdef(oid) like '%dcc.coordinator%' as coordinator_allowed
--   from pg_constraint where conname = 'capability_grants_capability_chk';
