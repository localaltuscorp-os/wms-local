# Employee editor compact details UI

## Objective

Rework employee edit dialog presentation to match compact configuration-form
reference while preserving fields, validation, permissions and save paths.

## Completed

- Traced attached screen to `EmployeeEditor`, which owns Function multi-select,
  task role, manager, attendance schedule and save behavior.
- Kept `editEmployee`, `updateEmployeeAttendanceSchedule` and bulk save paths.
- Tightened dialog, section cards, fields, controls and footer.
- Removed schedule requirement/fallback prose and duplicate schedule summary.
- Kept every editable control and compacted permission/consent labels.
- Added an opt-in compact style to Function multi-select; other consumers keep
  their existing layout.

## Changed files

- `components/admin/employee-editor/index.tsx`
- `components/admin/employee-editor/primitives.tsx`
- `components/admin/employee-editor/schedule-fields.tsx`
- `components/admin/department-multi-select.tsx`

## Database and access

None. Existing server actions and permission gates unchanged.

## Validation

- `pnpm typecheck` passed.
- Focused ESLint passed.
- `pnpm test -- tests/unit/employee-editor-bulk.test.ts` passed.
- `git diff --check` passed.

## Remaining

- Verify final visual density in browser using a standard employee and bulk-edit
  dialog before release.
