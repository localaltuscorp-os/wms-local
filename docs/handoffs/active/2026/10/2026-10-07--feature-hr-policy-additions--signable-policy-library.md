# Signable HR policy library additions

- Date: 2026-10-07
- Branch: `feature/hr-policy-additions`
- Status: implementation committed; validation, review and release steps pending
- Implementation commit: `28e5686a7d294d5ef2420b4df442ac83e4852d36`
- Review branch: `origin/feature/hr-policy-additions`

## Objective

Add three organisation-wide, read-and-sign HR policies to the existing Policies workspace, using the same versioned acknowledgement flow as the existing POSH policy.

## What changed

- Added code-authored baseline policy documents for Employee Travel & Railway Pass, Company Asset Management, and Attendance & Leave Recording.
- Registered all three policies as ready cards in the existing policy registry so they appear in the Policies workspace and open through the generic policy route.
- Added initial effective dates and sequential document-control codes as editable defaults:
  - Asset Management: 1 July 2026, `HR-POL-008`
  - Travel & Railway Pass: 1 October 2026, `HR-POL-007`
  - Attendance & Leave Recording: 1 October 2026, `HR-POL-009`

## Files changed

- `lib/hr/policies/content/employee-travel-railway-pass-policy.ts`
- `lib/hr/policies/content/company-asset-management-policy.ts`
- `lib/hr/policies/content/attendance-leave-recording-policy.ts`
- `lib/hr/policies/registry.ts`

## Data, security and release notes

- No database schema changes are required.
- The policies fall back to their code-authored baseline immediately, but the existing CMS needs its idempotent seed operation after deployment to create editable `policy_documents` and `policy_versions` records. Use `scripts/seed-policy-cms.ts` against the intended database.
- No automated travel reimbursement, asset monitoring, payroll deductions, leave deductions, or attendance changes were added. These are policy documents and acknowledgement records only.
- The policy documents must be reviewed by HR/legal before company-wide publication, particularly the Asset Management financial-liability language.

## Testing

- `git diff --check` passed.
- `pnpm.cmd typecheck` could not run because this clean worktree has no `node_modules`; `tsc` was unavailable. Install dependencies or run the check in an existing dependency-equipped development environment before merge.

## Next steps

1. Review the policy wording and document-control defaults with HR.
2. Run `pnpm.cmd typecheck` and relevant policy UI tests after dependencies are available.
3. Review the feature branch in the Altus-corp repository; do not merge directly to `main` until the required validation and release approval are complete.
4. Run the existing CMS seed script once in the target environment so HR can edit dates/text in the policy editor.
5. Verify every employee can view and sign each new policy and that acknowledgement status appears in HR records.

## Rollback

Revert the registry entries and the three content files before release. If the CMS seed has already run, archive or unpublish the three corresponding policy records through the established policy CMS rather than deleting acknowledgement history.
