# HR console WMS-style alignment and approved letter catalogue

- Date: 2026-10-06
- Work item: `hr-console`
- Status: Ready to commit and push on `feature/hr-console-policy-library`; the
  required GitHub `test` check must be monitored on the new PR head.
- Reviewed UI implementation commit: `5eaa568d783962327bdadf9be24ee800d93f7a6d`

## Objective

Align the HR console chrome with the WMS module and organize HR letters from
the approved catalogue without changing permissions, database behavior, or
approval flows.

## Changes

### 2026-10-06 UI workflow update

- Shared module navigation is now a compact, top-edge, scroll-aware row. It
  collapses on downward scroll, returns on upward scroll, and is intentionally
  absent from the Hub. Its in-flow height means page content reclaims the space
  rather than being covered by an overlay.
- HR now uses the same two-column chrome geometry as WMS: the HR rail owns the
  full left edge; the module row and right-hand action ribbon begin at the rail
  edge. The current HR page title is rendered in the rail title row, not
  duplicated in the action ribbon. Route-specific HR titles portal into that
  row as well.
- Approvals now has separated controls and table surfaces, an Attendance-only
  **Att Report** link, draggable non-pinned columns, a frozen Employee column,
  single-line rows, `DD-MMM-YYYY` periods, note tooltips, hidden horizontal
  scrollbar styling, and distinct paid/final action labels. Approval decisions,
  permissions, and server actions are unchanged.
- The Compliance Checklist names the six-month interval **Half-Yearly** and
  uses the application confirmation dialog for single and bulk deletes instead
  of the browser confirmation prompt. Delete behavior and archive actions are
  unchanged.
- My Salary now opens on the active calendar month rather than selecting an
  arbitrary returned ledger month.

Files changed for this update:

- `app/(app)/employees/cc/page.tsx`
- `app/(app)/my-salary/page.tsx`
- `app/globals.css`
- `components/admin/approvals/approval-workbench.tsx`
- `components/compliance/compliance-board.tsx`
- `components/hr/console/hr-console-context.tsx`
- `components/hr/console/hr-console-shell.tsx`
- `components/hr/console/hr-module-rail.tsx`
- `components/hr/console/hr-title-bar.tsx`
- `components/layout/app-top-bar.tsx`
- `components/layout/aura-top-bar.tsx`
- `components/layout/chrome-shell.tsx`
- `components/layout/module-footer.tsx`
- `components/salary/my-salary-view.tsx`
- `lib/compliance/cc-timeframes.ts`

- `components/hr/console/hr-module-rail.tsx`
  - Reuses the WMS shared rail contracts: `sidebar-rail`, `aura-rail-skin`,
    `sidebar-nav`, `nav-pill`, `nav-pill-active`, and `AuraRailLens`.
  - Renders lifecycle sections as individually expandable sidebar groups, with
    approved letter codes shown on their nested links.
- `components/hr/console/hr-console-shell.tsx`
  - Removes the horizontal Quick Access row; content now uses the full height
    under the global top bar.
  - Extends the HR rail to the top of the viewport, so its Back, Forward, and
    Collapse module list controls fill the left side of the header without a
    blank or separate top rectangle.
  - Adds a shared adjustable-width HR rail: users can drag the right edge or
    use Arrow keys/Home/End on the accessible resize handle. The selected width
    is kept in browser storage, survives collapse/expand, and keeps the top-bar
    title aligned to the rail.
- `components/layout/sidebar-rail.tsx`
  - Adds the same adjustable-width control to the shared rail used by all
    non-HR workspaces. Each workspace retains its own selected expanded width.
- `components/layout/aura-top-bar.tsx` and `app/aura.css`
  - Align the shared title slot with the WMS/HR rail on desktop while retaining
    the normal smaller-layout behavior.
- `lib/hr/letters/catalog.ts`
  - Adds the single approved catalogue for codes `1A`–`21`, exact display
    names, section order, and availability state.
  - Codes `6` (Declaration Letter) and `11` (Work Anniversary) are explicit
    `Content Pending / Not Provided` entries with no editable template.
- `lib/hr/lifecycle.ts`, `lib/hr/console-nav.ts`, and HR letter pages
  - Derive navigation, sidebar labels, title bars, and library ordering from
    the approved catalogue, preventing visible duplicate legacy letters.
  - Preserve separate entries for `14` Promotion Letter, `15` Salary Revision
    Letter, and `16` Appraisal + Promotion Letter.
- `lib/hr/letters/templates/*`
  - Add Policy Acknowledgement and Resignation Acceptance templates from the
    supplied PDFs, and update the Employee Compliance, Pre-Employment Training,
    and Appraisal + Promotion templates from their supplied PDFs.

### HR policy attachments

