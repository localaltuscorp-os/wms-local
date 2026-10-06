# HR form inline read-only preview

- **Date:** 2026-10-01
- **Branch:** `bugfix/hr-form-inline-preview`
- **Objective:** Open a selected person's complete saved HR form inside the HR Record screen instead of relying on navigation to `/hr/forms/[id]`.
- **Status:** Implemented, validated, and pushed as `1e348cce` on `origin/bugfix/hr-form-inline-preview`; included in the Om + HR integration.

## Current behavior and root cause

The HR Record list contained only submission metadata and linked View to a separate route. The saved answers were present in `hr_form_submissions.responses`, but they were not included in the employee-scoped loader, so the existing screen could not render a complete form itself.

## Changes

- `app/(app)/hr/record/person-files.ts` now selects and returns the saved responses while retaining its existing HR-staff gate and selected-employee filter.
- `app/(app)/hr/record/person-files-types.ts` carries the normalized read-only question/answer rows.
- `components/hr/forms/form-preview-modal.tsx` renders grouped responses, supports overlay/Escape/close-button dismissal, and retains the authorised PDF download.
- `components/hr/record/hr-record-screen.tsx` opens View in the modal without leaving the selected employee's record.
- The standalone `/hr/forms/[id]` route and Edit links remain unchanged for other entry points.

## Database, security, and rollback

- Database/migration impact: None. This reads the existing `responses` JSONB field.
- Access impact: None. Data still comes exclusively from the existing `requireHrStaff()` employee-scoped server loader; the PDF endpoint keeps its own authorization check.
- Rollback: revert this bugfix commit. No data rollback is required.

## Validation

- `pnpm.cmd typecheck`: PASS.
- `pnpm.cmd exec vitest run tests/unit/hr-form-inline-preview.test.ts tests/unit/hr-form-edit-href.test.ts tests/unit/hr-forms-sort.test.ts`: PASS, 20/20 tests.
- Changed-file ESLint: PASS with zero errors. It reports four pre-existing warnings in `hr-record-screen.tsx` outside this change.
