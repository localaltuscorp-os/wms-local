# Vendor Directory category master

Date: 2026-09-30
Branch: Om
Status: In progress; migration has not been applied, and nothing has been pushed or deployed.

## Objective

Make Vendor Category Master the live source of truth for Vendor Directory and its bulk workbook, while retaining the existing Vendor Directory importer and HR/super-admin write guard.

## Implemented

- Added `ops_vendor_categories`, a managed Vendor Category Master with active/retired state, ordering, audit columns, case-insensitive uniqueness, and an HR/super-admin management page at `/operations/directory/categories`.
- Added additive vendor fields: company name, WhatsApp number, office open/end times, three private document paths, and additional links.
- Updated the Vendor Directory form and review table. The six requested fields are required for new saves and imports; WhatsApp initially mirrors Cell No. until a user edits it.
- Reused the shared browser dictation hook for Notes and the existing private Storage signed-upload pattern for Business Card front/back and PPT/Catalogue.
- Replaced the browser-only hard-coded Vendor template with the shared Upload Master resolver. Its generated fallback workbook loads active categories from the master into a hidden list and Category dropdown; a static Upload Master override still wins unchanged.
- The same active master values are enforced server-side by `saveVendor` and `bulkCreateVendors`.
- Added migration `0257_vendor_category_master.sql`, which seeds the old suggested values and distinct existing categories, and copies legacy Cell No. to WhatsApp where blank.

## Database impact

`0257_vendor_category_master.sql` is forward-only. It adds the category master and nullable/compatibility-safe vendor fields. It does not make legacy rows invalid or delete data. Apply only through the normal migration process; it has not been run here.

## Remaining verification

- `tests/unit/template-registry.test.ts` passes (19 tests), including the Vendor template/parser header mapping. Targeted ESLint has no errors; it retains one existing `react-hooks/refs` warning in the Vendor bulk grid's pre-existing row initializer.
- Run the full TypeScript check to completion (the local full command exceeded the current command window before yielding a final status).
- Apply the migration in an approved local environment, then verify: create/retire/rename a category; download the generated Vendor template; confirm its Category dropdown; import a matching row; reject an unknown or retired category; test document upload and Notes dictation.
- Do not push or deploy without the task owner’s instruction.

## Rollback

Revert this work item’s commit(s). The new table and nullable columns can remain harmlessly if an application rollback is necessary; do not drop them without an explicit database rollback plan.