- The policy upload path preserves the exact original filename independently
  from the storage-safe object key, so spaces and `&` stay correct in the
  Policies list.
- Upload/delete now use the shared storage adapter, and local testing receives
  a working signed-object URL for every policy attachment.
- Three original, separate policy files were added to the local HR policy
  library and byte-verified against their source files:
  - `Employee Travel & Railway Pass Policy.docx` — Payroll & Benefits.
  - `Attendance & Leave Recording Policy.docx` — Leave & Attendance.
  - `COMPANY ASSET MANAGEMENT POLICY.pdf` — IT & Security.
- The configured `localhost:3000` Policies page uses a different data source.
  Its current account is not an HR policy publisher, so the existing server
  action correctly returns `Forbidden` and no live policy record was created.
  The UI now asks `canPublishPolicies` before exposing upload/delete controls,
  matching the action instead of displaying a button that cannot succeed.
- `lib/storage/dummy-url.ts` keeps the dummy-object URL formatter independent
  of filesystem-backed storage operations. HR policy reads now use that pure
  formatter directly, avoiding an unnecessary storage-filesystem trace in the
  Policies read path.

## Database and access impact

No schema, authentication, authorization, approval rules, or permission
filtering changed. The existing policy upload/delete actions now use the shared
storage adapter and save original-filename metadata in the existing description
field; no migration is needed. Pending catalogue entries have no registered
template, so the existing issue/export paths cannot issue them.

## Validation

### 2026-10-06 validation

- `npm run typecheck` — passed after correcting the module-navigation timeout
  handle to use the browser timer ID type.
- `npx eslint <all changed TypeScript/TSX files>` — completed with no errors.
  It reports two pre-existing React-hook warnings in
  `components/compliance/compliance-board.tsx` outside this update's delete
  dialog code; the stylesheet is intentionally outside ESLint's configured
  file set.
- Focused Vitest coverage — passed: 102 tests across approval permissions,
  attendance authorization, compliance columns/statuses/frequency, salary
  periods, and HR module navigation.
- `npm test` — 5,326 passed and 34 skipped; three unrelated tests timed out
  under the full concurrent run (`activity-union` and the repository conflict
  scan). Re-running those two test files with one worker passed: 8 tests.
- Browser checks on `localhost:3000` — confirmed the HR rail occupies the
  left viewport column; the navbar and action ribbon begin at its right edge;
  the page title appears only in the rail title row on `/hr` and
  `/hr/holidays`.
- `git diff --check` — passed. The current diff was searched for credentials,
  connection strings, private keys, and token-like additions; none were found.

- `npx vitest run tests/unit/policy-file-name.test.ts` — passed.
- `npx vitest run tests/unit/policies-workspace-signed.test.tsx tests/unit/policy-access.test.ts tests/unit/policy-file-name.test.ts` — passed: 10 tests.
- `npm run test` — passed: 5,316 tests; 34 intentionally skipped.
- `npx vitest run tests/unit/storage-objects.test.ts tests/unit/policy-file-name.test.ts tests/unit/policies-workspace-signed.test.tsx tests/unit/policy-access.test.ts` — passed: 20 tests.
- Production build — completed successfully before the final pure URL-helper
  extraction; its build manifest includes `/policies`.
- `npm run check:leaks` — passed: zero PGlite trace leaks across 4,141 built
  server files.
- Browser smoke — `/hr`, `/hr/directory`, `/hr/letters`, and `/policies`
  rendered successfully on `localhost:3000`; the HR Back, Forward, Collapse,
  and Resize controls are present, visible, and correctly positioned.
- Local policy-library verification — exactly one record per supplied file, in
  the intended category, with a SHA-256 match between each stored attachment
  and its source file.
- `npm run typecheck` — passed.
- `npx vitest run tests/unit/letter-order.test.ts tests/unit/format-date-hr.test.ts tests/unit/hr-console-visibility.test.ts` — passed: 27 tests.
- `git diff --check` — passed.
- `GET http://localhost:3000/hr/letters` — returned HTTP 200.
- Playwright desktop screenshot of `/hr/letters/promotion-revised-ctc` — the
  continuous rail and top controls render as intended.
- Playwright interaction check — resizing `/hr/post-interview` to 320px also
  changed the title margin to 320px.

The local development server timed out while compiling `/dashboard`, so the
equivalent WMS browser drag check remains a follow-up; static validation for
the shared rail passed.

## Remaining work

1. Sign in as an existing HR policy publisher (HR staff or super-admin) before
   uploading the three source files to the configured `localhost:3000` data
   store. Do not weaken or bypass `canPublishPolicies` to perform this upload.
2. Push the reviewed feature branch, create or update the PR against `main`,
   and monitor the required GitHub `test` check for the resulting head SHA.
   Do not merge without the user's explicit instruction and a passing required
   check.
