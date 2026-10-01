# Om and HR development integration

- **Date:** 2026-10-01
- **Branch:** `integration/om-hr-2026-10-01`
- **Objective:** Integrate Om's latest scoped-access correction and the HR saved-form inline preview into `origin/main`, then verify the wms-local Vercel deployment.
- **Status:** Merged and locally validated; remote push and deployment verification pending.

## Source commits and merge order

1. `d0c8f7e4` from `origin/Om` — return `null` when an employee has no active scoped grants so normal route permissions remain authoritative.
2. `1e348cce` from `origin/bugfix/hr-form-inline-preview` — show a complete saved HR form in a read-only modal inside HR Record.

Both sources were merged with merge commits. Om was merged first and HR second. The changes did not overlap and produced no conflicts.

## Functional changes

- `lib/permissions/scoped-temporary-access.ts`: an empty scoped-grant query now means no restrictive overlay instead of an empty allow-list that blocks routes.
- `app/(app)/hr/record/person-files.ts` and `person-files-types.ts`: return normalized saved form responses through the existing employee-scoped HR loader.
- `components/hr/forms/form-preview-modal.tsx`: provides the dedicated read-only same-page preview, grouped answers, authorised PDF link, and accessible close behavior.
- `components/hr/record/hr-record-screen.tsx`: opens the selected saved form in the modal while preserving the current person and list context.
- `tests/unit/hr-form-inline-preview.test.ts`: covers the inline-preview wiring.

## Database, authorization, and rollback

- Database/migrations: None. The HR preview reads the existing `hr_form_submissions.responses` value.
- Authorization: Existing normal permissions remain authoritative when no scoped grants exist. When grants exist, the restrictive overlay remains active. HR data still passes through the existing `requireHrStaff()` loader and the PDF endpoint retains its own authorization.
- Rollback: revert the integration merge commits (or restore `origin/main` to the pre-integration release through a reviewed revert). No database rollback is needed.
- Production repository: `fork/main` is intentionally untouched.

## Validation

- `pnpm.cmd typecheck`: PASS.
- `pnpm.cmd exec vitest run tests/unit/hr-form-inline-preview.test.ts tests/unit/hr-form-edit-href.test.ts tests/unit/hr-forms-sort.test.ts tests/unit/scoped-temporary-access.test.ts`: PASS, 24/24 tests.
- Changed-file ESLint: PASS with zero errors; four pre-existing warnings remain in `components/hr/record/hr-record-screen.tsx` outside this change.
- `pnpm.cmd build`: PASS (Next.js 16.2.6 production build).
- `pnpm.cmd check:leaks`: PASS; PGlite is absent from the production server bundle (`0 files`, `0 traces`).

## Deployment and remaining work

- Push the reviewed integration branch and promote the same commit to `origin/main`.
- Monitor the wms-local Vercel production deployment to Ready and probe `/`, `/api/health`, `/attendance`, `/my-salary`, and `/hr/record`.
- Record the final development SHA and deployment evidence here after verification.
