# Reporting hierarchy redesign

## Completed

- Rebuilt the Reporting Hierarchy presentation only; the existing employee
  manager query, history, permissions and server actions remain authoritative.
- Added Attendance-style People, Managers and No manager KPI controls as
  filters, with a visible selected state.
- Reordered and restyled Employee Master KPIs: Total Employees, Confirmed,
  Probation, Total Interns, Full-Time Interns, Part-Time Interns. Their existing
  client-side filters are retained.
- Replaced the tabular grid with manager columns and employee cards, retaining
  manager reassignment and manager designation actions.
- Replaced the nested-list tree with a light top-down connected organization
  tree. Direct manager branches use horizontal space; each branch's reports
  stack vertically.
- Ordered every sibling group active first and temporary-break branches last;
  empty-manager groups render at the far right of the root level.
- Used the shared WMS status badge for Active, On break and Inactive.
- Kept inactive people in a separate bottom section and retained empty manager
  columns/nodes.
- Added the canonical stored employee avatar URL to the hierarchy query and
  reused the shared Avatar image/fallback in table cards and tree nodes.

## Changed files

- `components/admin/employee-master/master-table.tsx`
- `components/admin/reporting-hierarchy.tsx`
- `lib/queries/hierarchy.ts`

## Validation

- `pnpm typecheck` passed.
- Focused ESLint passed for all three changed files.
- `git diff --check` passed.

## Notes

- The root comes from the existing `isRoot` value supplied by the canonical
  hierarchy query; no person, relationship or status ordering is hardcoded.
- The worktree contained unrelated changes before this task; they were left
  untouched.
