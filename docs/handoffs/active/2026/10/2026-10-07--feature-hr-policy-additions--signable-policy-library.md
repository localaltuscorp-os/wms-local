# Signable HR policy library additions

- Date: 2026-10-07
- Branch: `feature/hr-policy-additions`
- Status: policy CMS authoring, preview-only OTP review support, and an isolated reimbursement upload runtime fix are on the review branch; awaiting feature validation
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
- Added a private HR-admin drafts queue and visible **Edit freely** action on
  policy cards, so drafts and the editor are discoverable without knowing URLs.
- Reworked the editor after preview review: it now uses a focused full-width
  edit canvas or a full-width document preview (not a narrow split screen), and
  keeps version/compliance detail collapsed until needed.
- Removed the misleading read-only treatment for tables, committee rosters,
  workflows and legends. Those structured blocks can now be edited, extended,
  reordered or removed in the same workspace as paragraphs and bullet lists.
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
- `app/(app)/hr/policies/drafts/page.tsx`
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
- `app/(app)/reimbursements/attachment-actions.ts`

## Data, security and release notes

- No database schema changes are required.
- The production CMS seed was applied on 2026-10-07 through the authenticated
  Supabase management path. It inserted the missing editable document and
  version-1 rows for the three added policies only. Read-only verification
  confirmed all three are published with version 1 present. The policy editor
  therefore no longer needs an initial seed for these three policies.
- The editor deliberately stores declarative structured content rather than raw
  browser HTML. That keeps document rendering, print/PDF output, version history,
  and sign-off content consistent and avoids unsafe HTML being published.
- The Vercel project is configured to invoke `npm run build:turbopack`. This
  branch adds that missing script, with the same 4 GB Node heap as `build`, so a
  preview can use the configured build command without changing Vercel settings.
- Preview-development two-step exception: `previewTwoStepBypassEnabled` is
  enabled only when Vercel supplies `VERCEL_ENV=preview` or the Preview-only
  `PREVIEW_OTP_BYPASS_ENABLED=true` setting is present. The explicit setting is
  necessary because this Vercel project does not expose the system runtime
  marker. It bypasses two-step at both session minting and edge routing, while
  production receives neither setting and keeps two-step verification.
- Reimbursement upload runtime fix: the production Turbopack bundle attempted
  to evaluate the TypeScript-only `ClaimUploadRef` interface as a runtime value
  when loading the reimbursement Server Action. The type is now directly
  re-exported from its type-definition module, so the action has no runtime
  reference to that interface. The existing `module_submission_attachments`
  table was verified present in the target database; this change does not alter
  receipt data, storage objects, permissions, or schema.
- No automated travel reimbursement, asset monitoring, payroll deductions, leave deductions, or attendance changes were added. These are policy documents and acknowledgement records only.
- The policy documents must be reviewed by HR/legal before company-wide publication, particularly the Asset Management financial-liability language.

## Testing

- `git diff --check` passed.
- The focused OTP adjustment also passed `git diff --check`. Targeted ESLint
  could not run because this worktree's installed command set has no `eslint`
  executable; the Vercel preview build remains the TypeScript/build validation.
- The full typecheck was started with the same 4 GB Node heap as the Vercel
  build, but exceeded the local 60-second command limit without reporting a
  TypeScript error. The next Vercel Preview build must be checked before merge.
- `pnpm.cmd typecheck` could not run because this clean worktree has no `node_modules`; `tsc` was unavailable. Install dependencies or run the check in an existing dependency-equipped development environment before merge.
- Targeted ESLint for the reimbursement action was also unavailable because
  this worktree has no installed `eslint` executable. `git diff --check` passed.
- The first reimbursement-fix Preview build reached TypeScript validation and
  exposed a missing local type-only import in `attachClaimFiles`. It is restored
  while retaining the direct type re-export; a fresh Preview build is required.
- The first Vercel preview exposed a TypeScript mismatch between a CMS policy
  card and the registry card type. It is corrected by assigning `ready` only at
  the display boundary after the database query has already filtered published
  rows. Rebuild required.

## Next steps

1. Review the policy wording and document-control defaults with HR.
2. Run `pnpm.cmd typecheck` and relevant policy UI tests after dependencies are available.
3. Review the feature branch in the Altus-corp repository; do not merge directly to `main` until the required validation and release approval are complete.
4. Run the existing CMS seed script once in the target environment so HR can edit dates/text in the policy editor.
5. Validate draft creation, first publish, subsequent re-publish, and that a draft URL is not readable by a standard employee.
6. Verify every employee can view and sign each new policy and that acknowledgement status appears in HR records.
7. In a Preview deployment, submit one reimbursement claim with a synthetic
   receipt and confirm the claim is created and the attachment count renders.

## Rollback

Revert the registry entries and the three content files before release. If the CMS seed has already run, archive or unpublish the three corresponding policy records through the established policy CMS rather than deleting acknowledgement history.

## Main-branch conflict resolution

- Merged current `origin/main` (`ba3be1de`) into `feature/hr-policy-additions` without rebasing or rewriting history.
- The only textual conflict was in `package.json`: the feature branch made Turbopack the default build while current main keeps webpack as `build` and exposes Turbopack through `build:turbopack`. The main arrangement was retained because it preserves both commands and the audited local production/leak-check path.
- All other current-main attendance, salary, admin, email, proxy, and release-document changes merged automatically; no HR policy implementation was discarded.
- Validation after resolution: `$env:NODE_OPTIONS='--max-old-space-size=4096'; pnpm.cmd typecheck` passed; 99 focused tests passed across nine HR, policy, attendance, punch, and email test files; focused ESLint completed with zero errors and two pre-existing React warnings in `policy-editor.tsx`; `git diff --check` passed.
- Database impact from conflict resolution: none. No migration or production SQL was executed.
- Security/access impact from conflict resolution: none; the existing preview-only two-step behavior and production authentication behavior were preserved.
