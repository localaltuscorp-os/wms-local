-- 0186 — allow a SYSTEM account type.
--
-- A working login that is deliberately NOT part of the staff roster: test and
-- demo accounts. It authenticates and behaves exactly like an employee
-- (lib/auth/current.ts isLoginLive falls through to is_active for any
-- non-candidate type, and requireUser only forks candidates), but every staff
-- listing filters on account_type = 'employee' (lib/queries/employees.ts
-- isStaffAccount), so it never appears in the admin Employees list, a picker,
-- or a headcount.
--
-- Deactivating such an account would ALSO have hidden it, but is_active = false
-- blocks login — which defeats the point of a usable test account.
--
-- Idempotent: drops and recreates the CHECK with the wider set.
ALTER TABLE employees DROP CONSTRAINT IF EXISTS employees_account_type_chk;
ALTER TABLE employees ADD CONSTRAINT employees_account_type_chk
  CHECK (account_type = ANY (ARRAY['employee'::text, 'candidate'::text, 'system'::text]));

-- `employees_candidate_not_roster_chk` read "account_type = 'employee' OR
-- is_active = false" — i.e. a non-employee account may never be active. That
-- invariant exists to keep CANDIDATES off the roster (their liveness is
-- candidate_active, not is_active) and must KEEP holding for them.
-- A system account is already excluded from every roster by account_type, so it
-- does not need is_active = false to stay hidden — and it cannot log in without
-- is_active = true. Widen to employee OR system; candidates stay bound exactly
-- as before.
ALTER TABLE employees DROP CONSTRAINT IF EXISTS employees_candidate_not_roster_chk;
ALTER TABLE employees ADD CONSTRAINT employees_candidate_not_roster_chk
  CHECK (account_type IN ('employee', 'system') OR is_active = false);
