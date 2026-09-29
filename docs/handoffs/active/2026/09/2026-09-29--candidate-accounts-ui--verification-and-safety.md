# Candidate and Accounts UI verification handoff

- **Date:** 2026-09-29
- **Work item:** candidate-accounts-ui
- **Status:** Local changes verified where the local environment permits; not committed or deployed.

## Objective

Complete and verify the requested Accounts, Attendance, Overtime, Incentive, Salary, and Candidate Interview Form improvements.

## Summary

- Accounts tracker, shares, income-tax, SIP, and FNO screens use compact inbox-style tables, search/filter controls, row actions, and modal add/edit forms where requested.
- Loan and share serial numbers are calculated from the current highest numerical row code.
- SIP and FNO creation records the amount in the selected month.
- Candidate validation requires confirmed completion before Review and Submit, validates the mobile number, supports City/State selection, makes Family Details optional, and safely resolves uploaded photos in edit and review views.
- Attendance, Overtime, Incentive, and Salary layouts are compacted; Salary defaults to the active month rather than silently showing an earlier month.
- Vasa Family KYC Documents now has a schema migration, page, query, and guarded CRUD UI.
- CA Handover retains the existing super-admin-only credential-vault boundary. Unauthorized Accounts users now see an explanatory restricted page rather than being redirected to Home.

## Main files

- Accounts: `components/accounts/**`, `app/(app)/accounts/**`, `lib/accounts/**`, `db/migrations/0256_accounts_kyc_documents.sql`, `lib/queries/accounts-kyc.ts`.
- Candidate interview: `components/hr/candidate/**`, `app/(app)/hr/candidate-actions.ts`, `app/candidate/candidate-self-actions.ts`, `lib/hr/candidate/**`.
- Layouts: `app/(app)/attendance/**`, `components/attendance/**`, `app/(app)/overtime/**`, `components/overtime/**`, `app/(app)/salary/**`, `components/salary/**`.

## Database and access impact

- Apply `db/migrations/0256_accounts_kyc_documents.sql` before using the KYC Documents screen.
- No access boundary is intentionally widened. CA Handover password access remains super-admin-only; Accounts access is required for the broader Accounts module.

## Verification

- Passed: focused Vitest suite — 9 files, 123 tests.
- Passed: focused ESLint checks for changed Candidate and CA-Handover code (one existing image-optimization warning remains in the wizard).
- Passed: `git diff --check`.

## 2026-09-29 follow-up: Onboarding attachments and Employee Dossier uploads

- Onboarding file controls now show an explicit **Remove** action for a newly selected or already saved attachment. Existing storage objects are removed only after the submission row saves successfully; a failed save leaves the previous document intact.
- Address Proof choices are reversible: Aadhaar, Electricity Bill, and Other can be deselected. Clearing Other also clears its explanation, and Passport / Driving Licence choices can be toggled off instead of becoming stuck.
- Emergency Contact mobile input strips non-digits, caps at ten digits, and requires exactly ten digits before a contact counts toward the required two contacts. The server validates the same rule, including crafted submissions that bypass the browser.
- The shared Employee Dossier Add Document dialog now retains the selected ISO date when submitted and has a Remove action for a selected local file. Because every document-type + button opens this same dialog, the fix applies across the Dossier.
- The Employee Dossier detail header now includes a visible **Back to Employees** action instead of an icon-only back control.

### Verification for this follow-up

