# Bulk Upload / Import Audit

Audit date: 2026-09-30. Scope is every live structured-data ingestion flow found
in app, components, lib, scripts, public, tests, and Android source. Generic
document, image, audio, policy, and attachment uploads are excluded because they
store files rather than ingest rows into business tables. Exports are excluded
unless they are the source of a downloadable import template.

## 1. Executive Summary

- 20 live structured-data ingestion flows were found, plus Upload Master, which
  manages template overrides rather than business data. 15 operator/migration
  scripts ingest or transform structured data outside normal UI.
- 16 logical downloadable templates were found: 8 Upload Master registry
  entries, 2 Compliance templates, 1 Incentive template, 2 Outstanding/Collection
  templates, and browser-generated JD, Checklist, and Vendor templates.
- 6 live flows have no downloadable template: alternate Tasks bulk grid, Salary
  Altus-Log import, Salary Profile Google Sheet import, Executive Calendar paste
  import, and 3 Accounts direct-CSV imports.
- 2 confirmed or highly likely template mismatches exist: Goals cascade template
  versus server period fields; Weekly Goals generated workbook header position
  versus server parser. Project Plan overrides can also mismatch a selected kind.
- Duplicate or inconsistent implementations: two Tasks importers, two Goals
  importers sharing one template, three Accounts direct-CSV importers, and an
  in-app Outstanding importer alongside two operational scripts.
- Upload Master only covers 8 registry keys. Active WCC, MCC, Incentive,
  Outstanding, JD, Checklist, and Vendor templates bypass its replacement and
  inventory system.
- Android source has no CSV/XLSX/bulk-import UI.

## 2. Complete Inventory

| Module | Page | Feature | File Type | Template | Template Location | Backend/API | Status |
| ------ | ---- | ------- | --------- | -------- | ----------------- | ----------- | ------ |
| WMS Tasks | /tasks/import; top-bar; New Task | Canonical task import | CSV, XLS, XLSX | Altus-Tasks-Template.xlsx | API key tasks; lib/templates/tasks.ts | previewTaskImport, commitTaskImport | Aligned |
| WMS Tasks | New Task bulk grid | Alternate task grid | CSV, XLS, XLSX, paste | None | MISSING | bulkCreateTasks | Duplicate; no template |
| Goals | /goals/import | Cascade goals import | CSV, XLS, XLSX | Altus-Goals-Template.xlsx | public/templates/Altus-Goals-Template.xlsx, decorated by lib/templates/goals.ts | importGoals | MISMATCH |
| Goals Board | Month/quarter/year/week/day boards | Board goals bulk upload | CSV, XLS, XLSX | Goal-level workbook | API keys goals/monthlyGoals/quarterlyGoals/yearlyGoals | bulkCreateGoals | Shares risky Goals template |
| Weekly Goals | Weekly Goals board | Weekly goals import | CSV, XLS, XLSX | Weekly-Goals-Template.xlsx | lib/templates/weekly-goals.ts | importWeeklyGoals | LIKELY MISMATCH |
| Project Plan | Plan board/register | Plan-node bulk upload | CSV, XLS, XLSX, paste | Project-Plan-[kind]-template.xlsx | lib/templates/projects.ts | bulkCreatePlanNodes | Aligned built-in; override risk |
| DCC | WCC board | WCC compliance bulk upload | CSV, XLS, XLSX, paste | WCC template.xlsx | lib/compliance/bulk-template.ts | bulkAddCompliances | Aligned; not Upload Master |
| DCC | MCC board | MCC compliance bulk upload | CSV, XLS, XLSX, paste | MCC template.xlsx | lib/compliance/bulk-template.ts | bulkAddCompliances | Aligned; not Upload Master |
| Operations | Checklist run/master | Checklist bulk upload | CSV, XLS, XLSX, paste | [target]-tasks-template.xlsx | Browser, lib/operations/checklist-bulk.ts | bulkCreateChecklistRows | Aligned; not Upload Master |
| Operations | Job Description bank/person | JD bulk upload | CSV, XLS, XLSX, paste | jd-bulk-template.xlsx / per-person variant | Browser, lib/jd/bulk.ts | bulkCreateJdEntries | Aligned; not Upload Master |
| Operations | Vendor Directory | Vendor bulk entry | CSV, XLS, XLSX, paste | vendor-directory-template.xlsx | Browser, vendor-bulk-grid.tsx | bulkCreateVendors | Aligned; not Upload Master |
| Incentive | Incentive Entries | Incentive entries import | XLSX | Incentive-Entries-Import-Template.xlsx | /incentive/template.xlsx | validateIncentiveEntriesImport, confirmIncentiveEntriesImport | Aligned; not Upload Master |
| Billing Outstanding | Outstanding page | Contract/collection import | XLS, XLSX, CSV, TXT, Sheets | Outstanding and Collection blank templates | /billing/outstanding/export.xlsx?template= | previewImport, confirmImport, undoImport | Available; not Upload Master |
| Salary | Salary page | Altus-Log salary-run import | XLSX | None | MISSING | previewSalaryImport, confirmSalaryImport, undoSalaryImport | Hardcoded mapping |
| Employee Master | Employee Master | Salary Profile Google Sheet import | Google Sheet | None | MISSING | previewSalaryProfileImport, confirmSalaryProfileImport | External-sheet import |
| Executive Calendar | Calendar workspace | Spreadsheet paste import | TSV/paste | None | MISSING/N/A | importExecBlocks | Paste-only |
| Accounts | Monthly Checklist | Direct CSV import | CSV | None | MISSING | createMonthlyItem per row | Duplicate family |
| Accounts | Weekly Checklist | Direct CSV import | CSV | None | MISSING | createWeeklyItem per row | Duplicate family |
| Accounts | Due Dates | Direct CSV import | CSV | None | MISSING | createDueItem per row | Duplicate family |
| Accounts | Task List | Task List and Screenshots import | CSV, XLS, XLSX | Accounts-Task-List-Template.xlsx | lib/templates/accounts-task-list.ts | bulkImportAccountsTasks | Aligned |
| Admin Panel | /admin/upload-master | Template replacement management | XLSX | Registry templates only | template_files and Documents storage | uploadTemplate, deleteTemplates | Management flow, not row import |

