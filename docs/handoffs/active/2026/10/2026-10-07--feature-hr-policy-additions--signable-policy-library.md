# Signable HR policy library additions

- Date: 2026-10-07
- Branch: `feature/hr-policy-additions`
- Status: baseline policy documents committed; Policy CMS authoring extension implemented locally and awaiting validation/commit
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
- Added an HR-admin-only **Create policy** entry point. It creates a private v1
  draft, opens the existing live-preview editor, and keeps the draft unavailable
  to employees until a PIN-confirmed publish.
- Extended the Policies workspace with separate **Create policy** and **Upload
  file** actions, so authored/signable policies are not confused with legacy
  uploaded documents.
- Publishing a first draft makes version 1 public; later edits still mint a new
  version and reset acknowledgements using the existing compliance mechanism.
- Extended the acknowledgement, signature-compliance and single-policy download
  paths to resolve a published CMS policy as well as a code-authored policy. A
  new policy will therefore be signable after publication rather than only
  appearing in the directory.

## Files changed

- `lib/hr/policies/content/employee-travel-railway-pass-policy.ts`
- `lib/hr/policies/content/company-asset-management-policy.ts`
- `lib/hr/policies/content/attendance-leave-recording-policy.ts`
- `lib/hr/policies/registry.ts`
- `app/(app)/hr/policy-cms-actions.ts`
- `app/(app)/hr/policy-cms-actions-types.ts`
- `app/(app)/hr/policies/new/page.tsx`
- `components/hr/policies/policy-draft-creator.tsx`
- `components/hr/policies/policy-editor.tsx`
- `components/hr/policies/policies-workspace.tsx`
- `app/(app)/policies/page.tsx`
- `lib/hr/policies/load-db.ts`
- `lib/hr/policies/acknowledge-core.ts`
- `lib/hr/policies/compliance-sync.ts`
- `app/(app)/hr/policies/sign-off-actions.ts`
- `app/api/hr/policies/download/route.ts`
- `app/(app)/hr/policies/sign-status.ts`
- `app/(app)/hr/policies/signed-pdf.ts`

## Data, security and release notes

- No database schema changes are required.
- The policies fall back to their code-authored baseline immediately, but the existing CMS needs its idempotent seed operation after deployment to create editable `policy_documents` and `policy_versions` records. Use `scripts/seed-policy-cms.ts` against the intended database. New policies use those tables directly and need no new migration.
- The editor deliberately stores declarative structured content rather than raw
  browser HTML. That keeps document rendering, print/PDF output, version history,
  and sign-off content consistent and avoids unsafe HTML being published.
- The Vercel project is configured to invoke `npm run build:turbopack`. This
  branch adds that missing script, with the same 4 GB Node heap as `build`, so a
  preview can use the configured build command without changing Vercel settings.
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
5. Validate draft creation, first publish, subsequent re-publish, and that a draft URL is not readable by a standard employee.
6. Verify every employee can view and sign each new policy and that acknowledgement status appears in HR records.

## Rollback

Revert the registry entries and the three content files before release. If the CMS seed has already run, archive or unpublish the three corresponding policy records through the established policy CMS rather than deleting acknowledgement history.
