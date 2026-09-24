# 19 - Employee ID standardization and Control Panel completion

**Date:** 24 September 2026  
**Branch:** `Om`  
**Migration:** No new schema migration. This change reuses the existing
`employee_code_registry` and the already-created Control Panel migration
`0251_control_panel_module.sql`.

## Summary

The user-facing Employee ID is now the human-readable `employees.employee_code`.
The UUID in `employees.id` remains the internal relational key and is still used
by all foreign keys and internal routes.

Control Panel remains a separate top-level module at `/control-panel`; this
change completes its user table and makes Employee Code the displayed Employee
ID there.

## Employee ID changes

- Added `lib/employees/resolver.ts`, the shared Employee Code/Name resolver.
  It resolves Code or Name to the internal UUID and rejects Code/Name
  mismatches or ambiguous names.
- Added `issueSuggestedEmployeeCode()` to
  `lib/employees/code-registry.ts`. It delegates to the existing transactional
  allocator, preserves entity/intern prefixes, starts at the existing sequence,
  and never reuses retired codes.
- Updated `app/(admin)/admin/employees/actions.ts` so normal employee creation
  receives a code immediately. If a paying-entity prefix cannot be determined,
  creation fails clearly rather than creating an uncoded employee.
- Candidate placeholder rows and one-time data-import scripts are intentionally
  not assigned a code until they become valid employees with the required entity
  context. They are not normal employee-creation paths.
- Extended `lib/queries/employees.ts` options with `employeeCode` while keeping
  the UUID as the internal option value.
- Updated `components/incentive/incentive-entries.tsx` so Employee ID dropdowns
  display Employee Codes, never UUIDs.
- Updated salary payslip output and log detail output to display Employee Code
  under the Employee ID label.

## Incentive template and import

- `lib/exports/incentive-entry-template.ts` now generates Employee Code lookup
  values and formulas.
- `app/(app)/incentive/template.xlsx/route.ts` builds the roster from current
  Employee Master rows with non-null Employee Codes.
- `lib/import/incentive-import.ts` validates Employee Code, Employee Name,
  Code/Name consistency, current Product Master products, month/date cells,
  Yes/No fields, and numeric amounts.
- `app/(app)/incentive/admin-actions.ts` resolves references through the shared
  resolver and separates validation from confirmation. Inserts happen only
  after complete validation and inside one database transaction.

## Control Panel

The existing `0251` move is preserved:

- routes are `/control-panel/*`, not `/admin/control-panel/*`;
- Admin Panel navigation no longer owns Control Panel;
- workspace and permission checks enforce access server-side;
- old permission keys are migrated to top-level `control-panel.*` keys;
- unauthorized users do not receive navigation/module links and direct access
  is denied by the workspace gate.

`components/control-panel/users-table.tsx` adds the requested Users view:

- Active users shown by default;
- separate Active and Inactive views;
- search, name sort, and Group By (Function, Designation, Entity, Role);
- columns: S. No., Employee, Employee ID, Function, Designation, Entity, Role,
  Status;
- Employee ID is `employees.employee_code`.

## Files changed for this change set

- `lib/employees/resolver.ts`
- `lib/employees/code-registry.ts`
- `app/(admin)/admin/employees/actions.ts`
- `lib/queries/employees.ts`
- `components/incentive/incentive-entries.tsx`
- `lib/exports/incentive-entry-template.ts`
- `lib/import/incentive-import.ts`
- `app/(app)/incentive/admin-actions.ts`
- `app/(app)/incentive/template.xlsx/route.ts`
- `lib/queries/salary.ts`
- `app/(app)/salary/payslip/[runId]/route.ts`
- `components/admin/logs/log-detail-panel.tsx`
- `components/control-panel/users-table.tsx`
- `app/(app)/control-panel/users/page.tsx`
- existing Control Panel module/navigation/permission files listed in
  [`17-control-panel-module.md`](./17-control-panel-module.md)

## Verification

- `npm run typecheck` passed.
- `npm test -- --run tests/unit/incentive-employee-viewer.test.ts` passed (31/31).
- Control Panel module tests otherwise pass; one stale assertion still expects
  the removed Admin Overview node for old Admin routes.
- `git diff --check` passed.
- Local server: `http://localhost:3001`.

## Operational notes

Run [`SQL/19-apply-employee-id-and-control-panel.sql`](./SQL/19-apply-employee-id-and-control-panel.sql)
against another database only if the Control Panel permission-key migration has
not already been applied. Then run the read-only verification script. Missing
Employee Codes must be resolved through the application code-registry flow so
prefix selection, locking, history, and retirement rules are preserved.