Operational, non-UI imports also exist. scripts/import-legacy.ts is exposed as
pnpm import:legacy. Other manual scripts include import-sheet.ts,
import-new-sheets.ts, import-outstanding.ts, import-outstanding-xlsx.ts,
import-accounts-cash-xlsx.ts, import-salary-breakup.ts, import-punches.ts,
import-onboarding.ts, import-incentives.ts, import-dcc.ts, and import-ctc.ts.
They are historical or operator-run entry points, not proven dead.

## 3. Template / Backend Mapping

### WMS Tasks: canonical importer

- Template: Altus-Tasks-Template.xlsx, generated by lib/templates/tasks.ts.
- Columns: canonical manifest in lib/tasks/template-columns.ts. Writable fields
  include Client, Subject / Category, Task Description, Notes, Doer (Assignee),
  Initiator, Due Date, status, priority, tags, links, and other task metadata.
  Task ID and Task No. are read-only reference columns.
- Required: Client, Subject / Category, Task Description, Doer, Due Date.
- Optional: remaining writable manifest columns.
- Parser: lib/import/task-import.ts reads CSV/XLSX, finds Task sheet/header,
  resolves employees, validates dates, status/priority, subjects, and tag limits.
- API/Server Action: app/(app)/tasks/import-actions.ts previewTaskImport then
  commitTaskImport. UI is components/tasks/task-import.tsx.
- Database destination: tasks plus taskEvents.
- Duplicate handling: no business upsert or duplicate detection; short-ID
  uniqueness retry only.
- Error handling: per-row preview errors and skipped rows; no error-file export.
- Permissions: requireAdmin. Download route requires signed-in user; registry
  access does not mirror importer admin-only permission.
- Trace: UI file picker > previewTaskImport > task-import parser > commitTaskImport
  reparse > tasks/taskEvents.

### WMS Tasks: alternate bulk grid

- Template: MISSING. components/tasks/tasks-bulk-grid.tsx accepts file or pasted
  rows but has no download.
- Columns: local grid field mapping; task data submitted to bulkCreateTasks.
- Required/optional: enforced by local grid and existing task creation action.
- Parser: client-side CSV/XLS/XLSX/paste handling, separate from canonical parser.
- Database destination: tasks through bulkCreateTasks.
- Duplicate handling/error handling: local row selection and validation; no common
  task-import preview/error-file path.
