# Bulk Upload Audit

Audit date: 2026-10-06

Scope: live web UI bulk row imports, spreadsheet/paste imports, downloadable import templates, Upload Master registry, and current Incentive Entries/Targets flows. Generic document or image uploads excluded. Operator scripts listed separately.

## Executive findings

- 21 live structured-data bulk/import flows found.
- Upload Master currently lists 16 registry templates.
- 11 registry templates are wired to real module download buttons through `templateHref()` / `/api/templates/[key]`.
- 5 registry templates have real import flows but their current UI downloads templates from separate legacy or module-specific routes. Upload Master replacement therefore does not control those downloads.
- 6 live import flows have no Upload Master registry key.
- No Incentive Targets bulk uploader or target template exists.
- Incentive Entries and Incentive Targets use separate models. They connect at runtime through employee identity, normalized product name, and period range. No direct foreign key links an entry to a target plan.

## Upload Master registry

Current registry source: `lib/templates/keys.ts`, `lib/templates/registry.ts`.

| Registry key | Upload Master name | Actual flow | Wiring result |
|---|---|---|---|
| `tasks` | Tasks — Bulk Import | Tasks import dialog | Present in both; wired |
| `goals` | Goals — Bulk Import | Cascade Goals import; board week/day fallback | Present in both; wired |
| `weekly_goals_bulk_import` | Weekly Goals — Bulk Import | Weekly Goals import | Present in both; wired |
| `monthly_goals_bulk_import` | Monthly Goals — Bulk Import | Goals board monthly upload | Present in both; wired |
| `quarterly_goals_bulk_import` | Quarterly Goals — Bulk Import | Goals board quarterly upload | Present in both; wired |
| `yearly_goals_bulk_import` | Yearly Goals — Bulk Import | Goals board yearly upload | Present in both; wired |
| `projects_bulk_import` | Projects — Bulk Import | Project Plan upload, `kind` variant | Present in both; wired |
| `accounts-task-list` | Accounts — Task List | Accounts Task List + Screenshots import | Present in both; wired |
| `dcc_wcc_bulk_import` | DCC — WCC Bulk Import | WCC compliance upload | Concept present; current UI bypasses Upload Master |
| `dcc_mcc_bulk_import` | DCC — MCC Bulk Import | MCC compliance upload | Concept present; current UI bypasses Upload Master |
| `operations_checklist_bulk_import` | Operations — Checklist Bulk Import | Checklist run/master upload | Present in both; wired |
| `job_descriptions_bulk_import` | Operations — Job Description Bulk Import | JD upload, generic/person variant | Present in both; wired |
| `operations_vendor_bulk_import` | Operations — Vendor Directory Bulk Import | Vendor bulk entry | Present in both; wired |
| `incentive_entries_bulk_import` | Incentive — Entries Bulk Import | Incentive Entries import | Concept present; current UI bypasses Upload Master |
| `billing_outstanding_bulk_import` | Billing — Outstanding Bulk Import | Outstanding import | Concept present; current UI bypasses Upload Master |
| `billing_collection_bulk_import` | Billing — Collection Bulk Import | Collection import | Concept present; current UI bypasses Upload Master |

### Present in both and actually wired

Tasks, Goals, Weekly Goals, Monthly Goals, Quarterly Goals, Yearly Goals, Projects, Accounts Task List, Operations Checklist, Job Descriptions, Vendor Directory.

These module buttons resolve through `lib/templates/keys.ts` and `lib/templates/resolve.ts`. Upload Master replacement affects their downloaded template.

### Bulk upload exists, but current template path bypasses Upload Master

WCC, MCC, Incentive Entries, Billing Outstanding, Billing Collection.

Registry rows exist, but current buttons use separate routes:

- WCC/MCC: `/employees/cc/template.xlsx?kind=...`.
- Incentive Entries: `/incentive/template.xlsx`.
- Outstanding/Collection: `/billing/outstanding/export.xlsx?template=...`.

Replacing these rows in Upload Master does not change those current downloads.

### Bulk upload exists but missing from Upload Master

| Flow | Current source | Finding |
|---|---|---|
| Tasks alternate bulk grid | `components/tasks/tasks-bulk-grid.tsx` | CSV/XLS/XLSX/paste grid. No separate template or registry key. It is a second Tasks importer. |
| Salary Altus-Log import | `components/salary/salary-import-dialog.tsx` | XLSX upload. No template download and no registry key. Expects external Altus-Log workbook. |
| Salary Profile Google Sheet import | `components/admin/salary-profile-import-dialog.tsx`, `app/(app)/salary/import/profile-actions.ts` | Reads configured Google Sheet. No downloadable template or registry key. |
| Executive Calendar sheet paste | `components/exec-calendar/import-dialog.tsx` | TSV/paste import. No file template or registry key. |
| Accounts Monthly Checklist CSV | `components/accounts/checklist-table-toolbar.tsx` plus monthly page flow | Direct CSV parser. No template or registry key. |
| Accounts Weekly Checklist CSV | Same shared toolbar plus weekly page flow | Direct CSV parser. No template or registry key. |
| Accounts Due Dates CSV | Same shared toolbar plus due-date page flow | Direct CSV parser. No template or registry key. |

