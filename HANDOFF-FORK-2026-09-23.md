# Fork Main Handoff - 23 September 2026

## Delivery state

- Repository: `localaltuscorp-os/Altus-OS`
- Branch: `main`
- Delivered commit before this handoff: `75cc69bf`
- This delivery combines Shreya's Goals work, Vinal's dashboard/navigation
  work, Om's incentive/salary/logs/control-panel work, the post-merge
  TypeScript fixes, and the corrected incentive migration.
- The older local `HANDOFF-2026-09-22.md` was not included because its branch
  and delivery status are stale. The broader combined implementation handoff is
  `HANDOFF-MAIN-2026-09-23.md`.

## Integrated work

### Shreya

- Goals Review and Goals Approve workspace redesigns.
- Status metrics, week/fiscal controls, compact search, sorting, pagination,
  full-screen mode, and inline employee-goal review.
- Development-only Goals Approve preview fallback remains a follow-up for
  removal when real reporting relationships are available.

### Vinal

- Attendance, leave, reimbursement, operations, goals, queries, and compliance
  dashboard refreshes.
- Operations dashboard route and HR query notification inbox.
- Main navigation, sidebar, workspace, DCC, HR, and operations navigation
  updates.

### Om

- Incentive product master, applicability, workflows, payments, analytics,
  notifications, and My Incentives.
- Salary slip/statement PDFs, reimbursement earnings, and incentive payout
  integration.
- Global activity logs, sessions, exports, filters, and admin screens.
- Access Control and Control Panel roles, permissions, effective access,
  visibility grants, users, and temporary access.
- Standardized import/download templates and employee-type/intern/probation
  administration.

## Merge and TypeScript fixes

- Om's two textual conflicts were resolved in the HR management-assessment
  screen and `db/schema.ts`.
- Duplicate broadcast fields and duplicate task-board selections created by
  automatic merge composition were removed.
- Full TypeScript validation passed with zero errors using:

  ```powershell
  node --max-old-space-size=8192 node_modules/typescript/bin/tsc --noEmit --pretty false
  ```

- Targeted lint passed.
- The focused feature suite passed 131 tests.
- Task visibility and task-stat tests pass. The broader route-handler coverage
  test still reports 34 guarded routes without permission-node ownership; that
  permission-catalog gap remains open.

## Production database

- Correct Supabase project: `fjopgyqytfvbudkwhdto`
- SQL Editor:
  `https://supabase.com/dashboard/project/fjopgyqytfvbudkwhdto/sql/new`
- The earlier `app.is_admin()` discriminator is not valid for this deployment;
  it returns `NULL` on this production project.
- Do not use `pnpm db:migrate` against production because this repository has
  duplicate numeric migration prefixes.
- Do not use `Change-made/SQL` apply files; their project guidance is stale.

Run these exact migrations individually and in order, checking for success
after every file:

1. `db/migrations/0242_visibility_grants.sql`
2. `db/migrations/0243_incentive_product_master_rows.sql`
3. `db/migrations/0244_incentive_applicability_and_intern_type.sql`
4. `db/migrations/0245_global_logs.sql`
5. `db/migrations/0246_control_panel.sql`
6. `db/migrations/0247_activity_logs_allow_fk_null.sql`

### Reported database state

The latest verification supplied during delivery showed:

- `visibility_grants`: present
- `daily_sessions`: present
- `activity_logs`: present
- `roles`, `role_permissions`, `employee_roles`: present
- activity-log employee-delete trigger fix: present
- dated `incentive_eligibility` repair: present
- `incentive_function_scope`: not yet present at the time of verification
- `employees.employee_type`: not yet present at the time of verification
- `incentive_catalog.applicability`: not yet present at the time of verification

Therefore migration `0244` was not yet confirmed complete. Its first attempt
failed because the legacy eligibility table lacked `removed_effective_from`.
Commit `75cc69bf` corrects the migration so it upgrades that legacy table before
creating its indexes. Rerun the complete corrected `0244` file, then verify it.

The state of the three product rows from `0243` was not independently reported;
rerunning `0243` is safe because its inserts are idempotent.

## Post-migration verification

```sql
select
  to_regclass('public.visibility_grants') as visibility_grants,
  to_regclass('public.incentive_function_scope') as incentive_function_scope,
  to_regclass('public.daily_sessions') as daily_sessions,
  to_regclass('public.activity_logs') as activity_logs,
  to_regclass('public.roles') as roles,
  to_regclass('public.role_permissions') as role_permissions,
  to_regclass('public.employee_roles') as employee_roles,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'employees'
      and column_name = 'employee_type'
  ) as employee_type_exists,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'incentive_catalog'
      and column_name = 'applicability'
  ) as applicability_exists,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'incentive_eligibility'
      and column_name = 'removed_effective_from'
  ) as dated_eligibility_exists;
```

All table names must be non-null and all Boolean values must be `true`.

## Release checks

1. Confirm corrected migration `0244` completes and verification is all green.
2. Confirm the three products from `0243` exist in Product Master.
3. Run CI TypeScript, lint, and the complete unit-test suite.
4. Smoke-test Goals Review/Approve, Attendance/Leave, Reimbursements,
   Operations, HR Queries, Incentives, My Salary, Admin Logs, Control Panel,
   and responsive navigation.
5. Verify monthly salary-slip and log-finalization scheduled routes before
   enabling production schedules.