- Permissions: existing task creation authorization.
- Finding: duplicate implementation that can drift from canonical task template,
  parser, validation, and permission behavior.

### Goals: cascade importer

- Template: Altus-Goals-Template.xlsx. Static base is
  public/templates/Altus-Goals-Template.xlsx; lib/templates/goals.ts decorates
  it with current clients, goal lookups, and roster values.
- Download: API template key goals and legacy /goals/template.xlsx route.
- Template entry headers actually found: Area, Goal Title, Target Date, Measure,
  Actual, Target, Delegated, Type, Weight; decorator adds Client.
- Backend fields: manifest in lib/goals/template-columns.ts includes Goal Level,
  Goal Title, Year, Quarter, Month, Description/Notes, Goal Type/Type, Area,
  Client, Measure, Target, Target Amount, Actual, Actual Amount, Target Date,
  Weight, Goal Owner, Team Member(s), Dependency %, Reviewer, Status,
  Visibility/Share, Incentive, Incentive Amount, Incentive Kind, and Parent Goal
  ID reference fields.
- Required: server requires a recognizable title and a resolvable period;
  Goal Level/Year/Quarter/Month are required unless a legacy period key exists.
- Optional: descriptive, lookup, amount, ownership, dependency, reviewer,
  status, visibility, incentive, and parent fields as defined by manifest.
- Parser/API: app/(app)/goals/import/actions.ts importGoals parses CSV/XLSX and
  writes after Goals access and rate-limit checks.
- Database destination: goals.
- Duplicate handling: none; no upsert.
- Error handling: warnings returned, capped at 25; no error-file download.
- Permissions: requireGoalsAccess.
- Trace: GoalsImport > importGoals > manifest/header mapping > goals.

### Goals Board: level bulk uploader

- Template: API keys goals, monthlyGoals, quarterlyGoals, yearlyGoals, selected
  by level. Built-in source remains lib/templates/goals.ts.
- Columns: board parser recognizes Area, Goal, Measure, Actual, Target, Type and
  legacy Type aliases; it uses board period context and duplicate-title checks.
- Required: usable goal title; board context supplies destination bucket.
- Optional: remaining recognized fields.
- Parser/API: components/goals/board/goals-bulk-upload.tsx parses client-side,
  then calls bulkCreateGoals in app/(app)/goals/cascade/actions.ts.
- Database destination: goals.
- Duplicate handling: existing and intra-file titles flagged before import.
- Error handling: per-row preview errors; no download.
- Permissions: existing Goals board write authorization.
- Finding: separate client parser shares a global template with cascade importer,
  creating two incompatible consumers for one workbook.

### Weekly Goals

- Template: Weekly-Goals-Template.xlsx, lib/templates/weekly-goals.ts, registry
  key weekly_goals_bulk_import.
- Columns: Client, Subject, Priority, Target Date, Incentive, KPI, Target,
  % Done, Explanation, Notes, Link, Employee.
- Required: Target. Employee fan-out is accepted for admins only.
- Optional: all other columns.
- Parser/API: components/weekly-goals/weekly-goals-import.tsx >
  importWeeklyGoals in app/(app)/weekly-goals/actions.ts.
- Database destination: weeklyGoals.
- Duplicate handling: none; no upsert.
- Error handling: warnings capped at 20; no error-file download.
- Permissions: signed-in user, weekly-filled gate, rate limit; admin grants
  employee fan-out.
- Finding: generator creates title rows before entry header while action assumes
  row 0 is header. Generated download is likely rejected as unrecognized.

### Project Plan

- Template: Project-Plan-[kind]-template.xlsx, generated by
  lib/templates/projects.ts. Registry key projects_bulk_import.
- Columns: Name required; Owner, Target Date, Start Date, End Date, Description
  optional. Project kind omits Start Date and End Date.
- Parser: lib/project-plan/bulk.ts, shared by template generation and client
  parser. Header aliases accepted; maximum 300 rows.
- API/Server Action: PlanBulkUpload > bulkCreatePlanNodes in
  app/(app)/project-plan/actions.ts.
- Database destination: projectNodes; executable node types also sync a WMS task.
- Duplicate handling: client detects names already in target and duplicate file
  rows, but server action does not repeat that check or offer upsert.
