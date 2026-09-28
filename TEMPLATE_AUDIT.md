# WMS Spreadsheet Template Audit

**Scope:** Complete repository audit of Excel/CSV templates, bulk uploads, downloadable spreadsheets, import/export handlers, validations, lookup sources, and stale/hardcoded data.

**Audit mode:** Read-only. No application code was modified.

Legend: `T` text, `N` number/currency, `D` date, `M` month, `B` boolean, `DD` dropdown, `EL` employee lookup, `PL` product lookup, `F` formula/derived.

## A. Complete Template Inventory

| # | Module / template | Generator / format | Import / processor | Dynamic status | Main issues |
|---:|---|---|---|---|---|
| 1 | Tasks Bulk Import | `lib/templates/tasks.ts`, ExcelJS XLSX; 4 sheets, hidden `Lists` | `lib/import/task-import.ts`, `tasks/import-actions.ts` | Roster/client/subject dynamic; enums hardcoded | Non-transactional commit; client validation permissive |
| 2 | Goals Bulk Import | `lib/templates/goals.ts`, ExcelJS XLSX; decorated hand-authored workbook | `goals/import/actions.ts` | Master lists partly dynamic; code constants | Invalid rows skipped; non-transactional |
| 3 | Weekly Goals Bulk Import | `lib/templates/weekly-goals.ts`, ExcelJS; 3 sheets | `weekly-goals/actions.ts` | Employee roster dynamic; enums hardcoded | No transaction; first-row header mapping |
| 4 | Monthly Goals Bulk Import | Goals generator/manifest | Goals importer | Same as Goals | Same |
| 5 | Quarterly Goals Bulk Import | Goals generator/manifest | Goals importer | Same as Goals | Same |
| 6 | Yearly Goals Bulk Import | Goals generator/manifest | Goals importer | Same as Goals | Same |
| 7 | Project Plan Bulk Import | `lib/templates/projects.ts`, ExcelJS; per plan kind | `project-plan/bulk.ts`, `project-plan/actions.ts` | Employee owner list dynamic | Blank owner/date defaults silently |
| 8 | Accounts Task List | `lib/templates/accounts-task-list.ts`, SheetJS; 2 sheets | `accounts/task-import.ts`, `task-list/import-actions.ts` | Example data/static widths | No validations; cross-table partial import |
| 9 | Compliance WCC | `lib/compliance/bulk-template.ts`, ExcelJS; 4 sheets, hidden `Lists` | `lib/compliance/bulk.ts` | Employee dynamic; frequency/day/month lists hardcoded | Good validation; max 500 |
| 10 | Compliance MCC | Same WCC generator/importer | Same | Same | Same |
| 11 | Job Description Bulk | Client SheetJS; `Job Descriptions` + `Lists` | `lib/jd/bulk.ts`, JD actions | People/context dynamic; functions partly hardcoded | No Excel cell validation |
| 12 | Checklist Bulk, run | Client SheetJS; `Tasks` + `Lists` | checklist parser/actions | People/subjects dynamic; frequency hardcoded | Server validation only |
| 13 | Checklist Bulk, master | Same generator | Same | Same | Same |
| 14 | Vendor Directory Bulk | Client SheetJS; one `Vendors` sheet | directory actions | Example row hardcoded | Valid rows inserted despite failures |
| 15 | Incentive Entry Bulk | `lib/exports/incentive-entry-template.ts`, ExcelJS; visible `Incentive Entries`, hidden `_lists` | `lib/import/incentive-import.ts`, incentive admin actions | Employees/products dynamic; Yes/No hardcoded | Excel bidirectional lookup is formula-limited |
| 16 | Incentive Catalog Export | ExcelJS | Export only | Live DB catalog | Export, not import template |
| 17 | Tasks Rich Export | SheetJS | Export only | Live filtered tasks | Human-readable values, no validation |
| 18 | CC Master Export | ExcelJS | Export only | Dynamic cards/months | Dynamic column count |
| 19 | Vasa Interpersonal Export | SheetJS | Export only | Dynamic snapshots/parties | Matrix shape changes |
| 20 | Events Monthly Export | ExcelJS, 3 sheets | Export only | Live events/obligations/month | No validations |
| 21 | Attendance Export | SheetJS, 2 sheets | Export only | Live monthly dashboard | Dynamic matrix width |
| 22 | Training Attendance Export | SheetJS | Export only | Live sessions | Headers inferred from row objects |
| 23 | Salary XLSX Export | SheetJS | Export only | Live payroll run | Headers hardcoded |
| 24 | Salary CSV Export | CSV | Export only | Live payroll rows | Subtotal/grand-total rows mixed with detail |
| 25 | Billing Outstanding Template | SheetJS, header-only XLSX | Outstanding import actions | Headers static | No validation |
| 26 | Billing Collection Template | SheetJS, header-only XLSX | Outstanding import actions | Headers static | No validation |
| 27 | Billing Outstanding Export | SheetJS, 2 sheets | Export only | Live data | Export shape differs from import template |
| 28 | Audit Logs Export | ExcelJS | Export only | Live filtered logs | No validation |
| 29 | Exit Register Export | CSV | Export only | Live exit register | Headers hardcoded |
| 30 | Module Backup Workbook | ExcelJS | Restore/module processing | Dataset-driven | Backup workbook, not entry template |
| 31 | Legacy employee/task CSV | CSV parser | `lib/import/csv-schemas.ts` | Schema constants | Separate legacy schema |
| 32 | Salary breakup importer | SheetJS parser | `lib/salary/breakup-sheet.ts` | Input-dependent | Import-only; no generated template |
| 33 | Legacy scripts | XLSX/CSV scripts under `scripts/` | Script-specific importers | Source-file dependent | No shared schema |