- Passed: `npx vitest run tests/unit/onboarding-emergency-contact.test.ts tests/unit/onboarding-responses.test.ts --no-file-parallelism` — 2 files, 14 tests.
- Passed: focused ESLint for all five changed onboarding/Dossier modules and the new unit test — 0 errors; one pre-existing `set-state-in-effect` warning remains in `upload-dialog.tsx`.
- Passed: `git diff --check`.
- `npx tsc --noEmit --pretty false` exceeded the 60-second command limit without emitting a TypeScript error. Manual authenticated browser testing remains blocked by the existing local database connection failure.
- Passed: Candidate Records and intake validation tests — 2 files, 6 tests. This covers the email-domain search regression and ten-digit mobile validation.
- The repository-wide Vitest suite is not currently green: it reported unrelated established navigation/authorization failures before the 60-second command limit.
- Full ESLint and TypeScript checks exceeded the environment's 60-second command limit without producing an error.
- Browser/database flows could not be exercised because the local authenticated server logs database connection failures. Resolve the local database connection, then exercise the Accounts and Candidate flows manually.

## 2026-09-29 follow-up: Candidate Records and Evaluation Checklist

- Family Details phone uses the same digits-only, maximum-ten-digit input handling as the candidate mobile field; dictation is intentionally unavailable for phone values.
- Candidate Records search no longer searches the email domain, preventing short text such as `om` from matching every `.com` address. Its page shell is full-width so the table no longer leaves an avoidable left gutter.
- The Evaluation Checklist uses a wider workspace. When its section rail is collapsed, the grid now reserves 64px rather than the expanded 240px, removing the blank middle column. Eligibility and rating rows have a clearer responsive content/control split; expanded row notes now use a consistent, comfortably sized textarea.
- Follow-up lint has no errors. It still emits existing React hook/ref warnings in `evaluation-v2-screen.tsx`; the full TypeScript command exceeded the 60-second environment limit without reporting an error.

## 2026-09-29 follow-up: Management Assessment continuity and layout

- Management Assessment now uses the wide shared page shell and a responsive index/workspace grid, removing the constrained central column that made the assessment appear undersized.
- The Management Assessment link keeps the same candidate and still opens the independent management role. If that management role has not started, its Evaluation Checklist now displays a cloned interviewer pass as a starting point. The clone is not written during the read; the first management edit saves it as a separate management pass, leaving the interviewer pass unchanged.
- Added pure unit coverage for existing management data, interviewer-to-management seeding, and the empty starting state. Focused test command passed: 3 files, 9 tests.

## 2026-09-29 follow-up: Recruiter outcome, attachments, legacy intake, and letters

- Management Assessment now maps `free_training` and `assignment_needed` to the existing active candidate pipeline status (`shortlisted`) while retaining the exact management outcome in the assessment data. This prevents the client-side `Invalid status` error without introducing new database statuses.
- Recruiter outcome emails support every Management Assessment outcome, retain server-side HR authorization/rate limiting, and require an outcome plus a syntactically valid recruiter email in the UI.
- Attachments use one upload surface and each saved file has a signed, user-facing **Open** action. The interface states that files are stored with the candidate's management assessment; it does not disclose private storage paths.
- Editing a submitted candidate intake snapshots only the required keys that were blank at load time. Newly introduced fields, including Job Details, no longer retroactively invalidate the submitted form, while clearing a field that was originally present still fails validation. Completed active rail sections retain their green tick.
- Clearing the candidate or employee picker in the letter editor restores the template defaults for fields populated by that picker, so the `Dear` recipient and employee details do not remain stale.

### Verification for this follow-up

- Passed: focused ESLint on the Management Assessment, recruiter-email action/template, intake wizard/rail, and letter editor; no lint errors. Existing React-ref/image optimization warnings remain in modified legacy components.
- Passed: `vitest run tests/unit/candidate-intake-validation.test.ts tests/unit/candidate-search.test.ts tests/unit/evaluation-v2-instance.test.ts` — 3 files, 9 tests.
- Passed: `git diff --check`.
- Full `tsc --noEmit --pretty false` did not finish within the 60-second environment limit and emitted no TypeScript error before the timeout. Browser/database verification remains blocked by the local authenticated server's database connection failure.

## Deployment and rollback

- These changes are uncommitted local work on branch `Vinal`; they are not visible on hosted environments until reviewed, committed, and deployed through the Development Repository workflow.
- Rollback is by reverting the isolated development commit(s). The KYC migration is additive; do not remove it from an environment once records exist.

