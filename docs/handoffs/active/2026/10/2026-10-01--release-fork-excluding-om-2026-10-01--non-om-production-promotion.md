# Non-Om production promotion handoff

- Date: 2026-10-01
- Work item: `release/fork-excluding-om-2026-10-01`
- Status: In progress

## Objective

Prepare a production release candidate from `fork/main` containing only the approved non-Om fixes currently unique to Development.

## Base and selected source commits

- Base: `fork/main` at `498eaa8c`.
- Selected: `1e348cce` (HR inline form preview), `3913a92f` (global top-bar titles), and `5a743948` (reimbursement required fields).

## Explicit exclusion

- Exclude Om commit `d0c8f7e4` and its merge `0537c955`; neither is to be promoted in this release.

## Boundaries

- No direct modification to `fork/main` until the release candidate is reviewed and validated.
- No database migration is included by the selected commits.
- No Vercel or GitHub setting change.

## Applied candidate changes

The selected commits applied cleanly to this release candidate. The staged application changes are limited to the HR inline form preview, global top-bar title fallback, and reimbursement request-field fallback. The original handoffs for each selected change are included unchanged.

## Validation

- Targeted tests passed: `58/58` across the HR inline-preview, Aura top-bar, and reimbursement attachment suites.
- `git diff --check` and staged diff checking passed.
- Full TypeScript validation completed with no diagnostics.
- Targeted ESLint completed with zero errors. It reports four existing React-hook warnings in unchanged portions of `components/hr/record/hr-record-screen.tsx`; those lines predate the selected HR commit and are outside this release diff.
- No migration, SQL, authorization, Vercel, or GitHub configuration change is part of this candidate.

## Next step

Review the staged release diff and commit the candidate. Do not promote to `fork/main` until the release commit, final ancestry check, and release evidence are complete.