- Error handling: preview row errors/warnings; no download.
- Permissions: existing project-plan write authorization.
- Finding: one Upload Master override key serves every kind. A replacement made
  for one kind can omit columns needed by another kind.

### DCC WCC and MCC

- Templates: /dcc/wcc/template.xlsx and /dcc/mcc/template.xlsx, generated by
  lib/compliance/bulk-template.ts from shared bulkColumns definitions.
- WCC columns: Employee, Compliance, Frequency, Days when frequency needs it,
  plus template-supported optional scheduling/details fields.
- MCC columns: Employee, Compliance, Frequency, Deadline Day; deadline/month
  fields become conditionally required for applicable recurrence.
- Parser: lib/compliance/bulk.ts header aliases, maximum 500 rows.
- Required: WCC Employee/Compliance/Frequency and conditional Days. MCC
  Employee/Compliance/Frequency and conditional deadline fields.
- API/Server Action: ComplianceBulkUpload > bulkAddCompliances in
  app/(app)/dcc/compliance-actions.ts.
- Database destination: dccKpiItems.
- Duplicate handling: server rejects existing owner/title pair; no upsert.
- Error handling: dry-run problems and UI preview; no error-file download.
- Permissions: signed-in user, manageable-person scope, rate limit.
- Status: template/parser share source and align. Neither template is in Upload
  Master registry, so neither is replaceable there.

### Operations Checklist

- Template: browser-generated [slug]-tasks-template.xlsx from
  lib/operations/checklist-bulk.ts.
- Run columns: Client, Subject, Task, Doer, Initiator, Target Date, Day for
  event lists, Frequency. Master columns: Task, Subject, Day for event lists,
  Doer, Backup, Instructions, File link.
- Required: Task; valid resolved people; target-specific required fields.
- Optional: Client, Subject, initiator, backup, instructions, file link, and
  fields not used by selected target.
- Parser: readChecklistMatrix in lib/operations/checklist-bulk.ts; maximum 500;
  validates day-first dates, person lookup, backup differs from doer, event
  offsets, and frequency.
- API/Server Action: ChecklistBulkUpload > bulkCreateChecklistRows in
  app/(app)/operations/checklist/actions.ts.
- Database destination: opsChecklistItems.
- Duplicate handling: none; no upsert.
- Error handling: row preview; no error-file download.
- Permissions: requireEditor plus rate limit.
- Status: aligned browser template/parser; bypasses Upload Master.

### Operations Job Description

- Template: browser-generated jd-bulk-template.xlsx or per-person filename,
  from jdTemplateMatrix in lib/jd/bulk.ts.
- Columns: Position, Person, Function, Client, Subject, Task, Frequency,
  Time (mins), Video URL, Guidelines URL, Template URL, Notes, Add to DCC,
  Add to WMS, Add to Event, Assign To.
- Required: Task and either Position or Person.
- Optional: remaining fields, subject to type-specific checks.
- Parser: readJdMatrix, maximum 500. Resolves position/person, parses
  recurrence, duration, URLs, Yes/No flags, and assignees.
- API/Server Action: JdBulkUpload > bulkCreateJdEntries in
  app/(app)/operations/job-description/actions.ts.
- Database destination: jdEntries and jdAssignments.
- Duplicate handling: none; no upsert.
- Error handling: preview errors/warnings; all-or-nothing server transaction;
  no error-file download.
- Permissions: requireHrStaff and rate limit.
- Status: aligned browser template/parser; bypasses Upload Master.

### Operations Vendor Directory

- Template: browser-generated vendor-directory-template.xlsx in
  components/operations/directory/vendor-bulk-grid.tsx.
- Columns: Category, First Name, Last Name, Cell No, Email Address, Address
  Lines 1-4, Nearby Landmark, City, State, Pincode, Website, AMC, Notes.
- Required: Category and First Name.
- Optional: remaining columns.
- Parser: lib/operations/directory.ts; validates email and pincode; normalizes
  website and AMC values; maximum 500 rows.
- API/Server Action: vendor grid > bulkCreateVendors in
  app/(app)/operations/directory/actions.ts.
