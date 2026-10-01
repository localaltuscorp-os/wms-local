# Om, Rudra, and Vinal development integration

- **Date:** 2026-09-30
- **Branch:** `integration/om-rudra-vinal-2026-09-30`
- **Objective:** Integrate the requested `origin/Om`, `origin/Rudra`, and `origin/Vinal` deliveries into current `origin/main` without including other outstanding branches.
- **Status:** Validated for Development Repository integration; not promoted to production.
- **Source tips:** `origin/Vinal` `b6ea842b`, `origin/Rudra` `7975e980`, and `origin/Om` `0c581e5c`.
- **Validated integration history:** initial validation `73db6b77`; latest-tip merges `ed71edf4` and `9ee533dc`.

## Integrated scope

- Vinal: Accounts/HR/candidate workflow and UI improvements, Accounts KYC support, compensation approvals, and Altus hub-branding correction.
- Rudra: Holiday administration/access, Client Engagement and executive-calendar UI changes, and digit-only phone inputs.
- Om: Admin dropdown master, training/billing/incentive cleanup, role expiration, scoped temporary access, centralized template configuration, vendor categories, and temporary-break workforce controls.

## Conflict resolution

- `components/dossier/onboarding-form.tsx`: retained Vinal's ten-digit HTML validation and Rudra's digit-only normalization.
- `components/hr/candidate/intake-field.tsx`: retained Vinal's shared phone-field detection/pattern and Rudra's digit-only behavior.
- `components/hr/candidate/management-assessment-screen.tsx`: added the missing `assignment_needed` display label required by the integrated outcome-map type.
- `components/admin/admin-nav-config.ts`: retained Om's compact navigation structure and added Vinal's Approvals destination.
- `components/operations/directory/vendor-directory.tsx`: retained Rudra's digit-only phone behavior and stacked actions while adopting Om's company/WhatsApp/category fields.
- Latest Om compile blockers were corrected in employee KPI filters, hierarchy root typing, temporary-break toast calls, and template metadata/database loading.

## Database and migration impact

- `0256_accounts_kyc_documents.sql`: Vinal Accounts KYC tables.
- `0257_role_assignment_expiration.sql`: Om role assignment expiry; renumbered from branch-local `0253` because current main already contains a different `0253` migration.
- `0258_scoped_temporary_access.sql`: Om scoped access tables; renumbered from branch-local `0254` because current main already contains a different `0254` migration.
- `0259_compensation_approval_workflow.sql`: Vinal compensation approval workflow; renumbered from branch-local `0256`.
- `0260_template_field_configs.sql`: Om centralized template-field configuration; renumbered from branch-local `0256`.
- `0261_vendor_category_master.sql`: Om managed vendor categories; renumbered from branch-local `0257`.
- `0262_employee_temporary_breaks.sql`: Om workforce temporary-break records; renumbered from branch-local `0258`.
- No SQL was executed. Apply migrations in numeric order before deploying code that depends on them.
- Rollback is application revert plus database-owner-reviewed reversal; the migrations are additive and must not be casually rolled back after data is written.

## Validation

- Full unit suite after the latest tips: 5,206 passed, 27 failed, and 34 skipped across 396 files. Two template suites initially failed during import; the imports were corrected and their focused rerun passed 53/53.
- Changed-test set: 339 passed and 3 stale Control Panel expectations failed. The failures expect the removed `/control-panel/users` screen and its permission node, while Om intentionally makes Roles the landing and removes that node.
- TypeScript found and prompted fixes for the integrated Vinal assessment label and latest Om workforce/template typing issues. Final rerun passed.
- Optimized Next.js production build: passed (compiled, TypeScript, page-data collection, and 36 static pages).
- Full ESLint run: passed with 0 errors and 407 existing warnings.
- `pnpm check:leaks`: passed; all watched packages clean, including zero PGlite source and NFT traces.

## Known issues

- The full repository suite still has unrelated/stale failures. Three failures in the changed-test selection are stale Control Panel assertions for intentionally removed Users/effective-access screens; the application build and TypeScript contracts use Roles as the current landing.
- Existing build warnings about broad NFT tracing and dynamic cookie access remain; they did not fail the build and were not introduced or expanded as part of conflict resolution.

## Security and access impact

- Om changes role expiry, temporary access resolution, and Control Panel permission UI.
- Rudra changes holiday administration authorization.
- These are security-sensitive paths; production promotion requires explicit release approval after development validation and migration review.

## Excluded branches

- `origin/Shreya` had no remaining file diff against main.
- `origin/mobile-web-login-devices` and `origin/docs/repository-policy` were explicitly not included.
