# HR usability updates

- Date: 2026-09-30
- Work item: `main` / HR usability updates
- Status: Complete locally except for the ambiguous Mobile Number request; not committed or pushed.

## Objective

Improve the HR Help Desk, ticket attachment, HR Record, Address Book, Asset Register, KPI Management, and frozen-table scrolling experiences requested during UI review.

## Changes

- Help Desk queue filters are now a compact single horizontal row; narrow screens scroll horizontally rather than wrapping into extra rows.
- Newly selected ticket attachments have a `View` control before submission. Saved ticket attachments now also show an explicit `View` link, using the existing authorized signed URL.
- HR Record now uses the full application content width, so its workspace uses the available main-body space.
- Address Book uses a Service dropdown. Selecting `Other` reveals a required field for the service name; that value is stored in the existing `hr_contacts.service` column. Existing custom service values remain editable through the same path.
- Address Book resource rows now expose labeled `Edit`, `Archive`/`Restore`, and `Delete` actions for authorized editors.
- Address Book, Asset Register, and KPI Management now use the full main-content width.
- Asset Register pre-fills the next numeric serial number. The server allocates the final serial atomically with a dedicated existing-counter-table key, seeded from the highest numeric legacy serial.
- Asset photo and invoice uploads have a `View` action immediately after upload as well as after the asset is saved.
- KPI Management has a source filter for current, appraisal-derived, locally assigned, and archived KPIs. Both saved and appraisal-derived KPIs can be archived without deleting the shared appraisal definition; archived rows can be restored.
- Filled-form detail pages now include a Back link to the appropriate Filled Forms list.
- Records Backup schedule controls now use the shared collision-aware dropdown, keeping the menu inside the viewport.
- Frozen table layers now follow one application-wide order: body cells are below totals, and headers are always above both. This prevents a horizontally frozen row cell from painting over its own table heading. The payroll table header is also fully opaque, preventing row values from showing through while scrolling.

## Files changed

- `components/hr/ticket-list/queue-filters.tsx`
- `components/hr/ticket-composer/ticket-composer.tsx`
- `components/hr/ticket-thread/ticket-thread.tsx`
- `components/hr/record/hr-record-screen.tsx`
- `components/hr/registers/address-book.tsx`
- `app/(app)/hr/address-book/page.tsx`
- `components/hr/registers/asset-register.tsx`
- `app/(app)/hr/assets/actions.ts`
- `app/(app)/hr/assets/page.tsx`
- `app/(app)/hr/kpi/page.tsx`
- `app/(app)/hr/kpi/actions.ts`
- `components/hr/kpi/kpi-workbench.tsx`
- `app/(app)/hr/forms/[id]/page.tsx`
- `components/hr/records-backup/records-backup-screen.tsx`
- `app/globals.css`
- `components/salary/salary-breakup-table.tsx`

## Database and access impact

No migrations or authorization changes. New asset serials use the existing `hr_asset_counters` table. KPI archiving uses the existing `kpi_assignments.archived` column and append-only history table. Ticket attachment visibility remains governed by the existing signed-URL and ticket-visibility checks.

## Validation

- `git diff --check` passed.
- Focused ESLint passed with four pre-existing warnings in `hr-record-screen.tsx` about ref/state patterns outside this change.
- Focused ESLint also passed for the Address Book, Asset Register, asset action, and KPI page changes.
- Focused ESLint passed for the KPI archive/filter, Filled Forms Back control, and Records Backup dropdown changes, with one pre-existing KPI effect warning.
- `git diff --check` passed after the frozen-table update. Focused table lint completed with only six existing warnings in shared table components (React ref/effect and TanStack compiler notices); no lint errors.
- `corepack pnpm typecheck` was blocked by an unrelated stale `.next/types/validator.ts` reference to a missing `accounts/vasa-family-kyc` route.

## Deployment and rollback

No migration or deployment steps. Revert the component and page edits to roll back the UI changes.

## Known issue / required clarification

The Asset Register popup shown in the request has `Make`, `Model`, and `Serial No` fields, but no Mobile Number field. `Model` must continue to allow text for assets such as laptops. Confirm the actual route/field for the requested 10-digit mobile-number validation before adding that validation.