## 2026-09-29 follow-up: Post-Appointment letters and Policies workspace

- The shared letter picker now recognises `candidateName`, `recipientName`, and `internName` as recipient fields. Selecting or clearing a candidate updates every declared recipient field, so Intern Appointment and Minor Intern Undertaking show the chosen candidate instead of a stale employee name.
- Intern-only letters no longer expose the Employee picker. Selecting a candidate also detaches a prior employee, restoring employee-supplied values and the template entity defaults so email/export cannot use a stale employee record.
- Clearing an employee restores the template defaults for its populated fields; clearing the Paying Entity restores the template's default entity words rather than retaining the prior entity in the letter body.
- The structured Director signature fallback now uses the shared transparent proprietor PNG, matching the rich-letter path and preventing the legacy JPG/photo-like signature from appearing.
- The rich editor's inline Highlight and Insert Table panels remain shared by every letter type, so the overlap fixes apply to Appointment, Intern Appointment, Undertaking, and the other letter templates.
- The Policies list now uses a wider workspace and a three-column desktop grid. Individual policy pages use the shared wide shell and surface **Back to Policies** / **Edit Policy** inside the main policy body instead of the global header.

### Verification for this follow-up

- Passed: focused ESLint for the letter editor/rich editor and Policies pages/components (0 errors). Five existing warnings remain: four React state-in-effect warnings in legacy editor code and one existing internal navigation warning in `policy-view.tsx`.
- Passed: `vitest run tests/unit/letter-rich-entity.test.ts tests/unit/letter-order.test.ts tests/unit/letter-fit.test.ts tests/unit/letter-issue-access.test.ts tests/unit/hub-letter-shortcuts.test.tsx --no-file-parallelism` â€” 5 files, 60 tests.
- Browser/database verification remains blocked by the existing local authenticated server database connection failure. These are uncommitted local changes and are not visible on a hosted environment until reviewed, committed, and deployed through the Development Repository workflow.

## 2026-09-29 follow-up: Policy upload, search, and editor navigation

- Selecting **Other** in the uploaded-policy Category picker now requires an 80-character custom category name. The value is kept in reversible metadata inside the existing `documents.description` field, removed from the visible description when read, and shown as an `Other:` label on the saved upload. This avoids a policy-only database migration for an optional field.
- The upload dialog retains the selected local file and offers **View** and **Delete** before upload. Saved uploads now use explicit **View file** and **Delete** actions; storage URLs remain signed server-side and delete authorization remains unchanged.
- The Policies workspace includes a Search control that filters firm policies and uploaded policy title, category, description, and file name.
- Policy Editor has in-body **Back to Policies** and **View Live Policy** actions. Long summary and paragraph fields use the existing browser dictation hook, which appends speech-to-text without publishing automatically and retains existing browser permission/secure-origin safeguards.

### Verification for this follow-up

- Passed: focused ESLint for policy upload actions, list/editor UI, shared policy helpers, and editor route (0 errors). Two pre-existing React hook/ref warnings remain in `policy-editor.tsx`.
- Passed: `vitest run tests/unit/policy-custom-category.test.ts tests/unit/letter-rich-entity.test.ts --no-file-parallelism` — 2 files, 5 tests.
- Browser/database verification remains blocked by the existing local authenticated server database connection failure. No migration or authorization change is required.

## 2026-09-29 follow-up: Letter free-edit controls and entity/signature consistency

- The letter settings bar is now split into a wrapping selection group and a separate action group, preventing picker/action overlap at medium widths.
- Rich-letter colour, highlight, link, and table tools open in an inline panel below the toolbar rather than an absolute popover inside a horizontally scrolling strip. This keeps the panel visible, prevents overlap with the letter, and removes the unneeded alignment/line-spacing controls while retaining the required table tool.
- Link insertion now uses an accessible inline URL field, normalizes an omitted web scheme, rejects unsupported protocols, and gives clear feedback when no usable text/cursor location exists.
- Changing Paying Entity updates the declared entity field used by Selection and Assignment letters. A new Selection Letter now starts with its default letterhead and body entity aligned.
- Rich signatory replacement uses the template's declared signature image and repairs older saved markup so the image appears before the signer name, designation, date, and place. This applies to Selection and Assignment templates without changing template data or access rules.