## B. Column / Field Inventory

### Tasks

`Task ID(F/system)`, `Task No.(F/system)`, `Client(T, client roster, dynamic suggestion)`, `Subject / Category(DD, subject roster, dynamic)`, `Task Description(T, required)`, `Notes(T)`, `Doer (Assignee)(EL, Employee Master)`, `Initiator(EL, Employee Master)`, `Priority(DD, hardcoded enum)`, `Status(DD, hardcoded enum)`, `Due Date(D, required)`, `Revised Due Date(D)`, `Starts At(D/time)`, `Ends At(D/time)`, `All Day?(B/DD, hardcoded Yes/No)`, `Recurrence(DD, hardcoded enum)`, `Tags(T)`, `Created By(F/system)`.

Validation: dropdowns, date checks in parser, required fields, aliases, widths, filters, freeze panes, protected cells, hidden lists. Employee mapping accepts name/email. Client is permissive. Commit is not transactional.

### Goals / Monthly / Quarterly / Yearly

`Goal ID(F)`, `Goal Level(DD)`, `Goal Title(T, required)`, `Year(N)`, `Quarter(DD)`, `Month(DD)`, `Week (Mon date)(D/informational)`, `Description / Notes(T)`, `Goal Type(DD)`, `Type(DD/category)`, `Area(DD)`, `Client(DD)`, `Measure(DD)`, `Target(N)`, `Target Amount (Rs.)(N/currency)`, `Actual(N)`, `Actual Amount (Rs.)(N/currency)`, `Progress %(F)`, `Target Date(D)`, `Weight(N)`, `Goal Owner(EL)`, `Function(DD/derived)`, `Team Member(s)(EL/list)`, `Dependency %(N)`, `Reviewer(EL)`, `Assignment Type(F)`, `Assigned By(F)`, `Priority(DD/informational)`, `Status(DD)`, `Visibility / Share(DD)`, `Incentive?(B/DD)`, `Incentive Amount (Rs.)(N)`, `Incentive Kind(DD)`, `Parent Goal ID(lookup)`, `Created By(F)`, `Last Updated By(F)`.

Invalid rows are skipped/warned. `Week (Mon date)` is informational/skipped. Partial insertion is possible.

### Weekly Goals

`Client(T)`, `Subject(T)`, `Priority(DD/hardcoded)`, `Target Date(D)`, `Incentive(B/DD)`, `KPI(B/DD)`, `Target(T)`, `% Done(N 0–100)`, `Explanation(T)`, `Notes(T)`, `Link(T/URL)`, `Employee(EL, Employee Master)`.

### Project Plan

`Name(T, required)`, `Owner(EL, Employee Master)`, `Target Date(D)`, `Start Date(D)`, `End Date(D)`, `Description(T)`. Container levels omit start/end. Blank owner defaults importer; blank target date defaults today. Server transaction protects plan/task consistency.