- Database destination: opsVendors.
- Duplicate handling: none. Invalid rows are skipped; no upsert.
- Error handling: grid preview/per-row failures; no error-file download.
- Permissions: HR staff or superadmin.
- Status: aligned browser template/parser; bypasses Upload Master.

### Incentive Entries

- Template: Incentive-Entries-Import-Template.xlsx generated by
  lib/exports/incentive-entry-template.ts and downloaded from
  /incentive/template.xlsx.
- Columns: Employee ID, Employee Name, Incentive Product, Period Month, Amount,
  Approved, Approved Amount, Approved Date, Paid, Paid Amount, Paid Date, Note.
- Required: Employee ID, Employee Name, Incentive Product, Period Month, Amount,
  Approved, Paid.
- Optional: approved/paid amounts and dates, Note.
- Parser: lib/import/incentive-import.ts, first XLSX sheet, maximum 2,000 rows.
  It validates employee-code/name match, active product, month/date, currency,
  and Yes/No values.
- API/Server Action: validateIncentiveEntriesImport then
  confirmIncentiveEntriesImport in app/(app)/incentive/admin-actions.ts.
- Database destination: incentiveEntries.
- Duplicate handling: none; no upsert.
- Error handling: issue list/preview; no error-file download.
- Permissions: requireAdmin plus module view gate.
- Status: template/parser align; template bypasses Upload Master.

### Billing Outstanding and Collection

- Templates: blank Outstanding and Collection XLSX sheets from
  /billing/outstanding/export.xlsx?template=. UI exposes both from export dialog.
- Columns: Outstanding legacy shape has 26 fields. Collection shape has 7 fields.
  Exact header mapping is in lib/outstanding/import-shape.ts and
  lib/outstanding/import-map.ts.
- Required/optional: row requirements are import-map dependent; parser maps
  recognized aliases after converting workbook sheets to CSV.
- Parser/API: OutstandingImportDialog converts XLS/XLSX sheets to CSV, then
  previewImport and confirmImport in app/(app)/billing/outstanding/actions.ts.
- Database destination: contracts, installments, collections; undoImport removes
  a recorded import batch.
- Duplicate handling: import mapping detects existing rows and skips/idempotently
  handles supported records; no general update/upsert mode.
- Error handling: unmatched summary and preview; no downloadable error file.
- Permissions: billing workspace administrator.
- Status: templates match legacy importer format, but bypass Upload Master.

### Salary Altus-Log

- Template: MISSING. UI requires an externally supplied Altus-Log XLSX workbook.
- Expected file: Summary sheet, or first sheet fallback. Parser uses hardcoded
  indexes: financial year, month, employee, designation, entity, then attendance
  columns at positions 6 through 14.
- Required: valid April-2026-or-later month, active employee match, and salary
  profile. Other row handling follows Altus-Log parser.
- Parser/API: lib/salary/altus-log-import.ts > previewSalaryImport >
  confirmSalaryImport in app/(app)/salary/import/actions.ts.
- Database destination: salaryRuns, tagged by import batch.
- Duplicate handling: upsert by employeeId/month only for imported source rows;
  generated/disbursed rows are retained. Undo by batch exists.
- Error handling: preview lists unmatched, out-of-range, and missing-profile
  records; no error-file download.
- Permissions: requireAdmin and rate limit.
- Finding: hardcoded column indices with no downloadable contract template.

### Salary Profile Google Sheet

- Template: MISSING. Source is configured Google Sheet, not uploaded file.
- Columns: external sheet lookup contract in salary import profile actions.
- Parser/API: previewSalaryProfileImport and confirmSalaryProfileImport in
  app/(app)/salary/import/profile-actions.ts.
- Database destination: salaryProfiles plus lookup records.
- Duplicate handling: conflict-ignore and profile upsert behavior.
- Error handling: preview/confirmation response; no downloadable error report.
- Permissions: admin only.
- Finding: no visible source-schema/template contract in application UI.

### Executive Calendar

- Template: MISSING/N/A. User pastes a tab-separated Google Sheets block.
- Columns: parser finds header containing at least two dates; first column must
  be a clock/time. Repeated title cells are collapsed.
- Parser/API: ExecImportDialog > parseSheetPaste in lib/exec-calendar/import.ts
  > importExecBlocks in app/(app)/events/actions.ts.