The first row is a separate Tasks implementation. Goals board week/day uploads reuse `goals`; they are not separate missing template keys.

### Upload Master row with no actual flow/template

No registry row was found with no corresponding business flow or generated template. Main problem is not absent business flow. Main problem is stale wiring: five registry rows do not control current module downloads.

## Complete live bulk/import inventory

| # | Module / surface | Input | Template or picker | Write flow |
|---:|---|---|---|---|
| 1 | Tasks canonical importer | CSV/XLS/XLSX | Upload Master `tasks` template | `previewTaskImport` then `commitTaskImport` |
| 2 | Tasks alternate grid | CSV/XLS/XLSX/paste | No template | `bulkCreateTasks` |
| 3 | Goals cascade import | CSV/XLS/XLSX | Upload Master `goals` template | `importGoals` |
| 4 | Goals board | CSV/XLS/XLSX | `goals`, monthly, quarterly, yearly registry variants; week/day fallback | `bulkCreateGoals` |
| 5 | Weekly Goals | CSV/XLS/XLSX/Google Sheets-style data | Upload Master `weekly_goals_bulk_import` | `importWeeklyGoals` |
| 6 | Project Plan | CSV/XLS/XLSX/paste | Upload Master `projects_bulk_import`, `kind` variant | `bulkCreatePlanNodes` |
| 7 | WCC compliance | CSV/XLS/XLSX/paste | `/employees/cc/template.xlsx?kind=wcc` | `bulkAddCompliances` |
| 8 | MCC compliance | CSV/XLS/XLSX/paste | `/employees/cc/template.xlsx?kind=mcc` | `bulkAddCompliances` |
| 9 | Operations checklist | CSV/XLS/XLSX/paste | Upload Master checklist variants | `bulkCreateChecklistRows` |
| 10 | Operations Job Descriptions | CSV/XLS/XLSX/paste | Upload Master JD generic/person variants | `bulkCreateJdEntries` |
| 11 | Vendor Directory | CSV/XLS/XLSX/paste | Upload Master `operations_vendor_bulk_import` | `bulkCreateVendors` |
| 12 | Incentive Entries | XLSX | `/incentive/template.xlsx` | `validateIncentiveEntriesImport`, then `confirmIncentiveEntriesImport` |
| 13 | Billing Outstanding | CSV/XLS/XLSX/TXT/Google Sheet | Outstanding blank template route | `previewImport`, `confirmImport`, `undoImport` |
| 14 | Billing Collection | CSV/XLS/XLSX/TXT/Google Sheet path through Outstanding importer | Collection blank template route | Same Outstanding import actions with collection mapping |
| 15 | Salary Altus-Log | XLSX | No template; external workbook | `previewSalaryImport`, `confirmSalaryImport`, `undoSalaryImport` |
| 16 | Salary Profiles | Google Sheet | No downloadable template | `previewSalaryProfileImport`, `confirmSalaryProfileImport` |
| 17 | Executive Calendar | TSV/paste | No file template | `parseSheetPaste`, `importExecBlocks` |
| 18 | Accounts Monthly Checklist | CSV | No template | Per-row monthly create action |
| 19 | Accounts Weekly Checklist | CSV | No template | Per-row weekly create action |
| 20 | Accounts Due Dates | CSV | No template | Per-row due-date create action |
| 21 | Accounts Task List + Screenshots | CSV/XLS/XLSX | Upload Master `accounts-task-list` template | `bulkImportAccountsTasks` |

Excluded from count: Employee Master Bulk Edit, because it bulk-edits selected existing records and does not upload rows/templates. Excluded also: file attachments, policy uploads, images, signatures, and exports.

## Incentive audit

### Incentive Entries: current template and flow

Current picker: `components/incentive/incentive-import-dialog.tsx`.

- Button: `Import Excel` on admin Entries area.
- Download: hardcoded `/incentive/template.xlsx`.
- Filename: `Incentive-Entries-Import-Template.xlsx`.
- Generator: `lib/exports/incentive-entry-template.ts`.
- Parser: `lib/import/incentive-import.ts`.
- Actions: `validateIncentiveEntriesImport` and `confirmIncentiveEntriesImport` in `app/(app)/incentive/admin-actions.ts`.
- Destination: `incentiveEntries`.
- Legacy wrapper: `bulkUploadIncentiveEntries` exists, but current browser flow does not call it.

Template columns:

`Employee ID`, `Employee Name`, `Incentive Product`, `Period Month`, `Amount`, `Approved`, `Approved Amount`, `Approved Date`, `Paid`, `Paid Amount`, `Paid Date`, `Note`.

Required by default:

`Employee ID`, `Employee Name`, `Incentive Product`, `Period Month`, `Amount`, `Approved`, `Paid`.

Validation and rules:

- First workbook sheet is read.
- Maximum 2,000 data rows.
- Empty rows are skipped.
- Employee ID must match active Employee Master code.
- Employee Name must match one unique active Employee Master record.
- Employee ID and Employee Name must identify same employee when both are supplied.
- Incentive Product must exist in active Product Master.
- Period Month must be valid ISO, Indian, or Excel date; stored as first day of month.
- Amount, Approved Amount, and Paid Amount must be non-negative numbers with up to two decimals.
- Approved and Paid must be `Yes` or `No`.
- Entered Approved Date and Paid Date must be valid dates.
- Validation reports all row issues before any write.
- Confirm action re-reads and re-validates workbook, then inserts in one transaction.
- No duplicate detection, upsert, or import-batch undo exists for Incentive Entries.
- Admin authorization is required. The module UI also uses Incentive permission gating.

### Incentive Targets: current template and flow

No target bulk upload exists. No target template exists. No target key exists in Upload Master.

Current picker: `components/incentive/targets/target-form-dialog.tsx`.

- Button: `Add Target` on Targets dashboard.
- User selects `Team` or `User`.
- User selects subject, period type, period value, incentive products, and quantities.
- Server action: `createTargetPlan` in `app/(app)/incentive/target-actions.ts`.
- Storage: `incentive_target_plans` plus `incentive_target_plan_products`.
- Existing plans are upserted by subject, period type, and period start.
- Product lines upsert by plan and product name.

Target validation:

- Admin-only write.
- Subject must be valid UUID.
- Period must be week, month, quarter, or year and pass period-bound validation.
- At least one product line; maximum 50 lines.
- Product quantity must be finite, positive, and at most 1,000,000.
- Product must be active in Incentive Master/catalog.
- Server resolves live product rate; client rate is not trusted.
- Subject/team must have CTC on record.
- Total target must meet minimum target: 10% of monthly CTC, scaled for target period.
- Target plan uses unique subject-period constraint.

### Entries and Targets linkage

Link exists at runtime, not as direct relational storage.

- Target product stores `productId` plus copied `productName`.
- Incentive Entry stores `incentiveName` text and `employeeId`/`empName`.
- Target actual calculation reads approved, non-reversed Incentive Entries for target period.
- It matches normalized `incentiveName` to normalized target `productName`.
- User target matches employee ID/name.
- Team target aggregates entries from team members.
- No `incentive_entries.target_plan_id` or equivalent foreign key exists.
- Legacy `incentive_targets` monthly rows remain separate and still feed legacy analytics. They are not the granular target-plan rows.

Result: Entries contribute to Target actual/achievement when employee scope, normalized product name, and period overlap. A renamed product, mismatched identity, or period mismatch breaks the runtime match.

## Key risks found

1. Incentive Targets has no bulk upload, no downloadable template, and no Upload Master entry.
2. Incentive Entries-to-Targets link uses normalized names and period/employee logic, not foreign keys. Product rename or identity drift can produce zero actuals.
3. Two Tasks importers exist with different behavior; alternate grid has no template.
4. Salary Altus-Log import depends on external workbook shape with no managed template.

## Intentional non-registry imports

These flows have no downloadable registry-backed template and remain unchanged:

- Alternate Tasks bulk grid
- Salary Altus-Log workbook import
- Salary Profile Google Sheet import
- Executive Calendar paste import
- Accounts Monthly Checklist CSV
- Accounts Weekly Checklist CSV
- Accounts Due Dates CSV

All flows with a downloadable template use Upload Master registry resolution.

## Evidence map

- Upload Master registry: `lib/templates/keys.ts`, `lib/templates/registry.ts`, `app/(admin)/admin/upload-master/page.tsx`, `components/admin/upload-master/master-table.tsx`.
- Upload Master replacement action: `app/(admin)/admin/upload-master/actions.ts`.
- Template resolver: `lib/templates/resolve.ts`, `app/api/templates/[key]/route.ts`.
- Incentive Entries picker: `components/incentive/incentive-import-dialog.tsx`.
- Incentive Entries template route: `app/(app)/incentive/template.xlsx/route.ts`.
- Incentive Entries parser: `lib/import/incentive-import.ts`.
- Incentive Entries actions: `app/(app)/incentive/admin-actions.ts`.
- Incentive Targets picker: `components/incentive/targets/target-form-dialog.tsx`.
- Incentive Targets actions: `app/(app)/incentive/target-actions.ts`.
- Incentive Targets actual matching: `lib/queries/incentive-target-plans.ts`.
- Incentive schema: `db/schema.ts`, `db/migrations/0249_incentive_target_plans.sql`.
- Existing prior audit used for comparison: `BULK_UPLOAD_IMPORT_AUDIT.md` dated 2026-09-30. Current audit updates its Upload Master count from 8 to 16 and rechecks current Incentive Targets implementation.