### Accounts Task List

Sheet 1: `Sr. No.(N)`, `Area(T)`, `Task Description(T)`, `Frequency(T)`, `Target Date(D)`, `Responsible Person(T)`, `Status(T)`, `Notes(T)`.

Sheet 2: `Sr. No.(N)`, `Project Name(T)`, `Project Details(T)`, `Screenshot Link(T/URL)`, `Posted?(B/text)`.

No workbook validation or hidden lookup. Unknown status/gear/frequency are retained. Separate inserts can partially succeed.

### Compliance WCC

`Employee(EL, Employee Master)`, `Section(T)`, `Compliance(T)`, `Frequency(DD, hardcoded WCC list)`, `Days(DD/N, hardcoded)`, `Mins(N)`, `Target(N)`, `Unit(T)`.

### Compliance MCC

`Employee(EL, Employee Master)`, `Section(T)`, `Compliance(T)`, `Frequency(DD, hardcoded MCC list)`, `Day 1(DD)`, `Day 2(DD)`, `Day 3(DD)`, `Due Month(DD, hardcoded month list)`, `Target(N)`, `Unit(T)`.

Validation includes required headers, employee ambiguity, duplicate employee/title, frequency/day/target rules, max 500, row errors/warnings. ExcelJS provides dropdowns, numeric/text validation, conditional formatting, filters, hidden lists.

### Job Description Bulk

`Position(T/position master)`, `Person(EL)`, `Function(DD/T, partly hardcoded)`, `Client(T)`, `Subject(DD)`, `Task(T, required)`, `Frequency(DD/text)`, `Time (mins)(N)`, `Video URL(T/URL)`, `Guidelines URL(T/URL)`, `Template URL(T/URL)`, `Notes(T)`, `Add to DCC(B/DD)`, `Add to WMS(B/DD)`, `Add to Event(B/DD)`, `Assign To(EL/list)`.

Lists are contextual but workbook rules are absent. Parser validates URLs, minutes, frequency, duplicates and assignments. Commit is transactional.

### Checklist Bulk

Run target: `Client(T)`, `Subject(DD/T)`, `Task(T, required)`, `Doer(EL)`, `Initiator(EL)`, `Target Date(D)`, optional `Day(N)` for events, `Frequency(DD)`.

Master target: `Task(T)`, `Subject(DD/T)`, optional `Day(N)`, `Doer(EL)`, `Backup(EL)`, `Instructions(T)`, `File link(T/URL)`.

Lists contain contextual people/subjects. No Excel validation; server transaction is all-or-nothing.

### Vendor Directory

`Category(T)`, `First Name(T)`, `Last Name(T)`, `Cell No(T)`, `Email Address(T)`, `Address Line 1(T)`, `Address Line 2(T)`, `Address Line 3(T)`, `Address Line 4(T)`, `Nearby Landmark(T)`, `City(T)`, `State(T)`, `Pincode(T)`, `Website(T/URL)`, `AMC(B parsed Yes/No)`, `Notes(T)`.

One hardcoded example row. Header aliases allow reorder. Valid rows may insert while invalid rows are reported.

### Incentive Bulk

`Employee ID(EL)`, `Employee Name(EL)`, `Incentive Product(PL)`, `Period Month(M)`, `Amount(N/currency)`, `Approved(B/DD)`, `Approved Amount(N/currency)`, `Approved Date(D)`, `Paid(B/DD)`, `Paid Amount(N/currency)`, `Paid Date(D)`, `Note(T)`.

Employee and product values are dynamic. Yes/No is hardcoded. Hidden `_lists`, named ranges, dropdowns, date/number validation, freeze/filter, 100 rows. Import validates employee consistency, product, dates, amounts and statuses, then inserts transactionally. Excel name↔ID editing is not fully bidirectional because entering a name overwrites the formula.

### Billing Templates

Outstanding: `S. No.`, `First Name`, `Last Name`, `Cell No`, `Product`, `Responsible Person`, `Amount`, `GST`, `Total`, `Paid Amt`, `Balance`, `Payment Cycle`, `Due Date`, `Retainer Start Date`, `Retainer End Date`, `Bill Date`, `Start Date`, `End Date`, `No. of Subscription`, `Subscription Start Date`, `Frequency`, `Entity`, `Payment Mode`, `PDC Received`, `Other Comments`, `Attachments`.