- Database destination: execCalendarEvents, inserted in chunks.
- Duplicate handling: skips existing same owner/day/start/title event.
- Error handling: warnings and unclassified categories shown in UI; no download.
- Permissions: requireUser and rate limit.

### Accounts Monthly Checklist, Weekly Checklist, and Due Dates

- Template: MISSING for each. Existing exports are datasets, not documented
  import templates.
- File type: CSV only, shared file chooser in
  components/accounts/checklist-table-toolbar.tsx.
- Parser/API: client parses CSV and each module loops per-row into
  createMonthlyItem, createWeeklyItem, or createDueItem.
- Database destination: module-specific checklist/due-date tables.
- Duplicate handling: no shared batch duplicate contract; behavior follows
  individual create action.
- Error handling: client/action response only; no preview standard or error-file.
- Permissions: Accounts access and each existing create action's authorization.
- Finding: three near-identical direct CSV implementations with inconsistent
  mapping/validation risk and no templates.

### Accounts Task List and Screenshots to Post

- Template: Accounts-Task-List-Template.xlsx, lib/templates/accounts-task-list.ts,
  registry key accounts-task-list.
- Task List columns: Sr. No., Area, Task Description, Status, Links, Target
  Date, Actual Date, Gear, Notes.
- Screenshots columns: Sr. No., Project Name, Project Details, Frequency,
  Target Date, Actual Date, Gear, Notes.
- Required: parser skips blank/incomplete rows; business-required fields are
  enforced by lib/accounts/task-import.ts.
- Parser/API: AccountsTaskImport > bulkImportAccountsTasks >
  lib/accounts/task-import.ts.
- Database destination: accountsTaskList and accountsScreenshots; it can add
  lookup values for status, gear, and frequency.
- Duplicate handling: append-only; no upsert.
- Error handling: result response; no error-file download.
- Permissions: requireAccountsAccess and rate limit.
- Status: generated template/parser align.

### Upload Master

- Purpose: XLSX template replacement, not business row ingestion.
- Input: one .xlsx file for a registered key only.
- Validation: key must be in lib/templates/registry.ts; .xlsx extension and
  generic file-shape validation. Replacement headers/sheets are not validated.
- API/Server Action: uploadTemplate and deleteTemplates.
- Database/storage: template_files metadata; Documents bucket path
  templates/[key]/[uuid]/[safe filename].
- Duplicate handling: one row per key; update existing override or insert new
  override. Deletion restores built-in.
- Errors: action response/toast; no template schema report.
- Permissions: requireAdmin plus requireModuleEdit(admin.masters.upload-master).

## 4. Template Mismatches

1. Goals cascade: downloaded entry grid lacks Goal Level, Year, Quarter, Month,
   and Goal Owner, although importGoals requires a resolvable period when no
   legacy period key is submitted. Delegated appears in template but has no
   manifest mapping. Result: rows from current download can warn/skip instead of
   importing.
2. Weekly Goals: generator places non-header title content before header while
   importWeeklyGoals reads first row as header. Generator comments and help text
   claim first-sheet header row. Result: generated template is likely rejected
   as having no recognized columns.
3. Project Plan override: one Upload Master replacement applies to all plan
   kinds, although built-in kinds have different columns. A valid replacement
   for Project can be invalid for Action or Sub-action.
4. Upload Master replacement validation: it checks extension and generic upload
   shape, not feature headers/sheets. Any registered override can become
   parser-incompatible after upload.

## 5. Missing / Duplicate / Dead Flows

### Missing templates

- Tasks alternate bulk grid.
- Salary Altus-Log import.
- Salary Profile Google Sheet import.
- Executive Calendar paste import.
- Accounts Monthly Checklist direct CSV import.
- Accounts Weekly Checklist direct CSV import.
- Accounts Due Dates direct CSV import.

### Template coverage gaps

- WCC, MCC, Incentive, Outstanding/Collection, JD, Checklist, and Vendor
  templates are live but absent from Upload Master registry.
- Registry has 8 keys only: Tasks, Goals, Weekly Goals, Monthly Goals,
  Quarterly Goals, Yearly Goals, Projects, Accounts Task List.

### Duplicate templates or implementations

- Tasks has canonical server preview/commit importer and separate local bulk grid.
- Goals cascade importer and board importer share template family but parse and
  supply period context differently.
