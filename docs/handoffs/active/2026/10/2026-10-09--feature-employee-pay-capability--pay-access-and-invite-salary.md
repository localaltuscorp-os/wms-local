# Employee pay capability, invite salary and two-column invite dialog

- **Date:** 2026-10-09
- **Branch:** `feature/employee-pay-capability` (from `origin/main` at `6cbd5af9`)
- **Status:** Code complete and tested locally. **Migration 0271 is not applied anywhere.**
- **Commit / release SHA:** see the pull request

## Objective

1. Restrict viewing and editing of employee pay in the Employee Master to a database-backed capability instead of the `isSuperAdmin` email list.
2. Let a holder of that capability set a starting salary while inviting an employee.
3. Re-lay the invite dialog as two columns instead of a narrow scrolling column.
4. Keep inviting open to every admin (it already was: `requireAdmin()` only).

## Summary

New DB-backed capability `employee_pay.manage`. Nobody holds it by code, so it fails closed. A super-admin grants it from the **Employees screen** (row menu, Edit, "Manage pay" checkbox). Grants and revokes are written to `capability_grant_events`.

| Surface | Before | After |
|---|---|---|
| Employee Master page (CTC column, Payroll section, salary import button) | `isSuperAdmin(email)` | `employee_pay.manage` holder |
| `fetchEmployeeDetail` (server-side pay stripping, banking ids) | `isSuperAdmin` | `employee_pay.manage` holder |
| `saveCtcBreakup`, `savePayrollScalars` | `isSuperAdmin` | `employee_pay.manage` holder |
| Granting "Manage pay" | n/a | super-admin only (`editEmployee`) |
| `inviteEmployee` with a salary | n/a | needs `employee_pay.manage`; refused before the Firebase user is created |
| `inviteEmployee` without a salary | any admin | unchanged |

## Files changed

- `lib/security/capabilities.ts`, `lib/security/capability-grants.ts` — register `employee_pay.manage` (no GRANTS entry).
- `lib/employees/pay-access.ts` — new: `canManageEmployeePay`, `EMPLOYEE_PAY_REFUSAL`.
- `db/migrations/0271_employee_pay_capability.sql` — widens `capability_grants_capability_chk`. Names no employee and grants nothing.
- `app/(admin)/admin/employee-master/actions.ts` — three gates switched to the capability.
- `app/(admin)/admin/employee-master/page.tsx` — pay visibility and the import button use the capability.
- `app/(admin)/admin/employees/actions.ts` — `inviteEmployee` salary path; `editEmployee` `canManagePay` grant block.
- `app/(admin)/admin/employees/page.tsx`, `components/admin/employee-list.tsx`, `components/admin/employee-editor/index.tsx` — resolve who holds the grant and draw the "Manage pay" checkbox (super-admin only).
- `lib/validators/employee.ts` — `annualCtc` on the invite schema, `canManagePay` on the edit schema.
- `components/admin/invite-employee-dialog.tsx` — two-column layout, optional Annual CTC field (holders only).
- Tests: `tests/unit/employee-pay-access.test.ts` (new), `invite-employee-credentials.test.ts`, `master-admin-authorization.test.ts`.

## Database and migration

- **Migration:** `db/migrations/0271_employee_pay_capability.sql`. Additive and idempotent (drop and recreate a CHECK). Rollback: recreate the constraint without `employee_pay.manage` after deleting rows that use it.
- **Apply it before deploying this code**, through the approved release process. Not applied to any database by this work.
- Invite salary writes `salary_profiles.annual_ctc` and an empty-component `salary_ctc_breakup` row in one transaction, the same as `saveCtcBreakup`.

## Access behaviour change (read before deploying)

- Previously the addresses on the super-admin list could see and edit pay in the Employee Master. **After this change nobody can until a super-admin ticks "Manage pay"** on someone's record, including the super-admins themselves.
- A super-admin can grant it to themselves; the grant is audited.
- Still open to any admin (scope was Employee Master only): `/admin/salary-profiles` (`upsertSalaryProfile`), the salary profile import actions, `/salary/ctc`, the pay rates the Employees list sends to the browser, and the pay-rate write in `updateEmployeeAttendanceSchedule`. `/admin/salary-profiles` has no sidebar link.

## Testing

- `tsc --noEmit` (with `NODE_OPTIONS=--max-old-space-size=8192`; the default heap runs out), ESLint on changed files, and `pnpm test`: see the pull request for the results on this exact commit.
- Not run: `pnpm test:integration`, `pnpm test:visual`, `pnpm build` / `pnpm check:leaks` (no database bootstrap, `next.config.ts` or dependency change). No invite or salary save was run against a real database.

## Known issues / next steps

1. Apply 0271, then tick "Manage pay" for the intended person (super-admin).
2. Decide whether to close the remaining pay doors listed above.
3. `isSuperAdmin` is still an email allow-list in `lib/auth/super-admin.ts` and still gates the grant itself; moving that to a DB role is a separate task.
4. A comment in the invite dialog names the super-admins; it predates this work.
