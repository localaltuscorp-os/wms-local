# 22 — Control Panel simplification and Role UI

**Date:** 26 September 2026
**Migration:** None
**Scope:** Control Panel navigation, role administration, permissions presentation, and retired Master Admin screens

---

## What changed

Control Panel now opens on Roles. Its navigation contains Roles, Permissions,
Effective Access, and Temporary Access. The former Control Panel Users screen
and Users navigation item were removed. Employee records, authentication,
employee UUIDs, role assignments, and permission data remain unchanged.

Roles uses existing `roles`, `role_permissions`, and `employee_roles` data.
It shows only existing basic actions: View, Create, Edit, and Delete. Scope
selectors and other granular role controls are no longer shown. Existing stored
permission rows are not deleted.

Module Access renders every supplied module exactly once. It splits the current
ordered module list into two balanced columns on desktop and one column below
the `lg` breakpoint. Existing grant and revoke actions still write each
checkbox change.

Role membership supports searchable multi-selection. Employee labels use name,
employee code, and email where present. Existing members remain removable chips.
Pending selections remain local until Save changes invokes existing assignment
actions for each selected employee.

Permissions retains Show, View, and Edit semantics. Its module groups are now
distributed into two compact desktop columns and one narrow-screen column.

Master Admin route pages were retired because Control Panel owns these admin
surfaces. The per-employee permissions action module remains for Control Panel
Permissions compatibility, but uses the regular signed-in administrator gate.
It no longer has a `/master-admin` page or navigation entry.

Existing Admin route remains its own module entry and is labelled `Admin Panel`
in module theme metadata.

## Files changed

| Area | Files |
| --- | --- |
| Control Panel entry and navigation | `app/(app)/control-panel/page.tsx`, `components/layout/main-nav.tsx`, `lib/workspaces.ts`, `lib/permissions/catalog.ts` |
| Users removal | deleted `app/(app)/control-panel/users/page.tsx`, deleted `components/control-panel/users-table.tsx` |
| Role UI and employee assignment | `app/(app)/control-panel/roles/page.tsx`, `components/control-panel/roles-client.tsx`, `components/ui/multi-select.tsx`, `lib/queries/control-panel.ts` |
| Role writes | `app/(app)/control-panel/roles/actions.ts` |
| Permissions UI | `app/(app)/control-panel/permissions/page.tsx`, `components/control-panel/permissions-client.tsx` |
| Master Admin retirement | deleted `app/master-admin/page.tsx`, deleted `app/master-admin/layout.tsx`, `app/master-admin/actions.ts`, user-menu and employee-page links |
| Admin Panel label | `lib/module-theme.ts` |

## Database and SQL

No schema, migration, seed data, or permission-row data change belongs to this
change set. Do not run an apply migration for these UI changes.

`SQL/20-verify-control-panel-simplification.sql` is read-only. It inventories
roles, role permissions, employee-role assignments, and legacy Master Admin
capability grants before or after deployment.

## Authorization behaviour retained

- Roles still reads and writes `roles`, `role_permissions`, and `employee_roles`.
- Role checkboxes still call `grantRolePermission` and `revokeRolePermission`.
- Employee assignment still calls `assignRole`; removal still calls `removeRole`.
- Permissions still calls `setModulePermission` for each Show/View/Edit change.
- Effective Access and Temporary Access were not changed.

## Verification

- Focused ESLint passed for Roles and Permissions clients.
- `tsc --noEmit --pretty false` passed.
- Isolated production build passed. Existing Turbopack filesystem-tracing
  warnings remained, but did not fail build.
- `http://localhost:3000/control-panel/roles` returned HTTP 200.
- Full Vitest suite: 5,194 passed, 25 failed, 34 skipped. Failures include
  obsolete Master Admin and Control Panel Users expectations plus unrelated
  existing suites. No failure identified two-column Roles layout.

## Intentionally unchanged

- Permission storage and authorization model.
- Existing role data, employee data, employee codes, and authentication.
- Effective Access, Temporary Access, and Accounts functionality.
- Database schema, migrations, RLS, and seed data.