- Accounts Monthly, Weekly, and Due Dates repeat client CSV parsing and per-row
  create patterns.
- Outstanding has in-app importer plus import-outstanding.ts and
  import-outstanding-xlsx.ts. They share import mapping, reducing but not
  removing entry-point drift.
- Stable legacy routes for Tasks, Goals, and Accounts templates are intentional
  aliases of registry downloads, not dead duplicates.

### Unused or dead import code

- bulkUploadIncentiveEntries in app/(app)/incentive/admin-actions.ts has no
  in-repository caller. Browser uses validate/confirm actions directly. Treat as
  probable compatibility wrapper; external integrations were not audited.
- No live caller was found for the operational scripts above through normal UI.
  They are not proven dead because operators may invoke them manually.

## 6. Recommended Standard

1. Register every downloadable structured-data template in one registry.
2. Generate every template from same typed column manifest used by parser.
3. Validate uploaded replacement workbook headers, required sheets, and version
   before storing it.
4. Include template version, schema sheet, examples, required/optional marker,
   date format, duplicate mode, and owner permission note.
5. Standardize Import > server preview > row errors > downloadable error CSV >
   explicit create/update/upsert confirmation.
6. Make duplicate policy explicit for every importer.
7. Reuse one CSV/XLSX reader, header normalizer, row-error shape, and row-limit
   policy.
8. Give paste-only/external-source imports a documented sample contract or mark
   them intentionally template-free in UI.
9. Add parity tests for every live template, including non-registry browser and
   route-generated templates.

## Appendix: Operator and Migration Imports

These scripts are not mounted by a product page. Only import:legacy is exposed
in package.json. They need a runbook before removal or replacement.

| Script | Source format | Contract / destination | Template status |
| ------ | ------------- | ---------------------- | --------------- |
| scripts/adapt-form-csv.ts | tasksandall.csv | Adapts legacy task data to employees.csv and tasks.csv | No template |
| scripts/import-legacy.ts | employees.csv, tasks.csv | employees, tasks, taskEvents; legacy-key dedupe | No template |
| scripts/import-sheet.ts | Fixed Work-To-Employee XLSX | employees, tasks, taskEvents; legacy-key dedupe | No template |
| scripts/import-new-sheets.ts | Fixed Work-To-Employee XLSX | employees, tasks, taskEvents; legacy-key dedupe | No template |
| scripts/import-outstanding.ts | CSV aliases | Outstanding domain through shared import map; natural duplicate skip | No template |
| scripts/import-outstanding-xlsx.ts | Fixed-index XLSX | Outstanding domain through shared import map; natural duplicate skip | No template |
| scripts/import-accounts-cash-xlsx.ts | Fixed-layout XLSX | accountsCashItems, months, limits; upsert | No template |
| scripts/import-salary-breakup.ts | Salary_Breakup.xlsx, row 3 onward | salary_breakup; employee/month upsert | No template |
| scripts/import-dcc.ts | External Google Sheet | DCC items and related masters; natural-key upsert/archive | No template |
| scripts/import-onboarding.ts | External Google Sheet A1:BZ400 | onboardingSubmissions by employee | No template |
| scripts/import-incentives.ts | .mis-sheet-full.json | incentive catalog, entries, projects; destructive refresh | No template |
| scripts/import-punches.ts | Existing imported DB data | holidays and attendance logs transform | Not source-file import |
| scripts/import-ctc.ts | Existing imported DB data | salaryProfiles transform | Not source-file import |
| scripts/seed-accounts-*.ts | Sheets/API or fixed local inputs | Accounts seed domains | Operator seed, not UI import |
| scripts/seed-accounts-cash.ts | Sheet/API input | Accounts cash domain; overlaps XLSX cash importer | Operator seed, not UI import |

## Evidence Index

- Central registry and access: lib/templates/keys.ts, registry.ts, resolve.ts,
  access.ts, download.ts, app/api/templates/[key]/route.ts.
- Upload Master: app/(admin)/admin/upload-master/actions.ts and
  components/admin/upload-master/master-table.tsx.
- Template parity coverage currently applies registry templates only:
  tests/unit/template-registry.test.ts and tests/unit/template-download.test.ts.
- Legacy operational import scripts are listed above; their source is scripts/.
