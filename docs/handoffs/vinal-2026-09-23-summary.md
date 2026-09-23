# Vinal Branch Delivery Summary — 23 September 2026

## Copy-ready management summary

Today the Vinal branch was refreshed with the current `wms-local` main branch and prepared for release. The main delivery improves Operations, Goals, employee dashboards, and navigation while also carrying the already-merged Incentive, Salary, Global Logs, Access Control, and Control Panel work.

### Delivered today

1. **Goals dashboard**
   - Reworked the dashboard into compact, interactive sections for yearly, quarterly, monthly, weekly, and daily goals.
   - Added a clearer date selector with Day, Range, Month, and Financial Year options.
   - Replaced goal-card lists with scrollable tables: Goal, Progress, Period, Area, Attainment, Pace, and Status.
   - Added Transpose, table-only maximize/minimize, sticky headers, horizontal/vertical scrolling, and a Load more pattern after 10 goals.
   - Rebuilt the Yearly Pulse, made Quarterly use the full available width, removed redundant monthly progress strips, and added per-goal progress bars for Weekly goals.
   - Applied the WMS dashboard’s light KPI palette and aligned Daily Commitments as a full-height graph with KPI cards.

2. **Operations workspace**
   - Added the Operations Command Center dashboard.
   - Changed **New JD** to open in a focused dialog instead of taking users to a full-page form.
   - Removed explanatory copy that was creating visual clutter in Job Description, Checklists, Masters, Event Masters, and person-specific JD screens.
   - Simplified the JD creation form and aligned the frequency field with the shared UI.

3. **Accounts and employee experience**
   - Updated the Accounts sidebar sequence: Index, Weekly CC, Monthly CC, Due Dates Master, Salary, Salary Slip, Overtime, Reimbursement, MIS, KYC Documents, Accounts Manual, and Important Links.
   - Made MIS expandable only when selected and moved Collection Master to Billing.
   - Updated the employee compliance dashboard to match the WMS colour system, with clearer status and completion colours.

4. **Branch integration and stability**
   - Confirmed that the current `origin/main` is already included in Vinal; no conflicts or outstanding main changes remain.
   - Included the merged Incentive, Salary, Global Logs, Control Panel, Access Control, employee administration, templates, task visibility, Goals Review, and Goals Approve work documented in `HANDOFF-MAIN-2026-09-23.md`.

## Database / SQL work

No SQL was run from this machine during this delivery. The following migrations are part of the branch and must be reviewed and applied to the correct production database in numeric order before production verification:

| Migration | Purpose |
|---|---|
| `0242_visibility_grants.sql` | Adds access-control visibility grants for Tasks and Incentives. |
| `0243_incentive_product_master_rows.sql` | Adds Key Note, 2-Day Workshop, and Inhouse PS to the product master. |
| `0244_incentive_applicability_and_intern_type.sql` | Repairs the Incentive eligibility schema drift; adds applicability scopes, function mapping, employee type/internship fields, and related validation. |
| `0245_global_logs.sql` | Adds daily sessions and append-only activity logs with performance indexes. |
| `0246_control_panel.sql` | Adds roles, role permissions, employee-role assignments, and the Control Panel data model. |
| `0247_activity_logs_allow_fk_null.sql` | Preserves append-only logs while allowing employee/session deletion to anonymise their foreign keys. |

Use the repository migration files directly, not the superseded files under `Change-made/SQL/`. Confirm the target Supabase project and migration ledger before applying anything.

## Files changed for this UI delivery

### Goals and employee dashboards

- `components/goals/dashboard/goals-dashboard-filters.tsx`
- `components/goals/dashboard/goals-overview-dashboard.tsx`
- `components/compliance/dashboard/compliance-dashboard-view.tsx`

### Operations

- `app/(app)/operations/dashboard/page.tsx`
- `app/(app)/operations/job-description/page.tsx`
- `app/(app)/operations/checklist/page.tsx`
- `app/(app)/operations/masters/page.tsx`
- `app/(app)/operations/masters/jd/page.tsx`
- `app/(app)/operations/masters/checklist/page.tsx`
- `app/(app)/operations/masters/events/page.tsx`
- `components/operations/operations-command-center.tsx`
- `components/operations/job-description/jd-bank.tsx`
- `components/operations/job-description/jd-frequency-field.tsx`
- `components/operations/job-description/person-jd-workbench.tsx`
- `components/operations/masters/masters-header.tsx`

### Navigation and database

- `components/layout/main-nav.tsx`
- `db/migrations/0244_incentive_applicability_and_intern_type.sql`

For the complete merged main inventory, see `HANDOFF-MAIN-2026-09-23.md`.

## Validation completed

| Check | Result |
|---|---|
| Latest `origin/main` included | Passed — Vinal already contains current main. |
| TypeScript | Passed: `npm run typecheck`. |
| Full lint | Passed with 0 errors; 409 pre-existing warnings across unrelated modules. |
| Goals browser smoke test | Passed: KPI cards, date filter, progress tables, transpose, daily graph, and table size control. |
| Full unit suite | 5,130 passed, 34 skipped, 24 failures in unrelated auth, permissions, backup, WCC/MCC, incentive, salary, and filter tests. No failure names the Goals or Operations files changed in this delivery. |

## Delivery status

- Branch: `Vinal`
- Delivery commit: `0f42bc9b` — `feat: refine operations, goals, and employee dashboards`
- Main baseline: `5da93849`
- Ready to push to `origin/Vinal`; production deployment remains subject to the database migration review and the existing unrelated unit-test failures.