### Verification for this follow-up

- Passed: `vitest run tests/unit/letter-rich-entity.test.ts tests/unit/letter-order.test.ts tests/unit/letter-fit.test.ts tests/unit/letter-issue-access.test.ts tests/unit/hub-letter-shortcuts.test.tsx --no-file-parallelism` — 5 files, 60 tests.
- Passed: focused ESLint for the two letter editor components, Selection template, and added unit test — no errors. Four pre-existing React set-state-in-effect warnings remain in the editor components.
- Passed: `git diff --check`.
- No database, migration, authorization, or external API changes. Manual authenticated browser testing remains blocked by the existing local database connection failure; verify the editor interactions after restoring that environment.

## 2026-09-29 follow-up: During Employment and Exit Interview navigation

- The shared HR letter editor now synchronizes picker-generated values into an active **Edit freely** document. Selecting or clearing an employee therefore changes the visible rich letter as well as the structured fields, while retaining unrelated manual wording and formatting edits.
- Employee selection clears an earlier candidate attachment and recipient metadata; clearing an employee restores the declared template defaults, including any company/entity field it populated. Employee-only documents show **Employee recipient** so it is clear that no candidate detail is used for that letter.
- Director-signed rich letters use the shared transparent Manan signature PNG. The focused rich-letter unit test asserts that the legacy JPEG is not used for a Director-signed management letter.
- The shared rich toolbar/panels continue to serve Declaration, After Free Training, Employee of the Month, Birthday, resignation, probation, promotion, increment, CTC, and exit-letter templates; table and highlight controls remain inline below the toolbar rather than overlapping the letter.
- Both Director Exit Interview and Handover & Clearance forms now expose **Back to Exit Interview & Handover** at the top as well as the existing persistent bottom action bar.

### Verification for this follow-up

- Passed: `npx vitest run tests/unit/letter-rich-entity.test.ts tests/unit/letter-order.test.ts tests/unit/letter-fit.test.ts --no-file-parallelism` — 3 files, 15 tests.
- Passed: focused ESLint — 0 errors. Existing React hook/ref warnings remain in the letter and Exit form components.
- Passed: `git diff --check`.
- Authenticated browser/database verification remains blocked by the local database connection failure.

## 2026-09-29 follow-up: Post-Interview policy delivery and Evaluation Checklist entry

- Candidate Records now opens the active Evaluation Checklist with the clicked candidate fixed in context, rather than the retired read-only record. Reviewers can record ratings and use the new **Back to Candidate Records** control.
- Legacy evaluation-record URLs redirect to the same active checklist, preserving bookmarked links and access checks.
- Candidate policy/form email dispatch now requires a provider message id before the UI can present it as accepted. A provider failure leaves the private link available and shows the existing manual-send warning; a successful panel identifies the runtime recipient address.
- Local configuration has a mail API key but no explicit `RESEND_FROM_EMAIL` setting. Configure a verified sender in the intended environment and perform a real inbox delivery test; this is configuration ownership, not a database or code migration.

### Verification for this follow-up

- Passed: `vitest run tests/unit/candidate-intake-validation.test.ts tests/unit/candidate-search.test.ts tests/unit/candidate-merge.test.ts tests/unit/evaluation-v2-instance.test.ts --no-file-parallelism` — 4 files, 28 tests.
- Passed: focused ESLint for the Post-Interview list, evaluation route/screen, invite action/dialog, and mailer — no errors. Existing hooks/ref warnings remain in `evaluation-v2-screen.tsx`.
- Passed: `git diff --check`.