Collection: `S.No`, `Name`, `Amount`, `Payment Mode`, `Responsible Person`, `Other Comments`, `Attachments`.

Header-only SheetJS templates. No workbook validation.

### Export-only schemas

- Incentive catalog: `Incentive`, `Amount (INR)`, `Applies To`, `Description`, `Notes`, `Status`.
- Tasks rich: `Client Name`, `Subject`, `Status`, `Approval Status`, `Priority`, `Doer`, `Initiator`, `Due Date`, `Revised Target Date`, `Created At`, `Tags`.
- CC Master: `S. No`, `Entity Name`, `Card Name`, `ECS`, `ECS From?`, `Stmt Period`, `St Dt`, `Due Dt`, `Soft Copy Auto Email?`, followed by dynamic monthly fields.
- Events: `Time` plus dated day columns; legend and obligations columns `Obligation`, `Counterparty`, `Cadence`, `Monthly Target`, `Compulsory`, `This Month`, `Penalty Note`.
- Attendance Summary: `Employee`, `Present`, `Absent`, `Half-Day`, `Late`, `Left-Early`, `Late-Waived`, `Weekly-Off`, `Holiday`, `Holiday-Present`, `Paid-Leave`, `Unpaid-Leave`, `Comp-Off`, `Payable-Days`; daily columns generated per date.
- Salary XLSX: 15 hardcoded payroll/leave/attendance fields.
- Salary CSV: `PAYROLL_COLUMNS` plus subtotal/grand-total rows.
- Outstanding export: `S. No.`, `Client`, `Product`, `Cycle`, `Due Date`, `Balance`, `Days Overdue`, `Entity`, `Responsible`, `Status`; collections: `S. No.`, `Client`, `Amount`, `Payment Mode`, `Responsible`, `Comments`, `Collected At`.
- Audit Logs: 21 fields: Date, Time, Person, Employee ID, Function, Designation, Entity, Module, Page, Route, Event Type, Action, Resource Type, Resource ID, Resource Name, Status, Reason, Estimated Time (min), Before Changes, After Changes, Actor Type.
- Exit CSV: Name, Email, Department, Designation, Joined On, Exit Date, Exit Type, Exit Reason, Status, Notes.
- Training Attendance: inferred object keys from session rows.
- Vasa: dynamic matrix columns by snapshot/party.
- Module backup: dataset-defined columns per sheet plus metadata/files.

## C. Dynamic vs Hardcoded Findings

Dynamic: employee rosters, tasks clients/subjects, incentive products, project owners, compliance employees, JD/checklist people and subjects, live export rows, attendance/events/salary matrices.

Hardcoded or partly hardcoded: Yes/No lists, task/goal statuses and priorities, recurrence/frequencies, compliance day/month lists, JD functions, Accounts examples, Vendor sample row, salary headers, outstanding headers, exit headers, legacy schemas.

Staleness risks: client-generated SheetJS files reflect page state; hand-authored Goals workbook can drift from its manifest; header-only Outstanding files contain no current master data; registry overrides can replace built-ins through Upload Master.

## D. Duplicate / Inconsistent Field Names

- Employee: `Employee`, `Employee Name`, `Emp Name`, `Person`, `Doer`, `Owner`, `Responsible Person`, `Assign To`.
- Employee ID: `Employee ID`, `Emp ID`, `Employee Code`, `ID`.
- Product: `Product`, `Product Name`, `Incentive Product`, `Incentive`.
- Period: `Period Month`, `Month`, `Month/Year`, `Target Date`, `Due Date`.
- Subject: `Subject`, `Subject / Category`, `Category`, `Area`, `Type`.
- Description: `Task Description`, `Task`, `Description`, `Details`, `Work`.
- Notes: `Note`, `Notes`, `Comments`, `Other Comments`, `Remarks`.
- Dates vary between true Excel dates, formatted strings, ISO strings and parser-specific coercion.
- Booleans vary between `Yes/No`, `Y/N`, `true/false`, `1/0` and free text.

## E. Import Validation Weaknesses

Non-transactional or partially inserting paths:

1. Tasks: individual inserts; later failure leaves earlier tasks.
2. Goals: invalid rows skipped; individual inserts.
3. Weekly Goals: grouped inserts without transaction.
4. Accounts Task List: task and screenshot inserts separate.
5. Events: chunked inserts without transaction.
6. Vendors: valid rows inserted while invalid rows are reported.

Additional weaknesses: unknown columns are often ignored; aliases can silently discard fields; client/subject values are permissive; many templates have no Excel-level validation; missing owners/dates can default silently; legacy and modern schemas are duplicated; training headers are inferred; employee matching is commonly name/email rather than one ID-first contract.

## F. Templates Requiring Auto-Update

Highest priority: Incentive employee/product lookups; Goals client/area/measure/employee lists; Tasks client/subject/employee lists; Compliance employees; JD/checklist people, subjects and clients; Project owners; Outstanding product/entity/payment-mode/responsible values; all dropdowns currently backed by code constants but intended to be WMS master data.

## G. Recommended Common Architecture

`WMS master data → shared schema manifest → fresh ExcelJS workbook → one visible entry sheet + hidden internal lookup ranges → validations/formulas/styles → upload → header normalization → full-row validation → preview → explicit confirmation → one transaction → import summary`.

Standards:

- One canonical manifest per domain.
- Stable field keys separate from display headers.
- Shared import aliases.
- Fresh master-data snapshot for every download.
- ExcelJS for all XLSX templates.
- Hidden lookup ranges only when required.
- Explicit required/type/date/number/dropdown validation.
- Reject invalid rows before writes.
- Transactional all-or-nothing commit.
- Preserve true Excel dates and numbers.
- Employee ID plus verified employee name as the common identity contract.
- Separate export schemas from import schemas.

## H. Exact Files for Future Implementation

### Template and manifests

`lib/templates/registry.ts`, `lib/templates/resolve.ts`, `lib/templates/tasks.ts`, `lib/templates/goals.ts`, `lib/templates/weekly-goals.ts`, `lib/templates/projects.ts`, `lib/templates/accounts-task-list.ts`, `lib/goals/template-columns.ts`, `lib/tasks/template-columns.ts`, `lib/weekly-goals/template-columns.ts`, `lib/project-plan/bulk.ts`, `lib/compliance/bulk.ts`, `lib/compliance/bulk-template.ts`, `lib/jd/bulk.ts`, `lib/operations/checklist-bulk.ts`, `lib/operations/directory.ts`, `lib/exports/incentive-entry-template.ts`, `lib/import/incentive-import.ts`.

### Import/actions

`app/(app)/tasks/import-actions.ts`, `app/(app)/goals/import/actions.ts`, `app/(app)/weekly-goals/actions.ts`, `app/(app)/accounts/task-list/import-actions.ts`, `app/(app)/project-plan/actions.ts`, `app/(app)/operations/checklist/actions.ts`, `app/(app)/operations/job-description/actions.ts`, `app/(app)/operations/directory/actions.ts`, `app/(app)/incentive/admin-actions.ts`, `app/(app)/billing/outstanding/actions.ts`, `app/(app)/events/actions.ts`, `app/(app)/salary/import/actions.ts`.

### Client generators

`components/operations/job-description/jd-bulk-upload.tsx`, `components/operations/checklist/checklist-bulk-upload.tsx`, `components/operations/directory/vendor-bulk-grid.tsx`, `components/project-plan/plan-bulk-upload.tsx`, `components/incentive/incentive-import-dialog.tsx`.

### Export/template routes

`app/(app)/incentive/template.xlsx/route.ts`, `app/(app)/billing/outstanding/export.xlsx/route.ts`, `app/(app)/salary/export.xlsx/route.ts`, `app/(app)/salary/export.csv/route.ts`, `app/(app)/tasks/export.xlsx/route.ts`, `app/(app)/attendance/export.xlsx/route.ts`, `app/(app)/training/attendance/export.xlsx/route.ts`, `app/(app)/events/export.xlsx/route.ts`, `app/(admin)/admin/logs/export/route.ts`, `app/api/admin/exit-register/route.ts`, `lib/modules/backup/workbook.ts`.

## Summary

The repository contains **33 spreadsheet/CSV generation or import surfaces**. Only a subset use shared manifests and dynamic validation. The largest risks are duplicated schemas, hardcoded dropdown sources, non-transactional imports, permissive unknown-field handling, and inconsistent employee/product/date conventions.
