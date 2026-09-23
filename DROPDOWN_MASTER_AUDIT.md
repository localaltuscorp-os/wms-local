# Dropdown Master Audit

> Full audit of every dropdown / select / option-picker in the WMS codebase.
> READ-ONLY — no application code, UI, functionality, or option values were changed.
> Existing behavior is the source of truth. Option names/casing are preserved exactly as found.

---

## 1. Executive Summary

- **Total dropdown / select / option-picker controls found:** **630** (608 web + 22 Android).
  - Web, per slice: Tasks 58 · Attendance/Leave/Overtime/Remote 53 · HR/People/Accounts/Support/Agreements 144 · Incentive/Salary/Outstanding/Reimbursement/Billing 75 · Goals/Appraisal/PMS/KPI/Events/ECOS/Training 112 · Admin/Projects/Operations/People-Allocation/Hand-holding/Documents/Dashboard 166.
  - Android (Kotlin/Compose): 22 pickers.
- **Backend enum / option-set definitions (canonical + validation):** **155**.
  - 97 canonical `as const` arrays in `db/enums.ts`; 5 real `pgEnum`s; ~51 other `as const` option arrays in `lib/` and `scripts/`; ~40 distinct inline `zod.enum([...])` value sets across API routes and validators.
- **Modules containing dropdowns:** **~34** top-level modules/pages (see Section 2).
- **Dropdown primitives in use (web):**
  - `components/ui/select.tsx` — single-select (cmdk), auto-searchable over 8 options.
  - `components/ui/multi-select.tsx` — multi-select (cmdk combobox).
  - `components/ui/lookup-select.tsx` — searchable managed single-select with inline "+ Add" / per-row soft-delete (backed by `accounts_lookups` / master tables).
  - Native `<select>` — ~118 files still use native selects.
  - `components/ui/dropdown-menu.tsx` — action menus / option menus.
  - Custom hand-rolled comboboxes: `ClientSelect`, `SubjectSelect`, `DoerMultiSelect`, `MemberPicker`, `EmployeePicker`, `EmployeeCombobox`, `PersonPicker`, `SkillMultiSelect`, `SuggestInput`, `CellSelect`, `FixedSelect`, `ValueSelect`.
  - Non-dropdown option pickers (documented but not `<select>`): radio groups, segmented toggles, button grids, pill filters, weekday chips, steppers.
- **Source distribution (approximate — tallied from documented entries in Section 3):**
  - Database / API-backed (dynamic): **~140**.
  - Hardcoded literal arrays (inline): **~90**.
  - Named constant / enum-backed (static): **~135** (`db/enums.ts` + `lib/*` constants).
  - Computed / derived (dates, quarters, months, distinct values): **~20**.
- **Static vs dynamic (approximate):** static ~225 (enum/constant/hardcoded option sets); dynamic ~160 (DB rosters, API lookups, computed calendars). Remaining are action menus / editor-formatting controls that are neither.
- **Hardcoded vs DB/API-backed (approximate):** hardcoded+constant ~225; database/API ~140; computed ~20.
- **Potential duplicate concepts:** high — see Section 4 (status, employee/person picker, priority, function/department, entity, product, payment mode, frequency, month/year, yes/no, recurrence).
- **Potentially risky / shared dropdowns:** status (`status_settings`), worker type / pay basis, attendance codes, incentive statuses, appraisal dimension weights, payment-mode/entity/product masters, `accounts_lookups` (22 kinds), department, exit reason, rehire eligibility — see Section 7.

---

## 2. Module-wise Inventory

One row per module. Counts are the number of distinct dropdown/picker controls documented for that module in Section 3. "Key dropdowns" lists the representative pickers.

| Module | Count | Key dropdowns |
| ------ | ----- | ------------- |
| Tasks / WMS (list, kanban, agenda, edit, bulk, filters, recurrence) | 58 | Client, Subject, Initiator, Doer, Priority, Recurrence, Approval Status, Doer Status, Bulk Status/Priority/Reassign/Subject/Client/Manager-Status, Date Range, Assignee/Status/Priority/Client/Function/Team/Subject filters, Group By, Sort, Show Columns, Reschedule-to |
| My Day (board + dashboard) | 9 | Task status (native select), Function / Team Leader / Employee / Threshold pickers |
| Dynamic Forms | 4 | Field type "select", "buttons"/"product" MCQ, Form-editor Type |
| Attendance — HR Record / Change Log / Devices / Dashboard / Insights / day-detail | 30 | Employee (LookupSelect), Month/Year (×8), Change-log Employee/Actor/Action, Device status/Employee/Type, Punch Reason, Mark-Leave Type, Comp-off Credit |
| Leave | 10 | Leave Type (paid/unpaid), Duration (Full/Half), Category, Availability (personal/office/computer), Requests status/employee/function/type filters |
| Remote Work | 14 | Work Mode, Client Site, Repeat, Ends, Repeat-unit, Monthly-style, Day-of-month, Week-of-month, Weekday, Weekday-chips, Reason bucket |
| Overtime | 2 | Employee, Status filter |
| HR — Candidates | 14 | Candidate status/form/position filters, Candidate picker (×3), Designation (×2), Position Applied For, Function, Month of Passing, Size of House, Bathroom, Source |
| HR — CTC / Exit / Induction / JD / KPI / Letters / Policies / Record / Routing | 47 | CTC Employee/Entity/Reason, Exit employee (×2)/reason, Induction employee, JD Position/Frequency/Assignees/Function/Rank, KPI Employee/Year/Quarter/Catalog/Frequency/Effective-quarter, Letter Entity/Employee/Signatory/Signing-model/Type/Dept/Manager/formatting (style/font/spacing/size), Policy Entity/Category, Record Person/Skills, Routing Owner |
| Support / Queries (tickets) | 6 | Topic/Category, Priority (composer + thread), Assign-to |
| Agreements | 2 | Employee, Paying entity |
| Accounts (Bank Balance, Income Tax, Cash, CC Master, Due Dates, FNO, Shares, SIP, Monthly/Weekly Checklist, Task List, CA Handover) | 72 | Entity filter + `ValueSelect` (22 `accounts_lookups` kinds), ECS / soft-copy / hard-copy / tally / balance / charges-reversed cell selects, type/frequency/responsible/deadline/category filters, CA portal type |
| Ambassadors | 6 | Relationship Owner, Add Product, tier/status filters, pipeline owner/stage, referral product/assigned-to/stage |
| Incentive | 18 | Incentive Type, Product, Opportunity/Happiness Type, Content Quality, Event Type, Split person, roster, entry/month/type/status/paid filters, targets/analytics/grade filters |
| Salary / Payroll / My-Salary / CTC | 12 | Payroll year/month, entity/company filter, statement employee, month, daily status/week/work-type/sort, CTC kind, exit employee, paying entity, person switcher |
| Outstanding | 20 | Employee/entity/cycle/payment-mode/status/month/year filters, Contract Product/Responsible/GST/Cycle/Bill-Date/Frequency/Entity/Payment-Mode/PDC, Edit-product/entity/responsible/payment-mode/GST/cycle/PDC, Collection client |
| Reimbursements | 5 | Claims sort, Approved, Paid-through, Expense head, Tally entity |
| Billing | 2 | Outstanding filter, Payment filter |
| Goals | 30 | Area/Measure/Type/Goal-Type (managed lookups), Team-involved/members, Project, Vendor, Category, Monthly-master, Incentive-type, Bucket move/copy, Status, Reviewer, Delegate, period/level, carry-forward |
| Appraisal / PMS / KPI | 18 | Appraisal Cycle/Dimension, Manager/Management, Recognition person/kind, Review person, Goal Type, KPI catalog/frequency/quarter, rating terms |
| Weekly Goals / DCC | 9 | Weekly priority/client/subject, DCC person/section/client, status, day selector |
| ECOS / Broadcast | 5 | Broadcast Category/Priority/Acknowledgement/Recurrence, specific-people search |
| Events / Holidays | 7 | Event Category/Start/End/Obligation, Batch Type/Start/End/Category, Obligation category, Holiday year/month |
| Training / Communications / Feedback | 8 | Material subject/created-by/assisted-by/functions, Session subject/trainer/attendees, Assessment attendee, Feedback link-staff/service/escalate-to, Status/Type |
| Admin Panel (Employee Master, masters, settings, permission, activity, notification, reminder, temp access, offboard) | 80 | Employee type/designation/entity/manager/shift/function/status filters + bulk edit, Product/Payment-mode/Entity/Responsible/Status-color, Activity actor/kind/source, Notification kind/recipient, Reminder recipients/employees/scope/statuses, Temp-access employee/delegate/duration, Offboard reason/rehire/transfer, Hierarchy move-to, Permission matrix employee |
| People Allocation / Hand-holding | 22 | Person kind, Employee/Intern name, Product, Batch No, Call type, Day, Access role/module/section/action, Module/call filters, Ambassador product/call/day |
| Projects / Project Plan | 14 | Project filter, level, parent, status cell, plan-board project/filter/sort/rows/columns, bulk level/owner |
| Operations / Productivity / Documents / Dossier / Dashboard / Search | 18 | Checklist event/assignee/status, Performer priority/client/due, Date range, Aging sort/legend, period picker, Portal year, Onboarding same-as-permanent |
| Android (Kotlin/Compose) | 22 | Product, Doer, Initiator, Subject, Due date, Priority, Task filter, Theme, WMS page, DCC day/KPI/roster, HR/Salary month, Reimbursements Active/Archived, People-Gives category, Incentive year, Training subject, Task status transition, week/month pagers |

---

## 3. Complete Dropdown Details

The exhaustive per-dropdown records (all 20 fields each: module, screen, field/key, source, component, type, required, default, options, behavior, validation, dependencies, backend, special rules, code locations) are in the subsections below, one per slice. These are the raw audit outputs — option strings and code locations are preserved exactly as captured from the current codebase.


### 3.1 — Tasks & Work Management

# TASKS & WORK MANAGEMENT — Dropdown / Select / Option Picker Audit

Scope: `components/tasks`, `components/my-day`, `components/daily-checklist`, `components/forms`, `components/goals` (task-status pickers only), `app/(app)/tasks`, `app/(app)/my-day`, `app/(app)/daily-checklist`, `lib/tasks`, `lib/task-filters.ts`, `lib/kanban-columns.ts`, `lib/status-palette.ts`, `lib/shortcuts.ts`, `lib/shortcuts-catalog.ts`, `lib/templates`, `db/enums.ts`.

NOTES ON SCOPE:
- `app/(app)/fill-weekly-goals` does NOT exist in the repo (the directory is `app/(app)/weekly-goals`). Nothing found there.
- `lib/shortcuts.ts` and `lib/shortcuts-catalog.ts` are static help-sheet data — no dropdowns.
- `lib/kanban-columns.ts`, `lib/status-palette.ts`, `lib/task-filters.ts` are logic/palette files — no UI dropdowns (they define the option ARRAYS that feed pickers, cited under "Source" below).
- `components/daily-checklist/*` and `components/my-day/week-board.tsx` / `dashboard/parts.tsx` contain NO dropdown/select pickers.
- `components/goals` was scanned for task-status pickers only; the only task-status-related picker is the goal Status dropdown (listed below). Goal-only pickers (Reviewer, Goal Type, Members, Team, Week, GoalLookup) are out of scope and NOT inventoried.

---

# A. New Task form — `components/tasks/new-task-form.tsx`
(Also rendered by `components/tasks/new-task-dialog.tsx`, `app/(app)/tasks/new/page.tsx`, and `components/project-plan/new-node-dialog.tsx`.)

### Client Name
- **Module:** Tasks (WMS) — New Task form, section 01 Basics
- **Screen:** `components/tasks/new-task-form.tsx` (used in dialog `new-task-dialog.tsx`, page `app/(app)/tasks/new/page.tsx`, project-plan `new-node-dialog.tsx`)
- **Field/Key:** `tasks.title` (also seeds `tasks.client`; the form value is `title`)
- **Source:** database (client roster via `listActiveClientNames()` from the `clients` table, server-provided prop `clients`)
- **Component:** other — custom searchable combobox (`ClientSelect`, `components/tasks/client-select.tsx`, Radix Popover + hand-rolled listbox)
- **Type:** Single
- **Required:** Yes (zod `title` min 1, plus hidden `required` mirror input)
- **Default:** none (empty; placeholder "Select a client…")
- **Searchable:** Yes (local filter, case-insensitive substring)
- **Static/Dynamic:** Dynamic
- **Options:** active client names, alphabetical (server-supplied). Current value surfaced even if not in roster (legacy free-text clients). Admins get an extra "+ Add New Client…" row.
- **Add/Edit/Delete behavior:** Admin only (`canAddRoster` prop → `canAdd`) can add a new client inline → `quickAddClient` server action writes a `clients` row. No edit/delete here.
- **Validation:** zod `title: z.string().trim().min(1, "Client Name is required").max(240)`; server action `createTask`/`CreateTaskSchema` re-validates.
- **On-select behavior:** sets RHF `title`; on submit becomes `title` (and `client` in `createTasksCore`).
- **Dependencies:** none. (`hideSubject`/`titleFreeText` caller flags can swap the control for a plain input.)
- **Backend/API/DB:** `POST` server action `createTask` → `createTasksCore` → `tasks.title`, `tasks.client`.
- **Special rules:** admin-only add; non-admin add row removed (not disabled).
- **Code locations:** definition `components/tasks/client-select.tsx:40`; usage `components/tasks/new-task-form.tsx:519`, `components/tasks/task-edit-form.tsx:293`.

### Subject
- **Module:** Tasks (WMS) — New Task form, section 01 Basics
- **Screen:** `components/tasks/new-task-form.tsx`
- **Field/Key:** `tasks.subject`
- **Source:** database (subject roster via `listActiveSubjectNames()` → `subjects` table + retire/pin policy `applySubjectPolicy` in `lib/tasks/subject-options.ts`)
- **Component:** other — custom searchable combobox (`SubjectSelect`, `components/tasks/subject-select.tsx`, Radix Popover)
- **Type:** Single
- **Required:** Yes (zod `subject` min 1 when not hidden)
- **Default:** none (placeholder "Select a subject…")
- **Searchable:** Yes
- **Static/Dynamic:** Dynamic
- **Options:** active subjects (retired "WMS"/"WMS App" dropped; "Altus Ecosystem" pinned), alphabetical. Admins get "+ Add New Subject…".
- **Add/Edit/Delete behavior:** Admin only → `quickAddSubject` server action writes a `subjects` row.
- **Validation:** zod `subject: z.string().trim().min(1, "Subject is required")` (max 120 on server).
- **On-select behavior:** sets RHF `subject`.
- **Dependencies:** none.
- **Backend/API/DB:** `tasks.subject` (column is `text`).
- **Special rules:** retired subjects policy (`lib/tasks/subject-options.ts`: `RETIRED_SUBJECTS=["WMS","WMS App"]`, `PINNED_SUBJECTS=["Altus Ecosystem"]`); admin-only add.
- **Code locations:** definition `components/tasks/subject-select.tsx:38`; usage `components/tasks/new-task-form.tsx:537`, `components/tasks/task-edit-form.tsx:352`.

### Initiator
- **Module:** Tasks (WMS) — New Task form, section 02 Assignment
- **Screen:** `components/tasks/new-task-form.tsx`
- **Field/Key:** `tasks.initiatorId`
- **Source:** database (employee roster via `listEmployeeOptions()`)
- **Component:** Select (`components/ui/select.tsx`, cmdk combobox)
- **Type:** Single
- **Required:** Yes (zod `initiatorId` min 1)
- **Default:** none (placeholder "Select an employee…")
- **Searchable:** Yes (`searchable`, "Search employees…")
- **Static/Dynamic:** Dynamic
- **Options:** all active employees `{value: id, label: name}`.
- **Add/Edit/Delete behavior:** none.
- **Validation:** zod `initiatorId: z.string().min(1, "Initiator is required")`.
- **On-select behavior:** sets RHF `initiatorId`.
- **Dependencies:** none.
- **Backend/API/DB:** `tasks.initiatorId`.
- **Special rules:** none.
- **Code locations:** usage `components/tasks/new-task-form.tsx:567`.

### Doer
- **Module:** Tasks (WMS) — New Task form, section 02 Assignment
- **Screen:** `components/tasks/new-task-form.tsx`
- **Field/Key:** `tasks.doerId` / `doerIds` (multi fan-out)
- **Source:** database (employee roster prop `employees`)
- **Component:** other — custom multi-combobox (`DoerMultiSelect`, hand-rolled Popover listbox inside the same file)
- **Type:** Multi
- **Required:** Yes (zod `doerIds` min 1)
- **Default:** none (placeholder "Type a name…")
- **Searchable:** Yes (type-to-filter on employee name)
- **Static/Dynamic:** Dynamic
- **Options:** all employees passed in (name + id). "No employees available." when empty.
- **Add/Edit/Delete behavior:** none (chips removed via X / backspace).
- **Validation:** zod `doerIds: z.array(z.string()).min(1, "Pick at least one Doer")`; server `CreateTaskSchema.doerIds` max 50.
- **On-select behavior:** toggles `doerIds` array; submit fans out one task per doer.
- **Dependencies:** none.
- **Backend/API/DB:** `tasks.doerId` (one row per doer).
- **Special rules:** multi-select chips; Tab commits highlighted match and advances; Backspace on empty removes last chip.
- **Code locations:** usage `components/tasks/new-task-form.tsx:592` (component `DoerMultiSelect` defined `:861`).

### Priority
- **Module:** Tasks (WMS) — New Task form, section 02 Assignment
- **Screen:** `components/tasks/new-task-form.tsx`
- **Field/Key:** `tasks.priority`
- **Source:** enum (`TASK_PRIORITIES` + `PRIORITY_LABELS`, `db/enums.ts:320,335`)
- **Component:** Select
- **Type:** Single
- **Required:** Yes (zod enum; always has a default so never empty)
- **Default:** `not_imp_not_urgent` ("Normal")
- **Searchable:** No (4 options)
- **Static/Dynamic:** Static
- **Options:** `imp_urgent` → "Critical"; `imp_not_urgent` → "Important"; `not_imp_urgent` → "Urgent"; `not_imp_not_urgent` → "Normal"
- **Add/Edit/Delete behavior:** none.
- **Validation:** zod `priority: z.enum(TASK_PRIORITIES)`.
- **On-select behavior:** sets RHF `priority`.
- **Dependencies:** none.
- **Backend/API/DB:** `tasks.priority`.
- **Special rules:** underlying Eisenhower enum values; labels renamed to 1–4 scale (Critical/Important/Urgent/Normal).
- **Code locations:** usage `components/tasks/new-task-form.tsx:611`.

### Project (optional link)
- **Module:** Tasks (WMS) — New Task form, section 04 Organize (conditional)
- **Screen:** `components/tasks/new-task-form.tsx`
- **Field/Key:** `tasks.projectNodeId`
- **Source:** database (project tree nodes passed via prop `projectNodes`)
- **Component:** Select
- **Type:** Single
- **Required:** No
- **Default:** `""` ("Not linked to a project")
- **Searchable:** auto (>8 options)
- **Static/Dynamic:** Dynamic (rendered only when `projectNodes.length > 0 && !beforeSubmit && !createOverride`)
- **Options:** `""` → "Not linked to a project", then each node `{value: id, label: path-label}`.
- **Add/Edit/Delete behavior:** none.
- **Validation:** none (optional; server `z.string().uuid().nullable()`).
- **On-select behavior:** sets RHF `projectNodeId`.
- **Dependencies:** hidden entirely for Project Plan container levels (`hideSchedule`/`beforeSubmit`/`createOverride` paths).
- **Backend/API/DB:** `tasks.projectNodeId`.
- **Special rules:** conditional field.
- **Code locations:** usage `components/tasks/new-task-form.tsx:706`.

### Schedule → Recurrence preset
- **Module:** Tasks (WMS) — New Task form + Task Edit form, section 04 Organize
- **Screen:** `components/tasks/recurrence-control.tsx` (rendered by `schedule-section.tsx`)
- **Field/Key:** `tasks.recurrence` + `tasks.recurrenceRule`
- **Source:** enum (`TASK_RECURRENCES`/`RECURRENCE_LABELS`, `db/enums.ts:128,137`) plus hardcoded presets
- **Component:** Select (preset list) + custom dialog (see sub-items)
- **Type:** Single
- **Required:** No
- **Default:** `none` ("Does not repeat") — recurrence null
- **Searchable:** No (7 options)
- **Static/Dynamic:** Static labels, dynamic date-anchored wording
- **Options:** `none` → "Does not repeat"; `daily` → "Daily"; `weekly` → "Weekly on {Weekday}"; `monthly` → "Monthly on the {nth} {Weekday}"; `yearly` → "Annually on {Month} {date}"; `weekday` → "Every weekday (Monday to Friday)"; `custom` → "Custom…"
- **Add/Edit/Delete behavior:** none (Custom… opens a dialog).
- **Validation:** optional; server `z.enum(TASK_RECURRENCES).nullable()`.
- **On-select behavior:** sets `recurrence` + builds RRULE string (`FREQ=…`).
- **Dependencies:** anchor = task start date (fallback today); preset wording depends on anchor.
- **Backend/API/DB:** `tasks.recurrence`, `tasks.recurrenceRule`.
- **Special rules:** internal only (no Google Calendar sync); "Custom…" maps to a dialog with sub-pickers.
- **Code locations:** `components/tasks/recurrence-control.tsx:193` (preset Select); container `components/tasks/schedule-section.tsx:155`.

### Schedule → Custom Recurrence → Repeat unit
- **Module:** Tasks (WMS) — Custom Recurrence dialog
- **Screen:** `components/tasks/recurrence-control.tsx` (CustomDialog)
- **Field/Key:** `recurrenceRule` (FREQ part)
- **Source:** hardcoded (`UNITS` array)
- **Component:** Select
- **Type:** Single
- **Required:** No
- **Default:** `WEEKLY` (dialog seed)
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** `DAILY` → "day(s)"; `WEEKLY` → "week(s)"; `MONTHLY` → "month(s)"; `YEARLY` → "year(s)" (labels pluralize by interval)
- **Add/Edit/Delete behavior:** none.
- **Validation:** none.
- **On-select behavior:** sets `draft.freq`; reveals conditional weekday chips (WEEKLY) / month-mode select (MONTHLY).
- **Dependencies:** `freq === "WEEKLY"` shows weekday chips; `freq === "MONTHLY"` shows monthly-mode select.
- **Backend/API/DB:** RRULE `FREQ=`.
- **Special rules:** popover z-index lifted to `z-[130]` to sit above the dialog.
- **Code locations:** `components/tasks/recurrence-control.tsx:307`.

### Schedule → Custom Recurrence → Monthly mode
- **Module:** Tasks (WMS) — Custom Recurrence dialog (only when freq = MONTHLY)
- **Screen:** `components/tasks/recurrence-control.tsx`
- **Field/Key:** `recurrenceRule` (BYDAY vs BYMONTHDAY)
- **Source:** hardcoded
- **Component:** Select
- **Type:** Single
- **Required:** No
- **Default:** `day`
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** `day` → "Monthly on day {n}"; `weekday` → "Monthly on the {nth} {Weekday}"
- **Add/Edit/Delete behavior:** none.
- **Validation:** none.
- **On-select behavior:** sets `draft.monthlyMode`.
- **Dependencies:** only rendered when `freq === "MONTHLY"`.
- **Backend/API/DB:** RRULE `BYMONTHDAY=` vs `BYDAY=`.
- **Special rules:** none.
- **Code locations:** `components/tasks/recurrence-control.tsx:352`.

---

# B. Task Edit form — `components/tasks/task-edit-form.tsx`
(rendered from `components/tasks/task-detail-view.tsx:410`)

### Client Name (edit)
- Same definition/options as New Task Client Name above, but: required (hidden mirror), `canAdd = isAdmin`, initial value from `initial.title`.
- **Code locations:** usage `components/tasks/task-edit-form.tsx:293`; definition `client-select.tsx:40`.

### Priority (edit)
- **Module:** Tasks (WMS) — Edit form
- **Field/Key:** `tasks.priority`
- **Source:** enum (`TASK_PRIORITIES`/`PRIORITY_LABELS`)
- **Component:** Select
- **Type:** Single / **Required:** No (prefilled) / **Default:** `initial.priority`
- **Options:** Critical / Important / Urgent / Normal (same 4 as above)
- **On-select behavior:** `setPriority` local state → `editTaskFields` on save.
- **Code locations:** usage `components/tasks/task-edit-form.tsx:314`.

### Subject (edit)
- Same as New Task Subject; `canAdd = isAdmin`; `required` not marked (optional in edit — zod `subject` optional).
- **Code locations:** usage `components/tasks/task-edit-form.tsx:352`; definition `subject-select.tsx:38`.

### Project (edit, conditional)
- Same options as New Task Project; rendered only when `projectNodes.length > 0`.
- **Code locations:** usage `components/tasks/task-edit-form.tsx:480`.

### Schedule → Recurrence (edit)
- Same `ScheduleSection`/`RecurrenceControl` as New Task.
- **Code locations:** usage `components/tasks/task-edit-form.tsx:496`.

### Approval Status (admin only)
- **Module:** Tasks (WMS) — Edit form, "Admin only" box
- **Screen:** `components/tasks/task-edit-form.tsx`
- **Field/Key:** `tasks.approvalStatus` (separate column from `status`)
- **Source:** enum (`APPROVAL_STATUSES`, `db/enums.ts:113`) + hardcoded empty "No verdict"
- **Component:** Select
- **Type:** Single
- **Required:** No
- **Default:** `""` ("No verdict") — maps to NULL
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** `""` → "No verdict"; `approved` → "Approved"; `not_approved` → "Not Approved"; `cancelled` → "Cancelled"; `transferred` → "Transferred"
- **Add/Edit/Delete behavior:** none.
- **Validation:** `SetApprovalStatusSchema` (`z.enum(APPROVAL_STATUSES).nullable()`).
- **On-select behavior:** `setApprovalStatus`; persisted via `setTaskApprovalStatus` (only when changed and `isAdmin`).
- **Dependencies:** rendered only when `isAdmin`.
- **Backend/API/DB:** `tasks.approval_status` via `setTaskApprovalStatus` server action.
- **Special rules:** admin-only; `approval_status` defaults NULL; `cancelled` here is a VERDICT (the retired `status` value `cancelled` is separate).
- **Code locations:** usage `components/tasks/task-edit-form.tsx:526`; label map `task-edit-form.tsx:60-65`; schema `lib/validators/task.ts:102`.

---

# C. Reassign dialog — `components/tasks/reassign-dialog.tsx`

### New Doer
- **Module:** Tasks (WMS) — Reassign Task dialog
- **Screen:** `components/tasks/reassign-dialog.tsx`
- **Field/Key:** `tasks.doerId` (reassigned via `reassignTask`)
- **Source:** database (employee roster prop `employees`, current doer filtered out)
- **Component:** Select
- **Type:** Single
- **Required:** Yes (client check "Pick a new doer.")
- **Default:** `""` (placeholder "Select an employee…")
- **Searchable:** Yes
- **Static/Dynamic:** Dynamic
- **Options:** all employees except the current doer `{value: id, label: name}`.
- **Add/Edit/Delete behavior:** none.
- **Validation:** client: non-empty and not equal to current doer; server `ReassignSchema` (`newDoerId: uuid`, optional `resetStatus` boolean).
- **On-select behavior:** sets `newDoerId`; optional checkbox "Reset status to \"Not Read\"" (`resetStatus`).
- **Dependencies:** none.
- **Backend/API/DB:** `reassignTask` server action → `tasks.doerId`, optional status reset.
- **Special rules:** current doer removed from list; optimistic lock via `expectedUpdatedAt`.
- **Code locations:** usage `components/tasks/reassign-dialog.tsx:129`.

---

# D. Inline editable cells — tasks table (`components/tasks/`)

### Doer Status chip (inline status dropdown)
- **Module:** Tasks (WMS) — tasks table row (also kanban/agenda rows via same cell)
- **Screen:** `components/tasks/inline-status-cell.tsx`
- **Field/Key:** `tasks.status`
- **Source:** enum (`DOER_TASK_STATUSES`, `db/enums.ts:62`); labels from `status_settings` table (`getStatusDisplayMap`) with `STATUS_LABELS_FALLBACK` (`lib/format.ts:111`)
- **Component:** other — Radix Popover hand-rolled listbox (not the shared Select)
- **Type:** Single
- **Required:** Yes (task always has a status; new tasks default `dont_know`)
- **Default:** current `status`
- **Searchable:** No
- **Static/Dynamic:** Static option set (labels dynamic via status_settings)
- **Options:** `dont_know` → "Not Read"; `not_started` → "Not Started"; `initiated` → "Initiated"; `follow_up` → "Follow Up"; `need_info` → "Need Info"; `done` → "Done" (labels admin-overridable). A legacy status outside the list still renders but cannot be re-selected.
- **Add/Edit/Delete behavior:** none.
- **Validation:** server `applyTaskStatusChange` → `canTransitionTo(current, next, role)` permission matrix; optimistic lock.
- **On-select behavior:** optimistic flip → `setTaskStatus` server action → audit event + notifications + goal mirror.
- **Dependencies:** `editable` prop (permission-gated); if not editable renders a static badge (no dropdown).
- **Backend/API/DB:** `tasks.status` (and `tasks.completedAt` stamped on `done`).
- **Special rules:** `on_hold` deliberately ABSENT (manager ruling, moved to Manager Status / Mark Hold On); `isAdmin` no longer changes this option list (see comment `:85-94`).
- **Code locations:** definition `components/tasks/inline-status-cell.tsx:62` (options `:94`).

### Doer (inline reassign cell)
- **Module:** Tasks (WMS) — tasks table "Doer" column
- **Screen:** `components/tasks/inline-edit-cells.tsx` (`InlineDoerCell`)
- **Field/Key:** `tasks.doerId`
- **Source:** database (employee roster prop `employees`)
- **Component:** other — Radix Popover searchable listbox
- **Type:** Single
- **Required:** No (renders "-" when unset)
- **Default:** current doer name
- **Searchable:** Yes ("Search…")
- **Static/Dynamic:** Dynamic
- **Options:** all employees (filtered by name substring).
- **Add/Edit/Delete behavior:** none.
- **Validation:** server `reassignDoer` permission.
- **On-select behavior:** optimistic → `reassignDoer(taskId, id)`.
- **Dependencies:** `editable` prop; non-editable renders plain name.
- **Backend/API/DB:** `tasks.doerId` via `reassignDoer`.
- **Special rules:** none.
- **Code locations:** `components/tasks/inline-edit-cells.tsx:216`.

### Priority (inline priority cell)
- **Module:** Tasks (WMS) — tasks table "Priority" column
- **Screen:** `components/tasks/inline-edit-cells.tsx` (`InlinePriorityCell`)
- **Field/Key:** `tasks.priority`
- **Source:** enum (`TASK_PRIORITIES`/`PRIORITY_LABELS`)
- **Component:** other — Radix Popover listbox (renders `PriorityPill` per option)
- **Type:** Single
- **Required:** Yes (task always has priority; default Normal)
- **Default:** current `priority`
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** `imp_urgent` → "Critical" (flame); `not_imp_urgent` → "Urgent"; `imp_not_urgent` → "Important"; `not_imp_not_urgent` → "Normal"
- **Add/Edit/Delete behavior:** none.
- **Validation:** server `setTaskPriority`.
- **On-select behavior:** optimistic → `setTaskPriority(taskId, p)`.
- **Dependencies:** `editable` prop.
- **Backend/API/DB:** `tasks.priority`.
- **Special rules:** priority pill colours keyed on enum (not label) — Critical red, Urgent orange, Important green, Normal blue.
- **Code locations:** `components/tasks/inline-edit-cells.tsx:345` (options map `:427`).

---

# E. Bulk action bar — `components/tasks/bulk-action-bar.tsx`

### Bulk Doer Status
- **Module:** Tasks (WMS) — bulk bar (selection toolbar)
- **Field/Key:** `tasks.status` (bulk)
- **Source:** enum (`DOER_TASK_STATUSES`)
- **Component:** DropdownMenu (`components/ui/dropdown-menu.tsx`)
- **Type:** Single (one action per open)
- **Required:** No
- **Default:** n/a (trigger label "Doer Status")
- **Searchable:** No
- **Static/Dynamic:** Static set (labels via `statusLabels` prop from status_settings)
- **Options:** dont_know → "Not Read"; not_started → "Not Started"; initiated → "Initiated"; follow_up → "Follow Up"; need_info → "Need Info"; done → "Done"
- **Add/Edit/Delete behavior:** none.
- **Validation:** server `bulkSetStatus` re-checks per task.
- **On-select behavior:** `bulkSetStatus(selectedIds, s)` for all selected.
- **Dependencies:** `showTaskActions` prop.
- **Backend/API/DB:** `tasks.status`.
- **Code locations:** `components/tasks/bulk-action-bar.tsx:224` (options `statuses` `:160`).

### Bulk Priority
- **Module:** Tasks (WMS) — bulk bar
- **Field/Key:** `tasks.priority`
- **Source:** enum (`TASK_PRIORITIES`/`PRIORITY_LABELS`)
- **Component:** DropdownMenu
- **Options:** Critical / Important / Urgent / Normal
- **On-select behavior:** `bulkSetPriority`.
- **Code locations:** `components/tasks/bulk-action-bar.tsx:246`.

### Bulk Reassign
- **Module:** Tasks (WMS) — bulk bar
- **Field/Key:** `tasks.doerId`
- **Source:** database (employee roster prop `employees`)
- **Component:** DropdownMenu
- **Options:** employee names (all).
- **On-select behavior:** `bulkReassignDoer`.
- **Code locations:** `components/tasks/bulk-action-bar.tsx:270`.

### Bulk Subject (conditional)
- **Module:** Tasks (WMS) — bulk bar
- **Field/Key:** `tasks.subject`
- **Source:** database (distinct subjects prop `subjects`)
- **Component:** DropdownMenu
- **Options:** subject strings (rendered only when `subjects.length > 0`).
- **On-select behavior:** `bulkSetSubject`.
- **Code locations:** `components/tasks/bulk-action-bar.tsx:292`.

### Bulk Client (conditional)
- **Module:** Tasks (WMS) — bulk bar
- **Field/Key:** `tasks.client`
- **Source:** database (distinct clients prop `clients`)
- **Component:** DropdownMenu
- **Options:** client strings (rendered only when `clients.length > 0`).
- **On-select behavior:** `bulkSetClient`.
- **Code locations:** `components/tasks/bulk-action-bar.tsx:316`.

### Bulk Manager Status (admin only)
- **Module:** Tasks (WMS) — bulk bar
- **Field/Key:** `tasks.status` OR `tasks.approval_status` (two different columns)
- **Source:** hardcoded (`MANAGER_MARK_ACTIONS`)
- **Component:** DropdownMenu
- **Type:** Single action
- **Required:** No
- **Default:** n/a (trigger "Manager Status")
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** `on_hold` → "Mark Hold On" (writes status); `approved` → "Mark Approved" (writes approval_status); `not_approved` → "Mark Not Approved" (approval_status); `done` → "Mark Done" (status); `cancelled` → "Mark Cancelled" (approval_status)
- **Add/Edit/Delete behavior:** none.
- **Validation:** server re-checks admin.
- **On-select behavior:** routes to `bulkSetStatus` or `bulkSetApprovalStatus` depending on kind.
- **Dependencies:** `isAdmin`.
- **Backend/API/DB:** `tasks.status` / `tasks.approval_status`.
- **Special rules:** admin-only; `cancelled` routed to `approval_status` (retired `status` value not written).
- **Code locations:** `components/tasks/bulk-action-bar.tsx:344` (actions `:65-74`).

---

# F. Tasks list Filter bar — `components/layout/filter-bar.tsx`
(Shared chrome used by `app/(app)/tasks/page.tsx`, `app/(app)/tasks/kanban/page.tsx`, `app/(app)/tasks/agenda/page.tsx`, and the WMS dashboard.)

### Date Range
- **Module:** Tasks (WMS) — filter bar
- **Screen:** `components/layout/filter-bar.tsx`
- **Field/Key:** URL `start` / `end` (→ `filters.startDate`/`endDate`)
- **Source:** hardcoded defaults (`2026-01-01` start, today end; dashboard 30-day window)
- **Component:** other — Radix Popover + react-day-picker range calendar (not an option list)
- **Type:** Single (a range)
- **Required:** No
- **Default:** 30-day window ending today (dashboard) / parsed defaults
- **Searchable:** No
- **Static/Dynamic:** Dynamic
- **Options:** n/a (calendar).
- **Add/Edit/Delete behavior:** n/a.
- **Validation:** ISO date parse.
- **On-select behavior:** debounced `apply()` → URL replace + refetch.
- **Dependencies:** none.
- **Backend/API/DB:** URL query params.
- **Special rules:** two-click range commit; draft-while-open fix.
- **Code locations:** `components/layout/filter-bar.tsx:406`.

### Assignee (Doer) filter
- **Module:** Tasks (WMS) — filter bar
- **Field/Key:** URL `emp` (comma-separated doer ids) → `filters.doerIds`
- **Source:** database (employee options prop; synthetic `__all__` "All employees")
- **Component:** MultiSelect (`components/ui/multi-select.tsx`) with `FilterPill` trigger
- **Type:** Multi
- **Required:** No
- **Default:** "All Employees" (or "My Tasks" scope for non-admins)
- **Searchable:** Yes
- **Static/Dynamic:** Dynamic
- **Options:** "All employees" (`__all__`, only when `scopeDefaultsToMe`), "<You> (You)" pinned, then all employees.
- **Add/Edit/Delete behavior:** none.
- **Validation:** ids validated server-side.
- **On-select behavior:** `handleEmpChange` → `apply()` URL update.
- **Dependencies:** `scopeDefaultsToMe` (WMS dashboard) and non-admin `showScopeChip`.
- **Backend/API/DB:** URL `?emp=` → `tasks.doerId`.
- **Special rules:** `?emp=all` sentinel = all; empty = me (dashboard) / all (/tasks).
- **Code locations:** `components/layout/filter-bar.tsx:476`.

### Doer Status filter
- **Module:** Tasks (WMS) — filter bar
- **Screen:** `components/layout/filters/status-filter.tsx`
- **Field/Key:** URL `status` → `filters.statuses`
- **Source:** server-built `statusOptions` (from `app/(app)/tasks/page.tsx:127`): `TASK_STATUSES` minus deprecated, labels from `status_settings` (`getStatusDisplayMap`) + pseudo "Archived"
- **Component:** MultiSelect + `FilterPill`
- **Type:** Multi
- **Required:** No
- **Default:** none ("All Statuses")
- **Searchable:** Yes
- **Static/Dynamic:** Static option set, dynamic labels
- **Options:** dont_know → "Not Read"; not_started → "Not Started"; initiated → "Initiated"; follow_up → "Follow Up"; on_hold → "On Hold"; need_info → "Need Info"; done → "Done"; approved → "Approved"; not_approved → "Not Approved"; `archived` → "Archived" (pseudo-status)
- **Add/Edit/Delete behavior:** none (labels admin-editable via status_settings).
- **Validation:** `parseTaskFilters` filters to known `TASK_STATUSES`; `archived` flips `filters.archived`.
- **On-select behavior:** `apply()` URL update.
- **Dependencies:** none.
- **Backend/API/DB:** URL `?status=` → `tasks.status` (and `archived` boolean).
- **Special rules:** deprecated statuses (follow_up_1/2/3, cancelled, transferred, need_help) filtered out via `isDeprecatedStatus`; "Archived" is a pseudo chip.
- **Code locations:** `components/layout/filters/status-filter.tsx:9`; options built `app/(app)/tasks/page.tsx:127-136`.

### Priority filter
- **Module:** Tasks (WMS) — filter bar
- **Screen:** `components/layout/filters/priority-filter.tsx`
- **Field/Key:** URL `prio` → `filters.priorities`
- **Source:** enum (`TASK_PRIORITIES`/`PRIORITY_LABELS`)
- **Component:** MultiSelect + FilterPill
- **Type:** Multi
- **Options:** Critical / Important / Urgent / Normal
- **On-select behavior:** `apply()` URL.
- **Code locations:** `components/layout/filters/priority-filter.tsx:12`.

### Client filter (conditional)
- **Module:** Tasks (WMS) — filter bar
- **Screen:** `components/layout/filters/client-filter.tsx`
- **Field/Key:** URL `client` → `filters.clients`
- **Source:** database (distinct client names prop `clients`)
- **Component:** MultiSelect + FilterPill
- **Type:** Multi
- **Options:** distinct client names (rendered only when `clients.length > 0`).
- **Code locations:** `components/layout/filters/client-filter.tsx:8`.

### Function / Department filter
- **Module:** Tasks (WMS) — filter bar
- **Screen:** `components/layout/filters/department-filter.tsx`
- **Field/Key:** URL `dept` → `filters.departments`
- **Source:** enum (`DEPARTMENTS`, `db/enums.ts:342`)
- **Component:** MultiSelect + FilterPill
- **Type:** Multi
- **Options:** "Founder Office", "Handholding", "Apps", "Sales", "Marketing", "Social Media", "Accounts", "Admin", "HR", "Consulting", "CRM"
- **On-select behavior:** `apply()` URL.
- **Code locations:** `components/layout/filters/department-filter.tsx:9`.

### Team filter
- **Module:** Tasks (WMS) — filter bar
- **Screen:** `components/layout/filters/team-filter.tsx`
- **Field/Key:** URL `team` → `filters.teams`
- **Source:** constant (`TEAM_ROSTER`, `lib/teams/roster.ts`)
- **Component:** MultiSelect + FilterPill
- **Type:** Multi
- **Options:** `t1` → "T1 — Manan Vasa"; `t2` → "T2 — Ruchita Ambre"; `t3` → "T3 — Jeevan Bharambe"; `t4` → "T4 — Rutvisha Mehta"; `t5` → "T5 — Rohan Choudhary"; `t6` → "T6 — Mitul Mehta"
- **On-select behavior:** `apply()` URL.
- **Code locations:** `components/layout/filters/team-filter.tsx:27`; roster `lib/teams/roster.ts`.

### Subject filter (conditional)
- **Module:** Tasks (WMS) — filter bar
- **Screen:** `components/layout/filters/subject-filter.tsx`
- **Field/Key:** URL `subj` → `filters.subjects`
- **Source:** database (distinct subjects prop `subjects` from `listDistinctSubjects()`)
- **Component:** MultiSelect + FilterPill
- **Type:** Multi
- **Options:** distinct subject strings (rendered only when `subjects.length > 0`).
- **Code locations:** `components/layout/filters/subject-filter.tsx:6`.

(Note: the "Scope" (My Tasks / All Tasks) and "View" (Doer / Initiator) controls in the bar are SEGMENTED BUTTONS, not dropdowns — out of scope for dropdown inventory.)

---

# G. Tasks table toolbar — `components/tasks/task-table.tsx`

### Rows per page
- **Module:** Tasks (WMS) — table pager
- **Screen:** `components/tasks/task-table.tsx` (`TablePager`)
- **Field/Key:** UI-only `pageSize`
- **Source:** constant (`PAGE_SIZE_OPTIONS = [10, 20, 25, 50]`)
- **Component:** native select
- **Type:** Single
- **Required:** Yes (always set)
- **Default:** (from page-size state; default 25 per pager logic)
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** 10, 20, 25, 50
- **On-select behavior:** `onPageSize` (repaginate).
- **Code locations:** `components/tasks/task-table.tsx:1909` (constant `:34`).

### Group By
- **Module:** Tasks (WMS) — table toolbar
- **Screen:** `components/tasks/task-table.tsx` (`GroupByControl`)
- **Field/Key:** UI-only `groupBy` (GroupKey)
- **Source:** constant (`GROUP_OPTIONS`)
- **Component:** DropdownMenu
- **Type:** Single
- **Required:** No (default `none`)
- **Default:** `none`
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** `none` → "None"; `client` → "Client"; `subject` → "Subject"; `status` → "Doer Status"; `employee` → "Employee"; `priority` → "Priority"
- **On-select behavior:** clusters rows under that field with per-section counts.
- **Code locations:** `components/tasks/task-table.tsx:2037` (options `:101-108`).

### Sort By (mobile)
- **Module:** Tasks (WMS) — table toolbar (phone-only)
- **Screen:** `components/tasks/task-table.tsx` (`MobileSortControl`)
- **Field/Key:** UI-only column sort state
- **Source:** dynamic (sortable columns from the table instance; labels from `COLUMN_LABELS`, "Task" for title)
- **Component:** DropdownMenu
- **Type:** Single (toggles asc/desc per column)
- **Options:** every sortable column label.
- **On-select behavior:** `c.toggleSorting(...)`.
- **Code locations:** `components/tasks/task-table.tsx:2270`.

### Show Columns
- **Module:** Tasks (WMS) — table toolbar
- **Screen:** `components/tasks/task-table.tsx` (`ColumnsMenu`)
- **Field/Key:** UI-only column visibility
- **Source:** dynamic (hideable columns in `COLUMN_LABELS`)
- **Component:** DropdownMenu
- **Type:** Multi (persistent menu with checks; `onSelect → preventDefault`)
- **Options:** optional columns (Task + Actions always-on excluded).
- **On-select behavior:** `c.toggleVisibility()`.
- **Code locations:** `components/tasks/task-table.tsx:2317`.

---

# H. My Day agenda board — `components/tasks/agenda-board.tsx`

### Reschedule to (per-card menu)
- **Module:** My Day / Tasks agenda
- **Screen:** `components/tasks/agenda-board.tsx` (per admin card)
- **Field/Key:** `tasks.dueAt` (reschedule)
- **Source:** dynamic (`rescheduleTargets` = visible day columns: "Today (…)" / "{day} ({sub})")
- **Component:** DropdownMenu
- **Type:** Single
- **Required:** No
- **Default:** n/a (trigger icon button)
- **Searchable:** No
- **Static/Dynamic:** Dynamic
- **Options:** visible day columns (up to 6): "Today ({date})", then each day label "… ({date})". The current due day's option is disabled.
- **On-select behavior:** `onDropTask(id, ymd)` → moves card/reschedules due date.
- **Dependencies:** `canReschedule` (admin-only).
- **Backend/API/DB:** task due-date reschedule action.
- **Code locations:** `components/tasks/agenda-board.tsx:568` (targets built `:161-164`).

(Note: the "Show N days" control (`DAY_CHOICES = [3,4,5,6]`, `:88`) is a SEGMENTED BUTTON row, not a dropdown.)

---

# I. Tasks bulk entry grid — `components/tasks/tasks-bulk-grid.tsx`

### Client Name cell (suggestion combobox)
- **Module:** Tasks (WMS) — bulk grid
- **Field/Key:** `tasks.title` (row draft `title`)
- **Source:** database (clients prop)
- **Component:** other — `SuggestInput` (Popover suggestion list; free text preserved)
- **Type:** Single (free text with suggestions)
- **Required:** Yes (on proceed)
- **Searchable:** Yes (case-insensitive substring)
- **Options:** client names (suggestions only — not a constraint).
- **Code locations:** `components/tasks/tasks-bulk-grid.tsx:658` (`TEXT_COLS` `:61`; `SuggestInput` `:136`).

### Subject cell (suggestion combobox)
- **Module:** Tasks (WMS) — bulk grid
- **Field/Key:** `tasks.subject`
- **Source:** database (subjects prop)
- **Component:** `SuggestInput`
- **Options:** subject names (suggestions only).
- **Code locations:** `components/tasks/tasks-bulk-grid.tsx:658`.

### Priority cell
- **Module:** Tasks (WMS) — bulk grid
- **Field/Key:** `tasks.priority`
- **Source:** enum (`TASK_PRIORITIES`/`PRIORITY_LABELS` → `PRIORITY_OPTIONS`)
- **Component:** Select (`searchable={false}`, `unstyled`)
- **Type:** Single
- **Required:** Yes (default Normal)
- **Default:** `not_imp_not_urgent` ("Normal")
- **Options:** Critical / Important / Urgent / Normal
- **Code locations:** `components/tasks/tasks-bulk-grid.tsx:681` (options `:51`).

### Doer cell (multi)
- **Module:** Tasks (WMS) — bulk grid
- **Field/Key:** `tasks.doerId` (row draft `doers`)
- **Source:** database (roster prop)
- **Component:** other — `MemberPicker` multi (Popover type-to-search)
- **Type:** Multi
- **Options:** roster members.
- **Code locations:** `components/tasks/tasks-bulk-grid.tsx:704`.

### Initiator cell (single)
- **Module:** Tasks (WMS) — bulk grid
- **Field/Key:** `tasks.initiatorId` (row draft `initiator`)
- **Source:** database (roster prop)
- **Component:** `MemberPicker` single
- **Type:** Single
- **Options:** roster members.
- **Code locations:** `components/tasks/tasks-bulk-grid.tsx:707`.

---

# J. Time / Manager report filter bar — `components/tasks/time/reports/manager-filter-bar.tsx`

### Employee
- **Module:** Tasks time reports (manager)
- **Screen:** `components/tasks/time/reports/manager-filter-bar.tsx`
- **Field/Key:** URL `employee` (`TimeReportFilters.employeeId`)
- **Source:** database (`options.employees`)
- **Component:** LookupSelect (`components/ui/lookup-select.tsx`)
- **Type:** Single (nullable)
- **Required:** No
- **Default:** null (placeholder "All employees")
- **Searchable:** Yes
- **Options:** employees `{id, name}` + "Clear Selection".
- **Code locations:** `components/tasks/time/reports/manager-filter-bar.tsx:77`.

### Function
- **Module:** Tasks time reports (manager)
- **Field/Key:** URL `department`
- **Source:** database (`options.departments`)
- **Component:** native select
- **Options:** "" → "All Functions", then each department name.
- **Code locations:** `manager-filter-bar.tsx:89`.

### Client
- **Field/Key:** URL `client`; **Source:** database (`options.clients`); **Component:** native select; **Options:** "" → "All clients", then client names.
- **Code locations:** `manager-filter-bar.tsx:99`.

### Subject
- **Field/Key:** URL `subject`; **Source:** database (`options.subjects`); **Component:** native select; **Options:** "" → "All subjects", then subject names.
- **Code locations:** `manager-filter-bar.tsx:109`.

### Priority
- **Field/Key:** URL `priority`; **Source:** enum (`TASK_PRIORITIES`/`PRIORITY_LABELS`); **Component:** native select; **Options:** "" → "All priorities", then Critical/Important/Urgent/Normal.
- **Code locations:** `manager-filter-bar.tsx:119`.

### Goal
- **Field/Key:** URL `goal` (`goalId`); **Source:** database (`options.goals`); **Component:** LookupSelect; **Type:** Single (nullable); **Options:** goals `{id, name}` + "Clear Selection".
- **Code locations:** `manager-filter-bar.tsx:129`.

---

# K. My Day — `components/my-day/`

### My Day task status (inline native select)
- **Module:** My Day board
- **Screen:** `components/my-day/my-day-board.tsx`
- **Field/Key:** `tasks.status`
- **Source:** enum (`USER_TASK_STATUSES`) + `STATUS_LABELS_FALLBACK`
- **Component:** native select
- **Type:** Single
- **Required:** No (renders only when task has status; `readOnly` hides it)
- **Default:** current `item.status`
- **Searchable:** No
- **Static/Dynamic:** Static set, static labels
- **Options:** dont_know → "Not Read"; not_started → "Not Started"; initiated → "Initiated"; follow_up → "Follow Up"; on_hold → "On Hold"; need_info → "Need Info"; done → "Done" (plus a legacy out-of-set value kept selectable when present)
- **Add/Edit/Delete behavior:** none.
- **Validation:** `onStatusChange` → status action (server permission).
- **On-select behavior:** `onStatusChange(item, value)`.
- **Dependencies:** `readOnly`.
- **Backend/API/DB:** `tasks.status`.
- **Special rules:** includes `on_hold` (unlike DOER_TASK_STATUSES); keeps retired/legacy current value selectable.
- **Code locations:** `components/my-day/my-day-board.tsx:391` (options `:404-408`).

### My Day dashboard — Function / Team Leader / Employee (Picker)
- **Module:** My Day dashboard
- **Screen:** `components/my-day/dashboard/dashboard-view.tsx` (`Picker` component, native select)
- **Field/Key:** URL `dept` / `lead` / `emp`
- **Source:** database (`options.departments` = distinct employee departments; `options.leads`; `options.employees`)
- **Component:** native select
- **Type:** Single
- **Required:** No
- **Default:** "" ("All")
- **Searchable:** No
- **Options:** "" → "All", then distinct values (`{value,label}`).
- **On-select behavior:** `go({...})` URL navigation.
- **Code locations:** Function `dashboard-view.tsx:248`; Team Leader `:254`; Employee `:260` (Picker def `:490`).

### My Day dashboard — Threshold
- **Module:** My Day dashboard
- **Screen:** `components/my-day/dashboard/dashboard-view.tsx`
- **Field/Key:** URL `threshold`
- **Source:** constant (`THRESHOLD_CHOICES = [90, 80, 75, 70, 60]`, `lib/daily-goals/score.ts:257`; default 80)
- **Component:** native select
- **Type:** Single
- **Default:** 80 (default) or parsed `?threshold=`
- **Options:** 90%, 80%, 75%, 70%, 60% (plus any hand-typed value, sorted desc).
- **On-select behavior:** `go({ threshold })`.
- **Code locations:** `dashboard-view.tsx:397` (options `:405-413`).

(Note: My Day dashboard "Period" (Daily / This Week / Month to Date / Custom Range) is a segmented button row, not a dropdown.)

---

# L. Dynamic Forms — `components/forms/`

### Form field type "select" (rendered)
- **Module:** Forms (dynamic modules: Reimbursements, Record Reference, Participant Breakthrough, incentive forms)
- **Screen:** `components/forms/form-fields.tsx` (`FieldInput`)
- **Field/Key:** form field key (dynamic, per `FormFieldDef`)
- **Source:** database/config (`form_configs` overrides; code defaults)
- **Component:** Select
- **Type:** Single
- **Required:** depends on field `required`
- **Default:** `""` (placeholder "- Select -")
- **Searchable:** auto (>8 options)
- **Options:** `field.options` (admin-editable strings).
- **Add/Edit/Delete behavior:** admin edits options one-per-line in `FormEditorDialog` (`saveFormConfig` → `form_configs`).
- **Validation:** server form validator.
- **Code locations:** `components/forms/form-fields.tsx:87`.

### Form field type "buttons" / "product" (MCQ buttons)
- **Module:** Forms
- **Screen:** `components/forms/form-fields.tsx`
- **Field/Key:** form field key
- **Source:** database/config (`options`; product = global product list + inline add)
- **Component:** other — single-select MCQ buttons (not a dropdown; noted as option picker)
- **Type:** Single
- **Options:** `field.options` (buttons) / product names (product).
- **Add/Edit/Delete behavior:** product: admin can add inline → `addProductOption`.
- **Code locations:** `components/forms/form-fields.tsx:57` (buttons), `:194` (`ProductButtons`).

### Form editor — Field "Type" selector
- **Module:** Forms (admin form editor)
- **Screen:** `components/forms/form-editor-dialog.tsx`
- **Field/Key:** `FormFieldDef.type`
- **Source:** constant (`FIELD_TYPE_LABELS`, `lib/forms/field-types.ts:76`)
- **Component:** native select
- **Type:** Single
- **Options:** text → "Short text"; textarea → "Paragraph"; select → "Dropdown"; buttons → "Buttons (MCQ)"; product → "Product name (buttons)"; date → "Date"; number → "Number"; email → "Email"; tel → "Phone"; url → "Link / URL"
- **On-select behavior:** `update(i, { type })`; shows options textarea when type is select/buttons.
- **Code locations:** `components/forms/form-editor-dialog.tsx:109`.

---

# M. Goals module — task-status picker (`components/goals/board/goal-table-view.tsx`)

### Goal Status (inline)
- **Module:** Goals (board/table) — task-status-related picker
- **Screen:** `components/goals/board/goal-table-view.tsx` (`StatusCell`)
- **Field/Key:** `goals.status`
- **Source:** enum — `ADMIN_TASK_STATUSES` (admins) / `USER_TASK_STATUSES` (others), labels from local `STATUS_LABEL` map (`goal-table-view.tsx:378`)
- **Component:** Select
- **Type:** Single
- **Required:** Yes (always a status)
- **Default:** current `goals.status` (fallback `not_started`)
- **Searchable:** auto (>8 options)
- **Static/Dynamic:** Static set, labels hardcoded (DIFFER from WMS labels — see special rules)
- **Options (admin):** dont_know → "Not assessed"; not_started → "Not started"; initiated → "In progress"; follow_up → "Follow-up"; on_hold → "On hold"; need_info → "Need info"; done → "Done"; approved → "Approved"; not_approved → "Not approved"
- **Options (non-admin):** same minus approved/not_approved (USER_TASK_STATUSES), labels identical.
- **Add/Edit/Delete behavior:** none.
- **Validation:** server goal-status edit action.
- **On-select behavior:** `onCommit(status)` → goal status update.
- **Dependencies:** `isAdmin` chooses the option set; `disabled` lock.
- **Backend/API/DB:** `goals.status`.
- **Special rules:** labels here differ from the WMS `STATUS_LABELS_FALLBACK` ("Not assessed" vs "Not Read", "In progress" vs "Initiated", "Follow-up" vs "Follow Up", "On hold" vs "On Hold", "Need info" vs "Need Info"). A legacy/out-of-set current value is always appended to the list.
- **Code locations:** `components/goals/board/goal-table-view.tsx:412` (options `:423-429`; label map `:378-391`).

---

# N. Supporting option-array definitions (feed the pickers above)

- `db/enums.ts:7` `TASK_STATUSES` — full 15-value status enum.
- `db/enums.ts:34` `USER_TASK_STATUSES` — dont_know, not_started, initiated, follow_up, on_hold, need_info, done.
- `db/enums.ts:62` `DOER_TASK_STATUSES` — dont_know, not_started, initiated, follow_up, need_info, done (no on_hold).
- `db/enums.ts:71` `PENDING_STATUSES` — dont_know, not_started, initiated, follow_up, on_hold, need_info.
- `db/enums.ts:86` `DEPRECATED_TASK_STATUSES` — follow_up_1, follow_up_2, follow_up_3, cancelled, transferred, need_help.
- `db/enums.ts:107` `ADMIN_TASK_STATUSES` — TASK_STATUSES minus deprecated (= dont_know, not_started, initiated, follow_up, on_hold, need_info, done, approved, not_approved).
- `db/enums.ts:113` `APPROVAL_STATUSES` — approved, not_approved, cancelled, transferred.
- `db/enums.ts:128` `TASK_RECURRENCES` — none, daily, weekly, monthly, yearly; `db/enums.ts:137` `RECURRENCE_LABELS`.
- `db/enums.ts:145` `TASK_SUBJECTS` — 27 canonical subject strings (Marketing … Bank Follow Up); superseded at runtime by the dynamic `subjects` table + `applySubjectPolicy`.
- `db/enums.ts:320` `TASK_PRIORITIES` — imp_urgent, imp_not_urgent, not_imp_urgent, not_imp_not_urgent; `db/enums.ts:335` `PRIORITY_LABELS` — Critical/Important/Urgent/Normal.
- `db/enums.ts:342` `DEPARTMENTS` — Founder Office, Handholding, Apps, Sales, Marketing, Social Media, Accounts, Admin, HR, Consulting, CRM.
- `db/enums.ts:357` `AGE_BUCKETS` — 0-3/4-7/8-14/15-20/21-30/31-45/46-60/60+ days (used by aging heatmap, not a task dropdown in scope).
- `lib/format.ts:111` `STATUS_LABELS_FALLBACK` — the default human status labels (Not Read / Not Started / Initiated / Follow Up / Need Help / On Hold / Need Info / Follow Up 1-3 / Done / Approved / Not Approved / Cancelled / Transferred).
- `lib/tasks/subject-options.ts:35,39` `RETIRED_SUBJECTS` / `PINNED_SUBJECTS`.
- `lib/tasks/template-columns.ts` — Excel template dropdown sources: `TASK_STATUS_LABELS` (USER_TASK_STATUSES pretty-printed), `PRIORITY_LABELS_LIST` (Critical/Important/Urgent/Normal), `RECURRENCE_LABELS` (None/Daily/Weekly/Monthly/Yearly), `YES_NO_LABELS` (Yes/No).
- `lib/teams/roster.ts` `TEAM_ROSTER` — t1..t6 team options.
- `lib/daily-goals/score.ts:132` `PERIOD_LABELS`; `:257` `THRESHOLD_CHOICES` [90,80,75,70,60].

---

# O. Excel bulk-import template dropdowns (non-UI, but option pickers)

The built-in Tasks Excel template (`lib/templates/tasks.ts`, served by `app/(app)/tasks/template.xlsx/route.ts`) generates native Excel data-validation dropdowns (type "list") on 8 source-backed columns, defined in `lib/tasks/template-columns.ts` (`TASK_TEMPLATE_COLUMNS`):
- **Client** (`source: "client"`) — live active clients.
- **Subject / Category** (`source: "subject"`) — `listActiveSubjectNames()` (retire/pin policy).
- **Doer (Assignee)** (`source: "doer"`) — active employees (names).
- **Initiator** (`source: "initiator"`) — active employees.
- **Priority** (`source: "priority"`) — Critical / Important / Urgent / Normal (`PRIORITY_LABELS_LIST`).
- **Status** (`source: "status"`) — Not Read(?) / Not Started / Initiated / Follow Up / On Hold / Need Info / Done (USER_TASK_STATUSES pretty-printed via `prettyStatus`: `dont_know` → "Not Assessed", etc.).
- **All Day?** (`source: "yesno"`) — Yes / No.
- **Recurrence** (`source: "recurrence"`) — None / Daily / Weekly / Monthly / Yearly.
Validation is permissive (`showErrorMessage: false`); off-list values are flagged on import. These are Excel-native, not React components.
- **Code locations:** manifest `lib/tasks/template-columns.ts:148-281`; generator `lib/templates/tasks.ts` (dropdowns `:204-217`).

The Goals template (`lib/templates/goals.ts`) decorates a static workbook with dropdowns for clients/areas/measures/types/roster (out of task scope, noted for completeness).

### 3.2 — Attendance / Leave / Overtime / Remote Work

# Attendance / Leave / Overtime / Remote-Work — Dropdown & Option-Picker Audit (Slice 2)

Scope: `components/attendance`, `components/overtime`, `components/operations` (attendance-related only), `components/profile` (attendance/device related), `app/(app)/attendance`, `app/(app)/overtime`, `app/(app)/holidays`, `lib/attendance`, `lib/attendance-log`, `lib/recurrence`, `lib/geo`, `lib/webauthn`, plus `db/enums.ts`.

Enum source of truth (`C:/Users/om jadhav/Downloads/wms-local-main (1)/wms-local-main/db/enums.ts`):
- `ATTENDANCE_KINDS` (374): `in`, `out`
- `ATTENDANCE_CODES` (379): `P`, `H/D`, `A`, `W/O`, `incomplete`, `H`, `HP`, `H-H/D`, `PL`, `LWP`, `CO`
- `ATTENDANCE_CODE_LABELS` (385): Present / Half Day / Absent / Weekly Off / No Check-out / Holiday / Holiday Present / Holiday Half-Day / Paid Leave / Unpaid Leave / Comp Off
- `ATTENDANCE_CODE_VALUES` (381): P=1, H/D=0.5, A=0, W/O=1, incomplete=0, H=1, HP=2, H-H/D=1.5, PL=1, LWP=0, CO=1
- `LEAVE_KINDS` (393): `paid`, `unpaid`; `LEAVE_KIND_LABELS` (395): `paid`→"Paid Leave", `unpaid`→"Unpaid Leave"
- `LEAVE_STATUS` (400): `pending`, `approved`, `rejected`, `cancelled`; labels: Pending/Approved/Rejected/Cancelled
- `COMP_OFF_STATUS` (409): `open`, `redeemed`
- `PUNCH_SOURCES` (411): `self`, `admin`
- `PUNCH_REASONS` (413): `client_visit`, `wfh`, `forgot`, `correction`
- `REMOTE_WORK_MODES` (423): `wfh`, `client_site`, `field`; `REMOTE_WORK_MODE_LABELS` (434): WFH / Client Site / On Field
- `REMOTE_WORK_STATUSES` (441): `pending`, `approved`, `rejected`
- `REMOTE_REASON_BUCKETS` (453): `manan_approved`, `client_requested`, `manager_approved`; labels (459): "Manan Sir Approved" / "Client Requested" / "Manager Approved"
- `RECURRENCE_MODES` (475): `none`, `daily`, `weekdays`, `weekly`, `custom`; labels (477): "Does not repeat" / "Daily" / "Every weekday (Mon–Fri)" / "Weekly on this day" / "Custom…"
- `OFFICE_PHONE_AVAILABILITY` (493): `yes`, `no`, `na`; labels (495): Yes / No / Not applicable
- `DEVICE_KINDS` (1439): `laptop`, `phone`; `DEVICE_KIND_LABELS` (1442): Laptop / Phone
- `ATTENDANCE_AUDIT_ACTIONS` (1455): `create`, `update`, `delete`, `clear`; `ATTENDANCE_AUDIT_ACTION_LABELS` (1469): Created / Changed / Deleted / Cleared

Related constant (feeds admin-only dropdowns, OUT OF SCOPE for this slice): `EMPLOYEE_TYPE_OPTIONS` in `lib/attendance/worker-type.ts:31` (`full_time`, `first_half`, `second_half`, `hybrid`), `WORKER_TYPE_LABELS` (17). Used by `components/admin/*` only.

---

## A. HR Record page

### A1. Employee (HR Record LookupSelect)
- **Module:** Attendance › HR Record
- **Screen:** `/attendance/hr-record`
- **Field/Key:** URL param `?emp=`
- **Source:** database (employees list passed from server page)
- **Component:** LookupSelect (searchable combobox)
- **Type:** Single
- **Required:** No (can be null = no employee selected)
- **Default:** `selectedEmp` prop (null initially)
- **Searchable:** Yes
- **Static/Dynamic:** Dynamic (employee list from DB)
- **Options:** one per employee `{ id, name }`; placeholder "Pick an employee…"; "Clear Selection" row when a value is set
- **Add/Edit/Delete behavior:** None (no `onAdd`/`onDelete` wired here)
- **Validation:** None client-side; employee id validated server-side
- **On-select behavior:** `navigate(id, null)` → `router.push('/attendance/hr-record?emp=…')`
- **Dependencies:** Month picker disabled until an employee is chosen
- **Backend/API/DB:** server page query; navigation only
- **Special rules:** Keyboard-first; sorted alphabetically inside LookupSelect
- **Code locations:** `components/attendance/hr-record/hr-selectors.tsx:65` (def + usage)

### A2. Month (HR Record)
- **Module:** Attendance › HR Record
- **Screen:** `/attendance/hr-record`
- **Field/Key:** URL param `?month=`
- **Source:** database (months available for the selected employee, newest first)
- **Component:** native select
- **Type:** Single
- **Required:** No (disabled when no employee / no months)
- **Default:** `selectedMonth` prop
- **Searchable:** No
- **Static/Dynamic:** Dynamic
- **Options:** `""` → "No months on record" (only when empty); each `YYYY-MM-01` labelled via `hrMonthLabel(m)`
- **Add/Edit/Delete behavior:** None
- **Validation:** None
- **On-select behavior:** `navigate(selectedEmp, value)` → push `?emp=&month=`
- **Dependencies:** disabled when `!selectedEmp || months.length === 0`
- **Backend/API/DB:** server page; month list derived from employee's attendance history
- **Special rules:** flanked by older/newer chevron steppers
- **Code locations:** `components/attendance/hr-record/hr-selectors.tsx:93`

---

## B. Change Log (audit trail)

### B1. Employee filter
- **Module:** Attendance › Change Log
- **Screen:** `/attendance/change-log`
- **Field/Key:** URL param `employee`
- **Source:** database (`subjects` server prop)
- **Component:** native select
- **Type:** Single
- **Required:** No
- **Default:** `""` (Anyone)
- **Searchable:** No
- **Static/Dynamic:** Dynamic
- **Options:** `""` → "Anyone"; each subject `{ id, name }`
- **Add/Edit/Delete behavior:** None
- **Validation:** None
- **On-select behavior:** `set("employee", value)` → URL rewrite, server re-queries
- **Dependencies:** None
- **Backend/API/DB:** server-side filter via URL params
- **Special rules:** server-side filtering (table capped at 500 rows)
- **Code locations:** `components/attendance/change-log-client.tsx:94`

### B2. Changed by filter
- **Module:** Attendance › Change Log
- **Screen:** `/attendance/change-log`
- **Field/Key:** URL param `actor`
- **Source:** database (`actors` server prop)
- **Component:** native select
- **Type:** Single
- **Required:** No
- **Default:** `""` (Anyone)
- **Searchable:** No
- **Static/Dynamic:** Dynamic
- **Options:** `""` → "Anyone"; each actor `{ id, name }`
- **Add/Edit/Delete behavior:** None
- **Validation:** None
- **On-select behavior:** `set("actor", value)` → URL rewrite
- **Dependencies:** None
- **Backend/API/DB:** server-side filter
- **Special rules:** system entries render as "System" in rows, not an actor
- **Code locations:** `components/attendance/change-log-client.tsx:105`

### B3. Action filter
- **Module:** Attendance › Change Log
- **Screen:** `/attendance/change-log`
- **Field/Key:** URL param `action`
- **Source:** enum (`ATTENDANCE_AUDIT_ACTION_LABELS`)
- **Component:** native select
- **Type:** Single
- **Required:** No
- **Default:** `""` (All)
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** `""` → "All"; `create`→"Created"; `update`→"Changed"; `delete`→"Deleted"; `clear`→"Cleared"
- **Add/Edit/Delete behavior:** None
- **Validation:** None
- **On-select behavior:** `set("action", value)` → URL rewrite
- **Dependencies:** None
- **Backend/API/DB:** server-side filter
- **Special rules:** keys come from `Object.keys(ATTENDANCE_AUDIT_ACTION_LABELS)`
- **Code locations:** `components/attendance/change-log-client.tsx:116`

---

## C. Devices

### C1. Device status filter (tabs)
- **Module:** Attendance › Devices
- **Screen:** `/attendance/devices`
- **Field/Key:** local state `filter`
- **Source:** hardcoded
- **Component:** other (button group / segmented filter)
- **Type:** Single
- **Required:** No
- **Default:** `"all"`
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** `all`, `pending`, `approved`, `revoked` (labels capitalized via CSS `capitalize`: All / Pending / Approved / Revoked, each with a count)
- **Add/Edit/Delete behavior:** None
- **Validation:** None
- **On-select behavior:** client-side list filter
- **Dependencies:** search box also filters list
- **Backend/API/DB:** none (client filter)
- **Special rules:** defaults to live devices view
- **Code locations:** `components/attendance/devices-client.tsx:123`

### C2. Employee (Register Device)
- **Module:** Attendance › Devices › Register a device
- **Screen:** `/attendance/devices`
- **Field/Key:** `employeeId`
- **Source:** database (`employees` prop)
- **Component:** native select
- **Type:** Single
- **Required:** Yes (`required`)
- **Default:** `""`
- **Searchable:** No
- **Static/Dynamic:** Dynamic
- **Options:** `""` → "Select an employee…"; each employee `{ id, name }`
- **Add/Edit/Delete behavior:** None
- **Validation:** `required`; server re-checks
- **On-select behavior:** `setEmployeeId`
- **Dependencies:** none
- **Backend/API/DB:** `registerDeviceForEmployee` → `app/(app)/attendance/devices/actions.ts`
- **Special rules:** device id is typed in, not detected (admin's browser)
- **Code locations:** `components/attendance/devices-client.tsx:348`

### C3. Device type (Register Device)
- **Module:** Attendance › Devices › Register a device
- **Screen:** `/attendance/devices`
- **Field/Key:** `kind`
- **Source:** hardcoded (mirrors `DEVICE_KINDS` values; labels differ)
- **Component:** native select
- **Type:** Single
- **Required:** Yes (has default, always set)
- **Default:** `"laptop"`
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** `laptop`→"Desktop / Laptop"; `phone`→"Mobile phone"
- **Add/Edit/Delete behavior:** None
- **Validation:** server enforces cap (one approved laptop + one approved phone)
- **On-select behavior:** `setKind`
- **Dependencies:** none
- **Backend/API/DB:** `registerDeviceForEmployee` action
- **Special rules:** since 0215 kind decides the slot
- **Code locations:** `components/attendance/devices-client.tsx:360`

---

## D. Month/Year selectors (dashboard + insights)

Four near-identical components share the same `MONTH_LABELS` array (`"January"…"December"`, 1-indexed) and a client-computed year window `year-3 .. year+1`.

### D1. Month (Attendance dashboard)
- **Module:** Attendance › Dashboard
- **Screen:** `/attendance/dashboard`
- **Field/Key:** `?m=`
- **Source:** hardcoded `MONTH_LABELS`
- **Component:** native select
- **Type:** Single
- **Required:** Yes
- **Default:** `month` prop
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** 1→"January" … 12→"December"
- **On-select behavior:** `go(year, value)` → push `/attendance/dashboard?y=&m=`
- **Backend/API/DB:** none (URL nav)
- **Code locations:** `components/attendance/dashboard/month-selector.tsx:70`

### D2. Year (Attendance dashboard)
- **Field/Key:** `?y=` · **Options:** `year-3 .. year+1` · **Code locations:** `components/attendance/dashboard/month-selector.tsx:85`

### D3. Month (Employee insights)
- **Screen:** `/attendance/insights/employee/[employeeId]` · preserves employee id in path · **Code locations:** `components/attendance/insights/employee/employee-month-selector.tsx:74`

### D4. Year (Employee insights)
- **Code locations:** `components/attendance/insights/employee/employee-month-selector.tsx:89`

### D5. Month (Team insights)
- **Screen:** `/attendance/insights/team` · **Code locations:** `components/attendance/insights/manager/team-month-selector.tsx:48`

### D6. Year (Team insights)
- **Code locations:** `components/attendance/insights/manager/team-month-selector.tsx:54`

### D7. Month (Finance insights)
- **Screen:** `/attendance/insights/finance` · **Code locations:** `components/attendance/insights/finance/finance-month-selector.tsx:70`

### D8. Year (Finance insights)
- **Code locations:** `components/attendance/insights/finance/finance-month-selector.tsx:85`

(All D1–D8: native select, Single, Required Yes, Searchable No, Static, options as above; on-select normalizes month overflow/underflow into year rollover via `go()`.)

---

## E. Employee day-detail dialog (admin)

### E1. Reason (new punch)
- **Module:** Attendance › Dashboard › day detail
- **Screen:** employee-detail dialog (inline edit row)
- **Field/Key:** `reason`
- **Source:** enum `PUNCH_REASONS` + local `REASON_LABELS`
- **Component:** native select
- **Type:** Single
- **Required:** No (only rendered when adding a brand-new punch)
- **Default:** `"correction"`
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** `client_visit`→"Client visit"; `wfh`→"Work from home"; `forgot`→"Forgot to punch"; `correction`→"Correction"
- **Add/Edit/Delete behavior:** None
- **Validation:** reason only matters for new punches
- **On-select behavior:** `setReason`
- **Dependencies:** shown only when `addingNew`
- **Backend/API/DB:** `adminUpsertPunch` → `app/(app)/attendance/actions.ts`
- **Special rules:** `REASON_LABELS` is a local copy of labels (not in db/enums)
- **Code locations:** `components/attendance/dashboard/employee-detail.tsx:537` (labels def :47)

### E2. Type (Mark Leave)
- **Module:** Attendance › Dashboard › day detail › Leave / Comp-off
- **Screen:** employee-detail dialog
- **Field/Key:** `kind`
- **Source:** enum `LEAVE_KINDS` / `LEAVE_KIND_LABELS`
- **Component:** native select
- **Type:** Single
- **Required:** Yes (always set)
- **Default:** `"paid"`
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** `paid`→"Paid Leave"; `unpaid`→"Unpaid Leave"
- **Add/Edit/Delete behavior:** None
- **Validation:** start ≤ end enforced on submit
- **On-select behavior:** `setKind`
- **Dependencies:** none
- **Backend/API/DB:** `adminMarkLeave` → `app/(app)/attendance/leave/actions.ts`
- **Special rules:** unpaid approval marks dates Absent + salary deduction
- **Code locations:** `components/attendance/dashboard/employee-detail.tsx:760`

### E3. Credit (earned) — Redeem Comp-Off
- **Module:** Attendance › Dashboard › day detail › Leave / Comp-off
- **Screen:** employee-detail dialog
- **Field/Key:** `creditId`
- **Source:** database (`fetchCompOff` server action, filtered to `status === "open"`)
- **Component:** native select
- **Type:** Single
- **Required:** Yes (guard: "Pick an open comp-off credit.")
- **Default:** first open credit id (set after load)
- **Searchable:** No
- **Static/Dynamic:** Dynamic
- **Options:** one per open credit, value `c.id`, label `c.earnedDate`
- **Add/Edit/Delete behavior:** None (remove via separate list)
- **Validation:** requires credit + redeem date
- **On-select behavior:** `setCreditId`
- **Dependencies:** section hidden when no open credits
- **Backend/API/DB:** `redeemCompOff` / `fetchCompOff` → `app/(app)/attendance/dashboard/actions.ts`
- **Special rules:** none
- **Code locations:** `components/attendance/dashboard/employee-detail.tsx:828`

---

## F. Leave — Apply for Leave dialog

### F1. Leave Type (radio group)
- **Module:** Leave › Apply for Leave
- **Screen:** `/attendance/leave`
- **Field/Key:** `kind`
- **Source:** enum `LEAVE_KINDS`/labels; eligible set = `allowedKinds` server prop (from `lib/attendance/leave-eligibility`)
- **Component:** other (radiogroup / button pair)
- **Type:** Single
- **Required:** Yes (always a value)
- **Default:** `allowedKinds[0] ?? "unpaid"`
- **Searchable:** No
- **Static/Dynamic:** Dynamic (depends on worker type eligibility)
- **Options:** subset of `paid`→"Paid Leave", `unpaid`→"Unpaid Leave"
- **Add/Edit/Delete behavior:** None
- **Validation:** over-request guard for paid
- **On-select behavior:** `setKind`
- **Dependencies:** single eligible kind → collapses to static line "(the only type available to you)"
- **Backend/API/DB:** `requestLeave` → `app/(app)/attendance/leave/actions.ts`
- **Special rules:** none
- **Code locations:** `components/attendance/leave/apply-leave-dialog.tsx:289-324` (single-kind static line :276-288)

### F2. Leave Duration (Full / Half)
- **Module:** Leave › Apply for Leave
- **Screen:** `/attendance/leave`
- **Field/Key:** `startPortion` / `endPortion`
- **Source:** hardcoded
- **Component:** other (radiogroup segmented toggle, per editable boundary date)
- **Type:** Single
- **Required:** Yes
- **Default:** `"full"`
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** `full`→"Full Day"; `half`→"Half Day" (single-day) / "2nd half" (start date) / "1st half" (end date)
- **Add/Edit/Delete behavior:** None
- **Validation:** single-day hides end toggle (DB CHECK refuses start-half + end-half on one day)
- **On-select behavior:** `setStartPortion` / `setEndPortion`
- **Dependencies:** half-days only apply to first/last day; middle dates static "Full day"
- **Backend/API/DB:** `requestLeave` action
- **Special rules:** compact variant inside per-date rows
- **Code locations:** `components/attendance/leave/apply-leave-dialog.tsx:356` (component `FullHalfToggle` :679; `DurationByDate` :570)

### F3. Leave Category
- **Module:** Leave › Apply for Leave
- **Screen:** `/attendance/leave`
- **Field/Key:** `categoryId`
- **Source:** database (`categories` server prop — admin-editable list)
- **Component:** native select
- **Type:** Single
- **Required:** No (optional; empty → null)
- **Default:** `""`
- **Searchable:** No
- **Static/Dynamic:** Dynamic
- **Options:** `""` → "Select a category…"; each category `{ id, name }`
- **Add/Edit/Delete behavior:** None (managed in Admin)
- **Validation:** none
- **On-select behavior:** `setCategoryId`
- **Dependencies:** field not rendered when `categories.length === 0`
- **Backend/API/DB:** `requestLeave` action
- **Special rules:** none
- **Code locations:** `components/attendance/leave/apply-leave-dialog.tsx:390`

### F4. Available on personal phone
- **Field/Key:** `personalPhone` · **Component:** other (radiogroup ChoiceRow) · **Options:** `yes`→"Yes", `no`→"No" · **Required:** No (unanswered → NULL) · **Default:** `""` · **On-select:** clicking active answer clears it · **Code locations:** `components/attendance/leave/apply-leave-dialog.tsx:454`

### F5. Available on office phone
- **Field/Key:** `officePhone` · **Component:** other (radiogroup ChoiceRow) · **Options:** `na`→"NA", `yes`→"Yes", `no`→"No" (from `OFFICE_PHONE_OPTIONS`, values match `OFFICE_PHONE_AVAILABILITY`) · **Required:** No · **Default:** `""` · **Code locations:** `components/attendance/leave/apply-leave-dialog.tsx:463` (options def :43-47)

### F6. Computer & internet access
- **Field/Key:** `computer` · **Component:** other (radiogroup ChoiceRow) · **Options:** `yes`→"Yes", `no`→"No" · **Required:** No · **Default:** `""` · **Code locations:** `components/attendance/leave/apply-leave-dialog.tsx:469`

(All three reachability rows store NULL when unanswered; server columns nullable.)

---

## G. Leave Requests queue (reviewer)

### G1. Status tabs
- **Module:** Leave › Leave Requests
- **Screen:** `/attendance/leave/requests`
- **Field/Key:** URL param `status`
- **Source:** hardcoded `STATUS_TABS`
- **Component:** other (tablist / segmented control)
- **Type:** Single
- **Required:** No
- **Default:** server default = `pending` when no param
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** `all`→"All"; `pending`→"Pending"; `approved`→"Approved"; `rejected`→"Rejected"
- **Add/Edit/Delete behavior:** None
- **Validation:** none
- **On-select behavior:** `setParam("status", value)`
- **Dependencies:** "all" written explicitly to avoid bouncing back to pending
- **Backend/API/DB:** server-side filter
- **Special rules:** rejected tab omitted from `LEAVE_STATUS` (no "cancelled" tab)
- **Code locations:** `components/attendance/leave/leave-requests-client.tsx:17` (def), :104 (usage)

### G2. Filter by employee
- **Field/Key:** URL param `employee` · **Source:** database `employeeOptions` · **Component:** native select · **Options:** `""`→"All employees"; each `{ id, name }` · **Required:** No · **Code locations:** `components/attendance/leave/leave-requests-client.tsx:130`

### G3. Filter by Function
- **Field/Key:** URL param `dept` · **Source:** database `departmentOptions` · **Component:** native select · **Options:** `""`→"All Functions"; each `{ id, name }` · **Required:** No · **Dependencies:** hidden for managers (`departmentOptions.length === 0`) · **Code locations:** `components/attendance/leave/leave-requests-client.tsx:146`

### G4. Filter by leave type
- **Field/Key:** URL param `kind` · **Source:** enum `LEAVE_KINDS`/labels · **Component:** native select · **Options:** `""`→"All types"; `paid`→"Paid Leave"; `unpaid`→"Unpaid Leave" · **Required:** No · **Code locations:** `components/attendance/leave/leave-requests-client.tsx:162`

---

## H. Leave — Request Leave form (legacy simple form)

### H1. Type
- **Module:** Leave › Request leave
- **Screen:** `/attendance/leave`
- **Field/Key:** `kind`
- **Source:** enum `LEAVE_KINDS`/labels
- **Component:** other (button group)
- **Type:** Single
- **Required:** Yes
- **Default:** `"paid"`
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** `paid`→"Paid Leave"; `unpaid`→"Unpaid Leave"
- **Add/Edit/Delete behavior:** None
- **Validation:** end ≥ start
- **On-select behavior:** `setKind`
- **Dependencies:** none
- **Backend/API/DB:** `requestLeave` action
- **Special rules:** simple form (no category / half-day / availability)
- **Code locations:** `components/attendance/leave/request-leave-form.tsx:60`

---

## I. Remote Work workspace (request + amend)

### I1. Remote Work Type (RequestForm)
- **Module:** Remote Work › Request form
- **Screen:** `/attendance/remote-work`
- **Field/Key:** `workMode`
- **Source:** enum `REMOTE_WORK_MODE_LABELS` over local `MODES` (`["wfh","client_site","field"]`)
- **Component:** native select
- **Type:** Single
- **Required:** Yes
- **Default:** `"wfh"`
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** `wfh`→"WFH"; `client_site`→"Client Site"; `field`→"On Field"
- **Add/Edit/Delete behavior:** None
- **Validation:** server CHECK 0205 (mode must be requestable)
- **On-select behavior:** `setWorkMode`; reveals Client site field when `client_site`
- **Dependencies:** `needsClient`
- **Backend/API/DB:** `submitRemoteWorkRequest` → `app/(app)/attendance/remote-work/actions.ts`
- **Special rules:** `office`/`other` not requestable
- **Code locations:** `components/attendance/remote-work-workspace.tsx:341`

### I2. Client site (RequestForm)
- **Module:** Remote Work › Request form
- **Field/Key:** `clientLocationId`
- **Source:** database (`clientLocations` page data)
- **Component:** native select
- **Type:** Single
- **Required:** Yes (only when mode = client_site)
- **Default:** `""`
- **Searchable:** No
- **Static/Dynamic:** Dynamic
- **Options:** `""` → "Pick a site…"; each location `{ id, name }`
- **Add/Edit/Delete behavior:** None
- **Validation:** server enforces site presence for client_site
- **On-select behavior:** `setClientLocationId`
- **Dependencies:** disabled + error message when no sites saved
- **Backend/API/DB:** client locations from DB
- **Special rules:** none
- **Code locations:** `components/attendance/remote-work-workspace.tsx:356`

### I3. Repeat (RequestForm)
- **Module:** Remote Work › Request form
- **Field/Key:** `repeat`
- **Source:** enum `RECURRENCE_MODE_LABELS` + local "Monthly" option (`REPEAT_CHOICES`)
- **Component:** native select
- **Type:** Single
- **Required:** Yes
- **Default:** `"none"`
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** `none`→"Does not repeat"; `daily`→"Daily"; `weekdays`→"Every weekday (Mon–Fri)"; `weekly`→"Weekly on this day"; `monthly`→"Monthly"; `custom`→"Custom…"
- **Add/Edit/Delete behavior:** None
- **Validation:** none
- **On-select behavior:** `pickRepeat` (seeds weekdays + month-day from start date when picking Custom)
- **Dependencies:** reveals Ends control when `repeat !== "none"`; "monthly" submits as recurrence `"custom"`
- **Backend/API/DB:** submit action (expands to one row per date)
- **Special rules:** column admits only the five `RECURRENCE_MODES`; monthly = Google default (same day-of-month as start)
- **Code locations:** `components/attendance/remote-work-workspace.tsx:418` (choices def :48-55)

### I4. Ends (RequestForm)
- **Module:** Remote Work › Request form
- **Field/Key:** `endMode`
- **Source:** hardcoded
- **Component:** native select
- **Type:** Single
- **Required:** Yes (rendered only when repeating)
- **Default:** `"until"`
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** `until`→"On a date"; `count`→"After…"; `never`→"Never"
- **On-select behavior:** `setEndMode`; reveals date or occurrences input
- **Dependencies:** `repeats`
- **Backend/API/DB:** submit action (`end`/`repeatUntil`/`count`)
- **Special rules:** "Never" books up to horizon (`MAX_HORIZON_DAYS = 180`)
- **Code locations:** `components/attendance/remote-work-workspace.tsx:434`

### I5. Repeat unit (custom)
- **Field/Key:** `unit` · **Source:** hardcoded (labels pluralize by `intervalStr`) · **Component:** native select · **Options:** `day`→"Day"/"Days"; `week`→"Week"/"Weeks"; `month`→"Month"/"Months" · **Required:** Yes · **Default:** `"week"` · **Code locations:** `components/attendance/remote-work-workspace.tsx:492`

### I6. Monthly repeat style (custom)
- **Field/Key:** `monthlyKind` · **Source:** hardcoded · **Component:** native select · **Options:** `day`→"a date"; `weekday`→"a weekday" · **Required:** Yes · **Default:** `"day"` · **Code locations:** `components/attendance/remote-work-workspace.tsx:538`

### I7. Day of the month (custom)
- **Field/Key:** `monthDayStr` · **Source:** hardcoded 1..31 · **Component:** native select · **Options:** `1`→"1st" … `31`→"31st" (`nth()`) · **Required:** Yes · **Default:** `"1"` · **Code locations:** `components/attendance/remote-work-workspace.tsx:550`

### I8. Which week of the month (custom)
- **Field/Key:** `ordinalStr` · **Source:** hardcoded `ORDINALS` · **Component:** native select · **Options:** `1`→"First"; `2`→"Second"; `3`→"Third"; `4`→"Fourth"; `-1`→"Last" · **Required:** Yes · **Default:** `"1"` · **Code locations:** `components/attendance/remote-work-workspace.tsx:569` (def :57-63)

### I9. Which weekday (custom)
- **Field/Key:** `ordWeekdayStr` · **Source:** hardcoded `ORDINAL_WEEKDAYS` · **Component:** native select · **Options:** `1`→"Monday"; `2`→"Tuesday"; `3`→"Wednesday"; `4`→"Thursday"; `5`→"Friday"; `6`→"Saturday"; `0`→"Sunday" · **Required:** Yes · **Default:** `"1"` · **Code locations:** `components/attendance/remote-work-workspace.tsx:581` (def :66-74)

### I10. Weekday chips (custom weekly, multi)
- **Field/Key:** `weekdays` · **Source:** hardcoded `WEEKDAYS` · **Component:** other (toggle chips) · **Type:** Multi · **Required:** No (empty allowed) · **Default:** seeded to start date's weekday when Custom picked · **Options:** M(1), T(2), W(3), T(4), F(5), S(6), S(0) · **Code locations:** `components/attendance/remote-work-workspace.tsx:506` (def :30-38)

### I11. Reason (bucket) (RequestForm)
- **Field/Key:** `reasonBucket` · **Source:** enum `REMOTE_REASON_BUCKETS`/labels · **Component:** native select · **Options:** `""`→"Not specified"; `manan_approved`→"Manan Sir Approved"; `client_requested`→"Client Requested"; `manager_approved`→"Manager Approved" · **Required:** No · **Default:** `""` · **Code locations:** `components/attendance/remote-work-workspace.tsx:615`

### I12. Remote Work Type (AmendForm)
- **Module:** Remote Work › Amend (queue + history)
- **Field/Key:** `workMode` · **Source:** enum labels over `MODES` · **Component:** native select · **Options:** same as I1 · **Default:** `row.workMode` · **Required:** Yes · **Code locations:** `components/attendance/remote-work-workspace.tsx:948`

### I13. Client site (AmendForm)
- **Field/Key:** `clientLocationId` · **Source:** database · **Component:** native select · **Options:** `""`→"Pick a site…" + locations · **Default:** matched by `row.clientName` · **Code locations:** `components/attendance/remote-work-workspace.tsx:963`

### I14. Reason (bucket) (AmendForm)
- **Field/Key:** `reasonBucket` · **Source:** enum · **Component:** native select · **Options:** same as I11 · **Default:** `row.reasonBucket ?? ""` · **Code locations:** `components/attendance/remote-work-workspace.tsx:1011`

---

## J. Remote Check-In dialog (self punch)

### J1. Check In / Check Out toggle
- **Module:** Attendance › Remote Check-In
- **Screen:** remote check-in dialog (portal)
- **Field/Key:** `kind`
- **Source:** hardcoded `["in","out"]`
- **Component:** other (button pair)
- **Type:** Single
- **Required:** Yes
- **Default:** `"out"` if checked-in-but-not-out, else `"in"`
- **Options:** `in`→"Check In"; `out`→"Check Out"
- **On-select behavior:** `setKind`; "out" disabled until checked in; "in" disabled once checked in
- **Backend/API/DB:** `punchRemote` → `app/(app)/attendance/actions.ts`
- **Code locations:** `components/attendance/remote-checkin-dialog.tsx:102`

### J2. Where are you working? (work mode)
- **Field/Key:** `mode` · **Source:** hardcoded `MODES` (local) · **Component:** other (button grid) · **Type:** Single · **Required:** Yes · **Default:** `"wfh"` · **Options:** `wfh`→"Work from Home"; `client_site`→"Client Site"; `field`→"Field Visit"; `other`→"Other" · **Code locations:** `components/attendance/remote-checkin-dialog.tsx:117` (def :16-21)
- **Special rules:** NOTE — labels differ from `REMOTE_WORK_MODE_LABELS` ("Work from Home" vs "WFH", "Field Visit" vs "On Field") and includes `other`.

---

## K. Overtime

### K1. Employee (Log Overtime)
- **Module:** Overtime
- **Screen:** `/attendance/overtime` (or `/overtime`)
- **Field/Key:** `employeeId`
- **Source:** database (`loggableFor` prop: self + downline or everyone)
- **Component:** native select
- **Type:** Single
- **Required:** Yes (always has a value)
- **Default:** `meId`
- **Searchable:** No
- **Static/Dynamic:** Dynamic
- **Options:** each person `{ id, name }`, with `" (me)"` suffix appended for self
- **Add/Edit/Delete behavior:** None
- **Validation:** hours 0–24 checked on submit
- **On-select behavior:** `setEmployeeId`
- **Dependencies:** only rendered when `loggableFor.length > 1`
- **Backend/API/DB:** `logOvertime` → `app/(app)/overtime/actions.ts`
- **Special rules:** employeeId omitted from payload when logging for self
- **Code locations:** `components/overtime/overtime-client.tsx:306`

### K2. Status filter pills
- **Module:** Overtime
- **Field/Key:** `statusFilter` (client state) · **Source:** hardcoded + `STATUS_META` · **Component:** other (button group) · **Type:** Single · **Options:** `all`→"All"; `pending`→"Pending"; `approved`→"Approved"; `rejected`→"Rejected" (each with count) · **Default:** `"all"` · **Code locations:** `components/overtime/overtime-client.tsx:201` (usage :425-430)

---

## L. Profile — Workflow (attendance/availability related)

### L1. Delegate (Out of Office)
- **Module:** Profile › Out of Office
- **Screen:** `/profile`
- **Field/Key:** `oooDelegateId`
- **Source:** database (`colleagues` prop)
- **Component:** Select (shadcn/cmdk)
- **Type:** Single
- **Required:** No
- **Default:** `initial.oooDelegateId ?? ""`
- **Searchable:** Yes (`searchable`)
- **Static/Dynamic:** Dynamic
- **Options:** `""`→"No delegate"; each colleague → `{name}{department ? " · " + department : ""}`
- **Add/Edit/Delete behavior:** None
- **Validation:** none
- **On-select behavior:** `setDelegate` + immediate `setOoo` commit
- **Dependencies:** rendered only when OOO enabled
- **Backend/API/DB:** `setOoo` → `app/(app)/profile/actions.ts`
- **Special rules:** saves immediately on change (no explicit save button)
- **Code locations:** `components/profile/workflow/ooo-controls.tsx:184`

### L2. Timezone (Working Hours)
- **Module:** Profile › Working Hours
- **Screen:** `/profile`
- **Field/Key:** `timezone`
- **Source:** hardcoded `TZ_OPTIONS`
- **Component:** Select (shadcn/cmdk)
- **Type:** Single
- **Required:** Yes
- **Default:** `initial.timezone`
- **Searchable:** Yes (`searchPlaceholder="Search timezone…"`)
- **Static/Dynamic:** Static (plus current value appended if not in list)
- **Options:** `Asia/Kolkata`, `Asia/Dubai`, `Asia/Singapore`, `Asia/Tokyo`, `Europe/London`, `Europe/Berlin`, `Europe/Paris`, `America/New_York`, `America/Los_Angeles`, `UTC` (each value=label)
- **Add/Edit/Delete behavior:** None
- **Validation:** none
- **On-select behavior:** `setTz` + immediate `setWorkingHours` save
- **Backend/API/DB:** `setWorkingHours` → `app/(app)/profile/actions.ts`
- **Special rules:** saves immediately
- **Code locations:** `components/profile/workflow/working-hours.tsx:102` (def :10-21)

### L3. Working days (multi-select day chips)
- **Module:** Profile › Working Hours
- **Field/Key:** `workingDays`
- **Source:** hardcoded `DAY_LABELS`
- **Component:** other (toggle chips)
- **Type:** Multi
- **Required:** No (can be empty array)
- **Default:** `initial.workingDays`
- **Options:** 1→"Mon", 2→"Tue", 3→"Wed", 4→"Thu", 5→"Fri", 6→"Sat", 7→"Sun"
- **On-select behavior:** `flipDay` toggles + sorts + saves
- **Backend/API/DB:** `setWorkingHours` action
- **Code locations:** `components/profile/workflow/working-hours.tsx:156` (def :23-31)

---

## M. Insights / dashboard pickers (light-weight)

### M1. Period toggle (Attendance KPI strip)
- **Module:** Attendance › dashboard (self view)
- **Field/Key:** `period`
- **Source:** hardcoded `PERIODS`
- **Component:** other (segmented buttons)
- **Type:** Single
- **Default:** `"thisWeek"`
- **Options:** `thisWeek`→"This Week"; `thisMonth`→"This Month"; `lastMonth`→"Last Month"; `last3Months`→"Last 3 Months"
- **Backend/API/DB:** server summary `lib/queries/attendance-summary.ts`
- **Code locations:** `components/attendance/attendance-kpi-strip.tsx:56` (usage :259)

### M2. Leaderboards tabs (Org insights)
- **Module:** Attendance › Insights › Org
- **Field/Key:** `active`
- **Source:** hardcoded `BOARDS`
- **Component:** other (tablist)
- **Type:** Single
- **Default:** `"mostPunctual"`
- **Options:** `mostPunctual`→"Most Punctual"; `bestAttendance`→"Best Attendance"; `highestHours`→"Highest Hours"; `mostLate`→"Most Late"; `mostAbsent`→"Most Absent"
- **Backend/API/DB:** server analytics `lib/attendance/analytics/org.ts`
- **Code locations:** `components/attendance/insights/org/leaderboards.tsx:15` (usage :31)

---

## Notes / exclusions

- `components/operations/checklist/*` dropdowns (checklist-header.tsx:112, :160; checklist-grid.tsx:619) are the OPERATIONS CHECKLIST feature, not attendance — EXCLUDED per scope.
- `lib/attendance`, `lib/recurrence`, `lib/geo`, `lib/webauthn`, `lib/attendance-log` contain NO UI dropdowns (logic/constants only). Notable related constants: `ALL_DAY_START="10:30"` / `ALL_DAY_END="19:30"` (`lib/attendance/remote-work-constants.ts:15-16`), `MAX_HORIZON_DAYS=180` / `MAX_SERIES_DATES=60` / `weekdayLabels` / `weekdayOf` (`lib/attendance/recurrence.ts:30-47,245`).
- `app/(app)/attendance`, `app/(app)/overtime`, `app/(app)/holidays` contain NO inline dropdowns (server components delegate to the client components above). Confirmed by grep for `<select/<Select/<LookupSelect/<Command/<DropdownMenu` — zero matches.
- `EMPLOYEE_TYPE_OPTIONS` / `WORKER_TYPE_LABELS` (`lib/attendance/worker-type.ts`) feed worker-type pickers, but those live in `components/admin/*` (employee master / salary) — OUT OF SCOPE, noted for completeness.

### 3.3 — HR / People / Accounts / Support / Agreements

# HR / People-Accounts / Agreements / Support / Onboarding / Profile / Security — Dropdown Audit (Slice 3)

Scope: `components/hr`, `components/accounts`, `components/agreements`, `components/ambassadors`, `components/onboarding`, `components/profile`, `components/security`, `components/auth`, `components/layout` (filters/nav), `app/(app)/hr|agreements|support|queries|policies|letters|portal|accounts`, `lib/hr|employees|agreements|org|permissions|security|teams|validators`.

Legend for **Source**: hardcoded | constant | enum | API | database | other. **Component**: native select | Select | MultiSelect | LookupSelect | Command | DropdownMenu | other.

---

## HR — Candidates (Basic Details / Records)

### Filter by status (Candidate Records)
- **Module:** HR · Candidates
- **Screen:** Candidate Records list (`/hr/candidates`)
- **Field/Key:** local state `status`
- **Source:** hardcoded
- **Component:** native select
- **Type:** Single
- **Required:** No
- **Default:** `all`
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** `All statuses` (all) · `New` (new) · `Shortlisted` (shortlisted) · `Hired` (hired) · `Rejected` (rejected)
- **Add/Edit/Delete behavior:** none
- **Validation:** none
- **On-select behavior:** client-side row filter
- **Dependencies:** none
- **Backend/API/DB:** none (rows passed in)
- **Special rules:** none
- **Code locations:** `components/hr/candidate/basic-details-screen.tsx:179`

### Filter by form state (Candidate Records)
- **Module:** HR · Candidates
- **Screen:** Candidate Records list
- **Field/Key:** local state `form`
- **Source:** hardcoded
- **Component:** native select
- **Type:** Single
- **Required:** No
- **Default:** `all`
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** `All forms` (all) · `Complete` (complete) · `Draft` (draft)
- **Add/Edit/Delete behavior:** none
- **Validation:** none
- **On-select behavior:** client-side row filter
- **Dependencies:** none
- **Backend/API/DB:** none
- **Special rules:** none
- **Code locations:** `components/hr/candidate/basic-details-screen.tsx:186`

### Filter by position (Candidate Records)
- **Module:** HR · Candidates
- **Screen:** Candidate Records list
- **Field/Key:** local state `position`
- **Source:** database (derived from loaded rows, not a query)
- **Component:** native select
- **Type:** Single
- **Required:** No
- **Default:** `all`
- **Searchable:** No
- **Static/Dynamic:** Dynamic (distinct `positionApplied` values)
- **Options:** `All positions` (all) + each distinct `positionApplied` value
- **Add/Edit/Delete behavior:** none
- **Validation:** none
- **On-select behavior:** client-side row filter
- **Dependencies:** `candidates` prop
- **Backend/API/DB:** candidates query
- **Special rules:** hidden when no positions exist
- **Code locations:** `components/hr/candidate/basic-details-screen.tsx:192`

### Row actions menu (Candidate Records)
- **Module:** HR · Candidates
- **Screen:** Candidate Records list (per-row kebab)
- **Field/Key:** n/a (row actions)
- **Source:** hardcoded actions
- **Component:** DropdownMenu
- **Type:** Single (action)
- **Required:** No
- **Default:** n/a
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** `Evaluation Record` · `Edit` (or `Resume` when unsubmitted) · `Send form link` · `Cancel form link` · `Delete candidate` (admin-only)
- **Add/Edit/Delete behavior:** actions call server actions (resend/revoke/delete candidate intake)
- **Validation:** window.confirm before delete/revoke
- **On-select behavior:** navigate to `/hr/candidates/[id]/evaluation` or `/hr/intake?draft=`, or run link/delete actions
- **Dependencies:** `canDelete` prop
- **Backend/API/DB:** `resendCandidateFormLink`, `revokeCandidateFormLink`, `deleteCandidateIntake`
- **Special rules:** Delete gated by `canDelete`
- **Code locations:** `components/hr/candidate/basic-details-screen.tsx:366-412`

### Candidate picker (Pre-Interview Evaluation)
- **Module:** HR · Evaluation
- **Screen:** Candidate Evaluation Checklist (`/hr/evaluation`)
- **Field/Key:** `candidateId`
- **Source:** database (roster passed in)
- **Component:** native select
- **Type:** Single
- **Required:** Yes (to save)
- **Default:** `""`
- **Searchable:** No
- **Static/Dynamic:** Dynamic
- **Options:** `— Select candidate —` + each candidate `{fullName · positionApplied}`
- **Add/Edit/Delete behavior:** none
- **Validation:** Save blocked with toast if none picked
- **On-select behavior:** loads candidate ratings via `getCandidateEvaluation`
- **Dependencies:** `candidates` prop
- **Backend/API/DB:** `getCandidateEvaluation` / `saveCandidateEvaluation`
- **Special rules:** none
- **Code locations:** `components/hr/candidate/evaluation-screen.tsx:112-123`

### Candidate picker (Evaluation v2)
- **Module:** HR · Evaluation v2
- **Screen:** Candidate Evaluation v2 (`/hr/evaluation` v2)
- **Field/Key:** `candidateId`
- **Source:** database (roster)
- **Component:** LookupSelect
- **Type:** Single
- **Required:** Yes
- **Default:** null
- **Searchable:** Yes
- **Static/Dynamic:** Dynamic
- **Options:** each candidate `{fullName · positionApplied}`
- **Add/Edit/Delete behavior:** super-admin may delete candidate (confirmDelete + onDelete → `deleteCandidateIntake`)
- **Validation:** destructive-delete confirm dialog
- **On-select behavior:** loads evaluation via `getEvaluationV2(id, role)`
- **Dependencies:** `isSuperAdmin`, `fixedCandidateId`
- **Backend/API/DB:** `getEvaluationV2`, `deleteCandidateIntake`
- **Special rules:** delete gated to super-admins
- **Code locations:** `components/hr/candidate/evaluation-v2/evaluation-v2-screen.tsx:346-366`

### Designation (Evaluation v2 weight profile)
- **Module:** HR · Evaluation v2
- **Screen:** Candidate Evaluation v2 header
- **Field/Key:** `designation`
- **Source:** database (`load.designations`)
- **Component:** native select
- **Type:** Single
- **Required:** No
- **Default:** `default`
- **Searchable:** No
- **Static/Dynamic:** Dynamic
- **Options:** `Default Profile` (default) + each designation from DB
- **Add/Edit/Delete behavior:** none
- **Validation:** none
- **On-select behavior:** swaps weight profile used for scores
- **Dependencies:** `load` (evaluation load)
- **Backend/API/DB:** `load.designations`, `load.profilesByDesignation`
- **Special rules:** shown only once load exists
- **Code locations:** `components/hr/candidate/evaluation-v2/evaluation-v2-screen.tsx:376-387`

### Designation (Weight Matrix panel)
- **Module:** HR · Evaluation v2 (super-admin)
- **Screen:** Weight Metrics panel
- **Field/Key:** `selected`
- **Source:** constant (`DESIGNATION_LADDER`)
- **Component:** native select
- **Type:** Single
- **Required:** No
- **Default:** `default`
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** `Default` (default) · `Intern` · `Trainee` · `Executive` · `Sr Executive` · `Assistant Manager` · `Manager` · `Sr Manager` · `AVP` · `VP` · `Sr VP` (customised entries suffixed `·  customised`)
- **Add/Edit/Delete behavior:** none
- **Validation:** weights relative (renormalized); no must-equal-100 gate
- **On-select behavior:** loads that designation's weight grid
- **Dependencies:** `listWeightProfiles`, `saveWeightProfile`
- **Backend/API/DB:** weight profiles table
- **Special rules:** super-admin only
- **Code locations:** `components/hr/candidate/evaluation-v2/weight-matrix-panel.tsx:264-280`; ladder in `lib/hr/candidate/evaluation-v2.ts:501-512`

### Candidate picker (Management Assessment)
- **Module:** HR · Management Assessment
- **Screen:** Management Assessment (`/hr/management-assessment`)
- **Field/Key:** `candidateId`
- **Source:** database (roster)
- **Component:** native select
- **Type:** Single
- **Required:** Yes
- **Default:** `""`
- **Searchable:** No
- **Static/Dynamic:** Dynamic
- **Options:** `- Select candidate -` + each candidate `{fullName · positionApplied}`
- **Add/Edit/Delete behavior:** none
- **Validation:** none
- **On-select behavior:** loads assessment record
- **Dependencies:** `candidates` prop
- **Backend/API/DB:** management assessment actions
- **Special rules:** none
- **Code locations:** `components/hr/candidate/management-assessment-screen.tsx:410-423`

### Position Applied For (Candidate Interview Form)
- **Module:** HR · Candidate Intake
- **Screen:** Candidate Interview Form (`/hr/intake`) — Personal Details
- **Field/Key:** `personal.position`
- **Source:** database (Interview Positions master, add/delete live)
- **Component:** LookupSelect (via `IntakePositionSelect`)
- **Type:** Single
- **Required:** Yes
- **Default:** `""`
- **Searchable:** Yes
- **Static/Dynamic:** Dynamic (master editable)
- **Options:** seeded from `DEFAULT_POSITIONS`: `First-Year Intern` · `Second-Year Intern` · `Executive` · `Senior Executive` · `Assistant Manager` · `Deputy Manager` · `Senior Manager` · `Consultant` · `Senior Consultant` · `General Manager` · `Assistant Vice President` · `Deputy Vice President` · `Senior Vice President`
- **Add/Edit/Delete behavior:** authorised users can `+ Add` (`addInterviewPosition`) and delete (`deleteInterviewPosition`)
- **Validation:** required field
- **On-select behavior:** writes form value
- **Dependencies:** `canManage` (permission)
- **Backend/API/DB:** `addInterviewPosition` / `deleteInterviewPosition`
- **Special rules:** managed master; add/delete only when `canManage`
- **Code locations:** `components/hr/candidate/intake-position-select.tsx:53-62`; seed `lib/hr/candidate/intake-schema.ts:48-62`

### Function / Department (Candidate Interview Form)
- **Module:** HR · Candidate Intake
- **Screen:** Candidate Interview Form — Personal Details
- **Field/Key:** `personal.department`
- **Source:** database (admin Departments master via `departments` prop)
- **Component:** LookupSelect (via `IntakeField` select branch)
- **Type:** Single
- **Required:** Yes
- **Default:** `""`
- **Searchable:** Yes
- **Static/Dynamic:** Dynamic
- **Options:** each department name from the admin master
- **Add/Edit/Delete behavior:** none here (managed in /admin)
- **Validation:** required field
- **On-select behavior:** writes form value
- **Dependencies:** `departments` prop (resolved by intake wizard/page)
- **Backend/API/DB:** departments master
- **Special rules:** label "Function"; `optionsFrom: "departments"`
- **Code locations:** `components/hr/candidate/intake-section-step.tsx:80-81`; `components/hr/candidate/intake-field.tsx:91-107`; schema `lib/hr/candidate/intake-schema.ts:114`

### Month of Passing (Candidate Interview Form, Education repeater)
- **Module:** HR · Candidate Intake
- **Screen:** Candidate Interview Form — Education
- **Field/Key:** `education.{i}.passingMonth`
- **Source:** hardcoded
- **Component:** LookupSelect (via `IntakeField`)
- **Type:** Single
- **Required:** Yes
- **Default:** `""`
- **Searchable:** Yes
- **Static/Dynamic:** Static
- **Options:** `January` · `February` · `March` · `April` · `May` · `June` · `July` · `August` · `September` · `October` · `November` · `December`
- **Add/Edit/Delete behavior:** none
- **Validation:** required
- **On-select behavior:** writes form value
- **Dependencies:** repeater instance
- **Backend/API/DB:** none
- **Special rules:** none
- **Code locations:** `lib/hr/candidate/intake-schema.ts:68-76` (rendered by `components/hr/candidate/intake-field.tsx`)

### Size of House (Candidate Interview Form)
- **Module:** HR · Candidate Intake
- **Screen:** Candidate Interview Form — Personal Details
- **Field/Key:** `personal.sizeOfHouse`
- **Source:** hardcoded
- **Component:** LookupSelect (via `IntakeField`)
- **Type:** Single
- **Required:** Yes
- **Default:** `""`
- **Searchable:** Yes
- **Static/Dynamic:** Static
- **Options:** `1 RK` · `1 BHK` · `2 BHK` · `3 BHK`
- **Add/Edit/Delete behavior:** none
- **Validation:** required
- **On-select behavior:** writes form value
- **Dependencies:** none
- **Backend/API/DB:** none
- **Special rules:** none
- **Code locations:** `lib/hr/candidate/intake-schema.ts:130`

### Bathroom (Candidate Interview Form)
- **Module:** HR · Candidate Intake
- **Screen:** Candidate Interview Form — Personal Details
- **Field/Key:** `personal.bathroom`
- **Source:** hardcoded
- **Component:** LookupSelect (via `IntakeField`)
- **Type:** Single
- **Required:** Yes
- **Default:** `""`
- **Searchable:** Yes
- **Static/Dynamic:** Static
- **Options:** `Inside` · `Outside`
- **Add/Edit/Delete behavior:** none
- **Validation:** required
- **On-select behavior:** writes form value
- **Dependencies:** none
- **Backend/API/DB:** none
- **Special rules:** none
- **Code locations:** `lib/hr/candidate/intake-schema.ts:131`

### How did you learn about the opening? (Candidate Interview Form)
- **Module:** HR · Candidate Intake
- **Screen:** Candidate Interview Form — Personal Details
- **Field/Key:** `personal.source`
- **Source:** hardcoded
- **Component:** LookupSelect (via `IntakeField`)
- **Type:** Single
- **Required:** Yes
- **Default:** `""`
- **Searchable:** Yes
- **Static/Dynamic:** Static
- **Options:** `Company Website` · `Friend or Relative` · `Job Portal` · `HR Agency` · `Social Media` · `Other`
- **Add/Edit/Delete behavior:** none
- **Validation:** required
- **On-select behavior:** shows `sourceOther` text field when `Other`
- **Dependencies:** `sourceOther` field (showIf)
- **Backend/API/DB:** none
- **Special rules:** `Other` reveals "Please specify" field
- **Code locations:** `lib/hr/candidate/intake-schema.ts:153`

---

## HR — CTC

### Employee (CTC workbench)
- **Module:** HR · CTC
- **Screen:** CTC workbench (`/hr/ctc`)
- **Field/Key:** `employeeId`
- **Source:** database (roster)
- **Component:** LookupSelect
- **Type:** Single
- **Required:** Yes
- **Default:** null
- **Searchable:** Yes
- **Static/Dynamic:** Dynamic
- **Options:** each `{name · designation}`
- **Add/Edit/Delete behavior:** none
- **Validation:** none
- **On-select behavior:** loads employee CTC + seeds entity/reason
- **Dependencies:** `roster` prop
- **Backend/API/DB:** CTC actions
- **Special rules:** none
- **Code locations:** `components/hr/ctc/ctc-workbench.tsx:347-357`

### Paying Entity (CTC workbench)
- **Module:** HR · CTC
- **Screen:** CTC workbench
- **Field/Key:** `entity`
- **Source:** constant (`ENTITY_LIST`)
- **Component:** native select
- **Type:** Single
- **Required:** Yes
- **Default:** (depends on employee)
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** `Altus Corp` (altus-corp) · `Unleashed` (unleashed) · `The Gainmakers (MJV HUF)` (gainmakers) · `Legacy Creators (JSV HUF)` (legacy-creators) · `The Perfect Blend (Khushboo Shah)` (perfect-blend)
- **Add/Edit/Delete behavior:** none
- **Validation:** disabled until employee chosen
- **On-select behavior:** sets dirty
- **Dependencies:** `employeeId`
- **Backend/API/DB:** none (registry)
- **Special rules:** none
- **Code locations:** `components/hr/ctc/ctc-workbench.tsx:363-377`; registry `lib/hr/entities.ts:108-114`

### Revision Reason (CTC workbench)
- **Module:** HR · CTC
- **Screen:** CTC workbench
- **Field/Key:** `reason`
- **Source:** constant (`CTC_REASONS` + `REASON_LABELS`)
- **Component:** native select
- **Type:** Single
- **Required:** Yes
- **Default:** (state)
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** `Initial CTC` (initial) · `Promotion` (promotion) · `Appraisal Revision` (appraisal)
- **Add/Edit/Delete behavior:** none
- **Validation:** disabled until employee chosen
- **On-select behavior:** sets dirty
- **Dependencies:** `employeeId`
- **Backend/API/DB:** none
- **Special rules:** none
- **Code locations:** `components/hr/ctc/ctc-workbench.tsx:383-397`; `lib/hr/ctc/model.ts:191-198`

---

## HR — Exit

### Departing Employee (Exit workspace)
- **Module:** HR · Exit
- **Screen:** Exit workspace pick screen (`/hr/exit`)
- **Field/Key:** `empId`
- **Source:** database (roster)
- **Component:** native select
- **Type:** Single
- **Required:** Yes (to open a form)
- **Default:** `""`
- **Searchable:** No
- **Static/Dynamic:** Dynamic
- **Options:** `- Select employee -` + each employee name
- **Add/Edit/Delete behavior:** none
- **Validation:** toast "Select an employee first."
- **On-select behavior:** enables form cards
- **Dependencies:** `employees` prop
- **Backend/API/DB:** `getExitRecord`
- **Special rules:** none
- **Code locations:** `components/hr/exit/exit-workspace.tsx:153-166`

### Employee Name (Exit Interview form)
- **Module:** HR · Exit
- **Screen:** Director Exit Interview (Annexure B)
- **Field/Key:** `employeeId`
- **Source:** database (roster)
- **Component:** other (custom `EmployeeCombobox` — type-to-filter, keyboard-navigable)
- **Type:** Single
- **Required:** Yes
- **Default:** current employee
- **Searchable:** Yes (filters name + designation)
- **Static/Dynamic:** Dynamic
- **Options:** each roster employee `{name}` with sub `{designation · department}`
- **Add/Edit/Delete behavior:** none
- **Validation:** none
- **On-select behavior:** reloads form for that employee (auto-fills Manager + Designation)
- **Dependencies:** `roster`, `onEmployeeChange`
- **Backend/API/DB:** `saveExitRecord`
- **Special rules:** auto-fills `header_designation` + `header_managerName`
- **Code locations:** `components/hr/exit/exit-interview-form.tsx:207-213`; component `components/hr/exit/exit-fields.tsx:661-806`

### Employee Name (Handover form)
- **Module:** HR · Exit
- **Screen:** Handover & Clearance Checklist (Annexure A)
- **Field/Key:** `employeeId`
- **Source:** database (roster)
- **Component:** other (custom `EmployeeCombobox`)
- **Type:** Single
- **Required:** Yes
- **Default:** current employee
- **Searchable:** Yes
- **Static/Dynamic:** Dynamic
- **Options:** each roster employee `{name}` + `{designation · department}`
- **Add/Edit/Delete behavior:** none
- **Validation:** none
- **On-select behavior:** reloads form (auto-fills Employee ID + Function)
- **Dependencies:** `roster`, `onEmployeeChange`
- **Backend/API/DB:** `saveExitRecord`
- **Special rules:** auto-fills `header_employeeId` + `header_department`
- **Code locations:** `components/hr/exit/exit-handover-form.tsx:199-205`

### FloatingSelect (exit-fields) — DEAD COMPONENT (defined, never used)
- **Module:** HR · Exit
- **Screen:** n/a
- **Field/Key:** n/a
- **Source:** hardcoded options passed in
- **Component:** native select (styled)
- **Type:** Single
- **Required:** n/a
- **Default:** `— Select —`
- **Searchable:** No
- **Static/Dynamic:** Static (caller-supplied `options: string[]`)
- **Options:** caller-supplied; currently unused anywhere
- **Add/Edit/Delete behavior:** none
- **Validation:** none
- **On-select behavior:** n/a
- **Dependencies:** none
- **Backend/API/DB:** none
- **Special rules:** defined at `components/hr/exit/exit-fields.tsx:351-393` but no call site found
- **Code locations:** `components/hr/exit/exit-fields.tsx:351`

(Note: Exit choice questions Q2–Q5/Q8 and handover checkboxes are chip-radiogroup / checkbox pickers, NOT dropdowns — see Non-dropdown pickers section.)

---

## HR — Induction

### Employee (Induction)
- **Module:** HR · Induction
- **Screen:** Induction (`/hr/induction`)
- **Field/Key:** `employeeId`
- **Source:** database (people with onboarding submissions)
- **Component:** native select
- **Type:** Single
- **Required:** Yes
- **Default:** `""`
- **Searchable:** No
- **Static/Dynamic:** Dynamic
- **Options:** `- Select an employee -` + each name
- **Add/Edit/Delete behavior:** none
- **Validation:** none
- **On-select behavior:** loads onboarding summary via `getInduction`
- **Dependencies:** `people` prop
- **Backend/API/DB:** `getInduction`
- **Special rules:** none
- **Code locations:** `components/hr/induction/induction-screen.tsx:66-77`

---

## HR — Job Descriptions (JD Bank)

### Position (New Job Description)
- **Module:** HR · Job Description
- **Screen:** JD Bank (`/hr/job-description`)
- **Field/Key:** `positionId`
- **Source:** database (positions)
- **Component:** native select
- **Type:** Single
- **Required:** Yes
- **Default:** `""`
- **Searchable:** No
- **Static/Dynamic:** Dynamic
- **Options:** `Select a position…` + each `{title} ({holderCount})`
- **Add/Edit/Delete behavior:** none (positions created via NoPositionsYet block)
- **Validation:** none explicit
- **On-select behavior:** sets `chosen` (shows Function)
- **Dependencies:** `positions` prop
- **Backend/API/DB:** `createJdEntry`
- **Special rules:** none
- **Code locations:** `components/hr/job-description/jd-bank.tsx:256-267`

### Frequency (New Job Description)
- **Module:** HR · Job Description
- **Screen:** JD Bank
- **Field/Key:** `freqId`
- **Source:** constant (`FREQUENCY_OPTIONS`)
- **Component:** native select
- **Type:** Single
- **Required:** Yes
- **Default:** `daily`
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** `Daily` (daily) · `Every Monday` (mon) · `Mon-Wed-Fri` (mwf) · `Tue-Sat` (tue-sat) · `Weekly on Saturday` (sat) · `Once in 15 Days` (d15) · `Once in 30 Days` (d30) · `Monthly on 2nd Saturday` (sat2) · `First Monday of Month` (mon1) · `Custom` (custom)
- **Add/Edit/Delete behavior:** none
- **Validation:** interval/custom show sub-fields
- **On-select behavior:** updates recurrence preview
- **Dependencies:** `anchor`, `customLabel`
- **Backend/API/DB:** none
- **Special rules:** none
- **Code locations:** `components/hr/job-description/jd-bank.tsx:302-312`; `lib/jd/recurrence.ts`

### Assigned Person(s) (New Job Description)
- **Module:** HR · Job Description
- **Screen:** JD Bank
- **Field/Key:** `assignees`
- **Source:** database (people)
- **Component:** native select (`multiple`, `size=5`)
- **Type:** Multi
- **Required:** No
- **Default:** `[]`
- **Searchable:** No
- **Static/Dynamic:** Dynamic
- **Options:** each person name (no explicit empty option)
- **Add/Edit/Delete behavior:** none
- **Validation:** optional ("Leave empty to let the position decide")
- **On-select behavior:** appends/removes from selection
- **Dependencies:** `people` prop
- **Backend/API/DB:** `createJdEntry` (assigneeIds)
- **Special rules:** empty means "by position"
- **Code locations:** `components/hr/job-description/jd-bank.tsx:391-405`

### Function (Create first position)
- **Module:** HR · Job Description
- **Screen:** JD Bank first-run block
- **Field/Key:** `functionKey`
- **Source:** hardcoded list + `FUNCTION_LABELS`
- **Component:** native select
- **Type:** Single
- **Required:** Yes
- **Default:** `operations`
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** `Sales` (sales) · `Marketing` (marketing) · `Operations` (operations) · `Handholding` (handholding) · `HR` (hr) · `Admin` (admin) · `Accounts` (accounts) · `Apps/IT` (apps)
- **Add/Edit/Delete behavior:** none
- **Validation:** none
- **On-select behavior:** sets functionKey
- **Dependencies:** `FUNCTION_LABELS` (`lib/org/functions.ts:95-106`)
- **Backend/API/DB:** `createJdPosition`
- **Special rules:** only shown when no positions exist
- **Code locations:** `components/hr/job-description/jd-bank.tsx:470-480`

### Rank (Create first position)
- **Module:** HR · Job Description
- **Screen:** JD Bank first-run block
- **Field/Key:** `rankId`
- **Source:** database (ranks)
- **Component:** native select
- **Type:** Single
- **Required:** Yes
- **Default:** `ranks[0]?.id`
- **Searchable:** No
- **Static/Dynamic:** Dynamic
- **Options:** each rank name
- **Add/Edit/Delete behavior:** none
- **Validation:** create disabled when no rank
- **On-select behavior:** sets rankId
- **Dependencies:** `ranks` prop
- **Backend/API/DB:** `createJdPosition`
- **Special rules:** none
- **Code locations:** `components/hr/job-description/jd-bank.tsx:484-494`

---

## HR — KPI

### Employee (KPI workbench)
- **Module:** HR · KPI
- **Screen:** KPI workbench (`/hr/kpi`)
- **Field/Key:** `employeeId`
- **Source:** database (roster)
- **Component:** other (custom `EmployeePicker` combobox)
- **Type:** Single
- **Required:** Yes
- **Default:** null
- **Searchable:** Yes
- **Static/Dynamic:** Dynamic
- **Options:** each `{name}` + `{designation · department}`
- **Add/Edit/Delete behavior:** none
- **Validation:** none
- **On-select behavior:** loads KPI assignments
- **Dependencies:** `roster` prop
- **Backend/API/DB:** `loadKpiAssignments`
- **Special rules:** none
- **Code locations:** `components/hr/kpi/kpi-workbench.tsx:255-335` (used at :149)

### Year (KPI quarter selector)
- **Module:** HR · KPI
- **Screen:** KPI workbench
- **Field/Key:** `year`
- **Source:** derived (`quarterWindow(6,2)` → years)
- **Component:** native select
- **Type:** Single
- **Required:** Yes
- **Default:** latest year
- **Searchable:** No
- **Static/Dynamic:** Dynamic (derived)
- **Options:** each year string
- **Add/Edit/Delete behavior:** none
- **Validation:** none
- **On-select behavior:** recomposes `year-qtr`
- **Dependencies:** `years`
- **Backend/API/DB:** none
- **Special rules:** none
- **Code locations:** `components/hr/kpi/kpi-workbench.tsx:358-360`

### Quarter (KPI quarter selector)
- **Module:** HR · KPI
- **Screen:** KPI workbench
- **Field/Key:** `qtr`
- **Source:** hardcoded
- **Component:** native select
- **Type:** Single
- **Required:** Yes
- **Default:** `Q1`
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** `Q1` · `Q2` · `Q3` · `Q4`
- **Add/Edit/Delete behavior:** none
- **Validation:** none
- **On-select behavior:** recomposes `year-qtr`
- **Dependencies:** `year`
- **Backend/API/DB:** none
- **Special rules:** none
- **Code locations:** `components/hr/kpi/kpi-workbench.tsx:367-369`

### KPI catalog picker (Assign/Edit KPI)
- **Module:** HR · KPI
- **Screen:** KPI drawer
- **Field/Key:** `kpiKey`
- **Source:** constant (`CATALOG_OPTIONS` from KPI dictionary)
- **Component:** LookupSelect
- **Type:** Single
- **Required:** Yes
- **Default:** `__manual__`
- **Searchable:** Yes
- **Static/Dynamic:** Static (dictionary)
- **Options:** `Manual entry (type below)` (__manual__) + each dictionary KPI `{owner} - {name}`
- **Add/Edit/Delete behavior:** none
- **Validation:** none
- **On-select behavior:** sets kpiKey (typing name clears to manual)
- **Dependencies:** `KPI_CATALOG` (`lib/hr/kpi/catalog.ts`)
- **Backend/API/DB:** none (static dictionary)
- **Special rules:** none
- **Code locations:** `components/hr/kpi/kpi-workbench.tsx:716-723`; `components/hr/kpi/kpi-workbench.tsx:35-38`

### Frequency (Assign/Edit KPI)
- **Module:** HR · KPI
- **Screen:** KPI drawer
- **Field/Key:** `frequency`
- **Source:** enum (`KPI_FREQUENCIES` / `KPI_FREQUENCY_LABELS`)
- **Component:** native select
- **Type:** Single
- **Required:** Yes
- **Default:** state
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** `Weekly` (weekly) · `Monthly` (monthly) · `Quarterly` (quarterly) · `Annual` (annual)
- **Add/Edit/Delete behavior:** none
- **Validation:** none
- **On-select behavior:** sets frequency
- **Dependencies:** none
- **Backend/API/DB:** `saveKpiAssignment`
- **Special rules:** none
- **Code locations:** `components/hr/kpi/kpi-workbench.tsx:746-754`; enum `db/enums.ts:1123-1130`

### Effective quarter (Assign/Edit KPI)
- **Module:** HR · KPI
- **Screen:** KPI drawer
- **Field/Key:** `effectiveQuarter`
- **Source:** derived (`quarterWindow(6,2)` + current)
- **Component:** native select
- **Type:** Single
- **Required:** Yes
- **Default:** state
- **Searchable:** No
- **Static/Dynamic:** Dynamic (derived)
- **Options:** current quarter + all quarters in window (e.g. `2026-Q1` …)
- **Add/Edit/Delete behavior:** none
- **Validation:** none
- **On-select behavior:** sets effectiveQuarter
- **Dependencies:** `quarters`
- **Backend/API/DB:** `saveKpiAssignment`
- **Special rules:** none
- **Code locations:** `components/hr/kpi/kpi-workbench.tsx:774-782`

---

## HR — Letters

### Paying Entity (Letter editor)
- **Module:** HR · Letters
- **Screen:** Letter editor (`/hr/letters`)
- **Field/Key:** `entity`
- **Source:** constant (`ENTITY_LIST`)
- **Component:** native select
- **Type:** Single
- **Required:** Yes
- **Default:** `altus-corp`
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** `Altus Corp` · `Unleashed` · `The Gainmakers (MJV HUF)` · `Legacy Creators (JSV HUF)` · `The Perfect Blend (Khushboo Shah)`
- **Add/Edit/Delete behavior:** none
- **Validation:** none
- **On-select behavior:** re-brands letterhead
- **Dependencies:** none
- **Backend/API/DB:** none
- **Special rules:** none
- **Code locations:** `components/hr/letters/letter-editor.tsx:796-806`

### Employee (Letter editor recipient picker)
- **Module:** HR · Letters
- **Screen:** Letter editor (admin mode)
- **Field/Key:** `employeeId`
- **Source:** database (roster)
- **Component:** native select
- **Type:** Single
- **Required:** No
- **Default:** `""`
- **Searchable:** No
- **Static/Dynamic:** Dynamic
- **Options:** `- pick an employee -` + each `{name · designation}`
- **Add/Edit/Delete behavior:** none
- **Validation:** none
- **On-select behavior:** seeds name/designation/CTC + attaches employee
- **Dependencies:** `roster`, `isAdmin`
- **Backend/API/DB:** none (seed only)
- **Special rules:** admin-only, roster non-empty
- **Code locations:** `components/hr/letters/letter-editor.tsx:813-837`

### Signed by (Letter editor)
- **Module:** HR · Letters
- **Screen:** Letter editor
- **Field/Key:** `signatory`
- **Source:** hardcoded (`SIGNATORIES`)
- **Component:** native select
- **Type:** Single
- **Required:** Yes
- **Default:** (template)
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** `CA Manan Vasa` (director) · `HR Team` (hr)
- **Add/Edit/Delete behavior:** none
- **Validation:** none
- **On-select behavior:** swaps signature block (re-signs rich doc in place)
- **Dependencies:** `richMode`
- **Backend/API/DB:** none
- **Special rules:** none
- **Code locations:** `components/hr/letters/letter-editor.tsx:849-865`; `SIGNATORIES` at :92-95

### Signing model (Letter editor, rich mode)
- **Module:** HR · Letters
- **Screen:** Letter editor (rich/free-edit mode)
- **Field/Key:** `signingModel`
- **Source:** hardcoded (`SIGNING_MODELS`)
- **Component:** native select
- **Type:** Single
- **Required:** No
- **Default:** (state)
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** `No signature` (none) · `Acknowledge` (acknowledge) · `E-Sign (DigiLocker)` (esign)
- **Add/Edit/Delete behavior:** none
- **Validation:** none
- **On-select behavior:** sets signing model
- **Dependencies:** `richMode`, `isAdmin`
- **Backend/API/DB:** none
- **Special rules:** rich + admin only
- **Code locations:** `components/hr/letters/letter-editor.tsx:872-885`; `SIGNING_MODELS` at :84-88

### Department (letter field dropdown — Selection letter)
- **Module:** HR · Letters
- **Screen:** Letter editor (Selection template)
- **Field/Key:** `department` (`optionsKey: "departments"`)
- **Source:** database (admin Departments master via `departments` prop)
- **Component:** native select (inline field)
- **Type:** Single
- **Required:** Yes (template field)
- **Default:** `""` (placeholder = label)
- **Searchable:** No
- **Static/Dynamic:** Dynamic
- **Options:** label as placeholder + each department name; stored value kept if not in list
- **Add/Edit/Delete behavior:** none
- **Validation:** none
- **On-select behavior:** writes field value (prints verbatim)
- **Dependencies:** `departments` prop
- **Backend/API/DB:** departments master
- **Special rules:** `optionsKey` dropdown field
- **Code locations:** `components/hr/letters/letter-editor.tsx:1826-1847`; template `lib/hr/letters/templates/selection.ts:51`

### Reporting Manager (letter field dropdown — Selection letter)
- **Module:** HR · Letters
- **Screen:** Letter editor (Selection template)
- **Field/Key:** `reportingManager` (`optionsKey: "managers"`)
- **Source:** database (roster names)
- **Component:** native select (inline field)
- **Type:** Single
- **Required:** Yes
- **Default:** `""`
- **Searchable:** No
- **Static/Dynamic:** Dynamic
- **Options:** label placeholder + distinct roster names
- **Add/Edit/Delete behavior:** none
- **Validation:** none
- **On-select behavior:** writes value
- **Dependencies:** `roster`
- **Backend/API/DB:** none
- **Special rules:** optionLists.managers
- **Code locations:** `components/hr/letters/letter-editor.tsx:760-767`; template `lib/hr/letters/templates/selection.ts:52`

### Employee (Issue Letter dialog)
- **Module:** HR · Letters
- **Screen:** Letters workspace Issue Letter dialog
- **Field/Key:** `employeeId` (form field)
- **Source:** database (roster)
- **Component:** native select
- **Type:** Single
- **Required:** Yes
- **Default:** `""`
- **Searchable:** No
- **Static/Dynamic:** Dynamic
- **Options:** `Select a person…` (disabled) + each name
- **Add/Edit/Delete behavior:** none
- **Validation:** required
- **On-select behavior:** n/a
- **Dependencies:** `roster` prop
- **Backend/API/DB:** `uploadLetter`
- **Special rules:** none
- **Code locations:** `components/hr/letters/letters-workspace.tsx:228-233`

### Letter Type (Issue Letter dialog)
- **Module:** HR · Letters
- **Screen:** Letters workspace Issue Letter dialog
- **Field/Key:** `letterType`
- **Source:** constant (`LETTER_TYPES`)
- **Component:** native select
- **Type:** Single
- **Required:** Yes
- **Default:** `letter_offer`
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** `Offer Letter` (letter_offer) · `Confirmation Letter` (letter_confirmation) · `Increment / Revision` (letter_increment) · `Appreciation` (letter_appreciation) · `Warning / Notice` (letter_warning) · `Experience Letter` (letter_experience) · `Relieving Letter` (letter_relieving) · `Other Letter` (letter_other)
- **Add/Edit/Delete behavior:** none
- **Validation:** required
- **On-select behavior:** n/a
- **Dependencies:** none
- **Backend/API/DB:** `uploadLetter`
- **Special rules:** none
- **Code locations:** `components/hr/letters/letters-workspace.tsx:236-240`; `lib/hr/letter-types.ts:23-32`

### Paragraph style (Rich letter editor)
- **Module:** HR · Letters
- **Screen:** Rich/free-edit editor (TipTap)
- **Field/Key:** block type
- **Source:** hardcoded (`BLOCK_TYPES`)
- **Component:** native select
- **Type:** Single
- **Required:** No
- **Default:** `p`
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** `Normal text` (p) · `Heading 1` (h1) · `Heading 2` (h2) · `Heading 3` (h3)
- **Add/Edit/Delete behavior:** none
- **Validation:** none
- **On-select behavior:** sets paragraph style
- **Dependencies:** TipTap editor
- **Backend/API/DB:** none
- **Special rules:** editor formatting (not data)
- **Code locations:** `components/hr/letters/rich-letter-editor.tsx:685-696`; `BLOCK_TYPES` at :317-322

### Font family (Rich letter editor)
- **Module:** HR · Letters
- **Screen:** Rich/free-edit editor
- **Field/Key:** fontFamily
- **Source:** hardcoded (`FONT_FAMILIES`) + generated letter font groups
- **Component:** native select (optgroups)
- **Type:** Single
- **Required:** No
- **Default:** `""` (Letterhead default)
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** optgroup `Document defaults`: `Letterhead default` (empty) · `Georgia` · `Times New Roman` · `Arial` · `Courier New`; plus optgroups per letter-font category (54-font self-hosted library)
- **Add/Edit/Delete behavior:** none
- **Validation:** none
- **On-select behavior:** sets inline font CSS stack
- **Dependencies:** `letterFontGroups()`, `letterFontStack()`
- **Backend/API/DB:** none
- **Special rules:** editor formatting
- **Code locations:** `components/hr/letters/rich-letter-editor.tsx:701-726`; `FONT_FAMILIES` at :291-297

### Line spacing (Rich letter editor)
- **Module:** HR · Letters
- **Screen:** Rich/free-edit editor
- **Field/Key:** lineHeight
- **Source:** hardcoded (`LINE_HEIGHTS`)
- **Component:** native select
- **Type:** Single
- **Required:** No
- **Default:** `""` (Single)
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** `Single` (empty) · `1.15` · `1.5` · `Double` (2)
- **Add/Edit/Delete behavior:** none
- **Validation:** none
- **On-select behavior:** sets line-height
- **Dependencies:** none
- **Backend/API/DB:** none
- **Special rules:** editor formatting
- **Code locations:** `components/hr/letters/rich-letter-editor.tsx:973-984`; `LINE_HEIGHTS` at :335-340

### Font size (Rich letter editor)
- **Module:** HR · Letters
- **Screen:** Rich/free-edit editor
- **Field/Key:** fontSize
- **Source:** hardcoded (`FONT_SIZES`)
- **Component:** other (typeable stepper input + `<datalist>` presets)
- **Type:** Single
- **Required:** No
- **Default:** `11`
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** `8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72`
- **Add/Edit/Delete behavior:** none
- **Validation:** parseFloat; invalid reverts
- **On-select behavior:** applies font size
- **Dependencies:** none
- **Backend/API/DB:** none
- **Special rules:** datalist combobox (not a `<select>`)
- **Code locations:** `components/hr/letters/rich-letter-editor.tsx:767-771`; `FONT_SIZES` at :325

---

## HR — Policies

### Issuing Entity (Policy view)
- **Module:** HR · Policies
- **Screen:** Policy reading/signing view
- **Field/Key:** `entity`
- **Source:** constant (`ENTITY_LIST`)
- **Component:** native select
- **Type:** Single
- **Required:** Yes
- **Default:** `doc.entityDefault ?? "altus-corp"`
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** `Altus Corp` · `Unleashed` · `The Gainmakers (MJV HUF)` · `Legacy Creators (JSV HUF)` · `The Perfect Blend (Khushboo Shah)`
- **Add/Edit/Delete behavior:** none
- **Validation:** none
- **On-select behavior:** re-brands letterhead; entity sent on sign
- **Dependencies:** none
- **Backend/API/DB:** `/api/hr/policies/acknowledge`
- **Special rules:** none
- **Code locations:** `components/hr/policies/policy-view.tsx:75-85`

### Category (Upload Policy dialog)
- **Module:** HR · Policies
- **Screen:** Policies workspace Upload dialog
- **Field/Key:** `category`
- **Source:** constant (`POLICY_CATEGORIES`)
- **Component:** native select
- **Type:** Single
- **Required:** Yes
- **Default:** `hr_general`
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** `Code of Conduct` (code_of_conduct) · `Leave & Attendance` (leave_attendance) · `Payroll & Benefits` (payroll_benefits) · `IT & Security` (it_security) · `Workplace & Safety` (workplace_safety) · `HR — General` (hr_general) · `Other` (other)
- **Add/Edit/Delete behavior:** none
- **Validation:** required
- **On-select behavior:** n/a
- **Dependencies:** none
- **Backend/API/DB:** `uploadPolicy`
- **Special rules:** none
- **Code locations:** `components/hr/policies/policies-workspace.tsx:163-167`; `lib/hr/policy-types.ts:22-30`

---

## HR — Record

### Person picker (HR Record hub)
- **Module:** HR · Record
- **Screen:** HR Record (`/hr/record`)
- **Field/Key:** candidateId
- **Source:** database (candidates)
- **Component:** other (custom command-style searchable combobox `PersonPicker`)
- **Type:** Single
- **Required:** Yes
- **Default:** null
- **Searchable:** Yes
- **Static/Dynamic:** Dynamic
- **Options:** each candidate `{name · position/department}`
- **Add/Edit/Delete behavior:** none
- **Validation:** none
- **On-select behavior:** loads full person record (files, workflow, policies, exit, skills)
- **Dependencies:** candidates prop
- **Backend/API/DB:** `getPersonFiles`, `getWorkflowStatus`, `getPolicySigningStatus`, `getExitStatus`, person-records
- **Special rules:** none
- **Code locations:** `components/hr/record/hr-record-screen.tsx:1684+` (used at :364, :434)

### Skills (HR Record)
- **Module:** HR · Record
- **Screen:** HR Record
- **Field/Key:** `skills` (technical / nonTechnical)
- **Source:** database (Skills Master) + base constants
- **Component:** other (custom `SkillMultiSelect` — two grouped checkbox lists)
- **Type:** Multi
- **Required:** No
- **Default:** existing selection
- **Searchable:** No
- **Static/Dynamic:** Dynamic
- **Options:** Technical base: `Vercel` · `Supabase` · `Antigravity` · `React` · `Next.js`; Non-technical base: `Communication` · `Ownership` · `Time Management` · `Teamwork`; + admin-added custom entries
- **Add/Edit/Delete behavior:** HR admins can `+ Add` (`addSkillLookup`) and delete admin-added (`removeSkillLookup`); base options not deletable
- **Validation:** case-insensitive toggle
- **On-select behavior:** updates selection chips
- **Dependencies:** `isAdmin`, `listSkillLookups`
- **Backend/API/DB:** `skill_lookups` table (migration 0162)
- **Special rules:** base constants `lib/hr/skills.ts:17-20`
- **Code locations:** `components/hr/candidate/skill-multiselect.tsx`; used at `components/hr/record/hr-record-screen.tsx:648`

---

## HR — Ticket Routing

### Owner (Routing editor)
- **Module:** HR · Help Desk
- **Screen:** Ticket Routing (`/hr/routing`)
- **Field/Key:** `ownerId` per category row
- **Source:** database (handlers)
- **Component:** native select
- **Type:** Single
- **Required:** No
- **Default:** `""` (Super-admins fallback)
- **Searchable:** No
- **Static/Dynamic:** Dynamic
- **Options:** `Super-admins (fallback)` (empty) + each handler name
- **Add/Edit/Delete behavior:** none
- **Validation:** none
- **On-select behavior:** saves route via `updateRoute`
- **Dependencies:** `handlers` prop; per-category row
- **Backend/API/DB:** `updateRoute`
- **Special rules:** one select per `HR_TICKET_CATEGORIES` row
- **Code locations:** `components/hr/routing/routing-editor.tsx:66-79`

---

## Support / Tickets

### Topic (Ask HR composer)
- **Module:** Support / Queries
- **Screen:** Ask HR (`/queries`) — mode `query`
- **Field/Key:** `category`
- **Source:** enum (`HR_TICKET_CATEGORIES` + labels)
- **Component:** native select
- **Type:** Single
- **Required:** Yes
- **Default:** `policy_question`
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** `Payroll & Salary` (payroll) · `Leave & Attendance` (leave_attendance) · `Reimbursement` (reimbursement) · `IT & Access` (it_access) · `Facilities` (facilities) · `Documents & Letters` (documents_letters) · `Policy Question` (policy_question) · `Grievance (Confidential)` (grievance) · `Other` (other)
- **Add/Edit/Delete behavior:** none
- **Validation:** none
- **On-select behavior:** grievance → confidential notice; sets source=query
- **Dependencies:** none
- **Backend/API/DB:** `raiseTicket` (source=query)
- **Special rules:** query mode only
- **Code locations:** `components/hr/ticket-composer/ticket-composer.tsx:145-156`

### Priority (Raise ticket)
- **Module:** Support
- **Screen:** Raise ticket (`/support/new`) — mode `support`
- **Field/Key:** `priority`
- **Source:** enum (`HR_TICKET_PRIORITIES` + labels)
- **Component:** native select
- **Type:** Single
- **Required:** Yes
- **Default:** `normal`
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** `Low` (low) · `Normal` (normal) · `High` (high) · `Urgent` (urgent)
- **Add/Edit/Delete behavior:** none
- **Validation:** disabled when confidential (grievance → handled at High)
- **On-select behavior:** sets priority
- **Dependencies:** `confidential`
- **Backend/API/DB:** `raiseTicket`
- **Special rules:** grievance forces High
- **Code locations:** `components/hr/ticket-composer/ticket-composer.tsx:211-223`

### Category (Raise ticket) — button grid (NOT a dropdown)
- **Module:** Support
- **Screen:** Raise ticket — mode `support`
- **Field/Key:** `category`
- **Source:** enum (`HR_TICKET_CATEGORIES`)
- **Component:** other (button grid)
- **Type:** Single
- **Required:** Yes
- **Default:** `payroll`
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** all 9 `HR_TICKET_CATEGORY_LABELS` with `CATEGORY_GLYPH` icons
- **Add/Edit/Delete behavior:** none
- **Validation:** none
- **On-select behavior:** grievance → confidential notice
- **Dependencies:** none
- **Backend/API/DB:** `raiseTicket`
- **Special rules:** rendered as cards, not `<select>`
- **Code locations:** `components/hr/ticket-composer/ticket-composer.tsx:115-136`

### Assign to (Ticket thread, HR handler)
- **Module:** Support
- **Screen:** Ticket thread (`/support/[id]`)
- **Field/Key:** `assigneeId`
- **Source:** database (assignees)
- **Component:** native select
- **Type:** Single
- **Required:** No
- **Default:** `""` (Unassigned)
- **Searchable:** No
- **Static/Dynamic:** Dynamic
- **Options:** `Unassigned` (empty) + each assignee name
- **Add/Edit/Delete behavior:** none
- **Validation:** none
- **On-select behavior:** `assignTicket`
- **Dependencies:** `canHandle`, `assignees`
- **Backend/API/DB:** `assignTicket`
- **Special rules:** HR handler only
- **Code locations:** `components/hr/ticket-thread/ticket-thread.tsx:208-221`

### Priority (Ticket thread, HR handler)
- **Module:** Support
- **Screen:** Ticket thread
- **Field/Key:** `priority`
- **Source:** enum (`HR_TICKET_PRIORITIES` + labels)
- **Component:** native select
- **Type:** Single
- **Required:** Yes
- **Default:** ticket's current priority
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** `Low` · `Normal` · `High` · `Urgent`
- **Add/Edit/Delete behavior:** none
- **Validation:** none
- **On-select behavior:** `changePriority`
- **Dependencies:** `canHandle`
- **Backend/API/DB:** `changePriority`
- **Special rules:** HR handler only
- **Code locations:** `components/hr/ticket-thread/ticket-thread.tsx:222-234`

(Queue filters on the support list are PILL buttons, not dropdowns — see Non-dropdown pickers.)

---

## HR — Filled Forms

### Filter by HR section
- **Module:** HR · Forms
- **Screen:** All Filled Forms / My Filled Forms
- **Field/Key:** `section`
- **Source:** derived from rows
- **Component:** Select (ui)
- **Type:** Single
- **Required:** No
- **Default:** `__all__`
- **Searchable:** auto (>8 options)
- **Static/Dynamic:** Dynamic
- **Options:** `All sections` + each `{sectionLabel}`
- **Add/Edit/Delete behavior:** none
- **Validation:** none
- **On-select behavior:** client filter
- **Dependencies:** rows
- **Backend/API/DB:** none
- **Special rules:** none
- **Code locations:** `components/hr/forms/filled-forms-table.tsx:166-173`

### Filter by form
- **Module:** HR · Forms
- **Screen:** Filled Forms
- **Field/Key:** `form`
- **Source:** derived from rows
- **Component:** Select (ui)
- **Type:** Single
- **Required:** No
- **Default:** `__all__`
- **Searchable:** auto
- **Static/Dynamic:** Dynamic
- **Options:** `All forms` + each `{formName}`
- **Add/Edit/Delete behavior:** none
- **Validation:** none
- **On-select behavior:** client filter
- **Dependencies:** rows
- **Backend/API/DB:** none
- **Special rules:** none
- **Code locations:** `components/hr/forms/filled-forms-table.tsx:174-182`

### Filter by status
- **Module:** HR · Forms
- **Screen:** Filled Forms
- **Field/Key:** `status`
- **Source:** hardcoded
- **Component:** Select (ui)
- **Type:** Single
- **Required:** No
- **Default:** `__all__`
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** `All statuses` · `Submitted` (submitted) · `Draft` (draft)
- **Add/Edit/Delete behavior:** none
- **Validation:** none
- **On-select behavior:** client filter
- **Dependencies:** `hideStatusFilter`
- **Backend/API/DB:** none
- **Special rules:** hidden when page owns the split
- **Code locations:** `components/hr/forms/filled-forms-table.tsx:183-196`

### Sort submissions
- **Module:** HR · Forms
- **Screen:** Filled Forms
- **Field/Key:** `sort`
- **Source:** hardcoded
- **Component:** Select (ui)
- **Type:** Single
- **Required:** No
- **Default:** `newest`
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** `Sort: Newest` (newest) · `Sort: Oldest` (oldest) · `Sort: Employee name` (employee; "all" variant only)
- **Add/Edit/Delete behavior:** none
- **Validation:** none
- **On-select behavior:** client sort
- **Dependencies:** `showEmployee`
- **Backend/API/DB:** none
- **Special rules:** none
- **Code locations:** `components/hr/forms/filled-forms-table.tsx:197-208`

---

## HR — Holidays

### Year (Holiday list)
- **Module:** HR · Holidays
- **Screen:** Holiday List (`/hr/holidays`)
- **Field/Key:** `year` (URL param)
- **Source:** constant (`HOLIDAY_YEARS`)
- **Component:** native select
- **Type:** Single
- **Required:** Yes
- **Default:** current year
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** `2026` · `2027` · `2028` (unpublished years suffixed ` - not published`)
- **Add/Edit/Delete behavior:** none
- **Validation:** none
- **On-select behavior:** navigates (`?year=&month=`)
- **Dependencies:** `isPublishedHolidayYear`
- **Backend/API/DB:** none (static lists)
- **Special rules:** selection IS the URL
- **Code locations:** `app/(app)/hr/holidays/holiday-filters.tsx:44-59`; `lib/hr/holidays-2026.ts:205`

### Month (Holiday list)
- **Module:** HR · Holidays
- **Screen:** Holiday List
- **Field/Key:** `month` (URL param)
- **Source:** constant (`HOLIDAY_MONTHS`)
- **Component:** native select
- **Type:** Single
- **Required:** Yes
- **Default:** `0` (All months)
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** `All months` (0) · `January` (1) … `December` (12)
- **Add/Edit/Delete behavior:** none
- **Validation:** none
- **On-select behavior:** navigates
- **Dependencies:** none
- **Backend/API/DB:** none
- **Special rules:** month=0 means whole year
- **Code locations:** `app/(app)/hr/holidays/holiday-filters.tsx:64-76`; `lib/hr/holidays-2026.ts:238-245,252`

---

## Agreements

### Employee (Agreement workbench)
- **Module:** Agreements
- **Screen:** Admin workbench (`/agreements`)
- **Field/Key:** `employeeId`
- **Source:** database (roster)
- **Component:** native select
- **Type:** Single
- **Required:** Yes (to save/send)
- **Default:** `""`
- **Searchable:** No
- **Static/Dynamic:** Dynamic
- **Options:** `— select an employee —` + each `{name · designation}`
- **Add/Edit/Delete behavior:** none
- **Validation:** toast "Pick an employee first."
- **On-select behavior:** seeds designation/department/joining/CTC + entity
- **Dependencies:** `roster`
- **Backend/API/DB:** `saveAgreement`
- **Special rules:** none
- **Code locations:** `components/agreements/workbench.tsx:253-261`

### Paying entity (Agreement workbench)
- **Module:** Agreements
- **Screen:** Admin workbench
- **Field/Key:** `entity`
- **Source:** hardcoded seed + roster (`SEED_ENTITIES` + `r.entity`)
- **Component:** native select
- **Type:** Single
- **Required:** Yes
- **Default:** `Altus Corp`
- **Searchable:** No
- **Static/Dynamic:** Dynamic (seed + roster entities)
- **Options:** `Altus Corp` · `MJV HUF` · `JSV HUF` · `Unleashed` + any distinct roster entity (sorted)
- **Add/Edit/Delete behavior:** none
- **Validation:** none
- **On-select behavior:** resolves signatory via `signatoryForEntity`
- **Dependencies:** `roster`
- **Backend/API/DB:** `signatoryForEntity` (`lib/salary/signatories.ts`)
- **Special rules:** label "Paying entity (sets the signatory)"
- **Code locations:** `components/agreements/workbench.tsx:265-269`; `SEED_ENTITIES` at :19

(Template picker = pill-cards; Status tracker filter = pill tabs — NOT dropdowns.)

---

## Accounts

All accounts modules share a `ValueSelect` wrapper (LookupSelect) backed by the `accounts_lookups` master (`addAccountsLookup(kind, name)` / `softDeleteAccountsLookup`), plus a native-select entity/type filter chip. Options are `{id, name}` rows from DB, seeded per kind.

### Bank Balance — Account/entity (ValueSelect)
- **Module:** Accounts · Bank Balance
- **Screen:** Bank Balance editor row
- **Field/Key:** `draft.entity`
- **Source:** database (accounts_lookups, kind `bank_entity`)
- **Component:** LookupSelect
- **Type:** Single
- **Required:** Yes
- **Default:** null
- **Searchable:** Yes
- **Static/Dynamic:** Dynamic (inline add/delete)
- **Options:** existing account/entity names
- **Add/Edit/Delete behavior:** `+ Add` (`addAccountsLookup`), per-row delete (`softDeleteAccountsLookup`)
- **Validation:** "An entity is required."
- **On-select behavior:** sets entity name
- **Dependencies:** `entityOptions` prop
- **Backend/API/DB:** accounts_lookups
- **Special rules:** none
- **Code locations:** `components/accounts/bank-balance/bank-client.tsx:493` (ValueSelect def :64-74)

### Income Tax — Entity filter
- **Module:** Accounts · Income Tax Master Folder
- **Screen:** IT folder list
- **Field/Key:** `fEntity`
- **Source:** database (entityOptions + rows)
- **Component:** native select
- **Type:** Single
- **Required:** No
- **Default:** `""`
- **Searchable:** No
- **Static/Dynamic:** Dynamic
- **Options:** `All Entities` + distinct entity names
- **Add/Edit/Delete behavior:** none
- **Validation:** none
- **On-select behavior:** client filter
- **Dependencies:** entityOptions, rows
- **Backend/API/DB:** none
- **Special rules:** none
- **Code locations:** `components/accounts/income-tax/it-client.tsx:93-95`

### Income Tax — Entity (ValueSelect, editor)
- **Module:** Accounts · Income Tax
- **Field/Key:** `draft.entity`
- **Source:** database (kind `it_entity`)
- **Component:** LookupSelect
- **Type:** Single
- **Required:** Yes
- **Default:** null
- **Searchable:** Yes
- **Static/Dynamic:** Dynamic
- **Options:** entity names (add/delete)
- **Add/Edit/Delete behavior:** add/delete via accounts_lookups
- **Validation:** "An entity is required."
- **On-select behavior:** sets entity
- **Dependencies:** entityOptions
- **Backend/API/DB:** accounts_lookups
- **Special rules:** none
- **Code locations:** `components/accounts/income-tax/it-client.tsx:163`

### Cash Withdrawal — Entity filter
- **Module:** Accounts · Cash Withdrawal
- **Field/Key:** `fEntity`
- **Source:** database (entityOptions + items)
- **Component:** native select
- **Type:** Single
- **Required:** No
- **Default:** `""`
- **Searchable:** No
- **Static/Dynamic:** Dynamic
- **Options:** `All Entities` + entity names
- **Code locations:** `components/accounts/cash-withdrawal/cash-client.tsx:155-157`

### Cash Withdrawal — Entity (ValueSelect)
- **Module:** Accounts · Cash Withdrawal
- **Field/Key:** `draft.entity`
- **Source:** database (kind `cash_entity`)
- **Component:** LookupSelect
- **Type:** Single
- **Required:** No (but validated at save? entity optional here)
- **Default:** null
- **Searchable:** Yes
- **Static/Dynamic:** Dynamic
- **Options:** entity names
- **Code locations:** `components/accounts/cash-withdrawal/cash-client.tsx:345`

### Cash Withdrawal — Name on cheque (ValueSelect)
- **Module:** Accounts · Cash Withdrawal
- **Field/Key:** `draft.nameOnCheque`
- **Source:** database (kind `cash_payee`)
- **Component:** LookupSelect
- **Type:** Single
- **Required:** No
- **Default:** null
- **Searchable:** Yes
- **Static/Dynamic:** Dynamic
- **Options:** payee names
- **Code locations:** `components/accounts/cash-withdrawal/cash-client.tsx:346`

### CC Master — Entity filter
- **Module:** Accounts · CC Master
- **Field/Key:** `fEntity`
- **Source:** database
- **Component:** native select
- **Type:** Single
- **Required:** No
- **Default:** `""`
- **Searchable:** No
- **Static/Dynamic:** Dynamic
- **Options:** `All Entities` + entities
- **Code locations:** `components/accounts/cc-master/cc-client.tsx:239-240`

### CC Master — Entity (ValueSelect)
- **Module:** Accounts · CC Master
- **Field/Key:** `draft.entityName`
- **Source:** database (kind `cc_entity`)
- **Component:** LookupSelect
- **Type:** Single
- **Required:** Yes
- **Default:** null
- **Searchable:** Yes
- **Static/Dynamic:** Dynamic
- **Options:** entity names
- **Code locations:** `components/accounts/cc-master/cc-client.tsx:538`

### CC Master — ECS (editor)
- **Module:** Accounts · CC Master
- **Field/Key:** `draft.ecs`
- **Source:** hardcoded
- **Component:** native select
- **Type:** Single
- **Required:** No
- **Default:** `""` (`-`)
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** `-` (empty) · `Yes` · `No` · `Don't Know`
- **Code locations:** `components/accounts/cc-master/cc-client.tsx:544-547` (YES_NO at :529)

### CC Master — Soft copy auto-email (editor)
- **Module:** Accounts · CC Master
- **Field/Key:** `draft.softCopyAutoEmail`
- **Source:** hardcoded
- **Component:** native select
- **Type:** Single
- **Required:** No
- **Default:** `""` (`-`)
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** `-` (empty) · `Yes` · `No` · `NA`
- **Code locations:** `components/accounts/cc-master/cc-client.tsx:562-564`

### CC Master — Hard copy (CellSelect)
- **Module:** Accounts · CC Master
- **Field/Key:** `hardCopy`
- **Source:** constant (`CC_YESNO`)
- **Component:** native select (inline cell)
- **Type:** Single
- **Required:** No
- **Default:** `""` (`-`)
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** `-` (empty) · `Yes` · `No` · `NA`
- **Code locations:** `components/accounts/cc-master/cc-client.tsx:312`; `lib/accounts/cc.ts:18`

### CC Master — Google Drive (CellSelect)
- **Field/Key:** `googleDrive` — options `-` · `Yes` · `No` · `NA` (`CC_YESNO`)
- **Code locations:** `components/accounts/cc-master/cc-client.tsx:313`

### CC Master — Tally entry (CellSelect)
- **Field/Key:** `tallyEntry` — options `-` · `Done` · `Pending` · `NA` (`CC_TALLY`)
- **Code locations:** `components/accounts/cc-master/cc-client.tsx:314`; `lib/accounts/cc.ts:19`

### CC Master — Balance tally (CellSelect)
- **Field/Key:** `balanceTally` — options `-` · `Tallied` · `Pending` · `NA` (`CC_BALANCE`)
- **Code locations:** `components/accounts/cc-master/cc-client.tsx:315`; `lib/accounts/cc.ts:20`

### CC Master — Charges reversed (CellSelect)
- **Field/Key:** `chgReversed` — options `-` · `Yes` · `No` · `NA` (`CC_YESNO`)
- **Code locations:** `components/accounts/cc-master/cc-client.tsx:319`

### Due Dates — Area filter
- **Module:** Accounts · Due Dates
- **Field/Key:** `fArea` — native select — `All Areas` + areas
- **Code locations:** `components/accounts/due-dates/due-dates-client.tsx:189-191`

### Due Dates — Frequency filter
- **Field/Key:** `fFreq` — native select — `All Frequencies` + frequencies
- **Code locations:** `components/accounts/due-dates/due-dates-client.tsx:193-195`

### Due Dates — Area (ValueSelect)
- **Field/Key:** `draft.area` — LookupSelect kind `due_area`
- **Code locations:** `components/accounts/due-dates/due-dates-client.tsx:329`

### Due Dates — Frequency (ValueSelect)
- **Field/Key:** `draft.frequency` — LookupSelect kind `due_frequency`
- **Code locations:** `components/accounts/due-dates/due-dates-client.tsx:335`

### Due Dates — ECS (FixedSelect)
- **Field/Key:** `draft.ecs` — native select — `ECS?` + `Yes` · `No` · `Not Applicable` · `Don't Know`
- **Code locations:** `components/accounts/due-dates/due-dates-client.tsx:337-338` (YES_NO at :17)

### Due Dates — Soft copy auto-email (FixedSelect)
- **Field/Key:** `draft.softCopyAutoEmail` — `?` + `Yes` · `No` · `Not Applicable` · `Don't Know`
- **Code locations:** `components/accounts/due-dates/due-dates-client.tsx:353`

### Due Dates — Hard copy (FixedSelect)
- **Field/Key:** `draft.hardCopy` — `?` + YES_NO
- **Code locations:** `components/accounts/due-dates/due-dates-client.tsx:356`

### Due Dates — Soft copy (FixedSelect)
- **Field/Key:** `draft.softCopy` — `?` + YES_NO
- **Code locations:** `components/accounts/due-dates/due-dates-client.tsx:359`

### Due Dates — Tally entry (FixedSelect)
- **Field/Key:** `draft.tallyEntry` — `?` + `Done` · `Pending` · `NA`
- **Code locations:** `components/accounts/due-dates/due-dates-client.tsx:362`

### Due Dates — Balance tally (FixedSelect)
- **Field/Key:** `draft.balanceTally` — `?` + `Tallied` · `Pending` · `NA`
- **Code locations:** `components/accounts/due-dates/due-dates-client.tsx:365`

### Due Dates — Charges reversed (FixedSelect)
- **Field/Key:** `draft.chgReversed` — `?` + YES_NO
- **Code locations:** `components/accounts/due-dates/due-dates-client.tsx:377`

### FNO Income — Entity filter
- **Module:** Accounts · FNO Income
- **Field/Key:** `fEntity` — native select — `All Entities` + entities
- **Code locations:** `components/accounts/fno-income/fno-client.tsx:139-141`

### FNO Income — Entity (ValueSelect)
- **Field/Key:** `draft.entity` — LookupSelect kind `fno_entity`
- **Code locations:** `components/accounts/fno-income/fno-client.tsx:272`

### FNO Income — Agency (ValueSelect)
- **Field/Key:** `draft.agency` — LookupSelect kind `fno_agency` (required)
- **Code locations:** `components/accounts/fno-income/fno-client.tsx:273`

### Shares Register — Entity filter
- **Module:** Accounts · Shares Register
- **Field/Key:** `fEntity` — native select — `All Entities` + entities
- **Code locations:** `components/accounts/shares-register/shares-client.tsx:103-105`

### Shares Register — Entity (ValueSelect)
- **Field/Key:** `draft.entity` — LookupSelect kind `shares_entity`
- **Code locations:** `components/accounts/shares-register/shares-client.tsx:180`

### SIP Tracker — Entity filter
- **Module:** Accounts · SIP Tracker
- **Field/Key:** `fEntity` — native select — `All Entities` + entities
- **Code locations:** `components/accounts/sip-tracker/sip-client.tsx:160-162`

### SIP Tracker — Type filter
- **Field/Key:** `fType` — native select — `All Types` + types
- **Code locations:** `components/accounts/sip-tracker/sip-client.tsx:164-166`

### SIP Tracker — Entity (ValueSelect)
- **Field/Key:** `draft.entity` — LookupSelect kind `sip_entity`
- **Code locations:** `components/accounts/sip-tracker/sip-client.tsx:274`

### SIP Tracker — Type (ValueSelect)
- **Field/Key:** `draft.type` — LookupSelect kind `sip_type`
- **Code locations:** `components/accounts/sip-tracker/sip-client.tsx:278`

### SIP Loans — Entity (ValueSelect)
- **Module:** Accounts · SIP Loans panel
- **Field/Key:** `draft.entity` — LookupSelect kind `loan_entity`
- **Code locations:** `components/accounts/sip-tracker/loans-panel.tsx:249`

### Monthly Checklist — Type filter
- **Module:** Accounts · Monthly Checklist
- **Field/Key:** `fType` — native select — `All Types` + types
- **Code locations:** `components/accounts/monthly-checklist/monthly-client.tsx:415-417`

### Monthly Checklist — Frequency filter
- **Field/Key:** `fFrequency` — native select — `All Frequencies` + frequencies
- **Code locations:** `components/accounts/monthly-checklist/monthly-client.tsx:419-421`

### Monthly Checklist — Responsible filter
- **Field/Key:** `fResponsible` — native select — `All People` + responsibles
- **Code locations:** `components/accounts/monthly-checklist/monthly-client.tsx:423-425`

### Monthly Checklist — Month status (CellSelect)
- **Field/Key:** per-month status — native select — `-`/`·` + `Done` · `Pending` · `Need Help` · `N/A` (stored "Not Applicable")
- **Code locations:** `components/accounts/monthly-checklist/monthly-client.tsx:141-163`; `lib/accounts/monthly.ts:23`

### Monthly Checklist — Responsible (ValueSelect)
- **Field/Key:** `draft.responsiblePerson` — LookupSelect kind `monthly_responsible`
- **Code locations:** `components/accounts/monthly-checklist/monthly-client.tsx:689`

### Monthly Checklist — Deadline (ValueSelect)
- **Field/Key:** `draft.deadline` — LookupSelect kind `monthly_deadline`
- **Code locations:** `components/accounts/monthly-checklist/monthly-client.tsx:692`

### Monthly Checklist — Type (ValueSelect)
- **Field/Key:** `draft.type` — LookupSelect kind `monthly_type`
- **Code locations:** `components/accounts/monthly-checklist/monthly-client.tsx:695`

### Monthly Checklist — Frequency (ValueSelect)
- **Field/Key:** `draft.frequency` — LookupSelect kind `monthly_frequency`
- **Code locations:** `components/accounts/monthly-checklist/monthly-client.tsx:698`

### Weekly Checklist — Deadline filter
- **Module:** Accounts · Weekly Checklist
- **Field/Key:** `fDeadline` — native select — `All Deadlines` + deadlines
- **Code locations:** `components/accounts/weekly-checklist/weekly-client.tsx:406-408`

### Weekly Checklist — Category filter
- **Field/Key:** `fCategory` — native select — `All Categories` + categories
- **Code locations:** `components/accounts/weekly-checklist/weekly-client.tsx:410-412`

### Weekly Checklist — Responsible filter
- **Field/Key:** `fResponsible` — native select — `All People` + responsibles
- **Code locations:** `components/accounts/weekly-checklist/weekly-client.tsx:414-416`

### Weekly Checklist — Week status (CellSelect)
- **Field/Key:** per-week status — native select — `-` + `Done` · `Pending` · `Need Help` · `Not Applicable`
- **Code locations:** `components/accounts/weekly-checklist/weekly-client.tsx:136-153`; `lib/accounts/weekly.ts:12`

### Weekly Checklist — Deadline (ValueSelect)
- **Field/Key:** `draft.deadline` — LookupSelect kind `weekly_deadline`
- **Code locations:** `components/accounts/weekly-checklist/weekly-client.tsx:652`

### Weekly Checklist — Category (ValueSelect)
- **Field/Key:** `draft.category` — LookupSelect kind `weekly_category`
- **Code locations:** `components/accounts/weekly-checklist/weekly-client.tsx:655`

### Weekly Checklist — Responsible (ValueSelect)
- **Field/Key:** `draft.responsiblePerson` — LookupSelect kind `weekly_responsible`
- **Code locations:** `components/accounts/weekly-checklist/weekly-client.tsx:658`

### Weekly Checklist — Frequency (ValueSelect)
- **Field/Key:** `draft.frequency` — LookupSelect kind `weekly_frequency`
- **Code locations:** `components/accounts/weekly-checklist/weekly-client.tsx:661`

### Task List — Status filter
- **Module:** Accounts · Task List
- **Field/Key:** `fStatus` — native select — `All Statuses` + statuses
- **Code locations:** `components/accounts/task-list/task-list-client.tsx:531-533`

### Task List — Gear filter
- **Field/Key:** `fGear` — native select — `All Gear` + gears
- **Code locations:** `components/accounts/task-list/task-list-client.tsx:537-539`

### Task List — inline Status
- **Field/Key:** `status` — native select (colored) — status options
- **Code locations:** `components/accounts/task-list/task-list-client.tsx:98-104`

### Task List — inline Gear
- **Field/Key:** `gear` — native select — `-` + gear options
- **Code locations:** `components/accounts/task-list/task-list-client.tsx:115-123`

### Task List — Status (ValueSelect, editor)
- **Field/Key:** `draft.status` — LookupSelect kind `task_status`
- **Code locations:** `components/accounts/task-list/task-list-client.tsx:704`

### Task List — Gear (ValueSelect, editor)
- **Field/Key:** `draft.gear` — LookupSelect kind `task_gear`
- **Code locations:** `components/accounts/task-list/task-list-client.tsx:718`

### CA Handover — Portal (credential dialog)
- **Module:** Accounts · CA Handover
- **Screen:** Credential dialog
- **Field/Key:** portal type
- **Source:** constant (`CA_PORTAL_TYPES` + `CA_PORTAL_LABELS`)
- **Component:** LookupSelect
- **Type:** Single
- **Required:** Yes
- **Default:** fallback/current
- **Searchable:** Yes
- **Static/Dynamic:** Static
- **Options:** `Income Tax` (income_tax) · `GST` (gst) · `TDS` (tds) · `Professional Tax` (professional_tax) · `MLWF` (mlwf)
- **Add/Edit/Delete behavior:** none
- **Validation:** none
- **On-select behavior:** sets portal type
- **Dependencies:** none
- **Backend/API/DB:** CA handover actions
- **Special rules:** none
- **Code locations:** `components/accounts/ca-handover/credential-dialog.tsx:161`; `lib/accounts/ca-constants.ts:6-21`

---

## Ambassadors

### Relationship Owner (Ambassador form)
- **Module:** Sales · Ambassadors
- **Screen:** Ambassador create/edit
- **Field/Key:** `ownerId`
- **Source:** database (employees)
- **Component:** LookupSelect
- **Type:** Single
- **Required:** No
- **Default:** null
- **Searchable:** Yes
- **Static/Dynamic:** Dynamic
- **Options:** each employee name
- **Add/Edit/Delete behavior:** none
- **Validation:** none
- **On-select behavior:** sets owner
- **Dependencies:** `employees` prop
- **Backend/API/DB:** `createAmbassador` / `updateAmbassador`
- **Special rules:** none
- **Code locations:** `components/ambassadors/ambassador-form.tsx:326-333`

### Add a Product (Ambassador form)
- **Module:** Sales · Ambassadors
- **Screen:** Ambassador create/edit
- **Field/Key:** `pickProduct`
- **Source:** database (products) with inline add/delete
- **Component:** LookupSelect
- **Type:** Single (repeated to build multi selection)
- **Required:** No
- **Default:** null
- **Searchable:** Yes
- **Static/Dynamic:** Dynamic
- **Options:** product names
- **Add/Edit/Delete behavior:** `+ Add` (`addProduct`), delete (`softDeleteProduct`)
- **Validation:** none
- **On-select behavior:** toggles product into `productIds` + clears
- **Dependencies:** `productList`
- **Backend/API/DB:** `addProduct`, `softDeleteProduct`
- **Special rules:** selection rendered as chips (multi)
- **Code locations:** `components/ambassadors/ambassador-form.tsx:486-500`

### Filter by tier (Ambassador directory)
- **Module:** Sales · Ambassadors
- **Screen:** Directory
- **Field/Key:** `tier`
- **Source:** hardcoded (`TIERS`)
- **Component:** native select
- **Type:** Single
- **Required:** No
- **Default:** `""`
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** `All Tiers` · `Elite` (elite) · `Gold` (gold) · `Silver` (silver)
- **Add/Edit/Delete behavior:** none
- **Validation:** none
- **On-select behavior:** client filter
- **Dependencies:** none
- **Backend/API/DB:** none
- **Special rules:** none
- **Code locations:** `components/ambassadors/directory-table.tsx:113-119` (TIERS :19)

### Filter by status (Ambassador directory)
- **Module:** Sales · Ambassadors
- **Screen:** Directory
- **Field/Key:** `status`
- **Source:** hardcoded (`STATUSES`)
- **Component:** native select
- **Type:** Single
- **Required:** No
- **Default:** `""`
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** `All Statuses` · `Active` (active) · `Paused` (paused) · `Archived` (archived)
- **Add/Edit/Delete behavior:** none
- **Validation:** none
- **On-select behavior:** client filter
- **Dependencies:** none
- **Backend/API/DB:** none
- **Special rules:** none
- **Code locations:** `components/ambassadors/directory-table.tsx:121-127` (STATUSES :20)

### Filter — Ambassador (Pipeline board)
- **Module:** Sales · Ambassadors
- **Screen:** Pipeline board
- **Field/Key:** `fAmb`
- **Source:** database (ambassadors)
- **Component:** native select (FilterSelect)
- **Type:** Single
- **Required:** No
- **Default:** `""`
- **Searchable:** No
- **Static/Dynamic:** Dynamic
- **Options:** `All ambassadors` + each ambassador name
- **Add/Edit/Delete behavior:** none
- **Validation:** none
- **On-select behavior:** client filter
- **Dependencies:** `ambassadors` prop
- **Backend/API/DB:** none
- **Special rules:** none
- **Code locations:** `components/ambassadors/pipeline-board.tsx:186`

### Filter — Owner (Pipeline board)
- **Field/Key:** `fOwner` — native select — `All owners` + owner names
- **Code locations:** `components/ambassadors/pipeline-board.tsx:187`

### Filter — Stage (Pipeline board)
- **Field/Key:** `fStage` — native select — `All stages` + stage labels
- **Code locations:** `components/ambassadors/pipeline-board.tsx:188-192`

### Card stage (Pipeline board, keyboard fallback)
- **Field/Key:** `stage` — native select — all 11 `STAGES` labels
- **Code locations:** `components/ambassadors/pipeline-board.tsx:512-524`

### Table stage (Pipeline board table view)
- **Field/Key:** `stage` — native select — all 11 `STAGES` labels
- **Code locations:** `components/ambassadors/pipeline-board.tsx:602-614`

### Stage options list (referral drawer + board)
- **Source:** constant `STAGES` / `STAGE_LABELS` (`lib/ambassadors/stages.ts:7-38`)
- **Options:** `Received` (received) · `Assigned` (assigned) · `Qualified` (qualified) · `Meeting` (meeting) · `Proposal` (proposal) · `Negotiation` (negotiation) · `Won` (won) · `Payment` (payment) · `Commission generated` (commission_generated) · `Commission paid` (commission_paid) · `Lost` (lost)

### Ambassador (Referral drawer)
- **Module:** Sales · Ambassadors
- **Screen:** Referral drawer (new/edit referral)
- **Field/Key:** `ambassadorId`
- **Source:** database (ambassadors)
- **Component:** LookupSelect
- **Type:** Single
- **Required:** Yes (when not locked)
- **Default:** current
- **Searchable:** Yes
- **Static/Dynamic:** Dynamic
- **Options:** ambassador names
- **Code locations:** `components/ambassadors/referral-drawer.tsx:213-220`

### Product (Referral drawer)
- **Field/Key:** `productId` — LookupSelect (products) — optional
- **Code locations:** `components/ambassadors/referral-drawer.tsx:291-298`

### Assigned To (Referral drawer)
- **Field/Key:** `assignedToId` — LookupSelect (employees) — defaults to partner's owner
- **Code locations:** `components/ambassadors/referral-drawer.tsx:304-311`

### Stage (Referral drawer, create only)
- **Field/Key:** `stage` — native select — 11 `STAGES` labels
- **Code locations:** `components/ambassadors/referral-drawer.tsx:315-326`

---

## Profile

### Delegate (Out of Office)
- **Module:** Profile · Workflow
- **Screen:** Profile → Out of Office
- **Field/Key:** `oooDelegateId`
- **Source:** database (colleagues)
- **Component:** Select (ui)
- **Type:** Single
- **Required:** No
- **Default:** `""` (No delegate)
- **Searchable:** Yes
- **Static/Dynamic:** Dynamic
- **Options:** `No delegate` (empty) + each `{name · department}`
- **Add/Edit/Delete behavior:** none
- **Validation:** none
- **On-select behavior:** commits `setOoo`
- **Dependencies:** `colleagues`
- **Backend/API/DB:** `setOoo`
- **Special rules:** none
- **Code locations:** `components/profile/workflow/ooo-controls.tsx:184-204`

### Timezone (Working Hours)
- **Module:** Profile · Workflow
- **Screen:** Profile → Working Hours
- **Field/Key:** `timezone`
- **Source:** hardcoded (`TZ_OPTIONS`) + current value
- **Component:** Select (ui)
- **Type:** Single
- **Required:** Yes
- **Default:** `initial.timezone`
- **Searchable:** Yes (placeholder "Search timezone…")
- **Static/Dynamic:** Static (plus current if not in list)
- **Options:** `Asia/Kolkata` · `Asia/Dubai` · `Asia/Singapore` · `Asia/Tokyo` · `Europe/London` · `Europe/Berlin` · `Europe/Paris` · `America/New_York` · `America/Los_Angeles` · `UTC`
- **Add/Edit/Delete behavior:** none
- **Validation:** none
- **On-select behavior:** commits `setWorkingHours`
- **Dependencies:** none
- **Backend/API/DB:** `setWorkingHours`
- **Special rules:** none
- **Code locations:** `components/profile/workflow/working-hours.tsx:102-114`; `TZ_OPTIONS` at :10-21

---

## Layout (filters) — org/permission-style selectors

### Assignee (filter bar)
- **Module:** Layout · Task filter bar
- **Screen:** WMS task filters (shared)
- **Field/Key:** employee selection
- **Source:** database (employeeOptions prop)
- **Component:** MultiSelect
- **Type:** Multi
- **Required:** No
- **Default:** `[]`
- **Searchable:** Yes
- **Static/Dynamic:** Dynamic
- **Options:** employee names
- **Code locations:** `components/layout/filter-bar.tsx:476-489`

### Doer Status (StatusFilter)
- **Module:** Layout · filters
- **Screen:** task filter bar
- **Field/Key:** `status`
- **Source:** database (statusOptions prop, admin-overridable labels)
- **Component:** MultiSelect
- **Type:** Multi
- **Required:** No
- **Default:** `[]`
- **Searchable:** Yes
- **Static/Dynamic:** Dynamic
- **Options:** task status labels ("All Statuses")
- **Code locations:** `components/layout/filters/status-filter.tsx:19-31`

### Priority (PriorityFilter)
- **Module:** Layout · filters
- **Screen:** task filter bar
- **Field/Key:** `prio`
- **Source:** enum (`TASK_PRIORITIES` + `PRIORITY_LABELS`)
- **Component:** MultiSelect
- **Type:** Multi
- **Required:** No
- **Default:** `[]`
- **Searchable:** Yes
- **Static/Dynamic:** Static
- **Options:** `Critical` (imp_urgent) · `Important` (imp_not_urgent) · `Urgent` (not_imp_urgent) · `Normal` (not_imp_not_urgent)
- **Code locations:** `components/layout/filters/priority-filter.tsx:20-32`; labels `db/enums.ts:335-340`

### Client (ClientFilter)
- **Module:** Layout · filters
- **Screen:** task filter bar
- **Field/Key:** `client`
- **Source:** database (clients prop)
- **Component:** MultiSelect
- **Type:** Multi
- **Required:** No
- **Default:** `[]`
- **Searchable:** Yes
- **Static/Dynamic:** Dynamic
- **Options:** distinct task clients ("All Clients")
- **Code locations:** `components/layout/filters/client-filter.tsx:18-30`

### Function (DepartmentFilter)
- **Module:** Layout · filters
- **Screen:** task filter bar
- **Field/Key:** `dept`
- **Source:** enum (`DEPARTMENTS`)
- **Component:** MultiSelect
- **Type:** Multi
- **Required:** No
- **Default:** `[]`
- **Searchable:** Yes
- **Static/Dynamic:** Static
- **Options:** `Founder Office` · `Handholding` · `Apps` · `Sales` · `Marketing` · `Social Media` · `Accounts` · `Admin` · `HR` · `Consulting` · `CRM`
- **Code locations:** `components/layout/filters/department-filter.tsx:17-29`; `db/enums.ts:342-354`

### Team (TeamFilter)
- **Module:** Layout · filters
- **Screen:** task filter bar
- **Field/Key:** `team`
- **Source:** constant (`TEAM_ROSTER`)
- **Component:** MultiSelect
- **Type:** Multi
- **Required:** No
- **Default:** `[]`
- **Searchable:** Yes
- **Static/Dynamic:** Static
- **Options:** `T1 — Manan Vasa` (t1) · `T2 — Ruchita Ambre` (t2) · `T3 — Jeevan Bharambe` (t3) · `T4 — Rutvisha Mehta` (t4) · `T5 — Rohan Choudhary` (t5) · `T6 — Mitul Mehta` (t6)
- **Code locations:** `components/layout/filters/team-filter.tsx:35-47`; `lib/teams/roster.ts:36-45`

### Subject (SubjectFilter)
- **Module:** Layout · filters
- **Screen:** task filter bar
- **Field/Key:** `subj`
- **Source:** database (subjects prop)
- **Component:** MultiSelect
- **Type:** Multi
- **Required:** No
- **Default:** `[]`
- **Searchable:** Yes
- **Static/Dynamic:** Dynamic
- **Options:** task subjects ("All Subjects")
- **Code locations:** `components/layout/filters/subject-filter.tsx:17-29`

### Main nav group menu (layout)
- **Module:** Layout · Header
- **Screen:** Desktop header nav
- **Field/Key:** nav group
- **Source:** nav config (route items)
- **Component:** DropdownMenu (Radix)
- **Type:** Single (nav destination)
- **Required:** No
- **Default:** n/a
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** nav group links/sections
- **Add/Edit/Delete behavior:** none
- **Validation:** none
- **On-select behavior:** navigates
- **Dependencies:** nav config
- **Backend/API/DB:** none
- **Special rules:** navigation menu, not a data picker
- **Code locations:** `components/layout/main-nav-group.tsx:57-102`

---

## Option ARRAYS / CONSTANTS (in-scope lib/db — feeding pickers or validation)

### db/enums.ts — people/account/agreement/ticket constants
- **EMPLOYEE_ROLES** (`db/enums.ts:176`): `doer` · `initiator` · `both`
- **ACCOUNT_TYPES** (`:196`): `employee` · `candidate` · `system`
- **EMPLOYMENT_STATUSES** (`:217`): `active` · `former` · `anonymised`
- **EXIT_REASONS** (`:231`): `resigned` · `terminated_for_cause` · `redundancy` · `contract_ended` · `abandonment` · `retirement` · `deceased` · `other`
- **EXIT_REASON_LABELS** (`:243`): `Resigned` · `Terminated for cause` · `Redundancy` · `Contract ended` · `Abandonment` · `Retirement` · `Deceased` · `Other`
- **REHIRE_ELIGIBILITIES** (`:260`): `yes` · `no` · `with_review`
- **REHIRE_LABELS** (`:263`): `Eligible for rehire` · `Not eligible` · `Eligible with review`
- **WORKER_TYPES** (`:277`): `full_time` · `first_half` · `second_half` · `hybrid` · `project_remote`
- **PAY_BASES** (`:286`): `monthly_ctc` · `hourly` · `fixed_fee`
- **GRADING_MODES** (`:289`): `day` · `hours` · `session`
- **DEPARTMENTS** (`:342`): `Founder Office` · `Handholding` · `Apps` · `Sales` · `Marketing` · `Social Media` · `Accounts` · `Admin` · `HR` · `Consulting` · `CRM`
- **RELIGIONS** (`:798`): `hindu` · `christian` · `muslim` · `other` · `unspecified`
- **RELIGION_LABELS** (`:800`): `Hindu` · `Christian` · `Muslim` · `Other` · `Unspecified`
- **AGREEMENT_TYPES** (`:885`): `appointment` · `employment` · `nda` · `ctc` · `probation_confirmation` · `training_completion`
- **AGREEMENT_TYPE_LABELS** (`:894`): `Appointment Letter` · `Employment Agreement` · `NDA / Confidentiality` · `CTC / Salary Letter` · `Confirmation of Appointment (Post-Probation)` · `Confirmation - End of Free Training`
- **AGREEMENT_STATUSES** (`:903`): `draft` · `sent` · `signed`
- **AGREEMENT_STATUS_LABELS** (`:905`): `Draft` · `Sent` · `Signed`
- **HR_TICKET_STATUSES** (`:921`): `new` · `in_progress` · `waiting_on_employee` · `resolved` · `closed` · `reopened`
- **HR_TICKET_STATUS_LABELS** (`:932`): `New` · `In Progress` · `Waiting on Employee` · `Resolved` · `Closed` · `Reopened`
- **HR_TICKET_STATUS_EMPLOYEE_LABELS** (`:942`): `With HR` · `With HR` · `Waiting on you` · `Resolved` · `Closed` · `With HR`
- **HR_TICKET_PRIORITIES** (`:959`): `low` · `normal` · `high` · `urgent`
- **HR_TICKET_PRIORITY_LABELS** (`:961`): `Low` · `Normal` · `High` · `Urgent`
- **HR_TICKET_CATEGORIES** (`:985`): `payroll` · `leave_attendance` · `reimbursement` · `it_access` · `facilities` · `documents_letters` · `policy_question` · `grievance` · `other`
- **HR_TICKET_CATEGORY_LABELS** (`:997`): `Payroll & Salary` · `Leave & Attendance` · `Reimbursement` · `IT & Access` · `Facilities` · `Documents & Letters` · `Policy Question` · `Grievance (Confidential)` · `Other`
- **HR_TICKET_SOURCES** (`:1010`): `support` · `query`

### lib/hr — option arrays
- **DEFAULT_POSITIONS** (`lib/hr/candidate/intake-schema.ts:48`): 13 interview positions (seed for managed master)
- **Intake select field options** (`intake-schema.ts`): passing months (12), size of house (4), bathroom (2), source (6)
- **BASE_TECHNICAL / BASE_NON_TECHNICAL** (`lib/hr/skills.ts:17-20`): `Vercel` · `Supabase` · `Antigravity` · `React` · `Next.js`; `Communication` · `Ownership` · `Time Management` · `Teamwork`
- **BASIC_DETAILS_SECTIONS** (`lib/hr/basic-details-fields.ts:27`): legacy Google-Form schema — choice/checkbox options: Gender `Male/Female/Prefer not to say`; Bathroom `In/Out`; Y/N questions; source checkbox `Newspaper Advertisement/Company Website/Friend or Relative/Job Portal / HR agency/Social Media/Other`
- **LETTER_TYPES** (`lib/hr/letter-types.ts:23`), **POLICY_CATEGORIES** (`lib/hr/policy-types.ts:22`), **ENTITY_LIST** (`lib/hr/entities.ts:108`), **CTC_REASONS/REASON_LABELS** (`lib/hr/ctc/model.ts:191-198`)
- **KPI_FREQUENCIES** (`db/enums.ts:1123`), **FREQUENCY_OPTIONS** (`lib/jd/recurrence.ts`)
- **FUNCTION_LABELS** (`lib/org/functions.ts:95`)

### lib/validators — option arrays feeding forms
- **role** enum (`lib/validators/employee.ts:41,85,233`): `doer` · `initiator` · `both`
- **workerType** enum (`employee.ts:241`): `WORKER_TYPES`
- **exitReason / rehireEligibility** (`lib/validators/offboarding.ts:57,61`): `EXIT_REASONS`, `REHIRE_ELIGIBILITIES`

### lib/permissions / lib/security / lib/teams
- **PERMISSION_ACTIONS** (`lib/permissions/catalog.ts:41`): `show` · `view` · `edit` (labels `Show`/`View`/`Edit`); **PERMISSION_CATALOG** tree (matrix node options)
- **SecurityCapability** union + GRANTS (`lib/security/capabilities.ts:32-261`): 9 capabilities (not a dropdown, but the capability list for device/attendance/master-admin selectors)
- **TEAM_ROSTER** (`lib/teams/roster.ts:36`): 6 teams
- **CA_PORTAL_TYPES / CA_PORTAL_LABELS** (`lib/accounts/ca-constants.ts:6-21`)

### lib/accounts — fixed option sets
- **CC_YESNO** `["Yes","No","NA"]`, **CC_TALLY** `["Done","Pending","NA"]`, **CC_BALANCE** `["Tallied","Pending","NA"]` (`lib/accounts/cc.ts:18-20`)
- **WEEKLY_CHECK_STATUSES** `["Done","Pending","Need Help","Not Applicable"]` (`lib/accounts/weekly.ts:12`); **MONTHLY_CHECK_STATUSES** = same (`lib/accounts/monthly.ts:23`); **MONTHLY_FREQUENCIES** `["Monthly","Quarterly","Annual"]` (`lib/accounts/monthly.ts:30`)
- due-dates local: `YES_NO = ["Yes","No","Not Applicable","Don't Know"]`, `TALLY = ["Done","Pending","NA"]`, `BALANCE = ["Tallied","Pending","NA"]` (`components/accounts/due-dates/due-dates-client.tsx:17-19`)
- cc-master local: `YES_NO = ["Yes","No","Don't Know"]` (`components/accounts/cc-master/cc-client.tsx:529`)

---

## Non-dropdown option pickers (radiogroups / pill tabs / button grids) — for completeness

These are single-choice option pickers but NOT rendered as dropdowns. Listed by name + options, without the full per-field template:

1. **Recommendation picker** (Evaluation v2) — `Strong Hire` · `Hire` · `Hire with Concerns` · `Hold` · `Reject` (`lib/hr/candidate/evaluation-v2.ts:531-537`; `components/hr/candidate/evaluation-v2/special-sections.tsx:249`)
2. **Intake "buttons" chip fields** — Gender `Male/Female/Prefer not to say`; Marital Status `Single/Married/Divorced/Separated/Widowed`; many Y/N chips; Declaration `I Agree` (`lib/hr/candidate/intake-schema.ts`)
3. **Exit choice questions** (ChipGroup) — Q2 `Yes completely/Somewhat/No`; Q3/Q4 `Excellent/Good/Average/Fair/Poor`; Q5/Q8 `Yes/Somewhat/No` (`lib/hr/exit/content.ts:35-41`)
4. **Exit rating matrix** — 1–5 `Poor → Excellent` (`lib/hr/exit/content.ts:47-73`)
5. **Management Assessment outcome** — `selected` · `shortlisted` · `rejected` (`components/hr/candidate/management-assessment-screen.tsx:74`)
6. **Ticket status actions** (thread) — Start / Wait on Employee / Resolve / Close / Reopen (buttons) (`components/hr/ticket-thread/ticket-thread.tsx:236-251`)
7. **Queue filters** (support list) — status `Open/Waiting on Employee/Resolved/All`; assignee `Everyone/Mine/Unassigned`; source `All Sources/Tickets/Ask HR` (pill buttons) (`components/hr/ticket-list/queue-filters.tsx`)
8. **Agreement template picker** — 6 agreement types (pill cards) (`components/agreements/template-picker.tsx`)
9. **Agreement status tracker filter** — `All/Draft/Sent/Signed` (pill tabs) (`components/agreements/status-tracker.tsx:73`)
10. **Ambassador form Segmented controls** — Status `Active/Paused/Archived`; Payout Type `Percent/Flat ₹` (`components/ambassadors/ambassador-form.tsx:336-380`)
11. **Pipeline view toggle** — Board/Table (tablist) (`components/ambassadors/pipeline-board.tsx:214`)
12. **Filter bar Scope/View** — `My Tasks/All Tasks`; `Doer/Initiator` (segmented) (`components/layout/filter-bar.tsx:510-552`)
13. **Working Hours working days** — Mon–Sun toggle buttons (`components/profile/workflow/working-hours.tsx:156-184`)
14. **Basic Details legacy form choice/checkbox fields** (`lib/hr/basic-details-fields.ts`)

---

## Notes / key findings

- `components/hr/exit/exit-fields.tsx` `FloatingSelect` (native styled select) is **defined but never used** — dead code.
- All Accounts modules share the `ValueSelect` → `LookupSelect` pattern backed by the single `accounts_lookups` master (server actions `addAccountsLookup` / `softDeleteAccountsLookup`), keyed by kind (`bank_entity`, `cc_entity`, `cash_entity`, `cash_payee`, `fno_entity`, `fno_agency`, `it_entity`, `shares_entity`, `sip_entity`, `sip_type`, `loan_entity`, `due_area`, `due_frequency`, `monthly_responsible`, `monthly_deadline`, `monthly_type`, `monthly_frequency`, `weekly_deadline`, `weekly_category`, `weekly_responsible`, `weekly_frequency`, `task_status`, `task_gear`).
- The shared UI primitives are `LookupSelect` (`components/ui/lookup-select.tsx` — searchable single select with optional add/delete), `MultiSelect` (`components/ui/multi-select.tsx` — cmdk command-based multi select), and `Select` (`components/ui/select.tsx` — cmdk single select). All three are used throughout HR/Accounts/Profile/Layout.
- Employee/candidate/roster "person" pickers are implemented four different ways: native `<select>`, `LookupSelect`, custom `EmployeePicker` combobox (KPI), custom `EmployeeCombobox` (exit), custom `PersonPicker` (HR record).

### 3.4 — Incentive / Salary / Outstanding / Reimbursements / Billing

# Slice 4 — Dropdown / Select / Option-Picker Audit
**Areas:** INCENTIVE · SALARY · MY-SALARY · OUTSTANDING · REIMBURSEMENTS · BILLING
**Repo:** `C:/Users/om jadhav/Downloads/wms-local-main (1)/wms-local-main`
**Audit date:** 2026-09-19 — READ-ONLY (nothing modified)

> Conventions: the shared `Select` (`components/ui/select.tsx:50`) is a Popover + cmdk combobox (searchable when >8 options unless `searchable` is set explicitly). `MultiSelect` (`components/ui/multi-select.tsx:43`) is the same primitive, multi-select with an always-on search box. Native `<select>` = plain HTML select. DataTable `filters` render as a native `<select>` in `components/admin/ui/data-table.tsx:345` (with a leading "All" option, value `__all`).

---

# INCENTIVE

### 1. Incentive Type
- **Module:** Incentive
- **Screen:** New Incentive Request dialog (also Justify & Resubmit)
- **Field/Key:** `type`
- **Source:** enum — `INCENTIVE_TYPES` + `INCENTIVE_TYPE_LABELS` (`db/enums.ts:503,518`)
- **Component:** Select
- **Type:** Single
- **Required:** Yes
- **Default:** empty — placeholder "- Select incentive -"
- **Searchable:** No (5 options, auto search threshold is >8)
- **Static/Dynamic:** Static
- **Options:**
  - `bss_conversion` → "Conversion"
  - `sales_pitch` → "Sales Pitch"
  - `client_happiness` → "Client Happiness"
  - `group_intro` → "Group Introduction"
  - `leads_referrals` → "Leads / Referrals"
- **Add/Edit/Delete behavior:** Select-only; not editable inline. On resubmit the type is fixed (`disabled={!!resubmit}`).
- **Validation:** Must be non-empty to submit; no other rule.
- **On-select behavior:** `changeType()` — keeps the Incentive Date, clears type-specific answers, resets touched/submitted/serverError.
- **Dependencies:** Drives `visibleIncentiveFields(type, values)` — the rest of the form.
- **Backend/API/DB:** `createIncentiveRequest` / `resubmitIncentiveRequest` (`app/(app)/incentive/actions.ts`); server re-validates via `lib/incentive/prepare-request.ts`.
- **Special rules:** Server takes the stored type on resubmit; a different type would be a new request.
- **Code locations:** `components/incentive/incentive-form-dialog.tsx:487` (definition), options from `INCENTIVE_TYPES`/`INCENTIVE_TYPE_LABELS`.

### 2. Workshop Name (field, all 5 type forms)
- **Module:** Incentive
- **Screen:** New Incentive Request dialog (Conversion / Sales Pitch / Client Happiness / Group Introduction / Leads & Referrals)
- **Field/Key:** `workshop`
- **Source:** constant — `WORKSHOPS` (`lib/incentive-fields.ts:68`)
- **Component:** Select (rendered generically by `FieldControl` for `type === "select"`)
- **Type:** Single
- **Required:** Yes
- **Default:** empty — placeholder "- Select -"
- **Searchable:** No (8 options)
- **Static/Dynamic:** Static
- **Options:**
  - "NA"
  - "Don't Know"
  - "Altus Network Event"
  - "Business Scale Up Shastra"
  - "Colloquium"
  - "Completing the Year"
  - "Productivity Shastra"
  - "Productivity Shastra Orientation"
- **Add/Edit/Delete behavior:** Select-only.
- **Validation:** Required — "Workshop Name is required."; also `options.includes(v)` else "Workshop Name: invalid option."
- **On-select behavior:** `setValue("workshop", v)` + `touch()`.
- **Dependencies:** none.
- **Backend/API/DB:** stored in `details` JSON of incentive request.
- **Special rules:** same config validated server-side via `lib/incentive/prepare-request.ts`.
- **Code locations:** `lib/incentive-fields.ts:113,137,177,202,228` (field def); renderer `components/incentive/incentive-form-dialog.tsx:714-732`.

### 3. Conversion
- **Module:** Incentive
- **Screen:** New Incentive Request — Conversion (`bss_conversion`)
- **Field/Key:** `conversion`
- **Source:** hardcoded options array (`lib/incentive-fields.ts:120`)
- **Component:** Select
- **Type:** Single
- **Required:** Yes
- **Default:** empty — placeholder "- Select -"
- **Searchable:** No (3 options)
- **Static/Dynamic:** Static
- **Options:** "1st Attempt", "2nd Attempt", "Direct"
- **Add/Edit/Delete behavior:** Select-only.
- **Validation:** Required; invalid-option guard.
- **On-select behavior:** setValue + touch; choosing "Direct" reveals the Prospect block (`showIf`).
- **Dependencies:** `showIf` gate for prospect fields when value === "Direct".
- **Backend/API/DB:** details JSON.
- **Code locations:** `lib/incentive-fields.ts:115-121`; renderer `components/incentive/incentive-form-dialog.tsx:719`.

### 4. Product (Conversion form)
- **Module:** Incentive
- **Screen:** New Incentive Request — Conversion (`bss_conversion`)
- **Field/Key:** `product`
- **Source:** API/DB — `optionsFrom: "products"` → active product names via `listActiveProductNames()` (`lib/queries/products.ts`), passed as `products` prop.
- **Component:** Select
- **Type:** Single
- **Required:** Yes
- **Default:** empty — placeholder "- Select -"
- **Searchable:** auto (>8 products)
- **Static/Dynamic:** Dynamic (admin-editable product master)
- **Options:** live active product names (e.g. from `SEED_PRODUCTS` seed list: Altus Conclave, Billing, BSS, BSSO, Commission, Consulting, Graduate Programs, OS, PS, PSO, Rent, Retainer — but actual values come from `outstanding_products` active rows).
- **Add/Edit/Delete behavior:** Select-only; when no products exist the field is disabled and shows "No products in Admin → Products".
- **Validation:** Required; if empty and no products exist → "No products are set up yet — add them in Admin → Products."
- **On-select behavior:** setValue + touch.
- **Dependencies:** `productNames` context.
- **Backend/API/DB:** `outstanding_products` (active rows), `listActiveProductNames()`.
- **Code locations:** `lib/incentive-fields.ts:122`; `lib/incentive-fields.ts:263-268` (`optionsFor`); renderer `components/incentive/incentive-form-dialog.tsx:714-732`; page load `app/(app)/incentive/page.tsx:89`.

### 5. Opportunity Type
- **Module:** Incentive
- **Screen:** New Incentive Request — Sales Pitch (`sales_pitch`)
- **Field/Key:** `opportunity_type`
- **Source:** hardcoded (`lib/incentive-fields.ts:150`)
- **Component:** Select
- **Type:** Single
- **Required:** Yes
- **Default:** empty — placeholder "- Select -"
- **Searchable:** No (5 options)
- **Static/Dynamic:** Static
- **Options:** "BSS Potential", "Inhouse Consulting", "Inhouse Training", "PS Potential", "Sales Consulting"
- **Code locations:** `lib/incentive-fields.ts:145-152`.

### 6. Happiness Type
- **Module:** Incentive
- **Screen:** New Incentive Request — Client Happiness (`client_happiness`)
- **Field/Key:** `happiness_type`
- **Source:** hardcoded (`lib/incentive-fields.ts:164`)
- **Component:** Select
- **Type:** Single
- **Required:** Yes
- **Default:** empty
- **Searchable:** No (5 options)
- **Static/Dynamic:** Static
- **Options:** "Case Study", "Google Review", "Interview", "LinkedIn Testimonial", "Video Testimonial"
- **Dependencies:** choosing "Case Study" or "Video Testimonial" reveals "Client Permission to Publish".
- **Code locations:** `lib/incentive-fields.ts:157-165`.

### 7. Content Quality
- **Module:** Incentive
- **Screen:** New Incentive Request — Client Happiness
- **Field/Key:** `content_quality`
- **Source:** hardcoded (`lib/incentive-fields.ts:185`)
- **Component:** Select
- **Type:** Single
- **Required:** Yes
- **Default:** empty
- **Searchable:** No (4 options)
- **Static/Dynamic:** Static
- **Options:** "2-3 Sentences", "Do Not Use", "Good to Use", "Must Use"
- **Code locations:** `lib/incentive-fields.ts:180-187`.

### 8. No Gyan Only Gain Said
- **Module:** Incentive
- **Screen:** New Incentive Request — Client Happiness
- **Field/Key:** `no_gyan_only_gain`
- **Source:** hardcoded (`lib/incentive-fields.ts:193`)
- **Component:** Select
- **Type:** Single
- **Required:** Yes
- **Default:** empty
- **Searchable:** No (2 options)
- **Static/Dynamic:** Static
- **Options:** "Yes", "No"
- **Code locations:** `lib/incentive-fields.ts:188-195`.

### 9. Event Type
- **Module:** Incentive
- **Screen:** New Incentive Request — Group Introduction (`group_intro`)
- **Field/Key:** `event_type`
- **Source:** hardcoded (`lib/incentive-fields.ts:211`)
- **Component:** Select
- **Type:** Single
- **Required:** Yes
- **Default:** empty
- **Searchable:** No (6 options)
- **Static/Dynamic:** Static
- **Options:** "Ascent Intro", "BNI Intro", "Jito Intro", "Key Note", "Paid Event", "Sales Event"
- **Code locations:** `lib/incentive-fields.ts:206-212`.

### 10. Split person (Split Incentive picker)
- **Module:** Incentive
- **Screen:** New Incentive Request dialog — Split Incentive section
- **Field/Key:** `split[].employeeId` (not stored as details key)
- **Source:** API/DB — active employee roster (`listEmployeeOptions()`, passed as `employees`), minus the requester and already-picked people.
- **Component:** Select
- **Type:** Single (per row)
- **Required:** No (split is optional; a chosen row's person is part of `checkSplit`)
- **Default:** empty — placeholder "- Select employee -"
- **Searchable:** auto (>8 employees)
- **Static/Dynamic:** Dynamic
- **Options:** active employees `{id, name}` (excludes self and duplicates).
- **Add/Edit/Delete behavior:** "Add person" up to `MAX_SPLIT_PEOPLE` (5); remove via trash icon; "Split Equally" re-divides shares.
- **Validation:** split totals must equal 100% (`checkSplit`, `lib/incentive/split.ts`).
- **On-select behavior:** updates the row's employeeId; if equal-mode, re-equalises shares.
- **Dependencies:** `employees` prop.
- **Backend/API/DB:** submitted as `split` payload to `createIncentiveRequest`.
- **Code locations:** `components/incentive/incentive-form-dialog.tsx:963` (Select), `:886-1076` (SplitIncentive).

### 11. Employee (roster) — Add/Edit incentive entry
- **Module:** Incentive
- **Screen:** Incentive Entries ledger — "Add entry" / "Edit incentive entry" dialog
- **Field/Key:** `employeeId` / `empName`
- **Source:** API/DB — active employees (`listEmployeeOptions()`, passed as `employees` prop).
- **Component:** Select
- **Type:** Single
- **Required:** No (name is required, but can be free-typed)
- **Default:** empty — placeholder "— Select employee —"
- **Searchable:** Yes (`searchable`)
- **Static/Dynamic:** Dynamic
- **Options:** active employees `{id, name}`.
- **Add/Edit/Delete behavior:** picking fills `empId` + `empName`; a free name can be typed instead.
- **Validation:** `empName` required ("Employee name is required.").
- **On-select behavior:** `pickEmployee(id)` sets `empId` and copies the name.
- **Dependencies:** `employees` prop.
- **Backend/API/DB:** `createIncentiveEntry` / `updateIncentiveEntry` (`app/(app)/incentive/admin-actions.ts`).
- **Code locations:** `components/incentive/incentive-entries.tsx:446` (Select), `:378-382` (pickEmployee).

### 12. Month filter (Entries ledger)
- **Module:** Incentive
- **Screen:** Incentive Entries (ledger DataTable toolbar)
- **Field/Key:** DataTable filter index 0 — `periodMonth`
- **Source:** dynamic — distinct `YYYY-MM` of `periodMonth` in rows (`incentive-entries.tsx:95-104`)
- **Component:** native select (DataTable filter)
- **Type:** Single
- **Required:** No
- **Default:** "All" (`__all`)
- **Searchable:** No
- **Static/Dynamic:** Dynamic
- **Options:** "All" + months present in data (newest-first, label "Mon YYYY").
- **Add/Edit/Delete behavior:** filter only; hidden when ≤1 month present.
- **On-select behavior:** filters rows by `periodMonth?.slice(0,7) === v`.
- **Code locations:** `components/incentive/incentive-entries.tsx:195-196` (options), select rendered at `components/admin/ui/data-table.tsx:345`.

### 13. Incentive filter (Entries ledger)
- **Module:** Incentive
- **Screen:** Incentive Entries ledger
- **Field/Key:** DataTable filter — `incentiveName`
- **Source:** dynamic — distinct incentive names in rows (`incentive-entries.tsx:106-110`)
- **Component:** native select (DataTable filter)
- **Type:** Single
- **Required:** No
- **Default:** "All"
- **Searchable:** No
- **Static/Dynamic:** Dynamic
- **Options:** "All" + distinct sorted incentive names.
- **On-select behavior:** filters by `incentiveName === v`.
- **Code locations:** `components/incentive/incentive-entries.tsx:197-205`.

### 14. Approved filter (Entries ledger)
- **Module:** Incentive
- **Screen:** Incentive Entries ledger
- **Field/Key:** DataTable filter
- **Source:** hardcoded
- **Component:** native select (DataTable filter)
- **Type:** Single
- **Required:** No
- **Default:** "All"
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** "All", `yes` → "Approved", `no` → "Not approved"
- **On-select behavior:** filters `r.approved` truthy vs falsy.
- **Code locations:** `components/incentive/incentive-entries.tsx:206-213`.

### 15. Paid filter (Entries ledger)
- **Module:** Incentive
- **Screen:** Incentive Entries ledger
- **Field/Key:** DataTable filter
- **Source:** hardcoded
- **Component:** native select (DataTable filter)
- **Type:** Single
- **Required:** No
- **Default:** "All"
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** "All", `yes` → "Paid", `part` → "Partly paid", `no` → "Unpaid"
- **On-select behavior:** paid = `paidAmt>0 && paidAmt>=approvedAmt`; part = `paidAmt>0 && paidAmt<approvedAmt`; unpaid = `paidAmt===0`.
- **Code locations:** `components/incentive/incentive-entries.tsx:214-227`.

### 16. Participant (Team Split)
- **Module:** Incentive
- **Screen:** "Divide Incentive Among the Team" dialog (Incentive Status tab)
- **Field/Key:** `shares[].employeeId`
- **Source:** API/DB — active employees (`listEmployeeOptions()`)
- **Component:** Select
- **Type:** Single (per row)
- **Required:** No (at least one participant with a name required on save)
- **Default:** shows current `empName` or placeholder "- Select participant -"
- **Searchable:** Yes
- **Static/Dynamic:** Dynamic
- **Options:** active employees `{id, name}`.
- **Add/Edit/Delete behavior:** Add/Remove Participant rows; "Remove Split" clears all.
- **Validation:** ≥1 participant with non-empty name on save.
- **On-select behavior:** `pickEmployee(i, id)` sets employeeId + empName.
- **Backend/API/DB:** `saveIncentiveSplit` (`app/(app)/incentive/status-actions.ts`).
- **Code locations:** `components/incentive/incentive-team-split.tsx:224` (Select), `:92` (empOptions).

### 17. Status filter (Requests list)
- **Module:** Incentive
- **Screen:** Incentive Requests list (DataTable toolbar)
- **Field/Key:** DataTable filter — `status`
- **Source:** enum — `INCENTIVE_STATUS_LABELS` (`db/enums.ts:565`)
- **Component:** native select (DataTable filter)
- **Type:** Single
- **Required:** No
- **Default:** "All"
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** "All" +
  - `pending` → "Pending Approval"
  - `approved` → "Approved"
  - `rejected` → "Not Approved"
  - `due` → "Due"
  - `not_due` → "Not Due"
  - `reversed` → "Reversed"
  - `revision_requested` → "Revision Requested"
- **On-select behavior:** filters `r.status === v`.
- **Code locations:** `components/incentive/incentive-list.tsx:238-245`.

### 18. Type filter (Requests list)
- **Module:** Incentive
- **Screen:** Incentive Requests list
- **Field/Key:** DataTable filter — `type`
- **Source:** enum — `INCENTIVE_TYPES` + `INCENTIVE_TYPE_LABELS`
- **Component:** native select (DataTable filter)
- **Type:** Single
- **Required:** No
- **Default:** "All"
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** "All" + (same 5 as dropdown #1).
- **On-select behavior:** filters `r.type === v`.
- **Code locations:** `components/incentive/incentive-list.tsx:246-250`.

### 19. Scope filter (Requests list)
- **Module:** Incentive
- **Screen:** Incentive Requests list (only when `showEmployee`)
- **Field/Key:** DataTable filter — scope
- **Source:** hardcoded (+ conditional on `canReview`)
- **Component:** native select (DataTable filter)
- **Type:** Single
- **Required:** No
- **Default:** "All"
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** "All", `mine` → "Mine", and (if `canReview`) `queue` → "Needs my review"
- **On-select behavior:** `mine` → `r.employeeId === me.id`; `queue` → `needsReview(r.status)`.
- **Code locations:** `components/incentive/incentive-list.tsx:251-264`.

### 20. Target filter (Targets)
- **Module:** Incentive
- **Screen:** Incentive Targets tab (DataTable toolbar)
- **Field/Key:** DataTable filter
- **Source:** hardcoded
- **Component:** native select (DataTable filter)
- **Type:** Single
- **Required:** No
- **Default:** "All"
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** "All", `set` → "Has a target", `none` → "No target"
- **On-select behavior:** `set` → `r.target > 0`; `none` → `r.target === 0`.
- **Code locations:** `components/incentive/incentive-targets.tsx:271-279`.

### 21. Attainment filter (Targets)
- **Module:** Incentive
- **Screen:** Incentive Targets tab
- **Field/Key:** DataTable filter
- **Source:** hardcoded
- **Component:** native select (DataTable filter)
- **Type:** Single
- **Required:** No
- **Default:** "All"
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** "All", `on` → "At or above target", `near` → "60–99%", `behind` → "Below 60%"
- **On-select behavior:** compares `r.attainmentPct` (null always excluded).
- **Code locations:** `components/incentive/incentive-targets.tsx:280-292`.

### 22. Attainment filter (Status Report)
- **Module:** Incentive
- **Screen:** Incentive Status Report tab (DataTable toolbar)
- **Field/Key:** DataTable filter
- **Source:** hardcoded
- **Component:** native select (DataTable filter)
- **Type:** Single
- **Required:** No
- **Default:** "All"
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** "All", `on` → "At or above target", `behind` → "Behind target", `none` → "No target set"
- **On-select behavior:** `pct(r.paid, r.target)`; null → "none".
- **Code locations:** `components/incentive/incentive-status-report.tsx:232-243`.

### 23. Payment filter (Status tab)
- **Module:** Incentive
- **Screen:** Incentive Status (Booked/Accrued/Paid) tab (DataTable toolbar)
- **Field/Key:** DataTable filter
- **Source:** hardcoded
- **Component:** native select (DataTable filter)
- **Type:** Single
- **Required:** No
- **Default:** "All"
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** "All", `unbooked` → "Nothing booked yet", `booked` → "Booked, not accrued", `accrued` → "Accrued, not paid", `paid` → "Paid"
- **On-select behavior:** matches booked/accrued/paid amounts.
- **Code locations:** `components/incentive/incentive-status-tab.tsx:138-156`.

### 24. Split filter (Status tab)
- **Module:** Incentive
- **Screen:** Incentive Status tab
- **Field/Key:** DataTable filter
- **Source:** hardcoded
- **Component:** native select (DataTable filter)
- **Type:** Single
- **Required:** No
- **Default:** "All"
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** "All", `split` → "Divided among a team", `solo` → "One person"
- **On-select behavior:** `r.participantCount > 0` vs `=== 0`.
- **Code locations:** `components/incentive/incentive-status-tab.tsx:157-164`.

### 25. Month (Analytics dashboard)
- **Module:** Incentive
- **Screen:** Incentive Dashboard (analytics) — control row, only when period kind = "Specific Month"
- **Field/Key:** `month`
- **Source:** API/DB — `selectableMonths()` (`lib/incentive/analytics/periods.ts:119`, last 24 months from IST now, clipped at 2020-01), passed as `analyticsMonths`.
- **Component:** native select
- **Type:** Single
- **Required:** No (part of period control)
- **Default:** initial period month (or `months[1] ?? months[0]`)
- **Searchable:** No
- **Static/Dynamic:** Dynamic
- **Options:** "YYYY-MM" keys, label `formatMonthKey` → e.g. "Sep 2026".
- **On-select behavior:** `load("month", value)` refetches analytics.
- **Backend/API/DB:** `fetchIncentiveAnalytics` (`app/(app)/incentive/analytics-actions.ts`).
- **Code locations:** `components/incentive/analytics/incentive-analytics-dashboard.tsx:173-185`.

### 26. Grade filter (Analytics grade report)
- **Module:** Incentive
- **Screen:** Incentive Dashboard — grade report table
- **Field/Key:** DataTable filter
- **Source:** hardcoded
- **Component:** native select (DataTable filter)
- **Type:** Single
- **Required:** No
- **Default:** "All"
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** "All", `A` → "Grade A", `B` → "Grade B", `C` → "Grade C", `D` → "Grade D", `none` → "No grade"
- **On-select behavior:** `none` → `p.grade === null` else `p.grade === v`.
- **Code locations:** `components/incentive/analytics/incentive-analytics-dashboard.tsx:782-794`.

### 27. Target filter (Analytics grade report)
- **Module:** Incentive
- **Screen:** Incentive Dashboard — grade report table
- **Field/Key:** DataTable filter
- **Source:** hardcoded
- **Component:** native select (DataTable filter)
- **Type:** Single
- **Required:** No
- **Default:** "All"
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** "All", `set` → "Has a target", `none` → "No target", `behind` → "Behind target", `ahead` → "At or above target"
- **On-select behavior:** uses `p.target` / `p.difference`.
- **Code locations:** `components/incentive/analytics/incentive-analytics-dashboard.tsx:795-812`.

### 28. Outstanding filter (Billing — By salesperson)
- **Module:** Billing (surfaced in Incentive Billing tab + `/billing`)
- **Screen:** Billing dashboard — "By salesperson" table
- **Field/Key:** DataTable filter
- **Source:** hardcoded
- **Component:** native select (DataTable filter)
- **Type:** Single
- **Required:** No
- **Default:** "All"
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** "All", `open` → "Has outstanding", `clear` → "Fully collected"
- **On-select behavior:** `p.outstanding > 0` vs `<= 0`.
- **Code locations:** `components/incentive/billing-dashboard.tsx:353-362`.

### 29. Payment filter (Billing — Deals)
- **Module:** Billing
- **Screen:** Billing dashboard — "Deals" table
- **Field/Key:** DataTable filter
- **Source:** hardcoded
- **Component:** native select (DataTable filter)
- **Type:** Single
- **Required:** No
- **Default:** "All"
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** "All", `paid` → "Collected", `part` → "Part collected", `open` → "Nothing collected"
- **On-select behavior:** matches `paymentState(d).key` (derived, `billing-dashboard.tsx:457-466`).
- **Code locations:** `components/incentive/billing-dashboard.tsx:404-414`.

---

# SALARY

### 30. Payroll year
- **Module:** Salary
- **Screen:** `/salary` header (SalaryPeriodSelect)
- **Field/Key:** year of `?month=YYYY-MM`
- **Source:** API/DB — distinct years present in `salaryBreakupMonths()` (passed as `months`).
- **Component:** Select (unstyled)
- **Type:** Single
- **Required:** No (part of period control)
- **Default:** year of current selection
- **Searchable:** No (few years)
- **Static/Dynamic:** Dynamic
- **Options:** years (newest-first), value = label = "YYYY".
- **On-select behavior:** `onYear(y)` keeps same month where that year has one, else first month of year; navigates `?month=`.
- **Dependencies:** `months`.
- **Code locations:** `components/salary/salary-period-select.tsx:75-82`.

### 31. Payroll month
- **Module:** Salary
- **Screen:** `/salary` header (SalaryPeriodSelect)
- **Field/Key:** month of `?month=YYYY-MM`
- **Source:** API/DB — months with a sheet in the selected year (from `months`).
- **Component:** Select (unstyled)
- **Type:** Single
- **Required:** No
- **Default:** current selection's month
- **Searchable:** No
- **Static/Dynamic:** Dynamic
- **Options:** months of the selected year (newest-first), value "MM", label month name ("January"…"December").
- **On-select behavior:** `go(\`${selYear}-${m}\`)` navigates.
- **Code locations:** `components/salary/salary-period-select.tsx:83-93`; `MONTHS` const at `:7-10`.

### 32. Entity filter (salary header)
- **Module:** Salary
- **Screen:** `/salary` header (SalaryEntitySelect)
- **Field/Key:** `?entity=`
- **Source:** API/DB — distinct `companyName` values on the month's sheet (`app/(app)/salary/page.tsx:73-75`).
- **Component:** Select (unstyled)
- **Type:** Single
- **Required:** No
- **Default:** `ALL_ENTITIES` = `__all`
- **Searchable:** auto (>8 entities)
- **Static/Dynamic:** Dynamic
- **Options:** `__all` → "All entities" + entity names.
- **Add/Edit/Delete behavior:** control hidden entirely when <2 entities (`entities.length < 2`).
- **On-select behavior:** pushes `?month=&entity=` (or clears entity for All).
- **Code locations:** `components/salary/salary-entity-select.tsx:54-64`; `ALL_ENTITIES` at `:8`.

### 33. Company filter (breakup table)
- **Module:** Salary
- **Screen:** `/salary` breakup table toolbar (only when `hideCompanyFilter` false)
- **Field/Key:** `company`
- **Source:** API/DB — distinct `companyName` from rows (`salary-breakup-table.tsx:1040-1046`).
- **Component:** native select
- **Type:** Single
- **Required:** No
- **Default:** `__all`
- **Searchable:** No
- **Static/Dynamic:** Dynamic
- **Options:** `__all` → "All Companies" + sorted company names.
- **Add/Edit/Delete behavior:** hidden when `hideCompanyFilter` or ≤1 company.
- **On-select behavior:** sets `company`; filters rows by `companyName`.
- **Code locations:** `components/salary/salary-breakup-table.tsx:1160-1179`.

### 34. Employee (statements & documents)
- **Module:** Salary (WS-5/WS-6, `SALARY_STATEMENTS` gate)
- **Screen:** `/salary` — "Statements & documents" panel
- **Field/Key:** `selected` (employee id)
- **Source:** API/DB — `statementEmployees` (rows with resolved `employeeId`, deduped) from `/salary` page.
- **Component:** native select
- **Type:** Single
- **Required:** No (links disabled when none)
- **Default:** first employee by name (`sorted[0]?.id`)
- **Searchable:** No
- **Static/Dynamic:** Dynamic
- **Options:** employee names; single option "No linked employees" (value "") when empty.
- **On-select behavior:** `setSelected`; drives the annual-statement / total-earnings `<a href>`s.
- **Code locations:** `components/salary/statement-downloads.tsx:97-109`.

### 35. Month (My Salary net-pay card)
- **Module:** Salary / My Salary
- **Screen:** My Salary view (employee self-service + admin/manager view)
- **Field/Key:** `sel` (index into `months`)
- **Source:** API/DB — `loadMySalaryMonths()` (`lib/salary/my-salary.ts`).
- **Component:** native select
- **Type:** Single
- **Required:** No
- **Default:** index 0
- **Searchable:** No
- **Static/Dynamic:** Dynamic
- **Options:** month labels (`mo.label`), value = index. Shown only when `months.length > 1`.
- **On-select behavior:** `setSel(index)`; resets detail panel; fetches that month's ledger.
- **Code locations:** `components/salary/my-salary-view.tsx:209-223`.

### 36. Status filter (Daily Salary Report)
- **Module:** Salary
- **Screen:** My Salary — Daily Salary Report FilterBar
- **Field/Key:** `filter.status`
- **Source:** constant — `DAY_STATUS_FILTER_ORDER` + `DAY_STATUS_LABELS` (`lib/salary/day-ledger.ts:113,130`), filtered to statuses present in the month.
- **Component:** native select (local `Select` wrapper)
- **Type:** Single
- **Required:** No
- **Default:** "all" ("All statuses")
- **Searchable:** No
- **Static/Dynamic:** Static constants, but options narrowed to present values
- **Options:** "All statuses" + present of: "Full Day", "Overtime", "Half Day", "Absent", "Holiday", "Worked on Holiday", "Holiday Half Day", "Weekly Off", "Paid Leave", "Unpaid Leave", "Comp Off", "No Check-out", "Upcoming".
- **On-select behavior:** `onFilter({ ...filter, status })`.
- **Code locations:** `components/salary/daily-salary-report.tsx:335-343`; local Select `:396-427`.

### 37. Week filter (Daily Salary Report)
- **Module:** Salary
- **Screen:** Daily Salary Report FilterBar
- **Field/Key:** `filter.week`
- **Source:** dynamic — `ledger.weeks` (from `lib/salary/day-ledger.ts`).
- **Component:** native select (local wrapper)
- **Type:** Single
- **Required:** No
- **Default:** "all" ("All weeks")
- **Searchable:** No
- **Static/Dynamic:** Dynamic
- **Options:** "All weeks" + "Week N · <rangeLabel>" per week.
- **On-select behavior:** `onFilter({ ...filter, week })`.
- **Code locations:** `components/salary/daily-salary-report.tsx:345-356`.

### 38. Work type filter (Daily Salary Report)
- **Module:** Salary
- **Screen:** Daily Salary Report FilterBar (only when non-office places present)
- **Field/Key:** `filter.place`
- **Source:** constant — `WORK_PLACE_FILTER_ORDER` + `WORK_PLACE_LABELS` (`lib/salary/day-ledger.ts:183,190`).
- **Component:** native select (local wrapper)
- **Type:** Single
- **Required:** No
- **Default:** "all" ("All work types")
- **Searchable:** No
- **Static/Dynamic:** Static (narrowed to present places)
- **Options:** "All work types", `office` → "Office", `wfh` → "Work From Home", `field` → "On Field", `client_site` → "Client Site".
- **On-select behavior:** `onFilter({ ...filter, place })`.
- **Code locations:** `components/salary/daily-salary-report.tsx:358-369`.

### 39. Sort (Daily Salary Report)
- **Module:** Salary
- **Screen:** Daily Salary Report FilterBar
- **Field/Key:** `sort`
- **Source:** constant — `LEDGER_SORT_LABELS` (`lib/salary/day-ledger.ts:1355`).
- **Component:** native select (local wrapper)
- **Type:** Single
- **Required:** No
- **Default:** "date_asc"
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:**
  - `date_asc` → "Date — Oldest First"
  - `date_desc` → "Date — Newest First"
  - `hours_desc` → "Hours — Highest First"
  - `hours_asc` → "Hours — Lowest First"
  - `earned_desc` → "Earning — Highest First"
  - `earned_asc` → "Earning — Lowest First"
- **On-select behavior:** `onSort(v)`.
- **Code locations:** `components/salary/daily-salary-report.tsx:381-389`; consts `lib/salary/day-ledger.ts:1355-1362`.

### 40. Kind (Accountant adjustment)
- **Module:** Salary (CTC)
- **Screen:** CTC Breakup form (`/salary/ctc`) — Accountant Adjustments card
- **Field/Key:** `adjKind`
- **Source:** hardcoded
- **Component:** native select
- **Type:** Single
- **Required:** No (has default)
- **Default:** "deduct"
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** `deduct` → "Deduct (disciplinary)", `ex_gratia` → "Ex-gratia (add)"
- **On-select behavior:** `setAdjKind`.
- **Backend/API/DB:** `addAdjustment` (`app/(app)/salary/ctc/actions.ts`).
- **Code locations:** `components/salary/ctc-breakup-form.tsx:334-341`; state `:71`.

### 41. Employee (from salary profiles)
- **Module:** Salary (Exit Documents / Letters)
- **Screen:** Exit Documents workbench (`/letters`)
- **Field/Key:** `employeeId`
- **Source:** API/DB — `listSalaryProfiles()` → `exitEmployees` (employeeId, name, designation, entity).
- **Component:** native select
- **Type:** Single
- **Required:** No (name may be typed manually instead)
- **Default:** empty — option "— type manually below —"
- **Searchable:** No
- **Static/Dynamic:** Dynamic
- **Options:** "— type manually below —" (value "") + "Name · Entity" per employee.
- **On-select behavior:** `onPickEmployee(id)` fills name/designation/entity.
- **Dependencies:** `employees` prop.
- **Code locations:** `components/salary/exit-documents-workbench.tsx:206-218`; page data `app/(app)/letters/page.tsx:62-76`.

### 42. Paying entity (sets the signatory)
- **Module:** Salary (Exit Documents / Letters)
- **Screen:** Exit Documents workbench (`/letters`)
- **Field/Key:** `entity`
- **Source:** constant + DB — `SEED_ENTITIES` (`db/enums.ts:690`) merged with `payingEntityName` from salary profiles (deduped, sorted).
- **Component:** native select
- **Type:** Single
- **Required:** No
- **Default:** `entities[0] ?? "Altus Corp"`
- **Searchable:** No
- **Static/Dynamic:** Dynamic (constant seed + DB names)
- **Options:** entity names, e.g. "Altus Corp", "Unleashed", "IJV", "Khushboo", "MJV HUF", "JSV HUF", "Dharav Enterprises", "Colour Graphics", "Smita Raut", "Sunil Raut" (+ any profile entity).
- **On-select behavior:** `setEntity`; signatory resolves via `signatoryForEntity`.
- **Dependencies:** `entities` prop.
- **Code locations:** `components/salary/exit-documents-workbench.tsx:231-238`; source `app/(app)/letters/page.tsx:70-75`.

### 43. Person switcher (My Salary)
- **Module:** Salary / My Salary
- **Screen:** My Salary page — PageCommandBar (admins: everyone; managers: team)
- **Field/Key:** `?emp=<id>`
- **Source:** API/DB — `loadSalaryViewAccess()` → `access.people` (`lib/salary/salary-people.ts`).
- **Component:** other (custom portal listbox: button + `role="listbox"` + `role="option"`, client search)
- **Type:** Single
- **Required:** No
- **Default:** current person (self unless `?emp=` valid)
- **Searchable:** Yes (custom client filter by name)
- **Static/Dynamic:** Dynamic
- **Options:** people (name, avatar), "(you)" suffix on self.
- **Add/Edit/Delete behavior:** picker only; hidden when `scope === "self"`.
- **On-select behavior:** navigates `/my-salary?emp=<id>` (self → `/my-salary`).
- **Code locations:** `components/salary/salary-person-picker.tsx:95-163`; page `app/(app)/my-salary/page.tsx:89-96`.

---

# OUTSTANDING

### 44. Employees filter
- **Module:** Outstanding
- **Screen:** Outstanding Dashboard filter bar
- **Field/Key:** `?emp=` (comma-separated names)
- **Source:** API/DB — employee roster (`listEmployeeOptions()`), options by NAME.
- **Component:** MultiSelect
- **Type:** Multi
- **Required:** No
- **Default:** none — placeholder "All Employees"
- **Searchable:** Yes
- **Static/Dynamic:** Dynamic
- **Options:** employee names (value = name).
- **On-select behavior:** `setParam("emp", v)` → URL nav (auto-apply).
- **Backend/API/DB:** engine matches `responsibleName`.
- **Code locations:** `components/outstanding/dashboard/filter-bar.tsx:175-181`; options `:73-76`.

### 45. Entities filter
- **Module:** Outstanding
- **Screen:** Outstanding Dashboard filter bar
- **Field/Key:** `?entity=`
- **Source:** API/DB — `listOutstandingEntities()`, options by NAME.
- **Component:** MultiSelect
- **Type:** Multi
- **Required:** No
- **Default:** none — "All Entities"
- **Searchable:** Yes
- **Static/Dynamic:** Dynamic
- **Options:** entity names.
- **On-select behavior:** `setParam("entity", v)`.
- **Code locations:** `components/outstanding/dashboard/filter-bar.tsx:187-193`.

### 46. Cycles filter
- **Module:** Outstanding
- **Screen:** Outstanding Dashboard filter bar
- **Field/Key:** `?cycle=`
- **Source:** enum — `OUTSTANDING_CYCLES` + `OUTSTANDING_CYCLE_LABELS` (`db/enums.ts:610,618`), built as `CYCLE_OPTIONS` in `app/(app)/outstanding/page.tsx:40-43`.
- **Component:** MultiSelect
- **Type:** Multi
- **Required:** No
- **Default:** none — "All Cycles"
- **Searchable:** Yes
- **Static/Dynamic:** Static
- **Options:** `subscription` → "Subscription", `monthly_bill` → "Monthly Bill", `full_payment` → "Full Payment", `partial_payment` → "Partial Payment", `slabs` → "Slabs"
- **On-select behavior:** `setParam("cycle", v)`.
- **Code locations:** `components/outstanding/dashboard/filter-bar.tsx:199-205`.

### 47. Payment modes filter
- **Module:** Outstanding
- **Screen:** Outstanding Dashboard filter bar
- **Field/Key:** `?mode=`
- **Source:** API/DB — `listOutstandingPaymentModes()`, options by NAME.
- **Component:** MultiSelect
- **Type:** Multi
- **Required:** No
- **Default:** none — "All Modes"
- **Searchable:** Yes
- **Static/Dynamic:** Dynamic
- **Options:** payment-mode names.
- **On-select behavior:** `setParam("mode", v)`.
- **Code locations:** `components/outstanding/dashboard/filter-bar.tsx:211-217`.

### 48. Status filter
- **Module:** Outstanding
- **Screen:** Outstanding Dashboard filter bar
- **Field/Key:** `?status=` (derived installment state)
- **Source:** hardcoded `STATUS_OPTIONS` (`filter-bar.tsx:38-43`).
- **Component:** MultiSelect
- **Type:** Multi
- **Required:** No
- **Default:** none — "All Statuses"
- **Searchable:** Yes
- **Static/Dynamic:** Static
- **Options:** `overdue` → "Overdue", `due_soon` → "Due Soon (≤7 days)", `not_due` → "Not Due", `paid` → "Paid"
- **On-select behavior:** `setParam("status", v)`; engine matches derived `state`.
- **Code locations:** `components/outstanding/dashboard/filter-bar.tsx:223-229`.

### 49. Months filter
- **Module:** Outstanding
- **Screen:** Outstanding Dashboard filter bar
- **Field/Key:** `?month=` ("01".."12", any year)
- **Source:** hardcoded `MONTH_OPTIONS` (`filter-bar.tsx:47-50`).
- **Component:** MultiSelect
- **Type:** Multi
- **Required:** No
- **Default:** none — "All Months"
- **Searchable:** Yes
- **Static/Dynamic:** Static
- **Options:** January…December (value "01"…"12").
- **On-select behavior:** `setParam("month", v)`; engine matches `dueDate.slice(5,7)`.
- **Code locations:** `components/outstanding/dashboard/filter-bar.tsx:235-241`.

### 50. Year filter
- **Module:** Outstanding
- **Screen:** Outstanding Dashboard filter bar
- **Field/Key:** `?year=`
- **Source:** computed `yearOptions()` — current UTC year +2 through −3 (`filter-bar.tsx:54-61`).
- **Component:** MultiSelect
- **Type:** Multi
- **Required:** No
- **Default:** none — "All Years"
- **Searchable:** Yes
- **Static/Dynamic:** Dynamic (relative to current date)
- **Options:** years descending ("YYYY").
- **On-select behavior:** `setParam("year", v)`; engine matches `dueDate.slice(0,4)`.
- **Code locations:** `components/outstanding/dashboard/filter-bar.tsx:247-253`.

### 51. Product (New Outstanding Contract)
- **Module:** Outstanding
- **Screen:** New Outstanding Contract dialog
- **Field/Key:** `productId`
- **Source:** API/DB — `listOutstandingProducts()` (outstanding_products master).
- **Component:** Select
- **Type:** Single
- **Required:** Yes
- **Default:** empty — placeholder "— Select product —"
- **Searchable:** auto (>8 products)
- **Static/Dynamic:** Dynamic
- **Options:** products `{id, name}`.
- **Validation:** "Pick a product."
- **Code locations:** `components/outstanding/outstanding-form-dialog.tsx:383-389`.

### 52. Responsible Person (New Contract)
- **Module:** Outstanding
- **Screen:** New Outstanding Contract dialog
- **Field/Key:** `responsibleId`
- **Source:** API/DB — `listOutstandingResponsibles()`.
- **Component:** Select
- **Type:** Single
- **Required:** Yes
- **Default:** empty — placeholder "— Select person —"
- **Searchable:** Yes (`searchable`)
- **Static/Dynamic:** Dynamic
- **Options:** responsibles `{id, name}`.
- **Validation:** "Pick a responsible person."
- **Code locations:** `components/outstanding/outstanding-form-dialog.tsx:396-403`.

### 53. GST (New Contract)
- **Module:** Outstanding
- **Screen:** New Outstanding Contract dialog
- **Field/Key:** `gst`
- **Source:** hardcoded `GST_OPTIONS` (`outstanding-form-dialog.tsx:36-39`) — "the New Contract form offers only 0% / 18%".
- **Component:** Select
- **Type:** Single
- **Required:** Yes
- **Default:** "18"
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** `0` → "0 — No GST", `18` → "YES — 18%"
- **On-select behavior:** `setGst` + `resetConfirm()` (live total recomputes).
- **Code locations:** `components/outstanding/outstanding-form-dialog.tsx:425-434`; GST_OPTIONS `:36-39`.

### 54. Cycle (New Contract)
- **Module:** Outstanding
- **Screen:** New Outstanding Contract dialog
- **Field/Key:** `cycle`
- **Source:** enum — `OUTSTANDING_CYCLES` + labels (`CYCLE_OPTIONS` at `outstanding-form-dialog.tsx:41-44`).
- **Component:** Select
- **Type:** Single
- **Required:** Yes
- **Default:** empty — placeholder "— Select cycle —"
- **Searchable:** No (5 options)
- **Static/Dynamic:** Static
- **Options:** Subscription, Monthly Bill, Full Payment, Partial Payment, Slabs (keys as in #46).
- **On-select behavior:** sets cycle, clears confirmation; reveals cycle sub-form.
- **Validation:** "Pick a payment cycle."; sub-form must be confirmed before submit.
- **Code locations:** `components/outstanding/outstanding-form-dialog.tsx:447-456`.

### 55. Bill Date (New Contract — monthly_bill)
- **Module:** Outstanding
- **Screen:** New Outstanding Contract dialog — Monthly Bill cycle sub-form
- **Field/Key:** `billDate`
- **Source:** hardcoded `BILL_DATE_OPTIONS` (`outstanding-form-dialog.tsx:51-54`).
- **Component:** Select
- **Type:** Single
- **Required:** Yes
- **Default:** empty — placeholder "— Select bill date —"
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** "1", "3", "12", "21", "30" (value = label).
- **On-select behavior:** `setBillDate` + resetConfirm.
- **Code locations:** `components/outstanding/outstanding-form-dialog.tsx:687-693`.

### 56. Frequency (New Contract — subscription)
- **Module:** Outstanding
- **Screen:** New Outstanding Contract dialog — Subscription cycle sub-form
- **Field/Key:** `frequency`
- **Source:** enum — `SUBSCRIPTION_FREQUENCIES` + `SUBSCRIPTION_FREQUENCY_LABELS` (`db/enums.ts:628,635`; `FREQUENCY_OPTIONS` at `outstanding-form-dialog.tsx:46-49`).
- **Component:** Select
- **Type:** Single
- **Required:** Yes
- **Default:** empty — placeholder "— Select frequency —"
- **Searchable:** No (4 options)
- **Static/Dynamic:** Static
- **Options:** `10_days` → "10 Days", `15_days` → "15 Days", `30_days` → "30 Days", `weekly` → "Weekly"
- **On-select behavior:** `setFrequency` + resetConfirm.
- **Code locations:** `components/outstanding/outstanding-form-dialog.tsx:753-759`.

### 57. Entity (New Contract)
- **Module:** Outstanding
- **Screen:** New Outstanding Contract dialog — Payment Details
- **Field/Key:** `entityId`
- **Source:** API/DB — `listOutstandingEntities()`.
- **Component:** Select
- **Type:** Single
- **Required:** Yes
- **Default:** empty — placeholder "— Select entity —"
- **Searchable:** auto
- **Static/Dynamic:** Dynamic
- **Options:** entities `{id, name}`.
- **Validation:** "Pick an entity."
- **Code locations:** `components/outstanding/outstanding-form-dialog.tsx:533-539`.

### 58. Payment Mode (New Contract)
- **Module:** Outstanding
- **Screen:** New Outstanding Contract dialog — Payment Details
- **Field/Key:** `modeId`
- **Source:** API/DB — `listOutstandingPaymentModes()`.
- **Component:** Select
- **Type:** Single
- **Required:** Yes
- **Default:** empty — placeholder "— Select mode —"
- **Searchable:** auto
- **Static/Dynamic:** Dynamic
- **Options:** modes `{id, name}`.
- **Validation:** "Pick a payment mode."
- **Code locations:** `components/outstanding/outstanding-form-dialog.tsx:542-548`.

### 59. PDC Received (New Contract)
- **Module:** Outstanding
- **Screen:** New Outstanding Contract dialog — Payment Details
- **Field/Key:** `pdc`
- **Source:** hardcoded `YES_NO_OPTIONS` (`outstanding-form-dialog.tsx:56-59`).
- **Component:** Select
- **Type:** Single
- **Required:** Yes
- **Default:** empty — placeholder "— Select —"
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** `yes` → "Yes", `no` → "No"
- **Validation:** "Select whether a PDC was received."
- **Code locations:** `components/outstanding/outstanding-form-dialog.tsx:551-557`.

### 60. Client (Record a Collection)
- **Module:** Outstanding
- **Screen:** Record a Collection dialog
- **Field/Key:** `clientName`
- **Source:** API/DB — `listActiveClientNames()` (`lib/queries/clients.ts`).
- **Component:** Select
- **Type:** Single
- **Required:** Yes
- **Default:** empty — placeholder "— Select client —"
- **Searchable:** Yes (`searchable`)
- **Static/Dynamic:** Dynamic
- **Options:** active client names (string values).
- **Validation:** "Pick a client."
- **Code locations:** `components/outstanding/collection-form-dialog.tsx:123-130`.

### 61. Payment Mode (Collection)
- **Module:** Outstanding
- **Screen:** Record a Collection dialog
- **Field/Key:** `modeId`
- **Source:** API/DB — `listOutstandingPaymentModes()`.
- **Component:** Select
- **Type:** Single
- **Required:** Yes
- **Default:** empty — placeholder "— Select mode —"
- **Searchable:** auto
- **Static/Dynamic:** Dynamic
- **Options:** modes `{id, name}`.
- **Validation:** "Pick a payment mode."
- **Code locations:** `components/outstanding/collection-form-dialog.tsx:148-154`.

### 62. Responsible Person (Collection)
- **Module:** Outstanding
- **Screen:** Record a Collection dialog
- **Field/Key:** `responsibleId`
- **Source:** API/DB — `listOutstandingResponsibles()`.
- **Component:** Select
- **Type:** Single
- **Required:** Yes
- **Default:** empty — placeholder "— Select person —"
- **Searchable:** Yes (`searchable`)
- **Static/Dynamic:** Dynamic
- **Options:** responsibles `{id, name}`.
- **Validation:** "Pick a responsible person."
- **Code locations:** `components/outstanding/collection-form-dialog.tsx:160-167`.

### 63. Contract actions (row ⋮ menu)
- **Module:** Outstanding
- **Screen:** Manage Contracts (`/outstanding/contracts`) — each row
- **Field/Key:** (row action)
- **Source:** hardcoded items
- **Component:** DropdownMenu
- **Type:** Single (menu item)
- **Required:** No
- **Default:** n/a
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** "Edit", "Installments (N)" (N = `contract.installmentCount`), separator, "Close" (hidden when status closed), "Write Off" (danger; hidden when status written_off).
- **On-select behavior:** Edit → open EditContractDialog; Installments → InstallmentEditor; Close/Write Off → confirm dialog then `closeContract` / `writeOffContract`.
- **Code locations:** `components/outstanding/contract-list.tsx:214-259`.

### 64. Product (Edit Contract)
- **Module:** Outstanding
- **Screen:** Edit Contract dialog
- **Field/Key:** `productId`
- **Source:** API/DB — `listOutstandingProducts()`.
- **Component:** Select
- **Type:** Single
- **Required:** No (optional; nullable)
- **Default:** current contract's product
- **Searchable:** auto
- **Static/Dynamic:** Dynamic
- **Options:** products `{id, name}`.
- **Code locations:** `components/outstanding/contract-list.tsx:451-457`.

### 65. Entity (Edit Contract)
- **Module:** Outstanding
- **Screen:** Edit Contract dialog
- **Field/Key:** `entityId`
- **Source:** API/DB — `listOutstandingEntities()`.
- **Component:** Select
- **Type:** Single
- **Required:** No
- **Default:** current entity
- **Searchable:** auto
- **Static/Dynamic:** Dynamic
- **Options:** entities `{id, name}`.
- **Code locations:** `components/outstanding/contract-list.tsx:460-466`.

### 66. Responsible Person (Edit Contract)
- **Module:** Outstanding
- **Screen:** Edit Contract dialog
- **Field/Key:** `responsibleId`
- **Source:** API/DB — `listEmployeeOptions()` (employees roster).
- **Component:** Select
- **Type:** Single
- **Required:** No
- **Default:** current responsible
- **Searchable:** Yes (`searchable`)
- **Static/Dynamic:** Dynamic
- **Options:** employees `{id, name}`.
- **Code locations:** `components/outstanding/contract-list.tsx:469-476`.

### 67. Payment Mode (Edit Contract)
- **Module:** Outstanding
- **Screen:** Edit Contract dialog
- **Field/Key:** `modeId`
- **Source:** API/DB — `listOutstandingPaymentModes()`.
- **Component:** Select
- **Type:** Single
- **Required:** No
- **Default:** current `expectedModeId`
- **Searchable:** auto
- **Static/Dynamic:** Dynamic
- **Options:** modes `{id, name}`.
- **Code locations:** `components/outstanding/contract-list.tsx:479-485`.

### 68. GST (Edit Contract)
- **Module:** Outstanding
- **Screen:** Edit Contract dialog
- **Field/Key:** `gst`
- **Source:** enum — `GST_RATES` (`db/enums.ts:642`) via `GST_OPTIONS` (`contract-list.tsx:36-39`).
- **Component:** Select
- **Type:** Single
- **Required:** Yes
- **Default:** current contract's `gstRate` (initial state "18")
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** `0` → "0 - No GST", `5` → "5%", `12` → "12%", `18` → "18%", `28` → "28%"
- **Code locations:** `components/outstanding/contract-list.tsx:499-505`; GST_OPTIONS `:36-39`.

### 69. Cycle (Edit Contract)
- **Module:** Outstanding
- **Screen:** Edit Contract dialog
- **Field/Key:** `cycle`
- **Source:** enum — `OUTSTANDING_CYCLES` + labels (`CYCLE_OPTIONS` at `contract-list.tsx:31-34`).
- **Component:** Select
- **Type:** Single
- **Required:** Yes
- **Default:** current cycle
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** Subscription, Monthly Bill, Full Payment, Partial Payment, Slabs.
- **Validation:** "Pick a cycle."
- **On-select behavior:** `setCycle`; `isFullPayment` toggles Date vs Start Date + periods field.
- **Code locations:** `components/outstanding/contract-list.tsx:509-515`.

### 70. PDC Received (Edit Contract)
- **Module:** Outstanding
- **Screen:** Edit Contract dialog
- **Field/Key:** `pdc`
- **Source:** hardcoded `YES_NO_OPTIONS` (`contract-list.tsx:41-44`).
- **Component:** Select
- **Type:** Single
- **Required:** Yes
- **Default:** current contract's `pdcReceived` ("yes"/"no")
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** `yes` → "Yes", `no` → "No"
- **Code locations:** `components/outstanding/contract-list.tsx:541-547`.

---

# REIMBURSEMENTS

### 71. Sort
- **Module:** Reimbursements
- **Screen:** Reimbursements claims list toolbar (`/reimbursements`)
- **Field/Key:** `sort`
- **Source:** hardcoded `SORT_OPTIONS` (`rb-claims-list.tsx:84-89`).
- **Component:** Select
- **Type:** Single
- **Required:** No
- **Default:** "newest"
- **Searchable:** No (`searchable={false}`)
- **Static/Dynamic:** Static
- **Options:** `newest` → "Newest First", `oldest` → "Oldest First", `amount-desc` → "Amount · High → Low", `amount-asc` → "Amount · Low → High"
- **On-select behavior:** `setSort`.
- **Code locations:** `components/reimbursements/rb-claims-list.tsx:245-251`.

### 72. Approved (admin field)
- **Module:** Reimbursements
- **Screen:** Claim card → Admin panel (admin processing), rendered by shared `FieldInput` for `type === "select"`.
- **Field/Key:** `approved`
- **Source:** DB-driven form field — default `{ key:"approved", label:"Approved", type:"select", required:true, options:["Yes","No"] }` (`lib/forms/modules.ts:145`), overridable via admin Form Editor (`resolveFields`).
- **Component:** Select
- **Type:** Single
- **Required:** Yes
- **Default:** empty (unless claim already has the value)
- **Searchable:** No
- **Static/Dynamic:** Dynamic (DB-editable field def)
- **Options:** "Yes", "No" (defaults).
- **Backend/API/DB:** `module_submissions.admin_fields` JSON; `resolveFields` from `lib/forms/server.ts`.
- **Code locations:** field def `lib/forms/modules.ts:145`; render `components/forms/form-fields.tsx:85-95`; usage `components/reimbursements/rb-claims-list.tsx:551`.

### 73. Paid Through (admin field)
- **Module:** Reimbursements
- **Screen:** Claim card → Admin panel
- **Field/Key:** `paid_through`
- **Source:** DB-driven — default `options: PAID_THROUGH` (`lib/forms/modules.ts:147`, `PAID_THROUGH` at `:33`).
- **Component:** Select
- **Type:** Single
- **Required:** Yes
- **Default:** empty
- **Searchable:** No
- **Static/Dynamic:** Dynamic (DB-editable)
- **Options (defaults):** "98207 GPay", "Cash", "Bank Transfer"
- **Code locations:** `lib/forms/modules.ts:147` + `:33`.

### 74. Expense Head (admin field)
- **Module:** Reimbursements
- **Screen:** Claim card → Admin panel
- **Field/Key:** `expense_head`
- **Source:** DB-driven — default `options: EXPENSE_HEAD` (`lib/forms/modules.ts:148`, `EXPENSE_HEAD` at `:35-46`).
- **Component:** Select
- **Type:** Single
- **Required:** No
- **Default:** empty
- **Searchable:** auto (>8 options)
- **Static/Dynamic:** Dynamic (DB-editable)
- **Options (defaults):** "Conveyance", "Miscellaneous Expenses", "Printing & Stationery", "Repairs & Maintenance", "Staff Welfare", "Workshop Expenses", "Cell Phone Recharge", "Manan Sir Personal", "Suspense", "Other"
- **Code locations:** `lib/forms/modules.ts:148` + `:35-46`.

### 75. Tally Entity (admin field)
- **Module:** Reimbursements
- **Screen:** Claim card → Admin panel
- **Field/Key:** `tally_entity`
- **Source:** DB-driven — default `options: TALLY_ENTITY` (`lib/forms/modules.ts:150`, `TALLY_ENTITY` at `:48-56`).
- **Component:** Select
- **Type:** Single
- **Required:** No
- **Default:** empty
- **Searchable:** No (7 options)
- **Static/Dynamic:** Dynamic (DB-editable)
- **Options (defaults):** "Altus Corp", "Colour Graphics", "Dharav", "JSV HUF", "Khushboo Shah", "MJV HUF", "Unleashed"
- **Code locations:** `lib/forms/modules.ts:150` + `:48-56`.

---

# Related pickers — NOT dropdowns (excluded from count)
- **Team/User** and **Period** segmented controls (incentive analytics): `Segmented` in `components/incentive/ui/chrome.tsx:83`; `VIEW_OPTIONS` (Team/User) and `PERIOD_OPTIONS` (`PERIOD_KINDS`/`PERIOD_LABELS` from `lib/incentive/analytics/periods.ts:30-37`) in `components/incentive/analytics/incentive-analytics-dashboard.tsx:64-69,157,165`.
- **Year picker** on `/incentive` and `/billing` is a row of `<Link>` pills, not a select (`app/(app)/incentive/page.tsx:178-204`, `app/(app)/billing/page.tsx:85-104`).
- **SalaryMonthPicker** (button grid + prev/next) — `components/salary/salary-month-picker.tsx` (not a dropdown).
- **Client Permission to Publish** (incentive `client_permission`) is rendered as radio buttons (`control: "radio"`), options "Yes"/"No" (`lib/incentive-fields.ts:166-174`).
- **Reimbursement request "Product Name"** (`type: "product"`) renders as `ProductButtons`, not a dropdown (`components/forms/form-fields.tsx:47-56`).
- **Reimbursement status chips / KPI cards** are buttons (filter context), not dropdowns (`rb-claims-list.tsx:192-216`, `rb-kpi-strip.tsx`).

# Enum/constant usage notes (db/enums.ts)
- `INCENTIVE_DURATIONS` / `INCENTIVE_DURATION_LABELS` (`db/enums.ts:538-544`) feed the **admin** Incentive Master screen (`components/admin/incentive-master/workspace.tsx:533`) — outside this slice's scope, but a dropdown exists there.
- `OUTSTANDING_STATUSES` / `OUTSTANDING_STATUS_LABELS` (`:575-588`), `OUTSTANDING_CONTRACT_STATUS` (`:650`), `INSTALLMENT_STATES` (`:658`), `GST_FORM_RATES` (`:648`), `OUTSTANDING_OVERDUE_BUCKETS` (`:662`) are **defined but not rendered as dropdowns** anywhere in the audited slice. `GST_FORM_RATES` is validation-only (`lib/validators/outstanding.ts:129,170`); `OUTSTANDING_OVERDUE_BUCKETS` drives bucket labels (`lib/outstanding/buckets.ts`), not a select.
- `SEED_RESPONSIBLES` / `SEED_ENTITIES` / `SEED_PRODUCTS` / `SEED_PAYMENT_MODES` (`db/enums.ts:676-777`) are seed data; only `SEED_ENTITIES` surfaces in a dropdown (Exit Documents "Paying entity", #42). The live rosters are served from DB via `lib/queries/outstanding-rosters.ts`.
- `INCENTIVE_STATUSES`/`INCENTIVE_STATUS_LABELS` feed the Requests "Status" filter (#17); `SUBSCRIPTION_FREQUENCIES`/labels feed #56; `OUTSTANDING_CYCLES`/labels feed #46, #54, #69; `GST_RATES` feeds #68.

# Totals
- **Distinct dropdowns: 75**

### 3.5 — Goals / Appraisal / PMS / KPI / ECOS / Events / Training

# Slice 5 — Goals / Appraisal / PMS / KPI / Weekly-Goals / DCC / ECOS / Events / Holidays / Training / Communications — Dropdown & Option-Picker Audit

Read-only audit. Exact strings preserved. `UNKNOWN — NEEDS REVIEW` where not determinable.

Shared primitives (referenced throughout):
- `components/ui/select.tsx` — `Select` (single, Popover+cmdk, searchable auto when `options.length > 8` or `searchable` set; Tab commits; red check on selected).
- `components/ui/multi-select.tsx` — `MultiSelect` (multi, always has a search box; checkboxes; Clear).
- `components/ui/lookup-select.tsx` — `LookupSelect` (single, searchable, optional inline "+ Add new" / per-row trash).
- `components/goals/board/goal-lookup-select.tsx` — `GoalLookupSelect` (custom Popover combobox, searchable when >8 options, admin inline add/delete).
- `components/weekly-goals/field-controls.tsx` — `ComboInput` (type-ahead combobox, free text allowed), `PriorityPicker` (native select).

---

# GOALS MODULE

### Area (GoalLookupSelect — kind "area")
- **Module:** Goals
- **Screen:** Goal composer (BoardQuickAdd), level-board inline table Area cell, Review table (no — review uses Type), Weekly board
- **Field/Key:** `goals.area` / GoalLookupSelect kind `"area"`
- **Source:** constant (BASE_AREAS) + database (goal_lookups admin-added, merged) + subject policy
- **Component:** other (GoalLookupSelect custom Popover combobox)
- **Type:** Single
- **Required:** No (nullable)
- **Default:** `""` (placeholder "Choose an area" / "Area")
- **Searchable:** Yes (auto when >8 options)
- **Static/Dynamic:** Dynamic (base static + admin-added DB rows; hidden base options removed)
- **Options:** Base = `Sales, Collection, Marketing, Finances, App Devp, BSS App, PS, BSS, Altus Conclave, Handholding, Systems, Operations, Health, Learning, Self Devp, Training, Finance, Accounts, Admin, Renovation, Strategy, Family` + any admin-added `goal_lookups` rows (kind `area`) + subject policy (adds "Altus Ecosystem"; suppresses "WMS"/"WMS App")
- **Add/Edit/Delete behavior:** Admin can inline "+ Add Area" (persists via `addGoalLookup`) and delete any option (base options hidden server-side, not hard-deleted)
- **Validation:** None client-side (server persists free text; dedupe case-insensitive)
- **On-select behavior:** `onChange(value)` commits to the goal row (optimistic in table)
- **Dependencies:** `lib/goals/lookups.ts` `listGoalLookups()`; `lib/tasks/subject-options.ts`
- **Backend/API/DB:** `goal_lookups` table (migration 0148); action `addGoalLookup`/`removeGoalLookup` (`app/(app)/goals/cascade/actions.ts`)
- **Special rules:** Base options never hard-deletable; admins can hide base options.
- **Code locations:** `components/goals/board/goal-lookup-select.tsx` (definition); usages: `components/goals/board/board-quick-add.tsx:403`, `components/goals/board/goal-table-view.tsx:2533`

### Measure (GoalLookupSelect — kind "measure")
- **Module:** Goals
- **Screen:** Goal composer, inline table Measure cell, bulk grid
- **Field/Key:** `goals.uom` / kind `"measure"`
- **Source:** constant (BASE_MEASURES) + database (goal_lookups)
- **Component:** other (GoalLookupSelect)
- **Type:** Single
- **Required:** No
- **Default:** `""` (placeholder "Choose a measure" / "Measure")
- **Searchable:** Yes (auto >8)
- **Static/Dynamic:** Dynamic
- **Options:** Base = `Rs., Seats, Nos., Yes/No, NA` + admin-added
- **Add/Edit/Delete behavior:** Admin inline add/delete (same as Area)
- **Validation:** None
- **On-select behavior:** commits `uom`
- **Dependencies:** `listGoalLookups()`
- **Backend/API/DB:** `goal_lookups`
- **Special rules:** —
- **Code locations:** `components/goals/board/goal-lookup-select.tsx`; `components/goals/board/board-quick-add.tsx:416`, `components/goals/board/goal-table-view.tsx:2608`

### Type (GoalLookupSelect — kind "type")
- **Module:** Goals
- **Screen:** Goal composer Type field, Review table Category cell
- **Field/Key:** `goals.category` / kind `"type"`
- **Source:** constant (BASE_TYPES) + database
- **Component:** other (GoalLookupSelect)
- **Type:** Single
- **Required:** No (defaults "Goal" in composer)
- **Default:** composer `"Goal"`; table `""`
- **Searchable:** Yes (auto >8)
- **Static/Dynamic:** Dynamic
- **Options:** Base = `Goal, Target, Milestone, Operational` + admin-added
- **Add/Edit/Delete behavior:** Admin inline add/delete
- **Validation:** None
- **On-select behavior:** commits `category`; Review table calls `setGoalCategory`
- **Dependencies:** `listGoalLookups()`
- **Backend/API/DB:** `goal_lookups`; `setGoalCategory` action
- **Special rules:** Review table uses `isAdmin={false}` (no add/delete)
- **Code locations:** `components/goals/board/goal-lookup-select.tsx`; `components/goals/board/board-quick-add.tsx:429`, `components/goals/review/review-table.tsx:199`

### Goal Type (GoalLookupSelect — kind "goaltype")
- **Module:** Goals
- **Screen:** Level-board inline table Type cell
- **Field/Key:** `goals.goal_type` / kind `"goaltype"`
- **Source:** constant (GOAL_TYPES labels) / constant (QUARTER_TYPE_OPTIONS) / database (admin-added)
- **Component:** other (GoalLookupSelect)
- **Type:** Single
- **Required:** No
- **Default:** `""` (placeholder "Type")
- **Searchable:** Yes (auto >8)
- **Static/Dynamic:** Dynamic
- **Options:** full = `KPI, Strategic, Operational, Essential` (+ admin-added custom goaltypes); simplified board = `Incentive, KPI, Strategic, Operational` (QUARTER_TYPE_OPTIONS)
- **Add/Edit/Delete behavior:** Admin inline add/delete when `goaltypeOptions` supplied (non-simplified)
- **Validation:** None
- **On-select behavior:** commits `goal_type` (parsed through `grid.commit("type", …)`)
- **Dependencies:** `GOAL_TYPES`/`GOAL_TYPE_LABELS` (`db/enums.ts`), `listGoalLookups()`
- **Backend/API/DB:** `goal_lookups` kind `goaltype`
- **Special rules:** Legacy `branding` type renders blank (GOAL_TYPE_LABELS ?? "")
- **Code locations:** `components/goals/board/goal-table-view.tsx:2725` (options consts at `:1874`, `:1880`)

### Viewing (ViewingSelect)
- **Module:** Goals
- **Screen:** Yearly / Quarterly / Monthly / Weekly / Review & Scores headers
- **Field/Key:** viewed employee id (URL `?emp=`)
- **Source:** database (roster of employees)
- **Component:** Select
- **Type:** Single
- **Required:** Yes (always a person)
- **Default:** current viewer (seeded if not in roster)
- **Searchable:** Yes
- **Static/Dynamic:** Dynamic
- **Options:** roster `{id, name}`, "(me)" suffixed for signed-in user
- **Add/Edit/Delete behavior:** None
- **Validation:** None
- **On-select behavior:** `onChange(employeeId)` — caller updates URL/state
- **Dependencies:** `RosterMember[]` from server
- **Backend/API/DB:** employees roster query
- **Special rules:** Label prop defaults "Viewing" (Review says "Reviewing"); falls back to viewedName if value not in roster
- **Code locations:** `components/goals/shared/viewing-select.tsx` (definition)

### Team-Involved (TeamPicker — MultiSelect)
- **Module:** Goals
- **Screen:** Goal edit dialog "Team involved"
- **Field/Key:** `goals.team_involved`
- **Source:** database (roster)
- **Component:** MultiSelect
- **Type:** Multi
- **Required:** No
- **Default:** `[]`
- **Searchable:** Yes
- **Static/Dynamic:** Dynamic
- **Options:** roster names
- **Add/Edit/Delete behavior:** None
- **Validation:** None
- **On-select behavior:** stores employeeIds
- **Dependencies:** roster
- **Backend/API/DB:** employees
- **Special rules:** Free-text names from imports stay selectable
- **Code locations:** `components/goals/cascade/team-picker.tsx:32`; used in `components/goals/cascade/goal-edit-dialog.tsx:303`

### Team members — add from roster (local Select in goal-board-card)
- **Module:** Goals
- **Screen:** Goal edit drawer "Team involved" (card)
- **Field/Key:** `goals.team_involved`
- **Source:** database (roster)
- **Component:** Select
- **Type:** Single (adds one at a time; chips accumulate)
- **Required:** No
- **Default:** placeholder "Add from team…"
- **Searchable:** Yes
- **Static/Dynamic:** Dynamic
- **Options:** roster names
- **Add/Edit/Delete behavior:** chip remove; free-text add
- **Validation:** duplicate guard (id or name)
- **On-select behavior:** `add({employeeId, name})` to team
- **Dependencies:** roster
- **Backend/API/DB:** employees
- **Special rules:** Also a free-text "Or type a name…" input beside it
- **Code locations:** `components/goals/board/goal-board-card.tsx:1372`

### Team Members & Weights (TeamWeightsField)
- **Module:** Goals
- **Screen:** Goal composer / weekly composer "Team Members"
- **Field/Key:** `goals.team_involved` (with per-member `weight`)
- **Source:** database (roster)
- **Component:** other (Popover list picker)
- **Type:** Multi
- **Required:** No
- **Default:** `[]`
- **Searchable:** Yes (local search box)
- **Static/Dynamic:** Dynamic
- **Options:** roster names; each with editable weight (0–1000)
- **Add/Edit/Delete behavior:** toggle add/remove; per-member weight input
- **Validation:** weight clamped 0–1000
- **On-select behavior:** appends `{employeeId, name, weight:100}`
- **Dependencies:** roster
- **Backend/API/DB:** employees
- **Special rules:** shows "Total member weight"
- **Code locations:** `components/goals/board/team-weights-field.tsx` (definition); `components/goals/board/board-quick-add.tsx:515`, `components/goals/weekly/weekly-cascade-board.tsx:1225`

### Project (ProjectTagFields)
- **Module:** Goals
- **Screen:** Goal composer / weekly composer "Part of Project?"
- **Field/Key:** `goals.project_node_id`
- **Source:** database (project_nodes kind 'project')
- **Component:** native select
- **Type:** Single
- **Required:** No (only shown when "Part of Project? = Yes")
- **Default:** `""` ("— select a project —")
- **Searchable:** No
- **Static/Dynamic:** Dynamic
- **Options:** projects list; leading `— select a project —`
- **Add/Edit/Delete behavior:** None (projects created in Projects module)
- **Validation:** None
- **On-select behavior:** sets `projectNodeId`
- **Dependencies:** `projects` prop
- **Backend/API/DB:** project_nodes
- **Special rules:** shown only if `isProject`; empty list shows hint "No projects yet…"
- **Code locations:** `components/goals/board/project-tag-fields.tsx:90`

### Vendor (ProjectTagFields)
- **Module:** Goals
- **Screen:** Goal composer "…and the vendor if relevant"
- **Field/Key:** `goals.vendor_id`
- **Source:** database (vendors master, migration 0184)
- **Component:** native select
- **Type:** Single
- **Required:** No
- **Default:** `""` ("— none —")
- **Searchable:** No
- **Static/Dynamic:** Dynamic
- **Options:** vendors list; leading `— none —`
- **Add/Edit/Delete behavior:** None
- **Validation:** None
- **On-select behavior:** sets `vendorId`
- **Dependencies:** `vendors` prop
- **Backend/API/DB:** vendors
- **Special rules:** shown only if `isProject`
- **Code locations:** `components/goals/board/project-tag-fields.tsx:113`

### Bulk Grid — Area / Measure / Type (native selects, one per row)
- **Module:** Goals
- **Screen:** Goals Bulk-entry grid (spreadsheet)
- **Field/Key:** `area` / `uom` / `category`
- **Source:** constant + DB (same options as composer)
- **Component:** native select
- **Type:** Single
- **Required:** No
- **Default:** `""` ("—")
- **Searchable:** No
- **Static/Dynamic:** Dynamic (options passed in)
- **Options:** `—` + areaOptions / measureOptions / typeOptions
- **Add/Edit/Delete behavior:** None (grid rows add/remove)
- **Validation:** None (proceed filters non-empty)
- **On-select behavior:** writes cell
- **Dependencies:** options props
- **Backend/API/DB:** goal_lookups
- **Special rules:** keyboard-first spreadsheet; paste from Excel supported
- **Code locations:** `components/goals/board/goals-bulk-grid.tsx:307` (COLS at `:55`)

### Bulk Grid — Delegate (DelegatePicker)
- **Module:** Goals
- **Screen:** Goals Bulk grid "Delegated" column
- **Field/Key:** `delegatedTo` per row
- **Source:** database (roster)
- **Component:** other (portal Popover type-to-search)
- **Type:** Multi
- **Required:** No
- **Default:** `[]`
- **Searchable:** Yes (type-a-name)
- **Static/Dynamic:** Dynamic
- **Options:** roster names (filtered, slice 100)
- **Add/Edit/Delete behavior:** add chip (auto even-split %), editable %, remove
- **Validation:** % clamped 0–100
- **On-select behavior:** adds delegate with even-split weight
- **Dependencies:** roster
- **Backend/API/DB:** employees
- **Special rules:** —
- **Code locations:** `components/goals/board/goals-bulk-grid.tsx:76`

### Category (goal-board-card Select)
- **Module:** Goals
- **Screen:** Goal edit drawer "Category"
- **Field/Key:** `goals.category`
- **Source:** constant (GOAL_CATEGORIES)
- **Component:** Select
- **Type:** Single
- **Required:** No (but always set)
- **Default:** current category
- **Searchable:** No (`searchable={false}`)
- **Static/Dynamic:** Static
- **Options:** `target`→"Quarter Target", `milestone`→"Milestone", `operational`→"Operational", `goal`→"Goal"
- **Add/Edit/Delete behavior:** None
- **Validation:** None
- **On-select behavior:** `setGoalCategory`
- **Dependencies:** `GOAL_CATEGORIES` (`components/goals/cascade/util.ts:337`), `categoryStyle()`
- **Backend/API/DB:** `setGoalCategory` action
- **Special rules:** spillover shows "Spillover"
- **Code locations:** `components/goals/board/goal-board-card.tsx:822`

### Monthly Master (MonthlyMasterField Select)
- **Module:** Goals
- **Screen:** Goal edit drawer "Monthly Master"
- **Field/Key:** `goals.monthly_master_ref` (snapshot {kind,id,label})
- **Source:** API (server action `listGoalMasterPickables`)
- **Component:** Select
- **Type:** Single
- **Required:** No
- **Default:** `""` (placeholder "Pick an event / task…")
- **Searchable:** Yes
- **Static/Dynamic:** Dynamic (fetched on open; cached)
- **Options:** `Obligation · <label>` / `Batch · <label>`
- **Add/Edit/Delete behavior:** unlink (X on chip)
- **Validation:** None
- **On-select behavior:** commits `{kind, id, label}`
- **Dependencies:** Monthly Events Master obligations/batches
- **Backend/API/DB:** `listGoalMasterPickables` (server)
- **Special rules:** chip renders without re-join; cached module-level
- **Code locations:** `components/goals/board/goal-board-card.tsx:1192`

### Incentive Type (IncentiveField Select)
- **Module:** Goals
- **Screen:** Goal edit drawer "Incentive"
- **Field/Key:** `goals.incentive_kind`
- **Source:** constant (INCENTIVE_KIND_OPTIONS)
- **Component:** Select
- **Type:** Single
- **Required:** No (only when incentive enabled)
- **Default:** `""` (placeholder "Choose type…")
- **Searchable:** No (`searchable={false}`)
- **Static/Dynamic:** Static
- **Options:** `one_time`→"One-time", `repetitive`→"Repetitive / Recurring", `milestone`→"Milestone"
- **Add/Edit/Delete behavior:** None
- **Validation:** None
- **On-select behavior:** commits `incentiveKind`
- **Dependencies:** incentive Yes/No toggle
- **Backend/API/DB:** `editGoal` (incentiveKind)
- **Special rules:** —
- **Code locations:** `components/goals/board/goal-board-card.tsx:1292` (options const `:1223`)

### Goal ⋯ menu (MoreMenu DropdownMenu)
- **Module:** Goals
- **Screen:** Goal card / kanban card actions
- **Field/Key:** n/a (actions)
- **Source:** hardcoded action list (gated by policy/permissions)
- **Component:** DropdownMenu
- **Type:** Single action
- **Required:** No
- **Default:** —
- **Searchable:** No
- **Static/Dynamic:** Static (items filtered by policy)
- **Options:** "Mark as done", "Bring back"/"Set aside", "Move to another period", "Also add to a period…", "Split into …", "Delete"
- **Add/Edit/Delete behavior:** —
- **Validation:** —
- **On-select behavior:** fires action
- **Dependencies:** `GoalPolicy`, `canWrite`
- **Backend/API/DB:** various actions
- **Special rules:** "Delete" is danger-styled
- **Code locations:** `components/goals/board/goal-board-card.tsx:1038` (items `:222`)

### Move-to / Copy-to Bucket (MoveGoalDrawer Select + Level buttons)
- **Module:** Goals
- **Screen:** "Move to…" and "Also add to…" drawers
- **Field/Key:** target period/level/key
- **Source:** computed (FY calendar helpers)
- **Component:** Select (bucket) + button group (level)
- **Type:** Single
- **Required:** Yes (valid key required to save)
- **Default:** goal's own level/key; smart default on level hop
- **Searchable:** Yes (week/month levels only)
- **Static/Dynamic:** Dynamic
- **Options:** Level = `Year, Quarter, Month, Week, Day`; Bucket = periods of chosen level (quarters `2026-Q1…`, months `2026-04…`, weeks `W1 · …`, year `2026`; day → DateInput)
- **Add/Edit/Delete behavior:** —
- **Validation:** `keyShapeOk` (week/day need `YYYY-MM-DD`)
- **On-select behavior:** sets level/key; commit moves/copies
- **Dependencies:** `lib/goals/types.ts`, `lib/goals/fy-calendar.ts`, policy `canRehomeLevel`
- **Backend/API/DB:** `moveGoalToPeriod`, `moveGoalToLevel`, `moveGoalAcross`, `copyGoalToPeriod`, `undoConvertGoal`
- **Special rules:** cross-level move to week/day converts goal
- **Code locations:** `components/goals/board/goal-board-card.tsx:1710` (MOVE_LEVELS `:1428`, `moveBucketsOf` `:1468`)

### Status (StatusCell Select)
- **Module:** Goals
- **Screen:** Level-board inline table Status column
- **Field/Key:** goal status (derived)
- **Source:** enum (`ADMIN_TASK_STATUSES` / `USER_TASK_STATUSES`) + local STATUS_LABEL
- **Component:** Select (unstyled)
- **Type:** Single
- **Required:** No (falls back "not_started")
- **Default:** current value (or `not_started`)
- **Searchable:** No
- **Static/Dynamic:** Static (list depends on admin vs user)
- **Options:** admin = `dont_know`→"Not assessed", `not_started`→"Not started", `initiated`→"In progress", `follow_up`→"Follow-up", `on_hold`→"On hold", `need_info`→"Need info", `done`→"Done", `approved`→"Approved", `not_approved`→"Not approved", `cancelled`→"Cancelled", `transferred`→"Transferred"; user = same minus approval verdicts/on_hold (per USER_TASK_STATUSES). Current out-of-set value is prepended.
- **Add/Edit/Delete behavior:** None
- **Validation:** None
- **On-select behavior:** `onCommit(status)`
- **Dependencies:** `isAdmin`
- **Backend/API/DB:** task status enums (`db/enums.ts`)
- **Special rules:** legacy value kept visible
- **Code locations:** `components/goals/board/goal-table-view.tsx:438` (STATUS_LABEL `:378`)

### Reviewer (ReviewerCell Select)
- **Module:** Goals
- **Screen:** Level-board inline table Reviewer column
- **Field/Key:** `goals.reviewed_by_id`
- **Source:** database (roster) + hardcoded "No reviewer"
- **Component:** Select (unstyled)
- **Type:** Single
- **Required:** No
- **Default:** `__none__` ("No reviewer")
- **Searchable:** Yes
- **Static/Dynamic:** Dynamic
- **Options:** `No reviewer` + roster names
- **Add/Edit/Delete behavior:** None
- **Validation:** None
- **On-select behavior:** nulls or sets `reviewedById`
- **Dependencies:** roster
- **Backend/API/DB:** `goals.reviewed_by_id`
- **Special rules:** REVIEWER_NONE = `__none__`
- **Code locations:** `components/goals/board/goal-table-view.tsx:483`

### Team Members cell (TeamMembersCell Popover)
- **Module:** Goals
- **Screen:** Level-board table Team column
- **Field/Key:** `goals.team_involved`
- **Source:** database (roster)
- **Component:** other (Popover list, type-to-filter)
- **Type:** Multi
- **Required:** No
- **Default:** `null`
- **Searchable:** Yes
- **Static/Dynamic:** Dynamic
- **Options:** roster names; each with `wt` weight input (0–1000)
- **Add/Edit/Delete behavior:** toggle; weight edit
- **Validation:** weight clamp 0–1000
- **On-select behavior:** commit team array
- **Dependencies:** roster
- **Backend/API/DB:** employees
- **Special rules:** hover shows chip preview
- **Code locations:** `components/goals/board/goal-table-view.tsx:575`

### Bulk + Members (BulkMembers Popover)
- **Module:** Goals
- **Screen:** Table bulk-actions bar
- **Field/Key:** applies `team_involved` to selected goals
- **Source:** database (roster)
- **Component:** other (Popover checklist)
- **Type:** Multi
- **Required:** No
- **Default:** `[]`
- **Searchable:** No (plain list)
- **Static/Dynamic:** Dynamic
- **Options:** roster names + weight input
- **Add/Edit/Delete behavior:** toggle + "Apply to N goals"
- **Validation:** weight clamp 0–1000
- **On-select behavior:** apply
- **Dependencies:** roster
- **Backend/API/DB:** bulk edit action
- **Special rules:** —
- **Code locations:** `components/goals/board/goal-table-view.tsx:808`

### Delegated cell (DelegatesCell Popover)
- **Module:** Goals
- **Screen:** Level-board table Delegated column
- **Field/Key:** `goals.delegated_to` (with pct)
- **Source:** database (roster)
- **Component:** other (Popover, type-to-filter)
- **Type:** Multi
- **Required:** No
- **Default:** `null`
- **Searchable:** Yes
- **Static/Dynamic:** Dynamic
- **Options:** roster names; `%` input (0–100)
- **Add/Edit/Delete behavior:** toggle; pct edit; hover preview remove
- **Validation:** pct clamp 0–100
- **On-select behavior:** commit delegates
- **Dependencies:** roster
- **Backend/API/DB:** `goals.delegated_to`
- **Special rules:** delegation surfaces goal on delegate's board
- **Code locations:** `components/goals/board/goal-table-view.tsx:930`

### Bulk + Delegate (BulkDelegate Popover)
- **Module:** Goals
- **Screen:** Table bulk-actions bar
- **Field/Key:** applies `delegated_to` to selected goals
- **Source:** database (roster)
- **Component:** other (Popover checklist)
- **Type:** Multi
- **Required:** No
- **Default:** `[]`
- **Searchable:** No
- **Static/Dynamic:** Dynamic
- **Options:** roster names; `%` input
- **Add/Edit/Delete behavior:** toggle + "Delegate N goals"
- **Validation:** pct clamp 0–100
- **On-select behavior:** apply
- **Dependencies:** roster
- **Backend/API/DB:** bulk action
- **Special rules:** —
- **Code locations:** `components/goals/board/goal-table-view.tsx:1216`

### Copy to (CopyToMenu Popover)
- **Module:** Goals
- **Screen:** Table bulk-actions bar
- **Field/Key:** copy targets (child periods)
- **Source:** computed (`childMapping()`)
- **Component:** other (Popover checkable list)
- **Type:** Multi
- **Required:** No
- **Default:** none picked
- **Searchable:** No
- **Static/Dynamic:** Dynamic
- **Options:** child periods — year→`Q1..Q4` (sub "Apr–Jun"…), quarter→months, month→`Week 1..N`, week→`Mon..Sun`
- **Add/Edit/Delete behavior:** —
- **Validation:** none (disabled until ≥1)
- **On-select behavior:** `onCopy(keys)`
- **Dependencies:** level/periodKey
- **Backend/API/DB:** `bulkCopyGoalsToPeriod`
- **Special rules:** duplicate-collision dialog after
- **Code locations:** `components/goals/board/goal-table-view.tsx:1494`

### Move to (MoveToMenu Popover)
- **Module:** Goals
- **Screen:** Table bulk-actions bar
- **Field/Key:** sibling bucket target
- **Source:** computed (`siblingTargets()`)
- **Component:** other (Popover list)
- **Type:** Single
- **Required:** No
- **Default:** —
- **Searchable:** No
- **Static/Dynamic:** Dynamic
- **Options:** sibling period keys (e.g. Q2/Q3 for a Q1 goal)
- **Add/Edit/Delete behavior:** —
- **Validation:** —
- **On-select behavior:** `onMove(key,label)`
- **Dependencies:** level/periodKey
- **Backend/API/DB:** `moveGoalToPeriod`
- **Special rules:** —
- **Code locations:** `components/goals/board/goal-table-view.tsx:1583`

### Bulk Status (BulkStatusMenu Popover)
- **Module:** Goals
- **Screen:** Table bulk-actions bar
- **Field/Key:** bulk % done (sets status)
- **Source:** hardcoded (STATUS_PRESETS)
- **Component:** other (Popover list)
- **Type:** Single
- **Required:** No
- **Default:** —
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** `0% Not started`, `50% In progress`, `100% Done`
- **Add/Edit/Delete behavior:** —
- **Validation:** —
- **On-select behavior:** sets pct on selected goals
- **Dependencies:** —
- **Backend/API/DB:** bulk set pct
- **Special rules:** —
- **Code locations:** `components/goals/board/goal-table-view.tsx:1639` (presets `:1633`)

### Sort (goals-level-board Select)
- **Module:** Goals
- **Screen:** Level board toolbar
- **Field/Key:** sort key (local)
- **Source:** constant (SORT_OPTIONS)
- **Component:** Select (unstyled)
- **Type:** Single
- **Required:** No (default "position")
- **Default:** `position` ("Sr. No.")
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** `Sr. No.` / `Score high → low` / `Score low → high` / `At-risk first` / `A → Z`
- **Add/Edit/Delete behavior:** —
- **Validation:** —
- **On-select behavior:** re-sorts list
- **Dependencies:** —
- **Backend/API/DB:** —
- **Special rules:** sorting pauses drag-reorder
- **Code locations:** `components/goals/board/goals-level-board.tsx:1482` (SORT_OPTIONS `:144`)

### Areas filter (MultiPickFilter)
- **Module:** Goals
- **Screen:** Level board + Weekly board toolbar
- **Field/Key:** area filter (local Set)
- **Source:** constant + DB (areaOptions)
- **Component:** other (Popover checklist pill)
- **Type:** Multi
- **Required:** No
- **Default:** empty ("All Areas")
- **Searchable:** No
- **Static/Dynamic:** Dynamic
- **Options:** areaOptions strings
- **Add/Edit/Delete behavior:** toggle + Clear
- **Validation:** —
- **On-select behavior:** filters list
- **Dependencies:** areaOptions
- **Backend/API/DB:** —
- **Special rules:** —
- **Code locations:** `components/goals/board/goals-level-board.tsx:1893` (usage `:1497`); weekly `components/goals/weekly/weekly-cascade-board.tsx:620`

### Types filter (MultiPickFilter)
- **Module:** Goals
- **Screen:** Level board + Weekly board toolbar
- **Field/Key:** type filter (local Set)
- **Source:** constant (QUARTER_TYPE_OPTIONS)
- **Component:** other (Popover checklist pill)
- **Type:** Multi
- **Required:** No
- **Default:** empty ("All Types")
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** `Incentive, KPI, Strategic, Operational`
- **Add/Edit/Delete behavior:** toggle + Clear
- **Validation:** —
- **On-select behavior:** filters list
- **Dependencies:** —
- **Backend/API/DB:** —
- **Special rules:** —
- **Code locations:** `components/goals/board/goals-level-board.tsx:1498`; weekly `:622`

### Rows per page (Select)
- **Module:** Goals
- **Screen:** Level board + Weekly board toolbar
- **Field/Key:** pagination size (local)
- **Source:** hardcoded
- **Component:** Select (unstyled)
- **Type:** Single
- **Required:** No
- **Default:** 25
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** `25, 50, 100, All`
- **Add/Edit/Delete behavior:** —
- **Validation:** —
- **On-select behavior:** sets rowsPerPage
- **Dependencies:** —
- **Backend/API/DB:** —
- **Special rules:** —
- **Code locations:** `components/goals/board/goals-level-board.tsx:1508`; weekly `components/goals/weekly/weekly-cascade-board.tsx:630`

### Columns (ColumnsPicker)
- **Module:** Goals
- **Screen:** Level board + Weekly board toolbar
- **Field/Key:** visible/order columns (local, persisted)
- **Source:** constant (REORDERABLE_COLUMNS)
- **Component:** other (Popover checklist + drag reorder)
- **Type:** Multi (visibility)
- **Required:** No
- **Default:** all visible
- **Searchable:** No
- **Static/Dynamic:** Static (list fixed; order draggable)
- **Options:** `Measure, Actual, Team %, Delegated, Owner, Type, Notes` (pickable) + structural non-pickable `#, Area, Goal, Target, % Done, Target Date, Days Left`
- **Add/Edit/Delete behavior:** toggle visibility; drag reorder
- **Validation:** —
- **On-select behavior:** updates visibleCols/colOrder
- **Dependencies:** `REORDERABLE_COLUMNS`
- **Backend/API/DB:** persisted (client)
- **Special rules:** Area/Goal/Target/% Done never hideable
- **Code locations:** `components/goals/board/goals-level-board.tsx:2000` (usage `:1525`)

### Cascade toolbar — employee (native select)
- **Module:** Goals
- **Screen:** Cascade (year) toolbar
- **Field/Key:** viewed employee (`?emp=`)
- **Source:** database (roster)
- **Component:** native select
- **Type:** Single
- **Required:** Yes
- **Default:** current viewer
- **Searchable:** No
- **Static/Dynamic:** Dynamic
- **Options:** roster names
- **Add/Edit/Delete behavior:** —
- **Validation:** —
- **On-select behavior:** `go({emp})` → URL
- **Dependencies:** roster (shown only if `canPickEmployee && roster.length > 1`)
- **Backend/API/DB:** employees
- **Special rules:** —
- **Code locations:** `components/goals/cascade/cascade-toolbar.tsx:36`

### Cascade workspace — viewing employee (native select, invisible overlay)
- **Module:** Goals
- **Screen:** Cascade workspace header pill
- **Field/Key:** viewed employee
- **Source:** database (roster)
- **Component:** native select (opacity-0 over pill)
- **Type:** Single
- **Required:** Yes
- **Default:** viewer
- **Searchable:** No
- **Static/Dynamic:** Dynamic
- **Options:** roster names
- **Add/Edit/Delete behavior:** —
- **Validation:** —
- **On-select behavior:** router.push `/goals/cascade?emp=…&fy=…`
- **Dependencies:** roster
- **Backend/API/DB:** employees
- **Special rules:** invisible select over styled pill
- **Code locations:** `components/goals/cascade/cascade-workspace.tsx:378`

### Cascade workspace — month (native select)
- **Module:** Goals
- **Screen:** Cascade workspace month lens
- **Field/Key:** selected month
- **Source:** computed (monthsInFy)
- **Component:** native select
- **Type:** Single
- **Required:** Yes
- **Default:** current month
- **Searchable:** No
- **Static/Dynamic:** Dynamic
- **Options:** `monLabel(mk) <year>` per FY month
- **Add/Edit/Delete behavior:** —
- **Validation:** —
- **On-select behavior:** `setSelMonth`
- **Dependencies:** FY calendar
- **Backend/API/DB:** —
- **Special rules:** —
- **Code locations:** `components/goals/cascade/cascade-workspace.tsx:592`

### Goals import — default owner (native select)
- **Module:** Goals
- **Screen:** Goals import page
- **Field/Key:** default owner employeeId
- **Source:** database (roster) + hardcoded "all"
- **Component:** native select
- **Type:** Single
- **Required:** No
- **Default:** `all`
- **Searchable:** No
- **Static/Dynamic:** Dynamic
- **Options:** `Use the file's Employee column` (value `all`) + roster names
- **Add/Edit/Delete behavior:** —
- **Validation:** —
- **On-select behavior:** sets ownerId used on import
- **Dependencies:** roster
- **Backend/API/DB:** employees; `importGoals` action
- **Special rules:** —
- **Code locations:** `components/goals/cascade/goals-import.tsx:81`

### Carry forward to (MoveForwardMenu native select)
- **Module:** Goals
- **Screen:** Goal card "Carry" popover
- **Field/Key:** target period key
- **Source:** computed (targets prop)
- **Component:** native select
- **Type:** Single
- **Required:** Yes
- **Default:** `targets[0]`
- **Searchable:** No
- **Static/Dynamic:** Dynamic
- **Options:** sibling period keys, label via `periodKeyLabel`
- **Add/Edit/Delete behavior:** —
- **Validation:** target must be in list
- **On-select behavior:** sets target; Clone/Move buttons
- **Dependencies:** targets
- **Backend/API/DB:** `cloneGoalForward` / `moveGoalForward`
- **Special rules:** "Retain Progress" checkbox
- **Code locations:** `components/goals/cascade/move-forward-menu.tsx:79`

### Edit dialog — "Lands in" (native select)
- **Module:** Goals
- **Screen:** Goal edit dialog (child mode only, >1 option)
- **Field/Key:** child period key
- **Source:** computed (periodKeyOptions)
- **Component:** native select
- **Type:** Single
- **Required:** Yes
- **Default:** first option
- **Searchable:** No
- **Static/Dynamic:** Dynamic
- **Options:** period keys, label `periodKeyLabel`
- **Add/Edit/Delete behavior:** —
- **Validation:** —
- **On-select behavior:** setChildKey
- **Dependencies:** —
- **Backend/API/DB:** `addChildGoal`
- **Special rules:** only when `periodKeyOptions.length > 1`
- **Code locations:** `components/goals/cascade/goal-edit-dialog.tsx:228`

### Edit dialog — Delegated to (DelegateField MultiSelect)
- **Module:** Goals
- **Screen:** Goal edit dialog "Delegated to"
- **Field/Key:** `goals.delegated_to`
- **Source:** database (roster)
- **Component:** MultiSelect
- **Type:** Multi
- **Required:** No
- **Default:** `[]`
- **Searchable:** Yes
- **Static/Dynamic:** Dynamic
- **Options:** roster names
- **Add/Edit/Delete behavior:** chips with % + remove
- **Validation:** pct clamp 0–100
- **On-select behavior:** setIds
- **Dependencies:** roster
- **Backend/API/DB:** `editGoal`
- **Special rules:** —
- **Code locations:** `components/goals/cascade/goal-edit-dialog.tsx:396`

### Goals Dashboard — Employees (MultiSelect)
- **Module:** Goals
- **Screen:** Goals dashboard filter row
- **Field/Key:** `?emps=` URL param
- **Source:** database (roster) + synthetic `__all__`
- **Component:** MultiSelect (custom FilterPill trigger)
- **Type:** Multi
- **Required:** No (default self)
- **Default:** self (no param)
- **Searchable:** Yes
- **Static/Dynamic:** Dynamic
- **Options:** `All employees (N)` (`__all__`), `<You> (You)` (viewer), roster names
- **Add/Edit/Delete behavior:** —
- **Validation:** server re-validates against roster
- **On-select behavior:** draft while open; commits to URL on close
- **Dependencies:** roster, viewedEmployeeId
- **Backend/API/DB:** employees
- **Special rules:** "All employees" wins when ticked; empty falls back to you
- **Code locations:** `components/goals/dashboard/goals-dashboard-filters.tsx:274`

### Goals Dashboard — Date range (DayPicker Popover)
- **Module:** Goals
- **Screen:** Goals dashboard filter row
- **Field/Key:** `?from=` / `?to=`
- **Source:** react-day-picker
- **Component:** other (DayPicker in Popover)
- **Type:** range picker (not a list dropdown)
- **Required:** No
- **Default:** FY full year
- **Searchable:** No
- **Static/Dynamic:** Dynamic
- **Options:** calendar days (2 months)
- **Add/Edit/Delete behavior:** —
- **Validation:** draft until both ends
- **On-select behavior:** commits range to URL
- **Dependencies:** FY range
- **Backend/API/DB:** —
- **Special rules:** single-day commit if only start picked; "Reset to the full year"
- **Code locations:** `components/goals/dashboard/goals-dashboard-filters.tsx:202`

### Plan board — Whose day (native select)
- **Module:** Goals (Plan-Your-Day)
- **Screen:** Plan board header
- **Field/Key:** employeeId
- **Source:** database (roster)
- **Component:** native select
- **Type:** Single
- **Required:** Yes
- **Default:** viewer
- **Searchable:** No
- **Static/Dynamic:** Dynamic
- **Options:** roster names (only if `roster.length > 1`)
- **Add/Edit/Delete behavior:** —
- **Validation:** —
- **On-select behavior:** `onPerson`
- **Dependencies:** roster
- **Backend/API/DB:** employees
- **Special rules:** "Reports to …" line beside
- **Code locations:** `components/goals/plan/plan-board.tsx:1133`

### Plan board — window days (native select)
- **Module:** Goals (Plan-Your-Day)
- **Screen:** Plan board header
- **Field/Key:** windowDays
- **Source:** hardcoded
- **Component:** native select
- **Type:** Single
- **Required:** No (only when `showSpan`)
- **Default:** current window
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** `1 day, 2 days, 3 days, 4 days, 7 days`
- **Add/Edit/Delete behavior:** —
- **Validation:** —
- **On-select behavior:** `onSpan(n)`
- **Dependencies:** showSpan
- **Backend/API/DB:** —
- **Special rules:** —
- **Code locations:** `components/goals/plan/plan-board.tsx:1455`

### Plan board — sort (native select)
- **Module:** Goals (Plan-Your-Day)
- **Screen:** Plan board header
- **Field/Key:** plan sort
- **Source:** constant (PLAN_SORT_LABELS)
- **Component:** native select
- **Type:** Single
- **Required:** No
- **Default:** `oldest`
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** `Oldest → Newest` (oldest), `Newest → Oldest` (newest)
- **Add/Edit/Delete behavior:** —
- **Validation:** —
- **On-select behavior:** `onSort`
- **Dependencies:** `lib/goals/plan-sort.ts`
- **Backend/API/DB:** —
- **Special rules:** view over each column
- **Code locations:** `components/goals/plan/plan-board.tsx:1473`

### Plan board — Overdue (native select)
- **Module:** Goals (Plan-Your-Day)
- **Screen:** Plan board WMS column filters
- **Field/Key:** `filter.overdue`
- **Source:** constant (OVERDUE_OPTIONS / OVERDUE_LABEL)
- **Component:** native select
- **Type:** Single
- **Required:** No
- **Default:** `all`
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** `All`(all), `Overdue 22+ Days`(od_22_plus), `Overdue 15–21 Days`(od_15_21), `Overdue 8–14 Days`(od_8_14), `Overdue 4–7 Days`(od_4_7), `Overdue 1–3 Days`(od_1_3), `Due Today`(today), `Not Due`(not_due)
- **Add/Edit/Delete behavior:** —
- **Validation:** —
- **On-select behavior:** filters WMS column
- **Dependencies:** `components/goals/plan/wms-filters.ts`
- **Backend/API/DB:** —
- **Special rules:** —
- **Code locations:** `components/goals/plan/plan-board.tsx:1724`

### Plan board — Priority (native select)
- **Module:** Goals (Plan-Your-Day)
- **Screen:** Plan board WMS column filters
- **Field/Key:** `filter.priority`
- **Source:** enum (TASK_PRIORITIES / PRIORITY_LABELS)
- **Component:** native select
- **Type:** Single
- **Required:** No
- **Default:** `all`
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** `All`(all), `Critical`(imp_urgent), `Important`(imp_not_urgent), `Urgent`(not_imp_urgent), `Normal`(not_imp_not_urgent)
- **Add/Edit/Delete behavior:** —
- **Validation:** —
- **On-select behavior:** filters WMS column
- **Dependencies:** `db/enums.ts`
- **Backend/API/DB:** —
- **Special rules:** —
- **Code locations:** `components/goals/plan/plan-board.tsx:1741`

### Plan item — duration (native select)
- **Module:** Goals (Plan-Your-Day)
- **Screen:** Plan item card time block
- **Field/Key:** `durationMin`
- **Source:** hardcoded
- **Component:** native select
- **Type:** Single
- **Required:** No (only when startMin set)
- **Default:** `""` ("-")
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** `-`(""), `15 min`(15), `30 min`(30), `45 min`(45), `1 hr`(60), `1.5 hrs`(90), `2 hrs`(120), `3 hrs`(180)
- **Add/Edit/Delete behavior:** —
- **Validation:** —
- **On-select behavior:** sets startMin/durationMin
- **Dependencies:** —
- **Backend/API/DB:** —
- **Special rules:** "—" clears length
- **Code locations:** `components/goals/plan/plan-item-card.tsx:204`

### Canvas child-planner — target bucket (native select, ×2)
- **Module:** Goals (canvas)
- **Screen:** Child planner quick-add (quarter/month bucket + week Monday)
- **Field/Key:** bucket / monday
- **Source:** computed (buckets / stage.weeks)
- **Component:** native select
- **Type:** Single
- **Required:** Yes
- **Default:** first bucket / first week
- **Searchable:** No
- **Static/Dynamic:** Dynamic
- **Options:** `periodKeyLabel(b)` per bucket; `W<weekNo> · <rangeLabel>` per week
- **Add/Edit/Delete behavior:** —
- **Validation:** —
- **On-select behavior:** setBucket / setMonday
- **Dependencies:** FY calendar, stage
- **Backend/API/DB:** —
- **Special rules:** —
- **Code locations:** `components/goals/canvas/child-planner.tsx:384`, `:656`

### Canvas collab-panel — dependency target (native select)
- **Module:** Goals (canvas)
- **Screen:** Collab panel "Blocked by / Depends on"
- **Field/Key:** targetId
- **Source:** computed (candidate goals)
- **Component:** native select
- **Type:** Single
- **Required:** No (free-text fallback)
- **Default:** `""` ("External / free-text (name it below)…")
- **Searchable:** No
- **Static/Dynamic:** Dynamic
- **Options:** `External / free-text (name it below)…` + `goalCode · title` candidates
- **Add/Edit/Delete behavior:** —
- **Validation:** —
- **On-select behavior:** setTargetId
- **Dependencies:** candidates
- **Backend/API/DB:** goals
- **Special rules:** —
- **Code locations:** `components/goals/canvas/collab-panel.tsx:782`

### Canvas goal-container — Move to level + period (native selects)
- **Module:** Goals (canvas)
- **Screen:** Goal container "Move to" panel
- **Field/Key:** level / key
- **Source:** constant (MOVE_LEVELS) / computed (buckets)
- **Component:** native select (×2)
- **Type:** Single
- **Required:** Yes
- **Default:** goal's level/key
- **Searchable:** No
- **Static/Dynamic:** Dynamic
- **Options:** Level = `Year, Quarter, Month, Week, Day` (disabled if `!canRehome` and not own level); period = `moveBucketLabel(level, b)` buckets (day → DateInput)
- **Add/Edit/Delete behavior:** —
- **Validation:** disabled options for policy
- **On-select behavior:** pickLevel / setKey
- **Dependencies:** `lib/goals/policy.ts` POLICY_REASONS
- **Backend/API/DB:** move actions
- **Special rules:** —
- **Code locations:** `components/goals/canvas/goal-container.tsx:681` (level), `:714` (period)

### Canvas smart-toolbar — bucket picker (native select)
- **Module:** Goals (canvas)
- **Screen:** Smart toolbar quick-add
- **Field/Key:** chosenBucket
- **Source:** computed (tgtBuckets)
- **Component:** native select
- **Type:** Single
- **Required:** No (hidden if ≤1)
- **Default:** current bucket
- **Searchable:** No
- **Static/Dynamic:** Dynamic
- **Options:** `{key,label}` buckets
- **Add/Edit/Delete behavior:** —
- **Validation:** —
- **On-select behavior:** setBucketKey
- **Dependencies:** quickAddTarget
- **Backend/API/DB:** —
- **Special rules:** only if `tgtBuckets.length > 1`
- **Code locations:** `components/goals/canvas/smart-toolbar.tsx:468`

### Canvas zoom-spine — whose cascade (native select)
- **Module:** Goals (canvas)
- **Screen:** Zoom spine header
- **Field/Key:** viewedEmployeeId
- **Source:** database (roster)
- **Component:** native select
- **Type:** Single
- **Required:** Yes
- **Default:** viewer
- **Searchable:** No
- **Static/Dynamic:** Dynamic
- **Options:** roster names (plus current value if missing)
- **Add/Edit/Delete behavior:** —
- **Validation:** —
- **On-select behavior:** `setEmp`
- **Dependencies:** roster
- **Backend/API/DB:** employees
- **Special rules:** —
- **Code locations:** `components/goals/canvas/zoom-spine.tsx:458`

### Team performance — Function / Team / Status / Grade / Sort (5 × Select)
- **Module:** Goals (Team performance board)
- **Screen:** Team performance toolbar
- **Field/Key:** dept / team / status / grade / sort
- **Source:** database (departments/teams derived from rows) + constant (STATUS_FILTERS, SORT_OPTIONS, grade distribution)
- **Component:** Select (unstyled)
- **Type:** Single
- **Required:** No
- **Default:** `__all__` / `__all__` / `all` / `__all__` / `attention`
- **Searchable:** Yes (Function/Team when >8)
- **Static/Dynamic:** Dynamic
- **Options:**
  - Function: `All Functions` + department names
  - Team: `All teams` + `Reports to <manager>`
  - Status: `All statuses`, `On track`, `Working`, `Needs help`, `Blocked`, `No plan`, `Overdue`
  - Grade: `All grades` + `Grade <g> · <count>` (only held grades) + `Ungraded · <n>` (if any)
  - Sort: `Sort: Needs attention`, `Sort: Worst performing`, `Sort: Best performing`, `Sort: Goal score`, `Sort: Tasks completed`, `Sort: Overdue tasks`, `Sort: Pending tasks`, `Sort: Need help`, `Sort: Name A–Z`
- **Add/Edit/Delete behavior:** —
- **Validation:** —
- **On-select behavior:** sets filter/sort state
- **Dependencies:** rows, distribution
- **Backend/API/DB:** employees/rows
- **Special rules:** grade options limited to present grades
- **Code locations:** `components/goals/team/team-performance-board.tsx:467` (Function), `:480` (Team), `:493` (Status), `:502` (Grade), `:522` (Sort); consts `:130` (SORT), `:206` (STATUS_FILTERS)

### Weekly cascade board — Sort / Areas / Types / Rows / Columns / Monthly Goal
- **Module:** Goals (Weekly cascade board)
- **Screen:** Weekly board toolbar + composer
- **Field/Key:** sortKey / areaFilter / typeFilter / rowsPerPage / cols / monthGoalId
- **Source:** constant + DB (SORT_OPTIONS, QUARTER_TYPE_OPTIONS, areaOptions, monthGoalOptions)
- **Component:** Select (Sort, Rows, Monthly Goal), MultiPickFilter (Areas, Types), ColumnsPicker
- **Type:** Single (sort/rows/monthly), Multi (areas/types/columns)
- **Required:** Monthly Goal = No
- **Default:** position / 25 / none
- **Searchable:** Monthly Goal Yes (>8)
- **Static/Dynamic:** Dynamic (areas, monthly), Static (types, rows, sort)
- **Options:**
  - Sort: `Sr. No.`, `Score high → low`, `Score low → high`, `At-risk first`, `A → Z`
  - Areas: areaFilterOptions strings
  - Types: `Incentive, KPI, Strategic, Operational`
  - Rows: `25, 50, 100, All`
  - Monthly Goal: `No monthly link`("") + monthly goal titles
- **Add/Edit/Delete behavior:** —
- **Validation:** —
- **On-select behavior:** local filter/parent link
- **Dependencies:** —
- **Backend/API/DB:** monthly goals
- **Special rules:** toolbar compact; only in list view
- **Code locations:** `components/goals/weekly/weekly-cascade-board.tsx:615` (Sort), `:620` (Areas), `:622` (Types), `:630` (Rows), `:633` (Columns), `:1229` (Monthly Goal)

### Review table — Category (GoalLookupSelect kind "type")
- **Module:** Goals (Review & Scores)
- **Screen:** Review table Category column
- **Field/Key:** `goals.category`
- **Source:** constant + DB (typeOptions)
- **Component:** other (GoalLookupSelect)
- **Type:** Single
- **Required:** No
- **Default:** current category
- **Searchable:** Yes (auto >8)
- **Static/Dynamic:** Dynamic
- **Options:** typeOptions (base `Goal, Target, Milestone, Operational` + admin-added)
- **Add/Edit/Delete behavior:** None (`isAdmin={false}`)
- **Validation:** —
- **On-select behavior:** `changeCategory` → `setGoalCategory` (goal-kind rows only, `canReview`)
- **Dependencies:** canReview
- **Backend/API/DB:** `setGoalCategory`
- **Special rules:** —
- **Code locations:** `components/goals/review/review-table.tsx:199`

---

# WEEKLY-GOALS MODULE

### Team-member scope (native select, admin only)
- **Module:** Weekly Goals
- **Screen:** Weekly Goals board header
- **Field/Key:** `?emp=` scope
- **Source:** database (employees) + hardcoded "all"
- **Component:** native select
- **Type:** Single
- **Required:** No
- **Default:** `all` (admin) / self
- **Searchable:** No
- **Static/Dynamic:** Dynamic
- **Options:** `All team members`("all") + employee names
- **Add/Edit/Delete behavior:** —
- **Validation:** —
- **On-select behavior:** `go({emp})` → URL
- **Dependencies:** `props.me.isAdmin`
- **Backend/API/DB:** employees
- **Special rules:** admin only
- **Code locations:** `components/weekly-goals/weekly-goals-board.tsx:155`

### Priority (native select — add/edit form)
- **Module:** Weekly Goals
- **Screen:** Weekly board inline add/edit form
- **Field/Key:** `priority`
- **Source:** enum (TASK_PRIORITIES / PRIORITY_LABELS)
- **Component:** native select
- **Type:** Single
- **Required:** Yes (always a priority)
- **Default:** current priority
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** `Critical`(imp_urgent), `Important`(imp_not_urgent), `Urgent`(not_imp_urgent), `Normal`(not_imp_not_urgent)
- **Add/Edit/Delete behavior:** —
- **Validation:** —
- **On-select behavior:** setPriority
- **Dependencies:** `db/enums.ts`
- **Backend/API/DB:** —
- **Special rules:** —
- **Code locations:** `components/weekly-goals/weekly-goals-board.tsx:956`

### Priority pill (PriorityPicker — native select, per-row)
- **Module:** Weekly Goals
- **Screen:** Weekly board card priority pill
- **Field/Key:** `priority`
- **Source:** enum (TASK_PRIORITIES / PRIORITY_LABELS)
- **Component:** native select (tone-coloured)
- **Type:** Single
- **Required:** Yes
- **Default:** current
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** `Critical, Important, Urgent, Normal`
- **Add/Edit/Delete behavior:** —
- **Validation:** —
- **On-select behavior:** onChange(priority)
- **Dependencies:** —
- **Backend/API/DB:** —
- **Special rules:** colour by priority tone
- **Code locations:** `components/weekly-goals/field-controls.tsx:245` (definition); `components/weekly-goals/weekly-goals-board.tsx:594` (local copy)

### Client (ComboInput)
- **Module:** Weekly Goals
- **Screen:** Weekly board add/edit form + inline rows
- **Field/Key:** `client`
- **Source:** database (listActiveClientNames)
- **Component:** other (ComboInput type-ahead)
- **Type:** Single (free text allowed)
- **Required:** No
- **Default:** `""`
- **Searchable:** Yes (type-ahead)
- **Static/Dynamic:** Dynamic
- **Options:** active client names
- **Add/Edit/Delete behavior:** free text allowed
- **Validation:** —
- **On-select behavior:** commit on blur/select
- **Dependencies:** `clientOptions`
- **Backend/API/DB:** clients (query `listActiveClientNames`)
- **Special rules:** —
- **Code locations:** `components/weekly-goals/weekly-goals-board.tsx:941` (and `:329`); loader `app/(app)/weekly-goals/page.tsx:44`

### Subject (ComboInput)
- **Module:** Weekly Goals
- **Screen:** Weekly board add/edit form + inline rows
- **Field/Key:** `subject`
- **Source:** database (listActiveSubjectNames)
- **Component:** other (ComboInput type-ahead)
- **Type:** Single (free text allowed)
- **Required:** No
- **Default:** `""`
- **Searchable:** Yes (type-ahead)
- **Static/Dynamic:** Dynamic
- **Options:** active subject names
- **Add/Edit/Delete behavior:** free text
- **Validation:** —
- **On-select behavior:** commit
- **Dependencies:** `subjectOptions`
- **Backend/API/DB:** subjects (query `listActiveSubjectNames`)
- **Special rules:** —
- **Code locations:** `components/weekly-goals/weekly-goals-board.tsx:949` (and `:340`)

### ComboInput (generic primitive)
- **Module:** Weekly Goals (shared)
- **Screen:** used for Area (goal edit drawer) and Client/Subject
- **Field/Key:** any
- **Source:** passed `options: string[]`
- **Component:** other (ComboInput combobox)
- **Type:** Single (free text)
- **Required:** No
- **Default:** `""`
- **Searchable:** Yes
- **Static/Dynamic:** Dynamic
- **Options:** passed options
- **Add/Edit/Delete behavior:** free text allowed
- **Validation:** —
- **On-select behavior:** commit on blur/Enter/click
- **Dependencies:** —
- **Backend/API/DB:** —
- **Special rules:** CSS-anchored suggestion dropdown, `role="combobox"`
- **Code locations:** `components/weekly-goals/field-controls.tsx:32`; used `components/goals/board/goal-board-card.tsx:813` (Area)

---

# APPRAISAL MODULE

### Cycle picker (CyclePicker native select)
- **Module:** Appraisal
- **Screen:** Appraisal page admin bar
- **Field/Key:** `?cycle=`
- **Source:** database (cycles)
- **Component:** native select
- **Type:** Single
- **Required:** No (hidden if no cycles)
- **Default:** current cycle id
- **Searchable:** No
- **Static/Dynamic:** Dynamic
- **Options:** `<label || period> · <status>` per cycle
- **Add/Edit/Delete behavior:** —
- **Validation:** —
- **On-select behavior:** router.push `/appraisal?cycle=…`
- **Dependencies:** cycles
- **Backend/API/DB:** appraisal_cycles
- **Special rules:** —
- **Code locations:** `components/appraisal/admin-bar.tsx:137`

### Dimension (item-builder native select)
- **Module:** Appraisal
- **Screen:** Item builder form
- **Field/Key:** `dimension`
- **Source:** hardcoded (BUILDABLE)
- **Component:** native select
- **Type:** Single
- **Required:** Yes
- **Default:** `kpi`
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** `kpi`→"KPI", `skill`→"Skill", `attitude`→"Attitude"
- **Add/Edit/Delete behavior:** —
- **Validation:** title required
- **On-select behavior:** sets dim (reveals measure for KPI, Technical checkbox for skill)
- **Dependencies:** —
- **Backend/API/DB:** `addItem` action
- **Special rules:** —
- **Code locations:** `components/appraisal/item-builder.tsx:84` (BUILDABLE `:12`)

---

# APPRAISAL2 MODULE

### Manager (Advisory) (native select)
- **Module:** Appraisal2
- **Screen:** Admin panel Assignees editor
- **Field/Key:** `managerId`
- **Source:** database (people, excluding self)
- **Component:** native select
- **Type:** Single
- **Required:** No
- **Default:** `""` ("- None -")
- **Searchable:** No
- **Static/Dynamic:** Dynamic
- **Options:** `- None -` + people names
- **Add/Edit/Delete behavior:** —
- **Validation:** —
- **On-select behavior:** setManagerId
- **Dependencies:** `people` prop
- **Backend/API/DB:** `setAssignees` action
- **Special rules:** —
- **Code locations:** `components/appraisal2/admin-panel.tsx:217`

### Management (Final) (native select)
- **Module:** Appraisal2
- **Screen:** Admin panel Assignees editor
- **Field/Key:** `managementId`
- **Source:** database (people, excluding self)
- **Component:** native select
- **Type:** Single
- **Required:** No
- **Default:** `""` ("- None -")
- **Searchable:** No
- **Static/Dynamic:** Dynamic
- **Options:** `- None -` + people names
- **Add/Edit/Delete behavior:** —
- **Validation:** —
- **On-select behavior:** setManagementId
- **Dependencies:** people
- **Backend/API/DB:** `setAssignees`
- **Special rules:** —
- **Code locations:** `components/appraisal2/admin-panel.tsx:228`

### Appraisal workspace — person (native select with optgroups)
- **Module:** Appraisal2
- **Screen:** Appraisal workspace control bar
- **Field/Key:** `?emp=`
- **Source:** database (grouped people by department)
- **Component:** native select
- **Type:** Single
- **Required:** No (placeholder "Select a person…")
- **Default:** `""` (disabled placeholder)
- **Searchable:** No
- **Static/Dynamic:** Dynamic
- **Options:** grouped `<optgroup label={department}>` with person names; when a dept filter is active, flat list
- **Add/Edit/Delete behavior:** —
- **Validation:** —
- **On-select behavior:** `go(id)` → router.push
- **Dependencies:** departments, people
- **Backend/API/DB:** employees
- **Special rules:** department pills filter the group list
- **Code locations:** `components/appraisal2/appraisal-workspace.tsx:776`

---

# PMS MODULE

### Recognition — Person (LookupSelect)
- **Module:** PMS (Signals)
- **Screen:** Create Recognition form
- **Field/Key:** `employeeId`
- **Source:** database (people LookupOption[])
- **Component:** LookupSelect
- **Type:** Single
- **Required:** Yes (submit blocked without)
- **Default:** `null` (placeholder "Search a person…")
- **Searchable:** Yes
- **Static/Dynamic:** Dynamic
- **Options:** people
- **Add/Edit/Delete behavior:** None (no onAdd/onDelete)
- **Validation:** "Pick a person to recognise."
- **On-select behavior:** setEmployeeId
- **Dependencies:** people prop
- **Backend/API/DB:** `createRecognition` action
- **Special rules:** created row is "suggested" (needs release)
- **Code locations:** `components/pms/signals/create-recognition-form.tsx:131`

### Recognition — Kind (datalist)
- **Module:** PMS (Signals)
- **Screen:** Create Recognition form
- **Field/Key:** `kind` (free text + suggestions)
- **Source:** hardcoded (KINDS)
- **Component:** other (input + `<datalist>`)
- **Type:** Single (free text)
- **Required:** No (defaults first)
- **Default:** `"Spot award"`
- **Searchable:** Yes (native datalist)
- **Static/Dynamic:** Static
- **Options:** `Spot award, Employee of the month, Above & beyond, Team player, Customer impact, Learning champion`
- **Add/Edit/Delete behavior:** custom value allowed
- **Validation:** maxLength 80
- **On-select behavior:** setKind
- **Dependencies:** —
- **Backend/API/DB:** `createRecognition` kind
- **Special rules:** admin can type custom kind
- **Code locations:** `components/pms/signals/create-recognition-form.tsx:162` (KINDS `:15`)

### Review — Person (Popover picker)
- **Module:** PMS (Monthly Review)
- **Screen:** Review form person picker
- **Field/Key:** `selectedId`
- **Source:** database (people grouped by relation)
- **Component:** other (Popover list)
- **Type:** Single
- **Required:** Yes
- **Default:** first pending person
- **Searchable:** No (grouped list, no search box)
- **Static/Dynamic:** Dynamic
- **Options:** grouped `Your team (you manage)` / `Your manager (rate up)` / `Peers`, each person with department + Done chip
- **Add/Edit/Delete behavior:** —
- **Validation:** "Pick a person to review."
- **On-select behavior:** setSelectedId + close
- **Dependencies:** people
- **Backend/API/DB:** `saveMonthlyReview`
- **Special rules:** relation groups (manager/subordinate/peer)
- **Code locations:** `components/pms/review/review-form.tsx:143`

Note: PMS also uses non-dropdown pickers — "What needs to change?" changeTags are toggle pills; Attitude/Behaviour/Skill use StarRating; scope uses radio group; v3 panels use radio groups. None are dropdowns.

---

# DCC MODULE

### Person switcher (native select)
- **Module:** DCC
- **Screen:** DCC board toolbar
- **Field/Key:** `?emp=`
- **Source:** database (people)
- **Component:** native select
- **Type:** Single
- **Required:** Yes
- **Default:** viewer
- **Searchable:** No
- **Static/Dynamic:** Dynamic
- **Options:** people names (`(me)` suffixed for self)
- **Add/Edit/Delete behavior:** —
- **Validation:** —
- **On-select behavior:** router.push `/dcc?emp=…`
- **Dependencies:** people
- **Backend/API/DB:** employees
- **Special rules:** hidden if no people
- **Code locations:** `components/dcc/dcc-board.tsx:296`

### KPI — Section (datalist)
- **Module:** DCC
- **Screen:** New/Edit KPI dialog
- **Field/Key:** `section`
- **Source:** computed (sections from board)
- **Component:** other (input + `<datalist>`)
- **Type:** Single (free text)
- **Required:** No
- **Default:** `""`
- **Searchable:** Yes (native)
- **Static/Dynamic:** Dynamic
- **Options:** `sections` strings
- **Add/Edit/Delete behavior:** free text allowed
- **Validation:** —
- **On-select behavior:** `pickSection`
- **Dependencies:** sections
- **Backend/API/DB:** DCC board data
- **Special rules:** —
- **Code locations:** `components/dcc/dcc-board.tsx:885`

### KPI — Client (native select)
- **Module:** DCC
- **Screen:** New/Edit KPI dialog
- **Field/Key:** `clientId`
- **Source:** database (clients)
- **Component:** native select
- **Type:** Single
- **Required:** No
- **Default:** `""` ("No Client")
- **Searchable:** No
- **Static/Dynamic:** Dynamic
- **Options:** `No Client` + `<section> · <name>` per client
- **Add/Edit/Delete behavior:** —
- **Validation:** —
- **On-select behavior:** setForm clientId
- **Dependencies:** clients
- **Backend/API/DB:** clients
- **Special rules:** only rendered when clients exist
- **Code locations:** `components/dcc/dcc-board.tsx:893`

---

# ECOS / BROADCAST (components/ecos)

No dropdown/select/combobox components. `broadcast-popup.tsx` renders category/priority via label maps (display only); `poll-card.tsx` renders poll options as buttons. Audience/composer dropdowns live in `components/communications/broadcast-composer.tsx` (see Communications).

---

# EVENTS MODULE

### Event — Category (native select)
- **Module:** Events (Calendar)
- **Screen:** Event create/edit modal
- **Field/Key:** `categoryId`
- **Source:** database (categories)
- **Component:** native select
- **Type:** Single
- **Required:** No
- **Default:** `""` ("— None —") on create; current on edit
- **Searchable:** No
- **Static/Dynamic:** Dynamic
- **Options:** `— None —` + category names
- **Add/Edit/Delete behavior:** —
- **Validation:** —
- **On-select behavior:** set categoryId (null if "")
- **Dependencies:** categories
- **Backend/API/DB:** event categories
- **Special rules:** default = `categories[0]?.id` on create
- **Code locations:** `components/events/event-editor.tsx:140`

### Event — Status (toggle pills, NOT a dropdown)
- **Module:** Events
- **Screen:** Event modal
- **Component:** other (button pill group)
- **Options:** `confirmed`, `tentative` (lowercase labels)
- **Code locations:** `components/events/event-editor.tsx:153`

### Event — Colour override (palette buttons, NOT a dropdown)
- **Module:** Events
- **Screen:** Event modal
- **Component:** other (colour swatch buttons + "Use Category")
- **Code locations:** `components/events/event-editor.tsx:175`

### Event — Start time (native select)
- **Module:** Events
- **Screen:** Event modal (when not all-day)
- **Field/Key:** `startMin`
- **Source:** computed (SLOT_OPTIONS, 30-min steps 0→1440)
- **Component:** native select
- **Type:** Single
- **Required:** Yes (default 120 = 2h)
- **Default:** `DAY_START_MIN` or draft start
- **Searchable:** No
- **Static/Dynamic:** Static (generated)
- **Options:** 30-min slots `minToLabel(m)` (all but the last)
- **Add/Edit/Delete behavior:** —
- **Validation:** end auto-adjusts if ≤ start
- **On-select behavior:** sets startMin; bumps endMin if needed
- **Dependencies:** `lib/monthly-events/types.ts`
- **Backend/API/DB:** —
- **Special rules:** snaps to 30-min grid
- **Code locations:** `components/events/event-editor.tsx:223`

### Event — End time (native select)
- **Module:** Events
- **Screen:** Event modal
- **Field/Key:** `endMin`
- **Source:** computed (SLOT_OPTIONS filtered > startMin)
- **Component:** native select
- **Type:** Single
- **Required:** Yes
- **Default:** `DAY_START_MIN + SLOT_MIN`
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** 30-min slots greater than start
- **Add/Edit/Delete behavior:** —
- **Validation:** —
- **On-select behavior:** set endMin
- **Dependencies:** startMin
- **Backend/API/DB:** —
- **Special rules:** —
- **Code locations:** `components/events/event-editor.tsx:239`

### Event — Counts toward obligation (native select)
- **Module:** Events
- **Screen:** Event modal (if obligations exist)
- **Field/Key:** `obligationId`
- **Source:** database (obligations)
- **Component:** native select
- **Type:** Single
- **Required:** No
- **Default:** `""` ("— None —")
- **Searchable:** No
- **Static/Dynamic:** Dynamic
- **Options:** `— None —` + `name (counterparty)` per obligation
- **Add/Edit/Delete behavior:** —
- **Validation:** —
- **On-select behavior:** set obligationId
- **Dependencies:** obligations
- **Backend/API/DB:** obligations
- **Special rules:** —
- **Code locations:** `components/events/event-editor.tsx:265`

### Filter bar — Status / Source (toggle pills, NOT dropdowns)
- **Module:** Events
- **Screen:** Calendar filter bar
- **Component:** other (pill buttons)
- **Options:** Status = `Confirmed, Tentative`; Source = `Manual, Batch, Obligation`; Only = `Obligation-linked, Locked`
- **Code locations:** `components/events/filter-bar.tsx` (STATUS_OPTS `:31`, SOURCE_OPTS `:35`)

### Batch schedule — Batch Type (Select)
- **Module:** Events (Batches)
- **Screen:** Batch schedule form
- **Field/Key:** `batchTypeId`
- **Source:** database (batchTypes)
- **Component:** Select
- **Type:** Single
- **Required:** Yes
- **Default:** `""` (placeholder "— Select type —")
- **Searchable:** auto (>8)
- **Static/Dynamic:** Dynamic
- **Options:** batch type names (value = id)
- **Add/Edit/Delete behavior:** —
- **Validation:** required
- **On-select behavior:** pickBatchType (also pre-fills default category)
- **Dependencies:** batchTypes
- **Backend/API/DB:** batch types
- **Special rules:** —
- **Code locations:** `components/events/batches/batch-schedule-form.tsx:258`

### Batch schedule — Start time / End time (Select ×2)
- **Module:** Events (Batches)
- **Screen:** Batch schedule form (when not all-day)
- **Field/Key:** `startMin` / `endMin`
- **Source:** constant (START_OPTIONS) / computed (endOptions)
- **Component:** Select
- **Type:** Single
- **Required:** No
- **Default:** `""` (placeholder "Start time"/"End time")
- **Searchable:** auto
- **Static/Dynamic:** Static
- **Options:** 30-min slots `minToLabel` (start: slots whose block ends ≤21:00; end: derived)
- **Add/Edit/Delete behavior:** —
- **Validation:** —
- **On-select behavior:** set startMin (bumps endMin) / endMin
- **Dependencies:** —
- **Backend/API/DB:** —
- **Special rules:** —
- **Code locations:** `components/events/batches/batch-schedule-form.tsx:325` (Start), `:339` (End); START_OPTIONS `:34`

### Batch schedule — Category (Select)
- **Module:** Events (Batches)
- **Screen:** Batch schedule form
- **Field/Key:** `categoryId`
- **Source:** database (categories)
- **Component:** Select
- **Type:** Single
- **Required:** No
- **Default:** `""` (placeholder "— No category —")
- **Searchable:** auto
- **Static/Dynamic:** Dynamic
- **Options:** `— No category —`("") + category names
- **Add/Edit/Delete behavior:** —
- **Validation:** —
- **On-select behavior:** set categoryId
- **Dependencies:** categories
- **Backend/API/DB:** categories
- **Special rules:** status uses toggle pills (EVENT_STATUSES)
- **Code locations:** `components/events/batches/batch-schedule-form.tsx:377` (categoryOptions `:196`)

### Batch type editor — Default category (Select)
- **Module:** Events (Masters)
- **Screen:** Batch type editor modal
- **Field/Key:** `defaultCategoryId`
- **Source:** database (active categories)
- **Component:** Select
- **Type:** Single
- **Required:** No
- **Default:** `NONE` (placeholder "No default colour")
- **Searchable:** auto
- **Static/Dynamic:** Dynamic
- **Options:** `No default colour`(NONE) + active category names
- **Add/Edit/Delete behavior:** —
- **Validation:** name required
- **On-select behavior:** setCategoryId
- **Dependencies:** categories (filtered active)
- **Backend/API/DB:** `createBatchType`/`updateBatchType`
- **Special rules:** —
- **Code locations:** `components/events/masters/batch-type-editor.tsx:102` (options `:32`)

### Archive category dialog — Reassign to (Select)
- **Module:** Events (Masters)
- **Screen:** Archive category dialog (reassign mode)
- **Field/Key:** `reassignToId`
- **Source:** database (other active categories)
- **Component:** Select
- **Type:** Single
- **Required:** No (disabled if no targets)
- **Default:** `""` (placeholder "Choose a category…")
- **Searchable:** auto
- **Static/Dynamic:** Dynamic
- **Options:** target category names
- **Add/Edit/Delete behavior:** —
- **Validation:** —
- **On-select behavior:** setReassignToId
- **Dependencies:** `targets`, `canReassign`
- **Backend/API/DB:** archive action
- **Special rules:** —
- **Code locations:** `components/events/masters/archive-category-dialog.tsx:121`

### Obligation form — Category (Select)
- **Module:** Events (Obligations)
- **Screen:** Obligation form dialog
- **Field/Key:** `categoryId`
- **Source:** database (categories)
- **Component:** Select
- **Type:** Single
- **Required:** No
- **Default:** `""` (placeholder "— None —")
- **Searchable:** auto
- **Static/Dynamic:** Dynamic
- **Options:** `— None —`("") + category names
- **Add/Edit/Delete behavior:** —
- **Validation:** —
- **On-select behavior:** set categoryId
- **Dependencies:** categoryOptions
- **Backend/API/DB:** categories
- **Special rules:** —
- **Code locations:** `components/events/obligations/obligation-form-dialog.tsx:219`

---

# COMMUNICATIONS MODULE (ECOS broadcast composer)

### Category (native select)
- **Module:** Communications (ECOS Broadcast)
- **Screen:** Broadcast composer settings
- **Field/Key:** `category`
- **Source:** enum (BROADCAST_CATEGORIES) + local CATEGORY_LABELS
- **Component:** native select
- **Type:** Single
- **Required:** Yes
- **Default:** draft or `announcement`
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** `announcement`→"Announcement", `ceo`→"CEO Message", `policy`→"Policy Update", `compliance`→"Compliance", `emergency`→"Emergency", `department`→"Function", `event`→"Event", `holiday`→"Holiday", `recognition`→"Recognition", `it`→"IT / Systems", `payroll`→"Payroll", `other`→"Other"
- **Add/Edit/Delete behavior:** —
- **Validation:** —
- **On-select behavior:** setCategory
- **Dependencies:** `db/enums.ts`
- **Backend/API/DB:** broadcast row
- **Special rules:** —
- **Code locations:** `components/communications/broadcast-composer.tsx:1152` (labels `:105`)

### Priority (native select)
- **Module:** Communications (ECOS Broadcast)
- **Screen:** Broadcast composer settings
- **Field/Key:** `priority`
- **Source:** enum (BROADCAST_PRIORITIES) + local PRIORITY_LABELS
- **Component:** native select
- **Type:** Single
- **Required:** Yes
- **Default:** draft or `normal`
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** `normal`→"Normal", `important`→"Important", `high`→"High", `critical`→"Critical", `emergency`→"Emergency"
- **Add/Edit/Delete behavior:** —
- **Validation:** critical/emergency enable app-lock option
- **On-select behavior:** setPriority
- **Dependencies:** —
- **Backend/API/DB:** broadcast row
- **Special rules:** LOCK_PRIORITIES = {critical, emergency}
- **Code locations:** `components/communications/broadcast-composer.tsx:1169` (labels `:120`)

### Acknowledgement (native select)
- **Module:** Communications (ECOS Broadcast)
- **Screen:** Broadcast composer settings
- **Field/Key:** `ackMode`
- **Source:** enum (BROADCAST_ACK_MODES) + local ACK_LABELS
- **Component:** native select
- **Type:** Single
- **Required:** Yes
- **Default:** draft or `none`
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** `none`→"None - informational only", `read`→"Read receipt (auto)", `acknowledge`→"Require acknowledgement"
- **Add/Edit/Delete behavior:** —
- **Validation:** —
- **On-select behavior:** setAckMode
- **Dependencies:** —
- **Backend/API/DB:** broadcast row
- **Special rules:** —
- **Code locations:** `components/communications/broadcast-composer.tsx:1188` (labels `:128`)

### Recurrence (native select)
- **Module:** Communications (ECOS Broadcast)
- **Screen:** Broadcast composer schedule (when scheduledFor set)
- **Field/Key:** `recurrence`
- **Source:** enum (BROADCAST_RECURRENCES)
- **Component:** native select
- **Type:** Single
- **Required:** No (only when scheduled)
- **Default:** `none`
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** `none`→"One-time", `daily`→"Daily", `weekly`→"Weekly", `monthly`→"Monthly"
- **Add/Edit/Delete behavior:** —
- **Validation:** —
- **On-select behavior:** setRecurrence (reveals until-date when ≠ none)
- **Dependencies:** scheduledFor
- **Backend/API/DB:** broadcast row
- **Special rules:** —
- **Code locations:** `components/communications/broadcast-composer.tsx:1398`

### Audience — Scope (Whole organization / Custom) — toggle buttons, NOT a dropdown
- **Code locations:** `components/communications/broadcast-composer.tsx:1604,1616`

### Audience — Functions / Designations / Employee types / Roles (ChipGroup toggles, NOT dropdowns)
- **Module:** Communications
- **Options:** Functions = `departments`; Designations = `designations`; Employee types = WORKER_TYPES labels (`Full Time, First Half, Second Half, Hybrid, Project / Remote`); Roles = `Doer, Initiator, Both`
- **Code locations:** `components/communications/broadcast-composer.tsx:1632–1654`

### Audience — Specific people (search combobox)
- **Module:** Communications
- **Screen:** Broadcast composer audience
- **Field/Key:** `employeeIds`
- **Source:** database (employees)
- **Component:** other (search input + result list)
- **Type:** Multi
- **Required:** No
- **Default:** `[]`
- **Searchable:** Yes (type-a-name)
- **Static/Dynamic:** Dynamic
- **Options:** matched employees (name + designation/department)
- **Add/Edit/Delete behavior:** add on click; chip remove
- **Validation:** —
- **On-select behavior:** appends employeeId
- **Dependencies:** employees
- **Backend/API/DB:** employees
- **Special rules:** —
- **Code locations:** `components/communications/broadcast-composer.tsx:1658` (matches `:806`)

### Letterhead (Author identity) — toggle buttons, NOT a dropdown
- **Options:** `Altus HR`(hr), `CEO`(ceo), `Founder`(founder)
- **Code locations:** `components/communications/broadcast-composer.tsx:1253`

---

# TRAINING MODULE

### Material — Subject (LookupSelect)
- **Module:** Training
- **Screen:** New material form
- **Field/Key:** `subjectId`
- **Source:** database (subjects LookupOption[])
- **Component:** LookupSelect
- **Type:** Single
- **Required:** No
- **Default:** `null`
- **Searchable:** Yes
- **Static/Dynamic:** Dynamic
- **Options:** subject names; `onAdd` → `addTcLookup("subject")`; `onDelete` → `softDeleteTcLookup`
- **Add/Edit/Delete behavior:** inline add + soft-delete
- **Validation:** —
- **On-select behavior:** setSubjectId
- **Dependencies:** subjects
- **Backend/API/DB:** `addTcLookup` / `softDeleteTcLookup`
- **Special rules:** —
- **Code locations:** `components/training/material-form.tsx:130`

### Material — Created By (MultiSelect)
- **Module:** Training
- **Screen:** New material form
- **Field/Key:** `createdByIds`
- **Source:** database (employeeOptions)
- **Component:** MultiSelect
- **Type:** Multi
- **Required:** No
- **Default:** `[]`
- **Searchable:** Yes
- **Static/Dynamic:** Dynamic
- **Options:** employee names (value id)
- **Add/Edit/Delete behavior:** —
- **Validation:** —
- **On-select behavior:** setCreatedByIds
- **Dependencies:** employeeOptions
- **Backend/API/DB:** `createMaterial`
- **Special rules:** —
- **Code locations:** `components/training/material-form.tsx:176`

### Material — Assisted By (MultiSelect)
- **Module:** Training
- **Screen:** New material form
- **Field/Key:** `assistedByIds`
- **Source:** database (employeeOptions)
- **Component:** MultiSelect
- **Type:** Multi
- **Required:** No
- **Default:** `[]`
- **Searchable:** Yes
- **Static/Dynamic:** Dynamic
- **Options:** employee names
- **Add/Edit/Delete behavior:** —
- **Validation:** —
- **On-select behavior:** setAssistedByIds
- **Dependencies:** employeeOptions
- **Backend/API/DB:** `createMaterial`
- **Special rules:** —
- **Code locations:** `components/training/material-form.tsx:179`

### Material — Applies to Functions (MultiSelect)
- **Module:** Training
- **Screen:** New material form (when Part of Induction checked)
- **Field/Key:** `inductionDeptIds`
- **Source:** database (departmentOptions)
- **Component:** MultiSelect
- **Type:** Multi
- **Required:** No
- **Default:** `[]`
- **Searchable:** Yes
- **Static/Dynamic:** Dynamic
- **Options:** department/function names (value id)
- **Add/Edit/Delete behavior:** —
- **Validation:** —
- **On-select behavior:** setInductionDeptIds
- **Dependencies:** partOfInduction
- **Backend/API/DB:** `createMaterial`
- **Special rules:** placeholder "Select Functions…"
- **Code locations:** `components/training/material-form.tsx:198`

### Session — Subject (LookupSelect)
- **Module:** Training
- **Screen:** Schedule session form
- **Field/Key:** `subjectId`
- **Source:** database (subjectOptions)
- **Component:** LookupSelect
- **Type:** Single
- **Required:** No
- **Default:** `null` (placeholder "Pick a subject…")
- **Searchable:** Yes
- **Static/Dynamic:** Dynamic
- **Options:** subject names; `onAdd` = `onAddSubject`
- **Add/Edit/Delete behavior:** inline add (if callback)
- **Validation:** —
- **On-select behavior:** set subjectId
- **Dependencies:** subjectOptions
- **Backend/API/DB:** `createSession`/`updateSession`
- **Special rules:** —
- **Code locations:** `components/training/calendar/session-form.tsx:157`

### Session — Trainer (LookupSelect)
- **Module:** Training
- **Screen:** Schedule session form
- **Field/Key:** `trainerId`
- **Source:** database (employeeOptions)
- **Component:** LookupSelect
- **Type:** Single
- **Required:** No
- **Default:** `null` (placeholder "Defaults to you…")
- **Searchable:** Yes
- **Static/Dynamic:** Dynamic
- **Options:** employee names
- **Add/Edit/Delete behavior:** —
- **Validation:** —
- **On-select behavior:** set trainerId
- **Dependencies:** employeeOptions
- **Backend/API/DB:** session
- **Special rules:** —
- **Code locations:** `components/training/calendar/session-form.tsx:169`

### Session — Attendees (MultiSelect)
- **Module:** Training
- **Screen:** Schedule session form
- **Field/Key:** `attendeeIds`
- **Source:** database (employeeOptions)
- **Component:** MultiSelect
- **Type:** Multi
- **Required:** No
- **Default:** `[]`
- **Searchable:** Yes
- **Static/Dynamic:** Dynamic
- **Options:** employee names
- **Add/Edit/Delete behavior:** —
- **Validation:** —
- **On-select behavior:** set attendeeIds
- **Dependencies:** employeeOptions
- **Backend/API/DB:** session
- **Special rules:** placeholder "Select attendees…"
- **Code locations:** `components/training/calendar/session-form.tsx:284`

### Assessment — Attendee (LookupSelect)
- **Module:** Training
- **Screen:** Session assessment panel "Record assessment"
- **Field/Key:** `employeeId`
- **Source:** database (empOptions)
- **Component:** LookupSelect
- **Type:** Single
- **Required:** Yes (for recording)
- **Default:** `null` (placeholder "Who?")
- **Searchable:** Yes
- **Static/Dynamic:** Dynamic
- **Options:** employee names
- **Add/Edit/Delete behavior:** —
- **Validation:** —
- **On-select behavior:** setEmployeeId
- **Dependencies:** empOptions
- **Backend/API/DB:** assessment record action
- **Special rules:** below passPct fails → redo
- **Code locations:** `components/training/calendar/assessment-panel.tsx:129`

### Feedback — Link to staff (LookupSelect)
- **Module:** Training (Feedback)
- **Screen:** New feedback form
- **Field/Key:** `ratedEmployeeId`
- **Source:** database (employees)
- **Component:** LookupSelect
- **Type:** Single
- **Required:** No
- **Default:** `null` (placeholder "Select staff…")
- **Searchable:** Yes
- **Static/Dynamic:** Dynamic
- **Options:** employee names
- **Add/Edit/Delete behavior:** —
- **Validation:** displayName required to submit
- **On-select behavior:** setRatedEmployeeId
- **Dependencies:** employees
- **Backend/API/DB:** `createFeedback`
- **Special rules:** —
- **Code locations:** `components/training/feedback/feedback-form.tsx:278`

### Feedback — Service (LookupSelect)
- **Module:** Training (Feedback)
- **Screen:** New feedback form
- **Field/Key:** `serviceId`
- **Source:** database (services)
- **Component:** LookupSelect
- **Type:** Single
- **Required:** No
- **Default:** `null`
- **Searchable:** Yes
- **Static/Dynamic:** Dynamic
- **Options:** services; `onAdd`=`addFeedbackService`, `onDelete`=`deleteFeedbackService`
- **Add/Edit/Delete behavior:** inline add + delete
- **Validation:** —
- **On-select behavior:** setServiceId
- **Dependencies:** services
- **Backend/API/DB:** `addFeedbackService`/`deleteFeedbackService`
- **Special rules:** —
- **Code locations:** `components/training/feedback/feedback-form.tsx:286`

### Feedback — Escalate to (LookupSelect)
- **Module:** Training (Feedback)
- **Screen:** New feedback form (when escalate checked)
- **Field/Key:** `escalatedToId`
- **Source:** database (employees)
- **Component:** LookupSelect
- **Type:** Single
- **Required:** No
- **Default:** `null` (placeholder "Select consultant…")
- **Searchable:** Yes
- **Static/Dynamic:** Dynamic
- **Options:** employee names
- **Add/Edit/Delete behavior:** —
- **Validation:** —
- **On-select behavior:** setEscalatedToId
- **Dependencies:** escalate flag
- **Backend/API/DB:** `createFeedback`
- **Special rules:** only sent when escalate
- **Code locations:** `components/training/feedback/feedback-form.tsx:380`

### Feedback detail — Escalate to (LookupSelect)
- **Module:** Training (Feedback)
- **Screen:** Feedback detail escalate action
- **Field/Key:** `escTo`
- **Source:** database (employees)
- **Component:** LookupSelect
- **Type:** Single
- **Required:** No
- **Default:** `null` (placeholder "Escalate to…")
- **Searchable:** Yes
- **Static/Dynamic:** Dynamic
- **Options:** employee names
- **Add/Edit/Delete behavior:** —
- **Validation:** —
- **On-select behavior:** setEscTo
- **Dependencies:** employees
- **Backend/API/DB:** `escalateFeedback`
- **Special rules:** —
- **Code locations:** `components/training/feedback/feedback-detail.tsx:141`

### Feedback dashboard — Status filter (native select)
- **Module:** Training (Feedback)
- **Screen:** Feedback dashboard toolbar
- **Field/Key:** local `status` filter
- **Source:** hardcoded
- **Component:** native select
- **Type:** Single
- **Required:** No
- **Default:** `""` ("All Status")
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** `All Status`(""), `Open`(open), `Escalated`(escalated), `Resolved`(resolved), `Signed Off`(signed_off)
- **Add/Edit/Delete behavior:** —
- **Validation:** —
- **On-select behavior:** filters rows
- **Dependencies:** —
- **Backend/API/DB:** —
- **Special rules:** archived not in filter list
- **Code locations:** `components/training/feedback/feedback-dashboard.tsx:95`

### Feedback dashboard — Type filter (native select)
- **Module:** Training (Feedback)
- **Screen:** Feedback dashboard toolbar
- **Field/Key:** local `type` filter
- **Source:** constant (FEEDBACK_TEMPLATES keys)
- **Component:** native select
- **Type:** Single
- **Required:** No
- **Default:** `""` ("All Types")
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** `All Types`("") + `Consultant`(consultant), `Trainer`(trainer), `In-call`(in_call)
- **Add/Edit/Delete behavior:** —
- **Validation:** —
- **On-select behavior:** filters rows
- **Dependencies:** `lib/training/feedback-templates.ts`
- **Backend/API/DB:** —
- **Special rules:** —
- **Code locations:** `components/training/feedback/feedback-dashboard.tsx:99`

### Materials table — Subject filter (native select)
- **Module:** Training
- **Screen:** Materials table toolbar
- **Field/Key:** local `subject` filter
- **Source:** computed (distinct subjects from rows)
- **Component:** native select
- **Type:** Single
- **Required:** No
- **Default:** `""` ("All Subjects")
- **Searchable:** No
- **Static/Dynamic:** Dynamic
- **Options:** `All Subjects` + distinct subject strings
- **Add/Edit/Delete behavior:** —
- **Validation:** —
- **On-select behavior:** filters rows
- **Dependencies:** rows
- **Backend/API/DB:** —
- **Special rules:** —
- **Code locations:** `components/training/materials-table.tsx:113`

---

# HOLIDAYS MODULE

No dropdowns. `/holidays` page is read-only and religion-personalised. `HOLIDAY_APPLIES_TO` / `RELIGIONS` constants are consumed only by `components/events/holidays/personalise.ts` (logic) and the read-only page — no picker UI in scope. `DEFAULT_APPRAISAL_RATING_TERMS`, `APPRAISAL_CYCLE_STATUSES`, etc. are used for labels/status, not pickers.

---

# DASHBOARD (goal/appraisal filters)

No dedicated goal/appraisal dropdowns live under `components/dashboard`. The Goals dashboard filter (employees multi-select + date range) lives in `components/goals/dashboard/goals-dashboard-filters.tsx` (covered above). The only dropdowns in `components/dashboard` are task/activity-related and out of the goal/appraisal scope: `aging-heatmap.tsx:932` (Sort aging lanes — Risk/Total/Oldest), `performer-task-drawer.tsx:358` (generic labeled select), `exec/period-range-picker.tsx` (activity period Popover). No goal/appraisal filter selects in `components/dashboard`.

---

# CONSTANTS / OPTION ARRAYS (db/enums.ts + lib) — sources of truth

- `GOAL_PERIODS` = `year, quarter, month, week, day`; `GOAL_PERIOD_LABELS` = Yearly/Quarterly/Monthly/Weekly/Daily
- `GOAL_SOURCES` = `manual, cascade`
- `GOAL_TYPES` = `kpi, strategic, operational, essential`; labels KPI/Strategic/Operational/Essential
- `NON_KPI_GOAL_TYPES` = `strategic, operational`
- `APPRAISAL_DIMENSIONS` = `kpi, skill, attitude, incentive, culture, knowledge_sharing, problem_solving, growth_mindset, ability`
- `APPRAISAL_MANAGER_ONLY_DIMENSIONS` = `problem_solving, growth_mindset, ability`
- `APPRAISAL_AUTO_DIMENSIONS` = `incentive, knowledge_sharing`
- `APPRAISAL_CYCLE_STATUSES` = `draft, open, review, finalized, archived`
- `APPRAISAL_ITEM_STATUSES` = `draft, awaiting_self, awaiting_manager, awaiting_management, finalized`
- `APPRAISAL_SCORE_STAGES` = `self, manager, management, final`
- `DEFAULT_APPRAISAL_RATING_TERMS` = ≥90 Outstanding, ≥75 Exceeds Expectations, ≥60 Meets Expectations, ≥40 Needs Improvement, ≥0 Unsatisfactory
- `KPI_FREQUENCIES` = `weekly, monthly, quarterly, annual`
- `KPI_ASSIGNMENT_STATUSES` = `active, inactive`
- `KPI_CHANGE_TYPES` = `assigned, updated, activated, deactivated, removed, weightage_changed, target_changed`
- `EVENT_STATUSES` = `tentative, confirmed`; `EVENT_SOURCES` = `manual, holiday, batch, obligation`
- `BROADCAST_PRIORITIES` = `normal, important, high, critical, emergency`
- `BROADCAST_CATEGORIES` = `announcement, ceo, policy, compliance, emergency, department, event, holiday, recognition, it, payroll, other`
- `BROADCAST_STATUSES` = `draft, scheduled, published, paused, archived`
- `BROADCAST_ACK_MODES` = `none, read, acknowledge`
- `BROADCAST_AUTHOR_IDENTITIES` = `hr, ceo, founder`
- `BROADCAST_RECIPIENT_STATUSES` = `pending, read, acknowledged`
- `BROADCAST_RECURRENCES` = `none, daily, weekly, monthly`
- `HOLIDAY_APPLIES_TO` = `all, hindu_only, christian, muslim, custom`; labels Everyone/Hindu only/Christian add-on/Muslim add-on/Custom
- `RELIGIONS` = `hindu, christian, muslim, other, unspecified`; labels Hindu/Christian/Muslim/Other/Unspecified

`lib/performance/framework.ts` — `ROLE_CLASSES` = `manager` ("Manager") / `non-manager` ("Non-Manager"); `MACRO_BUCKETS` (manager: KPI Incentives 40, Monthly Goals 20, Altus Culture 10, Skill Upgrade 5, Knowledge Sharing 5, Problem Solving 5, Growth Mindset 5, MIH (Make It Happen) from Others 5, Team Nurture 5; non-manager: KPI Incentives 20, Monthly Goals 30, Altus Culture 15, Problem Solving 10, Growth Mindset 10, Attend Training 5, Skill Upgrade 5, Team Player 5). Role class is selected via PILL buttons in `components/appraisal2/admin-panel.tsx:140` (not a dropdown).

`lib/performance/kpi-dictionary.ts` — `KPI_DICTIONARY` (named KPI target sets per person; pure seed data, no picker UI).

---

## Audit notes
- The `GoalLookupSelect` kind values: `"area" | "measure" | "type" | "goaltype"`; `pickList`/`applyOptions` in `goal-lookup-select.tsx:184-204`.
- Weekly board ComboInput client/subject options originate from `listActiveClientNames()` / `listActiveSubjectNames()` (`app/(app)/weekly-goals/page.tsx:44-48`).
- `QUARTER_TYPE_OPTIONS` = `["Incentive", "KPI", "Strategic", "Operational"]` (`components/goals/board/goal-table-view.tsx:1880`).
- `GOAL_TYPE_OPTIONS` = `GOAL_TYPES.map(GOAL_TYPE_LABELS)` = `["KPI","Strategic","Operational","Essential"]` (`goal-table-view.tsx:1874`).
- Event time slots: `DAY_START_MIN=0`, `DAY_END_MIN=1440`, `SLOT_MIN=30` (`lib/monthly-events/types.ts:31-35`).
- `PCT_PRESETS = [0, 25, 50, 75, 100]` in `weekly-goals-fill-form.tsx:24` and `weekly-goals-board.tsx` are BUTTON groups, not dropdowns.

### 3.6 — Admin / Projects / Operations / People-Allocation / Hand-holding / Documents / Dashboard

# Slice 6 — Dropdown / Select / Option-Picker Audit
**Scope:** ADMIN, SYSTEM/SETTINGS, MASTER-ADMIN, PROJECTS, OPERATIONS, PRODUCTIVITY, PEOPLE-ALLOCATION, HAND-HOLDING, DOCUMENTS, DOSSIER, DASHBOARD, SEARCH/FILTERS, HUB, INBOX, MISCELLANEOUS.
**Repo:** `C:/Users/om jadhav/Downloads/wms-local-main (1)/wms-local-main`
**Date:** 2026-09-19 (READ-ONLY — no files modified)

Conventions: value → label. `UNKNOWN — NEEDS REVIEW` where a fact could not be confirmed. The shadcn `Select` (components/ui/select.tsx) and `MultiSelect` (components/ui/multi-select.tsx) are Popover + cmdk (`Command`) comboboxes — both are searchable (Select auto-searches when >8 options). `LookupSelect` was NOT found anywhere in scope. `Command`/cmdk is only used inside Select/MultiSelect (and role="combobox" in ManagedSelect).

---

# 1. PEOPLE-ALLOCATION (Hand-holding)

### Person Kind (Employee / Intern)
- **Module:** People-Allocation / Hand-holding
- **Screen:** Add Employee / Intern form (EntryForm)
- **Field/Key:** `kind`
- **Source:** constant (db/enums `HH_PERSON_KINDS`)
- **Component:** toggle buttons (other)
- **Type:** Single
- **Required:** Yes
- **Default:** `employee` (or `intern` when opened from intern roster)
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** `employee` → "Employee"; `intern` → "Intern"
- **Add/Edit/Delete behavior:** N/A
- **Validation:** Always one selected
- **On-select behavior:** Switches name roster + product order; clears name
- **Dependencies:** Name + Product options
- **Backend/API/DB:** `addEntry` action
- **Special rules:** Intern order = Retainer, Eco System, PS, BSS
- **Code locations:** `components/people-allocation/entry-form.tsx:194-232`

### Employee Name / Intern Name
- **Module:** People-Allocation
- **Screen:** Add Employee / Intern form
- **Field/Key:** `name`
- **Source:** constant (db/enums `hhNamesFor` → `HH_EMPLOYEE_NAMES` / `HH_INTERN_NAMES`)
- **Component:** native select (custom `Select` wrapper)
- **Type:** Single
- **Required:** Yes
- **Default:** "" (placeholder)
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** Employee: `Dattaram, Jeevan, Mishtie, Mitul, Namrata, Parvez, Prakash, Raj, Rohan, Ruchita, Rutvisha`. Intern: `Danyal, Hardik, Krish, Nandini, Om, Proveeka, Shreya Randhe, Shreya Shukla, Suresh, Vinal`. Placeholder "Select employee" / "Select intern".
- **Add/Edit/Delete behavior:** Server matches/creates roster name
- **Validation:** required
- **On-select behavior:** —
- **Dependencies:** Person Kind
- **Backend/API/DB:** `addEntry`
- **Special rules:** —
- **Code locations:** `components/people-allocation/entry-form.tsx:236-244`

### Product Name (EntryForm)
- **Module:** People-Allocation
- **Screen:** Add Employee / Intern form
- **Field/Key:** `section` (product)
- **Source:** constant (db/enums `ALLOCATION_CATEGORIES` / `INTERN_PRODUCTS`)
- **Component:** native select
- **Type:** Single
- **Required:** Yes
- **Default:** `defaultSection` prop
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** Employee: `ps`→"PS", `bss`→"BSS", `retainer`→"Retainer", `ecosystem`→"Eco System". Intern (reordered): `retainer`→"Retainer", `ecosystem`→"Eco System", `ps`→"PS", `bss`→"BSS". Placeholder "Select product".
- **Add/Edit/Delete behavior:** —
- **Validation:** required
- **On-select behavior:** toggles Batch No. visibility (PS/BSS only)
- **Dependencies:** `HH_BATCHED_SECTIONS`
- **Backend/API/DB:** `addEntry`
- **Special rules:** —
- **Code locations:** `components/people-allocation/entry-form.tsx:246-254`

### Batch No. (datalist)
- **Module:** People-Allocation
- **Screen:** Add Employee / Intern form
- **Field/Key:** `batchNo`
- **Source:** database (prop `batchOptions` = distinct batch numbers already in use)
- **Component:** native input + `<datalist>` (other)
- **Type:** Single (free text w/ suggestions)
- **Required:** No
- **Default:** ""
- **Searchable:** No (browser autocomplete)
- **Static/Dynamic:** Dynamic
- **Options:** suggested batch numbers
- **Add/Edit/Delete behavior:** —
- **Validation:** only shown for PS/BSS
- **On-select behavior:** —
- **Dependencies:** Product Name
- **Backend/API/DB:** derived from entries
- **Special rules:** hidden for Retainer/Eco System
- **Code locations:** `components/people-allocation/entry-form.tsx:257-278`

### Weekly Call Type (EntryForm)
- **Module:** People-Allocation
- **Screen:** Add Employee / Intern form (each weekly call row)
- **Field/Key:** `calls[i].callType`
- **Source:** constant (db/enums `HH_CALL_TYPES`)
- **Component:** native select
- **Type:** Single
- **Required:** Yes
- **Default:** "" (placeholder)
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** `hh`→"HH Call", `tool`→"Tool Call", `checkin`→"Check-in Call". Placeholder "Select type".
- **Add/Edit/Delete behavior:** rows addable/removable
- **Validation:** required per row
- **On-select behavior:** —
- **Dependencies:** —
- **Backend/API/DB:** `addEntry`
- **Special rules:** repeats per call row (1..N)
- **Code locations:** `components/people-allocation/entry-form.tsx:318-326`

### Weekly Call Day (EntryForm)
- **Module:** People-Allocation
- **Screen:** Add Employee / Intern form
- **Field/Key:** `calls[i].day`
- **Source:** constant (db/enums `HH_DAYS`)
- **Component:** native select
- **Type:** Single
- **Required:** Yes
- **Default:** "" (placeholder)
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** `mon`→"Mon", `tue`→"Tue", `wed`→"Wed", `thu`→"Thu", `fri`→"Fri", `sat`→"Sat", `sun`→"Sun". Placeholder "Select day".
- **Add/Edit/Delete behavior:** —
- **Validation:** required per row
- **On-select behavior:** —
- **Dependencies:** —
- **Backend/API/DB:** `addEntry`
- **Special rules:** repeats per call row
- **Code locations:** `components/people-allocation/entry-form.tsx:327-335`

### Access Role (Admin / HR / Ruchita)
- **Module:** People-Allocation
- **Screen:** Access / Permissions dialog + Admin Panel
- **Field/Key:** `role`
- **Source:** constant (db/enums `HH_ACCESS_ROLES`)
- **Component:** toggle buttons (tablist)
- **Type:** Single
- **Required:** Yes
- **Default:** `hr`
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** `admin`→"Admin", `hr`→"HR", `ruchita`→"Ruchita"
- **Add/Edit/Delete behavior:** —
- **Validation:** always one
- **On-select behavior:** recomputes Action options (`hhActionsFor`)
- **Dependencies:** Action dropdown
- **Backend/API/DB:** `addAccessActivity`
- **Special rules:** fixed matrix, not stored
- **Code locations:** `components/people-allocation/access-dialog.tsx:483-511`

### Access Module (multi)
- **Module:** People-Allocation
- **Screen:** Access / Permissions dialog
- **Field/Key:** `modules`
- **Source:** constant (db/enums `HH_ACCESS_MODULES`)
- **Component:** toggle buttons (multi)
- **Type:** Multi
- **Required:** Yes
- **Default:** `[handholding]`
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** `handholding`→"Hand-holding", `ambassadors`→"Ambassadors", `development`→"Development"
- **Add/Edit/Delete behavior:** one stored row per selected module
- **Validation:** ≥1
- **On-select behavior:** —
- **Dependencies:** —
- **Backend/API/DB:** `addAccessActivity`
- **Special rules:** multi-select as toggles, not `<select multiple>`
- **Code locations:** `components/people-allocation/access-dialog.tsx:536-559`

### Access Section (Employees / Interns)
- **Module:** People-Allocation
- **Screen:** Access / Permissions dialog
- **Field/Key:** `section`
- **Source:** constant (db/enums `HH_ACCESS_SECTIONS`)
- **Component:** toggle buttons (tablist)
- **Type:** Single
- **Required:** Yes
- **Default:** `employees`
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** `employees`→"Employees", `interns`→"App Development (Interns)" (renders as "Interns")
- **Add/Edit/Delete behavior:** —
- **Validation:** always one
- **On-select behavior:** resets person name; drives name roster
- **Dependencies:** Select (person name)
- **Backend/API/DB:** `addAccessActivity`
- **Special rules:** —
- **Code locations:** `components/people-allocation/access-dialog.tsx:563-601`

### Access Select (person name)
- **Module:** People-Allocation
- **Screen:** Access / Permissions dialog
- **Field/Key:** `personName`
- **Source:** constant (db/enums `hhNamesFor`)
- **Component:** native select (custom `Select` wrapper)
- **Type:** Single
- **Required:** Yes
- **Default:** ""
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** employee or intern names (see Employee Name). Placeholder "Select employee"/"Select intern".
- **Add/Edit/Delete behavior:** —
- **Validation:** required
- **On-select behavior:** —
- **Dependencies:** Section
- **Backend/API/DB:** `addAccessActivity`
- **Special rules:** —
- **Code locations:** `components/people-allocation/access-dialog.tsx:604-615`

### Access Action
- **Module:** People-Allocation
- **Screen:** Access / Permissions dialog
- **Field/Key:** `action`
- **Source:** constant (db/enums `hhActionsFor` → `HH_ACCESS_ACTIONS`)
- **Component:** native select
- **Type:** Single
- **Required:** Yes
- **Default:** `add`
- **Searchable:** No
- **Static/Dynamic:** Static (varies by role)
- **Options:** Admin/Ruchita: `add`→"Add", `edit`→"Edit", `delete`→"Delete". HR: `add`→"Add" only. Placeholder "Select action".
- **Add/Edit/Delete behavior:** —
- **Validation:** required
- **On-select behavior:** —
- **Dependencies:** Role
- **Backend/API/DB:** `addAccessActivity`
- **Special rules:** dropdown never lists an action the server refuses
- **Code locations:** `components/people-allocation/access-dialog.tsx:617-629`

### Access Activity table — Module cell
- **Module:** People-Allocation
- **Screen:** Access / Permissions (stored rows, in-place edit)
- **Field/Key:** `row.module`
- **Source:** constant (`HH_ACCESS_MODULES`)
- **Component:** native select (`RowSelect`)
- **Type:** Single
- **Required:** Yes
- **Default:** stored value
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** Hand-holding / Ambassadors / Development (same as Module)
- **Add/Edit/Delete behavior:** in-place `updateAccessActivity`
- **Validation:** —
- **On-select behavior:** commits on change
- **Dependencies:** `canEdit`
- **Backend/API/DB:** `updateAccessActivity`
- **Special rules:** disabled for non-editors
- **Code locations:** `components/people-allocation/access-dialog.tsx:738-744`

### Access Activity table — Person cell
- **Field/Key:** `row.personName`
- **Options:** employee/intern roster by section; keeps pre-list value (`extra`)
- **Code locations:** `components/people-allocation/access-dialog.tsx:747-757` (component: native select `RowSelect`, Single, Required, source constant, backend `updateAccessActivity`)

### Access Activity table — Section cell
- **Field/Key:** `row.section`
- **Options:** `employees`→"Employees", `interns`→"Interns"
- **Code locations:** `components/people-allocation/access-dialog.tsx:760-769` (native select, Single, source constant `HH_ACCESS_SECTIONS`)

### Access Activity table — Action cell
- **Field/Key:** `row.action`
- **Options:** Add/Edit/Delete per row role (`hhActionsFor`), keeps `extra`
- **Code locations:** `components/people-allocation/access-dialog.tsx:772-779` (native select, Single, source constant)

### Ambassador Product Name (multi)
- **Module:** People-Allocation / Ambassadors
- **Screen:** Ambassadors screen Add form
- **Field/Key:** `products`
- **Source:** constant (`ALLOCATION_CATEGORIES`)
- **Component:** toggle buttons (multi)
- **Type:** Multi
- **Required:** No
- **Default:** `[]`
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** `ps`→"PS", `bss`→"BSS", `retainer`→"Retainer", `ecosystem`→"Eco System"
- **Add/Edit/Delete behavior:** —
- **Validation:** name required to save
- **On-select behavior:** toggles Batch No. visibility
- **Dependencies:** `HH_BATCHED_SECTIONS`
- **Backend/API/DB:** `upsertAmbassador`
- **Special rules:** —
- **Code locations:** `components/people-allocation/ambassadors-screen.tsx:203-231`

### Ambassador Weekly Call Type
- **Field/Key:** `calls[i].callType`
- **Options:** HH Call / Tool Call / Check-in Call (`HH_CALL_TYPES`)
- **Component:** native select; default `hh`; repeats per row
- **Code locations:** `components/people-allocation/ambassadors-screen.tsx:277-292`

### Ambassador Day
- **Field/Key:** `calls[i].day`
- **Options:** Mon..Sun (`HH_DAYS`, short labels); default `mon`
- **Component:** native select; repeats per row
- **Code locations:** `components/people-allocation/ambassadors-screen.tsx:298-313`

### Bulk Add roster (Employees / Interns)
- **Module:** People-Allocation (Admin Panel)
- **Screen:** Bulk Add PS / Bulk Add BSS dialog
- **Field/Key:** selection set
- **Source:** constant (`HH_EMPLOYEE_NAMES`, `HH_INTERN_NAMES`)
- **Component:** checkbox grid (other)
- **Type:** Multi
- **Required:** Yes (≥1 to save)
- **Default:** none
- **Searchable:** No
- **Static/Dynamic:** Static (already-on people disabled)
- **Options:** grouped "Employees" and "App Development (Interns)" name lists
- **Add/Edit/Delete behavior:** —
- **Validation:** "Select at least one person."
- **On-select behavior:** —
- **Dependencies:** `alreadyOn` set
- **Backend/API/DB:** `bulkAddParticipants`
- **Special rules:** —
- **Code locations:** `components/people-allocation/bulk-add-dialog.tsx:98-194`

### Participants filter — Module
- **Module:** People-Allocation
- **Screen:** All Participants table toolbar
- **Field/Key:** `moduleFilter`
- **Source:** constant (`HH_PARTICIPANT_MODULES`)
- **Component:** native select (`Chevroned`)
- **Type:** Single
- **Required:** No
- **Default:** "" ("All modules")
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** "All modules"; `ps`→"PS", `bss`→"BSS", `retainer`→"Retainer", `ecosystem`→"Eco System", `tool`→"Tool", `follow_up`→"Follow Up"
- **Add/Edit/Delete behavior:** —
- **Validation:** —
- **On-select behavior:** client-side filter
- **Dependencies:** —
- **Backend/API/DB:** —
- **Special rules:** —
- **Code locations:** `components/people-allocation/participants-table.tsx:444-458`

### Participants filter — Day
- **Field/Key:** `dayFilter`
- **Options:** "All days"; HH_DAYS full labels (Monday..Sunday)
- **Component:** native select; Single
- **Code locations:** `components/people-allocation/participants-table.tsx:459-473`

### Participants Sort menu (Module / Participant Name)
- **Field/Key:** sort direction
- **Options:** `asc`→"A to Z", `desc`→"Z to A"
- **Component:** custom dropdown menu (`role="menu"`, menuitemradio)
- **Code locations:** `components/people-allocation/participants-table.tsx:173-250` (used at 528-548)

### Participants cell — Module
- **Field/Key:** `row.section`
- **Options:** "None" + HH_PARTICIPANT_MODULES
- **Component:** native select; Single; editable `canEdit`
- **Backend:** `setParticipantProduct`
- **Code locations:** `components/people-allocation/participants-table.tsx:578-593`

### Participants cell — Participant Name
- **Field/Key:** `row.name`
- **Options:** `HH_ALL_PERSON_NAMES` + pre-list value
- **Component:** native select; Single; backend `setParticipantName`
- **Code locations:** `components/people-allocation/participants-table.tsx:596-613`

### Participants cell — Call
- **Field/Key:** `row.callType`
- **Options:** "None" + `HH_PARTICIPANT_CALLS` (`1`,`2`,`3`,`4`)
- **Component:** native select; Single; backend `setParticipantCall`
- **Code locations:** `components/people-allocation/participants-table.tsx:616-631`

### Participants cell — Day
- **Field/Key:** `row.day`
- **Options:** "None" + HH_DAYS full labels
- **Component:** native select; Single; backend `setParticipantDay`
- **Code locations:** `components/people-allocation/participants-table.tsx:643-659`

---

# 2. PEOPLE-GIVES

### Introductions filter — Reference source
- **Module:** People-Gives
- **Screen:** People Gives list toolbar
- **Field/Key:** `source` (`referenceSource`)
- **Source:** API/database (distinct values from rows)
- **Component:** native select
- **Type:** Single
- **Required:** No
- **Default:** "" ("All Sources")
- **Searchable:** No
- **Static/Dynamic:** Dynamic
- **Options:** "All Sources" + distinct reference-source strings
- **Add/Edit/Delete behavior:** —
- **Validation:** —
- **On-select behavior:** client-side filter
- **Dependencies:** —
- **Backend/API/DB:** rows from query
- **Special rules:** —
- **Code locations:** `components/people-gives/introductions-table.tsx:132-135`

### Introductions filter — Business category
- **Field/Key:** `category`
- **Options:** "All Categories" + distinct businessCategory
- **Component:** native select; Single
- **Code locations:** `components/people-gives/introductions-table.tsx:136-139`

### Introductions filter — Salesperson
- **Field/Key:** `salesPerson`
- **Options:** "All Salespeople" + distinct salesPerson
- **Component:** native select; Single
- **Code locations:** `components/people-gives/introductions-table.tsx:140-143`

### Reference Source (ManagedSelect)
- **Module:** People-Gives
- **Screen:** New Introduction form
- **Field/Key:** `referenceSourceId`
- **Source:** API/database (`lookups.referenceSources`; kind `reference_source`)
- **Component:** combobox (Popover + role="listbox"; custom `ManagedSelect`)
- **Type:** Single
- **Required:** No
- **Default:** null
- **Searchable:** Yes (type-ahead)
- **Static/Dynamic:** Dynamic
- **Options:** lookup options from DB; "+ Add new reference source…" inline; "Clear Selection"
- **Add/Edit/Delete behavior:** inline add (`addLookupOption`), soft-delete (`softDeleteLookupOption`)
- **Validation:** optional UUID
- **On-select behavior:** sets id
- **Dependencies:** —
- **Backend/API/DB:** `people_gives_lookup` (via `app/(app)/people-gives/actions`)
- **Special rules:** mirrors WMS ClientSelect
- **Code locations:** `components/people-gives/introduction-form.tsx:151-160`; component `components/people-gives/managed-select.tsx`

### Designation (ManagedSelect)
- **Field/Key:** `designationId`; kind `designation`; source `lookups.designations`
- **Code locations:** `components/people-gives/introduction-form.tsx:189-191`

### Business Category (ManagedSelect)
- **Field/Key:** `businessCategoryId`; kind `business_category`; source `lookups.businessCategories`
- **Code locations:** `components/people-gives/introduction-form.tsx:192-194`

### Assign Salesperson (ManagedSelect)
- **Field/Key:** `salesPersonId`; kind `sales_person`; source `lookups.salesPeople`
- **Code locations:** `components/people-gives/introduction-form.tsx:206-208`

---

# 3. ADMIN — EMPLOYEE EDITORS / DIALOGS

### Edit Employee — Task Role
- **Module:** Admin (Employees)
- **Screen:** Edit employee dialog
- **Field/Key:** `role`
- **Source:** constant (`EMPLOYEE_ROLES` labels)
- **Component:** shadcn `Select` (cmdk combobox)
- **Type:** Single
- **Required:** Yes
- **Default:** employee role
- **Searchable:** No (≤8)
- **Static/Dynamic:** Static
- **Options:** `doer`→"Doer", `initiator`→"Initiator", `both`→"Both"
- **Add/Edit/Delete behavior:** —
- **Validation:** zod enum
- **On-select behavior:** —
- **Dependencies:** —
- **Backend/API/DB:** `editEmployee`
- **Special rules:** —
- **Code locations:** `components/admin/edit-employee-dialog.tsx:248-258`

### Edit Employee — Manager
- **Field/Key:** `managerId`
- **Source:** API (`managerOptions` prop)
- **Component:** shadcn `Select`, searchable
- **Options:** `""`→"— None —" + manager list (excludes self)
- **Code locations:** `components/admin/edit-employee-dialog.tsx:259-271`

### Edit Employee — Weekly off
- **Field/Key:** `weeklyOff`
- **Source:** hardcoded `WEEKDAY_OPTIONS`
- **Component:** shadcn `Select`
- **Options:** `0`→"Sunday" … `6`→"Saturday"
- **Code locations:** `components/admin/edit-employee-dialog.tsx:377-383`

### Edit Employee — Functions (optional)
- **Field/Key:** `departmentIds` / `primaryId`
- **Source:** API (`departmentOptions` = functions)
- **Component:** checkbox list w/ primary star (`DepartmentMultiSelect`) — other
- **Type:** Multi
- **Code locations:** `components/admin/edit-employee-dialog.tsx:272-282`; component `components/admin/department-multi-select.tsx`

### Invite Employee — Task Role
- **Field/Key:** `role`
- **Options:** Doer / Initiator / Both
- **Component:** shadcn `Select`
- **Code locations:** `components/admin/invite-employee-dialog.tsx:108-118`

### Invite Employee — Functions (optional)
- **Component:** `DepartmentMultiSelect` (checkbox multi)
- **Code locations:** `components/admin/invite-employee-dialog.tsx:119-129`

### Salary Profile — Employee Type
- **Module:** Admin (Salary Profiles)
- **Field/Key:** `workerType`
- **Source:** constant (`WORKER_TYPES` + `WORKER_TYPE_LABELS`)
- **Component:** shadcn `Select`
- **Options:** `full_time`→"Full Time", `first_half`→"First Half", `second_half`→"Second Half", `hybrid`→"Hybrid", `project_remote`→"Project / Remote"
- **Default:** `full_time`
- **Code locations:** `components/admin/salary-profile-dialog.tsx:149-156`

### Salary Profile — Designation
- **Field/Key:** `designationId`
- **Source:** API (`designations` prop)
- **Component:** shadcn `Select`, searchable, placeholder "— None —"
- **Code locations:** `components/admin/salary-profile-dialog.tsx:279-288`

### Salary Profile — Paying Entity
- **Field/Key:** `payingEntityId`
- **Source:** API (`entities` prop)
- **Component:** shadcn `Select`, searchable, placeholder "— None —"
- **Code locations:** `components/admin/salary-profile-dialog.tsx:290-299`

### Employee Editor — Task Role (single + bulk)
- **Screen:** Employee editor (Edit N Employees / Edit Employee)
- **Field/Key:** `role`
- **Component:** shadcn `Select`; bulk adds `__no_change__`→"No Change"
- **Options:** Doer / Initiator / Both (+ "No Change" in bulk)
- **Code locations:** `components/admin/employee-editor/index.tsx:499-509`

### Employee Editor — Manager
- **Field/Key:** `managerId`
- **Component:** shadcn `Select`, searchable; options "No Change" (bulk), "— None —", managers
- **Code locations:** `components/admin/employee-editor/index.tsx:510-523`

### Employee Editor — WhatsApp consent (bulk only)
- **Field/Key:** `waOptIn`
- **Component:** shadcn `Select`
- **Options:** `__no_change__`→"No Change", `yes`→"Consent given", `no`→"No consent"
- **Code locations:** `components/admin/employee-editor/index.tsx:628-639`

### Employee Editor — Employee Type (schedule)
- **Field/Key:** `workerType`
- **Component:** shadcn `Select`
- **Options:** WORKER_TYPE_OPTIONS (Full Time / First Half / Second Half / Hybrid / Project / Remote) + "No Change" (bulk)
- **Code locations:** `components/admin/employee-editor/schedule-fields.tsx:72-90`

### Employee Editor — Weekly Off (schedule)
- **Field/Key:** `weeklyOff`
- **Component:** shadcn `Select`
- **Options:** Sunday..Saturday (values 0-6) + "No Change" (bulk)
- **Code locations:** `components/admin/employee-editor/schedule-fields.tsx:92-104`

### Employee Editor — Functions
- **Component:** `DepartmentMultiSelect`
- **Code locations:** `components/admin/employee-editor/index.tsx:549-557`

---

# 4. ADMIN — EMPLOYEE MASTER

### Employee Master — Section (mobile)
- **Screen:** Employee Master workspace (mobile rail)
- **Field/Key:** `section`
- **Source:** hardcoded `SECTIONS`
- **Component:** native select
- **Options:** Overview / Payroll / Contact Details / Documents / Work & Attendance / Other (Payroll only when `canSeePay`)
- **Code locations:** `components/admin/employee-master/workspace.tsx:486-497`

### Employee Master — Designation (Pick)
- **Field/Key:** `designationId`
- **Source:** API (`options.designations`)
- **Component:** native select
- **Options:** `""`→"—" + designations
- **Code locations:** `components/admin/employee-master/workspace.tsx:606`

### Employee Master — Entity (Pick)
- **Field/Key:** `payingEntityId`
- **Source:** API (`options.entities`)
- **Options:** "—" + entities
- **Code locations:** `components/admin/employee-master/workspace.tsx:607`

### Employee Master — Manager (Pick)
- **Field/Key:** `managerId`
- **Source:** API (`options.managers`)
- **Options:** "—" + managers
- **Code locations:** `components/admin/employee-master/workspace.tsx:636`

### Employee Master — Shift Type
- **Field/Key:** `workerType`
- **Source:** constant (`EMPLOYEE_TYPE_OPTIONS` + `WORKER_TYPE_LABELS`)
- **Component:** native select
- **Options:** `""`→"—"; `full_time`→"Full Time", `first_half`→"First Half", `second_half`→"Second Half", `hybrid`→"Hybrid" (project_remote EXCLUDED)
- **Code locations:** `components/admin/employee-master/workspace.tsx:1233-1246`

### Employee Master table — Status (segmented)
- **Screen:** Employee Master table toolbar
- **Source:** constant (`EMPLOYEE_STATUS_TABS`/`EMPLOYEE_STATUS_LABELS` from lib/employees/master-filters)
- **Component:** segmented buttons
- **Options:** `all`→"All", `current`→"Current", `probation`→"Probation", `past`→"Past" (with counts)
- **Code locations:** `components/admin/employee-master/master-table.tsx:490-516`

### Employee Master table — Filters (Entity / Designation / Function / Manager / Shift Type / Status / Team Lead / Train Pass / PT Exempt / Probation / Employee Code)
- **Screen:** Employee Master table Filters panel
- **Component:** native select (local `Select`)
- **Options:**
  - Entity / Designation / Function / Manager: `""`→"Any" + `options.*` (API)
  - Shift Type: `""`→"Any" + EMPLOYEE_TYPE_OPTIONS labels
  - Status: `""`→"Any", `active`→"active", `probation`→"probation", `inactive`→"inactive", `offboarded`→"offboarded"
  - Team Lead / Train Pass / PT Exempt: `""`→"Any", `yes`→"Yes", `no`→"No"
  - Probation: `""`→"Any", `on`→"On probation", `off`→"Not on probation"
  - Employee Code: `""`→"Any", `yes`→"Has a code", `no`→"No code yet"
- **Code locations:** `components/admin/employee-master/master-table.tsx:555-578`

### Employee Master — Columns (checkbox list)
- **Component:** checkbox grid of column keys (other, Multi)
- **Code locations:** `components/admin/employee-master/master-table.tsx:525-541`

### Employee Master — MasterRowActions (dropdown)
- **Screen:** Employee Master row kebab
- **Component:** shadcn `DropdownMenu`
- **Options:** "Edit Employee", "Copy invite link" / "Copy password-reset link", "Reset Password", "Deactivate"/"Reactivate", "Offboard employee"
- **Code locations:** `components/admin/employee-master/row-actions.tsx:109-154`

### Bulk Edit — Entity / Designation / Shift Type / Manager / Team Lead / Train Pass
- **Screen:** Employee Master Bulk Edit dialog
- **Component:** native select (each gated by a checkbox)
- **Options:**
  - Entity/Designation/Shift Type/Manager: `""`→"— (clear this field)" + options
  - Team Lead / Train Pass: `yes`→"Yes", `no`→"No"
- **Code locations:** `components/admin/employee-master/bulk-edit-dialog.tsx:91-106, 196-247`

---

# 5. ADMIN — OFFBOARDING / HIERARCHY / TEMP ACCESS / PERMISSIONS

### Offboard — Reason for leaving
- **Screen:** Offboard employee wizard (step 1)
- **Field/Key:** `exitReason`
- **Source:** constant (`EXIT_REASONS`/`EXIT_REASON_LABELS`)
- **Component:** native select
- **Options:** `resigned`→"Resigned", `terminated_for_cause`→"Terminated for cause", `redundancy`→"Redundancy", `contract_ended`→"Contract ended", `abandonment`→"Abandonment", `retirement`→"Retirement", `deceased`→"Deceased", `other`→"Other"
- **Default:** `resigned`
- **Code locations:** `components/admin/archive-employee-dialog.tsx:214-234`

### Offboard — Eligible for rehire
- **Field/Key:** `rehire`
- **Source:** constant (`REHIRE_ELIGIBILITIES`/`REHIRE_LABELS`)
- **Options:** `yes`→"Eligible for rehire", `no`→"Not eligible", `with_review`→"Eligible with review"
- **Default:** `with_review`
- **Code locations:** `components/admin/archive-employee-dialog.tsx:237-256`

### Offboard — Transfer open work to
- **Field/Key:** `successorId`
- **Source:** API (`successorOptions`)
- **Options:** `""`→"Nobody — leave tasks unassigned" + active colleagues
- **Code locations:** `components/admin/archive-employee-dialog.tsx:324-342`

### Hierarchy — Move to…
- **Screen:** Hierarchy board card
- **Field/Key:** manager target
- **Source:** API (`people` prop)
- **Component:** native select
- **Options:** `""`→"Move to…"; `__unassigned__`→"No manager" (when has manager); other managers
- **Code locations:** `components/admin/hierarchy-board.tsx:309-330`

### Temporary Access — Employee (whose account)
- **Screen:** Temporary Access grant card
- **Field/Key:** `targetId`
- **Source:** API (`targets` prop)
- **Component:** native select
- **Options:** `""`→"Select an employee…" + `{name} · {email}`
- **Code locations:** `components/admin/temporary-access-panel.tsx:212-224`

### Temporary Access — Temporary access user (delegate)
- **Field/Key:** `delegateId`
- **Options:** `""`→"Select a person…" + delegates
- **Code locations:** `components/admin/temporary-access-panel.tsx:230-242`

### Temporary Access — Duration
- **Field/Key:** `duration`
- **Source:** constant (`DELEGATED_ACCESS_DURATIONS` from lib/auth/delegated-expiry)
- **Component:** native select
- **Options:** `30`→"30 minutes", `60`→"1 hour", `120`→"2 hours", `180`→"3 hours", `240`→"4 hours", `480`→"8 hours"
- **Default:** `60`
- **Code locations:** `components/admin/temporary-access-panel.tsx:244-259`

### Permission Matrix — Employee
- **Screen:** Permission matrix (master-admin)
- **Field/Key:** `personId`
- **Source:** API (`people` prop)
- **Component:** native select
- **Options:** `""`→"Select an employee…" + `{name} · {email}` (+ " (master admin — not governed)" disabled)
- **Code locations:** `components/admin/permission-matrix.tsx:179-192`

### Previous Employees — Reason filter
- **Field/Key:** `reasonFilter`
- **Source:** constant (`EXIT_REASON_LABELS`, present reasons only)
- **Component:** native select
- **Options:** `all`→"All reasons" + present exit reasons
- **Code locations:** `components/admin/previous-employees.tsx:168-179`

---

# 6. ADMIN — INCENTIVE MASTER / BILLING MASTER

### Incentive workspace — Section (mobile)
- **Screen:** Incentive workspace
- **Component:** native select
- **Options:** Incentive details / Eligible employees / Eligibility history
- **Code locations:** `components/admin/incentive-master/workspace.tsx:387-400`

### Incentive — Incentive type
- **Field/Key:** `incentiveType`
- **Source:** constant (`INCENTIVE_TYPES`/`INCENTIVE_TYPE_LABELS`)
- **Component:** native select
- **Options:** `""`→"Not tied to a request type"; `bss_conversion`→"Conversion", `sales_pitch`→"Sales Pitch", `client_happiness`→"Client Happiness", `group_intro`→"Group Introduction", `leads_referrals`→"Leads / Referrals"
- **Code locations:** `components/admin/incentive-master/workspace.tsx:476-490`

### Incentive — Product
- **Field/Key:** `productId`
- **Source:** API (`products` prop)
- **Component:** native select
- **Options:** `""`→"Not product-specific" + `{name}` / `{name} ({code})`
- **Code locations:** `components/admin/incentive-master/workspace.tsx:491-505`

### Incentive — Duration
- **Field/Key:** `duration`
- **Source:** constant (`INCENTIVE_DURATIONS`/`INCENTIVE_DURATION_LABELS`)
- **Component:** native select
- **Options:** `permanent`→"Permanent", `one_time`→"One-Time"
- **Code locations:** `components/admin/incentive-master/workspace.tsx:526-539`

### Incentive — Function / Department filter
- **Screen:** Incentive eligibility tab
- **Field/Key:** `departmentId`
- **Source:** API (`view.functions`)
- **Component:** native select
- **Options:** `""`→"All Functions" + functions
- **Code locations:** `components/admin/incentive-master/workspace.tsx:778-793`

### Incentive — Show filter
- **Field/Key:** `scope`
- **Source:** hardcoded
- **Component:** native select
- **Options:** `all`→"Everyone", `eligible`→"Eligible only", `not_eligible`→"Not eligible"
- **Code locations:** `components/admin/incentive-master/workspace.tsx:795-807`

### Billing Master — Section (mobile)
- **Screen:** Billing entity workspace
- **Component:** native select
- **Options:** Basic / Contact / Tax & Billing / Banking Details / Files & Documents (Files only when `fileView`)
- **Code locations:** `components/admin/billing-master/workspace.tsx:333-346`

---

# 7. ADMIN — MASTER LISTS (DataTable filters + row menus)

All DataTable filter dropdowns are native `<select>` with a leading `"__all"`→"All" option. All row menus are shadcn `DropdownMenu`.

- **Client list — Status filter:** `active`→"Active", `inactive`→"Inactive". `components/admin/client-list.tsx:34-42`
- **Client list — row menu:** "Edit", "Deactivate"/"Reactivate", "Delete". `components/admin/client-list.tsx:249-268`
- **Holiday list — Status filter:** Active/Inactive. `components/admin/holiday-list.tsx:53-61`
- **Holiday list — row menu:** "Edit", "Deactivate"/"Reactivate", "Remove". `components/admin/holiday-list.tsx:201-224`
- **Outstanding roster list — Status filter:** Active/Inactive. `components/admin/outstanding-roster-list.tsx:85-93`
- **Outstanding roster list — row menu:** "Edit", "Deactivate"/"Reactivate". `components/admin/outstanding-roster-list.tsx:238-252`
- **Product master list — Status filter:** Active/Inactive. `components/admin/product-master-list.tsx:84-92`
- **Product master list — Code filter:** `coded`→"Has a code", `uncoded`→"No code yet". `components/admin/product-master-list.tsx:94-100`
- **Product master list — row menu:** "Edit", "Deactivate"/"Reactivate". `components/admin/product-master-list.tsx:274-288`
- **Billing master table — Status filter:** Active/Inactive. `components/admin/billing-master/master-table.tsx:100-108`
- **Billing master table — Tax details filter:** `complete`→"GST + PAN on file", `missing`→"Missing GST or PAN". `components/admin/billing-master/master-table.tsx:112-118`
- **Incentive master table — Status filter:** `on_offer`→"On offer today", `active`→"Active", `inactive`→"Inactive", `expired`→"Expired". `components/admin/incentive-master/master-table.tsx:105-114`
- **Incentive master table — Duration filter:** `permanent`→"Permanent", `one_time`→"One-Time". `components/admin/incentive-master/master-table.tsx:124-129`
- **Incentive master table — Eligibility filter:** `named`→"Named employees", `groups`→"By group", `nobody`→"Nobody eligible". `components/admin/incentive-master/master-table.tsx:132-138`
- **Department list — Status filter:** Active/Inactive. `components/admin/department-list.tsx:95-103`
- **Subject list — Status filter:** Active/Inactive. `components/admin/subject-list.tsx:25-33`
- **Leave category list — Status filter:** `active`→"In the dropdown", `retired`→"Retired". `components/admin/leave-category-list.tsx:57-64`
- **Employee list — Role filter:** Doer/Initiator/Both. `components/admin/employee-list.tsx:274-280`
- **Employee list — Function filter:** departmentOptions (API). `components/admin/employee-list.tsx:283-290`
- **Employee list — Status filter:** `active`→"Active", `deactivated`→"Deactivated". `components/admin/employee-list.tsx:292-297`
- **Employee list — row menu (EmployeeRowActions):** "Edit Employee", "Resend invite", "Copy invite link"/"Copy password-reset link", "Reset Password", "Deactivate"/"Reactivate", "Offboard employee". `components/admin/employee-row-actions.tsx:163-204`
- **Client location list — Status filter:** `active`→"Active", `retired`→"Retired". `components/admin/client-location-list.tsx:65-73`
- **Client location list — Map pin filter:** `pinned`→"Has a pin", `unpinned`→"No pin". `components/admin/client-location-list.tsx:75-81`
- **Salary profile list — Designation filter:** distinct designation names. `components/admin/salary-profile-list.tsx:57-59`
- **Salary profile list — Entity filter:** distinct entity names. `components/admin/salary-profile-list.tsx:62-64`
- **Salary profile list — CTC filter:** `set`→"CTC set", `unset`→"No CTC". `components/admin/salary-profile-list.tsx:67-72`

### Status color picker (ColorPicker)
- **Module:** Admin (Settings → Statuses)
- **Screen:** Status settings tab (`SettingsTabStatuses`), per-status row (`StatusRowEditor`)
- **Field/Key:** `color`
- **Source:** constant (`STATUS_COLOR_TOKENS`) + free hex
- **Component:** Popover (swatch grid + custom hex input) — other
- **Type:** Single
- **Required:** Yes
- **Default:** stored token/hex
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** `blue`, `green`, `amber`, `red`, `rose`, `purple`, `yellow`, `orange`, `slate`, `brown`, `stone` (+ custom `#a855f7`-style hex)
- **Add/Edit/Delete behavior:** —
- **Validation:** `colorTokenSchema` (preset token OR 3/4/6/8-digit hex)
- **On-select behavior:** immediate, saved via Save button
- **Dependencies:** —
- **Backend/API/DB:** `updateStatusSettingAction` (`status_settings`)
- **Special rules:** `StatusRowEditor` renders one per TASK_STATUSES row
- **Code locations:** `components/admin/color-picker.tsx:35-101`; `components/admin/status-row-editor.tsx:67`; `components/admin/settings-tab-statuses.tsx:16-23`

---

# 8. ADMIN — ACTIVITY / NOTIFICATION / TASK REMINDER FILTERS

### Activity filter — Actor
- **Screen:** /admin/activity filter bar
- **Source:** API (`employees` prop)
- **Component:** `MultiSelect` (cmdk)
- **Type:** Multi
- **Options:** employee roster; placeholder "All actors"
- **Code locations:** `components/admin/activity-filter-bar.tsx:193-201`

### Activity filter — Kind
- **Source:** constant (`TASK_EVENT_TYPES` from lib/events + local `EVENT_TYPE_LABELS`)
- **Options:** `created`→"Created", `field_updated`→"Edited", `status_changed`→"Status changed", `reassigned`→"Reassigned", `transferred_external`→"Transferred out", `priority_changed`→"Priority", `due_changed`→"Due date", `archived`→"Archived", `restored`→"Restored", `commented`→"Commented"; placeholder "All event types"
- **Code locations:** `components/admin/activity-filter-bar.tsx:204-212`

### Activity filter — Source
- **Source:** hardcoded `SOURCE_OPTIONS`
- **Options:** `task`→"Tasks", `employee`→"Employees", `settings`→"Settings"; placeholder "All sources"
- **Code locations:** `components/admin/activity-filter-bar.tsx:215-223`

### Notification filter — Kind
- **Screen:** /admin/notifications filter bar
- **Source:** hardcoded `KIND_OPTIONS`
- **Component:** `MultiSelect`
- **Options:** `task_assigned`→"Task assigned", `task_initiated`→"Task initiated", `status_changed`→"Status changed", `approved`→"Approved", `declined`→"Declined", `reassigned`→"Reassigned", `transferred`→"Transferred", `cancelled`→"Cancelled", `commented`→"Commented", `overdue_digest`→"Overdue digest"; placeholder "All kinds"
- **Code locations:** `components/admin/notification-filter-bar.tsx:17-28, 193-199`

### Notification filter — Recipient
- **Source:** API (`employees`)
- **Options:** placeholder "All recipients"
- **Code locations:** `components/admin/notification-filter-bar.tsx:202-210`

### Task reminder — Recipients
- **Screen:** Task reminder rule editor
- **Source:** API (`employees`)
- **Component:** `MultiSelect`
- **Options:** placeholder "Choose recipients"
- **Code locations:** `components/admin/task-reminder-rules.tsx:350-357`

### Task reminder — Employees (scope)
- **Source:** API (`employees`)
- **Component:** `MultiSelect`; placeholder "Choose employees" (shown when scope=selected)
- **Code locations:** `components/admin/task-reminder-rules.tsx:376-385`

### Task reminder — Employee scope
- **Component:** toggle buttons
- **Options:** `all`→"All Employees", `selected`→"Selected"
- **Code locations:** `components/admin/task-reminder-rules.tsx:359-374`

### Task reminder — Task statuses
- **Source:** constant (`REMINDER_STATUS_TOKENS` + `reminderStatusLabel`)
- **Component:** toggle buttons (multi)
- **Options:** `dont_know`, `not_started`, `initiated`, `follow_up`, `need_info`, `need_help`, `on_hold`, `overdue` (labels via `STATUS_LABELS_FALLBACK`, "Overdue" for `overdue`); default `DEFAULT_REMINDER_STATUSES` = dont_know, not_started, initiated, overdue
- **Code locations:** `components/admin/task-reminder-rules.tsx:388-418`

---

# 9. LAYOUT / FILTERS (shared dashboard + tasks filter bar)

### FilterBar — Date Range
- **Module:** Layout (shared FilterBar)
- **Screen:** /dashboard, /tasks, /my-day, /archived, /tasks/kanban
- **Field/Key:** start/end
- **Component:** Popover + react-day-picker `DayPicker` (range)
- **Type:** Single (range)
- **Default:** last 30 days
- **Code locations:** `components/layout/filter-bar.tsx:406-473`

### FilterBar — Assignee
- **Field/Key:** `emp`
- **Source:** API (`employees` prop) + synthetic `__all__`
- **Component:** `MultiSelect` w/ FilterPill trigger
- **Type:** Multi
- **Options:** employees; on self-scoped surfaces adds `__all__`→"All employees" + "`name` (You)"
- **Special rules:** `scopeDefaultsToMe` / `showScopeChip` / "My Tasks"/"Only Me" pill logic
- **Code locations:** `components/layout/filter-bar.tsx:475-489`

### FilterBar — Doer Status (StatusFilter)
- **Field/Key:** `status`
- **Source:** API (`statusOptions` prop — admin-overridable labels)
- **Component:** `MultiSelect`; pill "Doer Status" / "All Statuses"
- **Code locations:** `components/layout/filters/status-filter.tsx`

### FilterBar — Priority (PriorityFilter)
- **Source:** constant (`TASK_PRIORITIES`/`PRIORITY_LABELS`)
- **Options:** `imp_urgent`→"Critical", `imp_not_urgent`→"Important", `not_imp_urgent`→"Urgent", `not_imp_not_urgent`→"Normal"
- **Code locations:** `components/layout/filters/priority-filter.tsx`

### FilterBar — Client (ClientFilter)
- **Source:** API (`clients` prop)
- **Options:** distinct client strings; pill "All Clients"
- **Code locations:** `components/layout/filters/client-filter.tsx`

### FilterBar — Function (DepartmentFilter)
- **Source:** constant (`DEPARTMENTS`)
- **Options:** Founder Office, Handholding, Apps, Sales, Marketing, Social Media, Accounts, Admin, HR, Consulting, CRM
- **Code locations:** `components/layout/filters/department-filter.tsx`

### FilterBar — Team (TeamFilter)
- **Source:** constant (`TEAM_ROSTER` from lib/teams/roster)
- **Options:** `t1`→"T1 — Manan Vasa", `t2`→"T2 — Ruchita Ambre", `t3`→"T3 — Jeevan Bharambe", `t4`→"T4 — Rutvisha Mehta", `t5`→"T5 — Rohan Choudhary", `t6`→"T6 — Mitul Mehta"
- **Code locations:** `components/layout/filters/team-filter.tsx`

### FilterBar — Subject (SubjectFilter)
- **Source:** API (`subjects` prop)
- **Options:** subject strings; pill "All Subjects"
- **Code locations:** `components/layout/filters/subject-filter.tsx`

### FilterBar — Scope (non-admins)
- **Component:** segmented buttons
- **Options:** "My Tasks", "All Tasks"
- **Code locations:** `components/layout/filter-bar.tsx:510-515`

### FilterBar — View
- **Component:** segmented buttons (solid)
- **Options:** "Doer", "Initiator"
- **Code locations:** `components/layout/filter-bar.tsx:524-552`

### MainNavGroup (nav dropdown)
- **Module:** Layout (header nav)
- **Component:** shadcn `DropdownMenu`
- **Options:** nav group items/sections (dynamic from config)
- **Code locations:** `components/layout/main-nav-group.tsx:56-105`

---

# 10. DASHBOARD

### Aging Heatmap — Sort by
- **Screen:** Aging Heatmap section header
- **Field/Key:** `sortMode`
- **Source:** hardcoded
- **Component:** native select (transparent overlay over pill)
- **Options:** `risk`→"Risk", `total`→"Total", `oldest`→"Oldest"
- **Default:** `risk`
- **Code locations:** `components/dashboard/aging-heatmap.tsx:887-947`

### Aging Heatmap — Age legend (filter pills)
- **Field/Key:** `ageFilter`
- **Source:** constant (`AGE_BUCKETS`)
- **Component:** toggle buttons
- **Options:** `0-3`→"0-3 days", `4-7`→"4-7 days", `8-14`→"8-14 days", `15-20`→"15-20 days", `21-30`→"21-30 days", `31-45`→"31-45 days", `46-60`→"46-60 days", `60+`→"60+ days" (each with count)
- **Code locations:** `components/dashboard/aging-heatmap.tsx:996-1072`

### Aging Heatmap — Function toggle
- **Field/Key:** `functionView`
- **Source:** constant (`FUNCTION_VIEWS`/`FUNCTION_LABELS` from lib/org/functions)
- **Component:** segmented buttons (tablist)
- **Code locations:** `components/dashboard/function-toggle.tsx:43-104`; used `components/dashboard/aging-heatmap.tsx:776-780`

### Period / Range picker
- **Screen:** delegation boards (manager/creator activity)
- **Field/Key:** period
- **Source:** constant (`ACTIVITY_PERIODS` from lib/dashboard/manager-activity-contract)
- **Component:** Popover (preset buttons + custom range)
- **Options:** `3d`→"Last 3 Days", `7d`→"Last 7 Days", `month`→"This Month", `last_month`→"Last Month", `year`→"This Year", `custom`→"Custom Range..."
- **Default:** `7d`
- **Code locations:** `components/dashboard/exec/period-range-picker.tsx:42-152`

### Performer Task Drawer — Priority
- **Screen:** Performer drill-down drawer
- **Field/Key:** `priority`
- **Source:** constant (`TASK_PRIORITIES`/`PRIORITY_LABELS`)
- **Component:** native select (`FilterSelect`)
- **Options:** `all`→"All priorities", Critical/Important/Urgent/Normal
- **Code locations:** `components/dashboard/performer-task-drawer.tsx:183-191`

### Performer Task Drawer — Client
- **Field/Key:** `client`
- **Source:** derived from result rows
- **Options:** `all`→"All clients" + distinct clients
- **Code locations:** `components/dashboard/performer-task-drawer.tsx:192-200`

### Performer Task Drawer — Due
- **Field/Key:** `due`
- **Source:** hardcoded
- **Options:** `all`→"Any due date", `onTime`→"On or before due", `late`→"After due date"
- **Code locations:** `components/dashboard/performer-task-drawer.tsx:201-210`

---

# 11. PROJECT-PLAN

### New node — Level
- **Screen:** New Project item dialog
- **Field/Key:** `kind`
- **Source:** constant (`PLAN_KINDS`/`KIND_LABEL` from lib/project-plan/levels)
- **Component:** native select
- **Options:** `project`→"Project", `milestone`→"Milestone", `result`→"Result", `action`→"Action", `sub_action`→"Sub-Action", `sub_sub_action`→"Sub-Sub-Action"
- **Code locations:** `components/project-plan/new-node-dialog.tsx:224-234`

### Parent pickers (cascading ancestors)
- **Screen:** New node dialog + Bulk upload
- **Field/Key:** `picked` per ancestor level
- **Source:** database (`tree` prop, filtered by kind/parent)
- **Component:** native select per ancestor
- **Options:** placeholder varies ("Choose a project…", "Choose a project first", "No milestone here yet"); rows `name` or "(unnamed)"
- **Code locations:** `components/project-plan/parent-pickers.tsx:72-136`

### Plan board — Project filter
- **Screen:** Hierarchy board toolbar
- **Field/Key:** `projectId`
- **Source:** database (`tree`)
- **Component:** native select (`BarSelect`)
- **Options:** `all`→"All projects (N)" + project names
- **Code locations:** `components/project-plan/plan-board.tsx:1093-1103`

### Plan board — Show down to
- **Field/Key:** collapse depth
- **Source:** hardcoded
- **Component:** native select (`BarSelect`)
- **Options:** `all`→"All levels", `0`→"Projects only", `1`→"To milestone", `2`→"To result", `3`→"To action"
- **Code locations:** `components/project-plan/plan-board.tsx:1105-1121`

### Plan board — Sort
- **Field/Key:** `sortKey`
- **Source:** hardcoded `SORT_OPTIONS`
- **Component:** native select (`BarSelect`)
- **Options:** `position`→"Plan order", `name`→"Name A–Z", `target`→"Target date", `owner`→"Owner"
- **Code locations:** `components/project-plan/plan-board.tsx:250-255, 1123-1129`

### Plan board — Rows per page (RowsPicker)
- **Component:** native select (row limit)
- **Code locations:** `components/project-plan/plan-board.tsx:1135, 2394+`

### Plan board — Columns picker
- **Component:** checkbox menu (other)
- **Code locations:** `components/project-plan/plan-board.tsx:1151, 2496+`

### Plan status cell — Status
- **Screen:** plan rows (all views)
- **Field/Key:** status
- **Source:** constant (`PLAN_WORKING_STATUSES`/`PLAN_RESTRICTED_STATUSES`/`PLAN_STATUS_LABEL`)
- **Component:** native select w/ `<optgroup>`
- **Options:** "Progress": Not Read, Not Started, Initiated, Follow Up, Need Info, Done. "Owner / admin only": Not Approved, Approved, On Hold, Cancelled (`archived` excluded). Current value always included even if not re-selectable.
- **Code locations:** `components/project-plan/plan-status-cell.tsx:161-198`

### Bulk upload — Level
- **Field/Key:** `kind`
- **Source:** constant (`BULK_KINDS` = PLAN_KINDS minus sub_sub_action)
- **Component:** native select
- **Options:** "Projects", "Milestones", "Results", "Actions", "Sub-Actions"
- **Code locations:** `components/project-plan/plan-bulk-upload.tsx:62, 366-378`

### Bulk upload — Owner
- **Screen:** bulk upload preview row
- **Field/Key:** `row.ownerId`
- **Source:** API (`employees` prop)
- **Component:** native select
- **Options:** `""`→"— none —" + employee names
- **Code locations:** `components/project-plan/plan-bulk-upload.tsx:609-627`

### Plan register — Filter by project
- **Field/Key:** `projectId`
- **Source:** database (`projects`)
- **Component:** native select
- **Options:** `all`→"All projects" + project names (hidden on Projects register)
- **Code locations:** `components/project-plan/plan-register.tsx:522-537`

### Project views — Filter by project
- **Field/Key:** `rootId`
- **Source:** database (`projects`)
- **Component:** native select
- **Options:** `""`→"All projects" + `P{i+1} · {name}`
- **Code locations:** `components/project-plan/project-views.tsx:281-293`

---

# 12. FORMS

### Form field — Select type
- **Screen:** any module form (dynamic fields)
- **Field/Key:** field.key
- **Source:** database (`field.options` from form config)
- **Component:** shadcn `Select`
- **Options:** field options; placeholder "- Select -"
- **Code locations:** `components/forms/form-fields.tsx:85-95`

### Form field — Buttons (MCQ)
- **Component:** toggle buttons; options from `field.options`
- **Code locations:** `components/forms/form-fields.tsx:57-84`

### Form field — Product name (buttons)
- **Component:** toggle buttons + admin inline add (`addProductOption`)
- **Code locations:** `components/forms/form-fields.tsx:193-280`

### Form editor — Type
- **Screen:** Edit Form dialog (per field)
- **Field/Key:** `field.type`
- **Source:** constant (`FIELD_TYPE_LABELS` from lib/forms/field-types)
- **Component:** native select
- **Options:** `text`→"Short text", `textarea`→"Paragraph", `select`→"Dropdown", `buttons`→"Buttons (MCQ)", `product`→"Product name (buttons)", `date`→"Date", `number`→"Number", `email`→"Email", `tel`→"Phone", `url`→"Link / URL"
- **Code locations:** `components/forms/form-editor-dialog.tsx:107-112`

### Module list — CardMenu
- **Screen:** forms module submission cards (admin)
- **Component:** custom dropdown menu
- **Options:** "Archive"/"Restore", "Delete"
- **Code locations:** `components/forms/module-list.tsx:194-235`

---

# 13. OPERATIONS

### Checklist header — Event Name
- **Screen:** New checklist header (event mode)
- **Field/Key:** `eventId`
- **Source:** API (`events` prop)
- **Component:** native select
- **Options:** `""`→"Select an event…" + `{title} — {date}`
- **Code locations:** `components/operations/checklist/checklist-header.tsx:112-134`

### Checklist header — Start from a master
- **Field/Key:** `templateId`
- **Source:** API (`templates` prop)
- **Component:** native select
- **Options:** `""`→"Blank checklist" + `{name} ({itemCount} rows)`
- **Code locations:** `components/operations/checklist/checklist-header.tsx:157-175`

### Checklist grid — Assignee
- **Field/Key:** assignee id
- **Source:** API (`people`)
- **Component:** native select
- **Options:** `""`→"—" + person names
- **Code locations:** `components/operations/checklist/checklist-grid.tsx:618-633`

### Checklist grid — Status menu
- **Field/Key:** status
- **Source:** constant (`CHECK_STATUSES` from lib/operations/checklist)
- **Component:** custom small menu (checkbox + menu)
- **Options:** Pending / Done / Need Help / Not Applicable
- **Code locations:** `components/operations/checklist/checklist-grid.tsx:644+`

---

# 14. PORTAL / DOSSIER

### Portal — Year filter
- **Screen:** Portal salary slips
- **Field/Key:** `year`
- **Source:** API (financial-year options)
- **Component:** native select
- **Options:** `ALL_YEARS`→"All Years" + FY labels
- **Code locations:** `components/portal/portal-screen.tsx:279-288`

### Onboarding — Same as Permanent?
- **Module:** Dossier (onboarding)
- **Screen:** Employee onboarding form
- **Field/Key:** `sameAsPermanent`
- **Source:** constant (schema `onboarding-schema.ts` options)
- **Component:** toggle buttons
- **Options:** `YES`, `NO`
- **Required:** Yes
- **Code locations:** `components/dossier/onboarding-form.tsx:291-304`; schema `lib/dossier/onboarding-schema.ts:137`

---

# 15. SOURCE CONSTANTS (option arrays / enums)

### db/enums.ts (in-scope constants)
- **ALLOCATION_CATEGORIES:** `ps` (PS, PS Participants, expected 6), `bss` (BSS, BSS Participants, 8), `retainer` (Retainer, Retainer Clients, 1), `ecosystem` (Eco System, Ecosystem Clients (Apps), 2). Total expected = 17 (`ALLOCATION_EXPECTED_TOTAL`).
- **INTERN_SECTIONS:** `["retainer","ecosystem","ps","bss"]`
- **INTERN_PRODUCTS:** ALLOCATION_CATEGORIES reordered to intern order.
- **ALLOCATION_CATEGORY_CODES:** `["ps","bss","retainer","ecosystem"]`
- **HH_CALL_TYPES:** `hh`→"HH Call", `tool`→"Tool Call", `checkin`→"Check-in Call"
- **HH_DAYS:** mon..sun (label short: Mon..Sun; full: Monday..Sunday)
- **HH_PERSON_KINDS:** `employee`→"Employee", `intern`→"Intern"
- **HH_EMPLOYEE_NAMES:** Dattaram, Jeevan, Mishtie, Mitul, Namrata, Parvez, Prakash, Raj, Rohan, Ruchita, Rutvisha
- **HH_INTERN_NAMES:** Danyal, Hardik, Krish, Nandini, Om, Proveeka, Shreya Randhe, Shreya Shukla, Suresh, Vinal
- **HH_PARTICIPANT_MODULES:** `ps`→"PS", `bss`→"BSS", `retainer`→"Retainer", `ecosystem`→"Eco System", `tool`→"Tool", `follow_up`→"Follow Up"
- **HH_PARTICIPANT_CALLS:** `["1","2","3","4"]`
- **HH_ALL_PERSON_NAMES:** employee + intern names combined
- **HH_BATCHED_SECTIONS:** `["ps","bss"]`
- **HH_ACCESS_ROLES:** admin (add/edit/delete), hr (add), ruchita (add/edit/delete)
- **HH_ACCESS_MODULES:** handholding (Employees, App Development (Interns)), ambassadors (Ambassadors), development (Development)
- **HH_ACCESS_ACTIONS:** `add`→"Add", `edit`→"Edit", `delete`→"Delete"
- **HH_ACCESS_SECTIONS:** `employees`→"Employees", `interns`→"App Development (Interns)"
- **STATUS_COLOR_TOKENS:** blue, green, amber, red, rose, purple, yellow, orange, slate, brown, stone
- **SEED_RESPONSIBLES:** Anand Singh, Dhanashree Solkar, Jeevan Bharambe, Kiran Bhosale, Manan Vasa, Mishtie Kanani, Rohan Choudhary, Ruchita Ambre, Rutvisha Mehta, Sanket Thorat, Satish Sonawane, Siddesh Walve
- **SEED_ENTITIES:** Altus Corp, Unleashed, IJV, Khushboo, MJV HUF, JSV HUF, Dharav Enterprises, Colour Graphics, Smita Raut, Sunil Raut
- **SEED_PRODUCTS:** Altus Conclave, Billing, BSS, BSSO, Commission, Consulting, Graduate Programs, OS, PS, PSO, Rent, Retainer
- **SEED_PAYMENT_MODES:** Altus Kotak, Barter, CMV G Pay, Dattaram Kotak, Gpay - CMV, Gpay - JSV HUF, Gpay - MJV, IJV, Jodo, JSV HUF ICICI, JSV HUF Kotak, KAS Kotak, Kotak - Altus, Kotak - JSV HUF, Kotak - Khushboo, Kotak - MJV HUF, Kotak - Unleashed, MJV G Pay, MJV HUF Kotak, Parvez Kotak, Pay U, PDC, Razorpay, Smita, Sunil Kotak, Unleashed Kotak

### Other lib constants feeding in-scope dropdowns
- **DEPARTMENTS** (db/enums): Founder Office, Handholding, Apps, Sales, Marketing, Social Media, Accounts, Admin, HR, Consulting, CRM
- **TASK_PRIORITIES / PRIORITY_LABELS:** imp_urgent→"Critical", imp_not_urgent→"Important", not_imp_urgent→"Urgent", not_imp_not_urgent→"Normal"
- **EMPLOYEE_ROLES:** doer, initiator, both
- **WORKER_TYPES / WORKER_TYPE_LABELS** (lib/attendance/worker-type): full_time→"Full Time", first_half→"First Half", second_half→"Second Half", hybrid→"Hybrid", project_remote→"Project / Remote". EMPLOYEE_TYPE_OPTIONS = first four (excludes project_remote).
- **EXIT_REASONS / EXIT_REASON_LABELS** and **REHIRE_ELIGIBILITIES / REHIRE_LABELS** (db/enums)
- **DELEGATED_ACCESS_DURATIONS** (lib/auth/delegated-expiry): 30m/1h/2h/3h/4h/8h
- **EMPLOYEE_STATUS_TABS/LABELS** (lib/employees/master-filters): all/current/probation/past
- **TEAM_ROSTER** (lib/teams/roster): t1..t6
- **ACTIVITY_PERIODS** (lib/dashboard/manager-activity-contract): 3d/7d/month/last_month/year/custom
- **CHECK_STATUSES** (lib/operations/checklist): Pending, Done, Need Help, Not Applicable; **RUN_STATUSES:** active, completed, cancelled
- **REMINDER_STATUS_TOKENS / DEFAULT_REMINDER_STATUSES** (lib/task-reminders/rules)
- **FIELD_TYPE_LABELS** (lib/forms/field-types)
- **PLAN_KINDS / KIND_LABEL / PARENT_KIND / TASK_KINDS** (lib/project-plan/levels)
- **PLAN_STATUS_LABEL / PLAN_WORKING_STATUSES / PLAN_RESTRICTED_STATUSES** (lib/project-plan/status)
- **INCENTIVE_TYPES / INCENTIVE_TYPE_LABELS / INCENTIVE_DURATIONS / INCENTIVE_DURATION_LABELS** (db/enums + lib/incentive/master)
- **PG_LOOKUP_KINDS** (lib/validators/people-gives): reference_source, designation, business_category, sales_person
- **OUTSTANDING_CYCLES / SUBSCRIPTION_FREQUENCIES / OUTSTANDING_STATUSES / GST_RATES / GST_FORM_RATES** (db/enums — used by outstanding forms, out-of-scope UI)
- **TASK_STATUSES / USER_TASK_STATUSES / DOER_TASK_STATUSES / APPROVAL_STATUSES / TASK_RECURRENCES / TASK_SUBJECTS / ACCOUNT_TYPES / EMPLOYMENT_STATUSES / ATTENDANCE_CODES / LEAVE_KINDS / etc.** (db/enums — broader app)

---

## NOTES / UNKNOWNS
- `LookupSelect` component does NOT exist in scope (0 usages).
- `Command`/cmdk combobox is used internally by `Select` and `MultiSelect` (components/ui) and via `role="combobox"` in `ManagedSelect`; there is no standalone `<Command>` picker in scope.
- `components/hub/module-shortcuts.tsx` mentions "combobox" only in a keyboard-guard comment — no dropdown.
- `components/system/single-window-guard.tsx`, `components/legal`, `components/manager-gates`, `components/motion`, `components/pwa` — no dropdowns found.
- `components/productivity` (`dashboard-view.tsx`, `report-view.tsx`, `grade-badge.tsx`) — no dropdowns found (grep clean); UNKNOWN — NEEDS REVIEW only if a picker is expected there.
- `app/(app)/dashboard`, `app/(app)/search`, `app/(app)/inbox` pages: no `<select>`/picker markup (filters live in the shared `FilterBar` components); inbox `category-bar.tsx` uses tabs, not a dropdown.
- `app/(admin)/admin/incentive-master/actions.ts` `<select>` match is a code comment only.
- `lib/admin`, `lib/system`, `lib/projects`, `lib/workspaces` are empty directories.
- `lib/commands`, `lib/dispatch`, `lib/search/rank.ts`, `lib/documents/status.ts`, `lib/documents/signing.ts`, `lib/dossier/access.ts`, `lib/dossier/types.ts`, `lib/dossier/onboarding-responses.ts`, `lib/productivity/*`, `lib/dashboard/kpi-buckets.ts`, `lib/dashboard/creator-workload-contract.ts` contain data/contracts, not pickers (KPI_BUCKET_KEYS, WORKLOAD_RELATIONS, WORKLOAD_FAMILIES, SELF_TARGETS are chart/table constants, not dropdown option lists).

### 3.7 — Backend Enums / API Validation / Database / Import & Seed

# Slice 7 — Backend Enum / Option-Set Audit

Repo: `C:/Users/om jadhav/Downloads/wms-local-main (1)/wms-local-main`
Scope: backend + API validation + database + import/seed layers. READ-ONLY.

Canonical source of truth for almost all dropdowns/enums is **`db/enums.ts`** (1,519 lines). The DB uses **5 real pgEnums** plus a large number of `text` columns typed with `$type<...>` overlays to the enums.ts unions ("house norm — not pgEnums"). `allowedValues` is NOT used anywhere (0 matches). `inArray()` appears only as Drizzle query filters (not option-set definitions). `functions/src/index.ts` contains NO enum/dropdown logic (only the Firebase auth claim).

---

## 1. The five pgEnums (db/schema.ts:78–82)

### taskStatusEnum (`task_status`)
- **Where defined:** `db/schema.ts:78` — `pgEnum("task_status", TASK_STATUSES)`
- **Values:** `dont_know`, `not_started`, `initiated`, `follow_up`, `need_help`, `on_hold`, `need_info`, `follow_up_1`, `follow_up_2`, `follow_up_3`, `done`, `approved`, `not_approved`, `cancelled`, `transferred`
- **DB column(s):** `tasks.status` (pgEnum, line 1379, default `not_started`); `status_settings.status` (pgEnum PK, line 1354); `weekly_goals.status` (line 4632, default `not_started`); `daily_checklist.status` (line 4733, default `not_started`); `goals.status` (line 4978, default `not_started`)
- **Used by:** `db/enums.ts:7` (TASK_STATUSES); validators `lib/validators/weekly-goal.ts:143` (ReviewWeeklyGoalSchema status `z.enum(TASK_STATUSES)`), `lib/validators/task.ts`; `app/(admin)/admin/settings/actions.ts:108`
- **Special rules:** 6 deprecated values kept for backward compat (`follow_up_1/2/3`, `cancelled`, `transferred`, `need_help`); new writes must NOT use them (see `DEPRECATED_TASK_STATUSES`, `isDeprecatedStatus`). `approved/not_approved/cancelled/transferred` also live as a separate `approval_status` column.

### employeeRoleEnum (`employee_role`)
- **Where defined:** `db/schema.ts:79` — `pgEnum("employee_role", EMPLOYEE_ROLES)`
- **Values:** `doer`, `initiator`, `both`
- **DB column(s):** `employees.role` (pgEnum, line 338, NOT NULL)
- **Used by:** `db/enums.ts:176`; `lib/validators/employee.ts:41,85,233`; `lib/import/csv-schemas.ts:12` (LegacyEmployeeRowSchema); seed `scripts/dummy-db-seed.ts` (`$4::employee_role` cast)
- **Validation:** `z.enum(["doer","initiator","both"])`
- **Special rules:** none.

### taskPriorityEnum (`task_priority`)
- **Where defined:** `db/schema.ts:80` — `pgEnum("task_priority", TASK_PRIORITIES)`
- **Values:** `imp_urgent`, `imp_not_urgent`, `not_imp_urgent`, `not_imp_not_urgent`
- **DB column(s):** `tasks.priority` (pgEnum, line 1378, default `not_imp_not_urgent`); `weekly_goals.priority` (pgEnum, line 4592, default `imp_not_urgent`)
- **Used by:** `db/enums.ts:320` + `PRIORITY_LABELS` (Critical/Important/Urgent/Normal); validators `lib/validators/task.ts:23,73`, `lib/validators/weekly-goal.ts:20,61`; `lib/import/csv-schemas.ts:53`
- **Validation:** `z.enum(TASK_PRIORITIES)`
- **Special rules:** labels renamed 2026-05-30 to 1–4 scale; enum values unchanged (no data migration).

### approvalStatusEnum (`approval_status`)
- **Where defined:** `db/schema.ts:81` — `pgEnum("approval_status", APPROVAL_STATUSES)`
- **Values:** `approved`, `not_approved`, `cancelled`, `transferred`
- **DB column(s):** `tasks.approval_status` (pgEnum, line 1440, nullable — NULL = no verdict yet)
- **Used by:** `db/enums.ts:113`; `lib/validators/task.ts:103` (`SetApprovalStatusSchema`)
- **Special rules:** admin-only verdict layered on top of `status`; moving a verdict moves the task out of "pending" without touching `status`.

### approvalLevelEnum (`approval_level`)
- **Where defined:** `db/schema.ts:82` — `pgEnum("approval_level", APPROVAL_LEVELS)`
- **Values:** `none`, `manager`, `admin`
- **DB column(s):** `tasks.approval_level` (pgEnum, line 1445, default `none`)
- **Used by:** `db/enums.ts:1177` (APPROVAL_LEVELS); `lib/tasks/approval-permissions.ts`
- **Special rules:** two-stage approval (migration 0185) layered OVER `tasks.status='approved'`; kanban columns for `manager_approved`/`admin_approved` were REMOVED (see `lib/kanban-columns.ts`).

---

## 2. Canonical enums — `db/enums.ts` (every exported constant array / union)

Statuses + related sets:

### TASK_STATUSES
- **Where defined:** `db/enums.ts:7`
- **Values:** `dont_know`, `not_started`, `initiated`, `follow_up`, `need_help`, `on_hold`, `need_info`, `follow_up_1`, `follow_up_2`, `follow_up_3`, `done`, `approved`, `not_approved`, `cancelled`, `transferred`
- **DB column(s):** `tasks.status`, `status_settings.status`, `weekly_goals.status`, `daily_checklist.status`, `goals.status` (pgEnum `task_status`)
- **Special rules:** full set incl. legacy + deprecated; new code should write new statuses + `approval_status` independently.

### USER_TASK_STATUSES
- **Where defined:** `db/enums.ts:34`
- **Values:** `dont_know`, `not_started`, `initiated`, `follow_up`, `on_hold`, `need_info`, `done`
- **Used by:** `lib/validators/weekly-goal.ts:99` (`SetWeeklyGoalStatusSchema`); `lib/tasks/template-columns.ts:91` (`TASK_STATUS_CODES`); `lib/kanban-columns.ts`
- **Special rules:** non-admin in-app status picker; excludes approval verdicts; `on_hold` stays (kanban/filter/import).

### DOER_TASK_STATUSES
- **Where defined:** `db/enums.ts:62`
- **Values:** `dont_know`, `not_started`, `initiated`, `follow_up`, `need_info`, `done`
- **Special rules:** the ONLY values offered in the primary Status control (inline chip + bulk dropdown); `on_hold` deliberately ABSENT (manager ruling, moved to "Mark Status" dropdown as "Mark Hold On").

### PENDING_STATUSES
- **Where defined:** `db/enums.ts:71`
- **Values:** `dont_know`, `not_started`, `initiated`, `follow_up`, `on_hold`, `need_info`
- **Special rules:** drives the `?unread=1` filter (tasks with no read receipt AND a pending status).

### DEPRECATED_TASK_STATUSES
- **Where defined:** `db/enums.ts:86`
- **Values:** `follow_up_1`, `follow_up_2`, `follow_up_3`, `cancelled`, `transferred`, `need_help`
- **Special rules:** retired 2026-06-08/2026-06-10; filtered out of every picker/kanban via `isDeprecatedStatus()`; follow_up_* → `follow_up`; cancelled/transferred → Archived; need_help → `need_info`.

### ADMIN_TASK_STATUSES
- **Where defined:** `db/enums.ts:107` (derived = TASK_STATUSES minus deprecated)
- **Values:** `dont_know`, `not_started`, `initiated`, `follow_up`, `on_hold`, `need_info`, `done`, `approved`, `not_approved`
- **Special rules:** what admins see in pickers (incl. approval verdicts, minus retired).

### APPROVAL_STATUSES
- **Where defined:** `db/enums.ts:113`
- **Values:** `approved`, `not_approved`, `cancelled`, `transferred`
- **DB column(s):** `tasks.approval_status` (pgEnum `approval_status`)
- **Used by:** `lib/validators/task.ts:103`

### TASK_RECURRENCES
- **Where defined:** `db/enums.ts:128`
- **Values:** `none`, `daily`, `weekly`, `monthly`, `yearly`
- **Labels:** `none`→"Does not repeat", `daily`→"Daily", `weekly`→"Weekly", `monthly`→"Monthly", `yearly`→"Yearly"
- **DB column(s):** `tasks.recurrence` (text, line 1468; null/'none' = one-off)
- **Used by:** `lib/validators/task.ts:45,85`; `lib/tasks/template-columns.ts:122` (`RECURRENCE_CODES`)

### TASK_SUBJECTS
- **Where defined:** `db/enums.ts:145`
- **Values:** `Marketing`, `Exhibition`, `CP Sign Up`, `Mandate`, `Invoicing`, `MIS`, `Admin`, `Recruitment`, `Accounts`, `PR`, `Customer Visit`, `Documentation`, `Liasoning`, `Sales`, `Systems`, `KPI`, `Assessment`, `Basic Checklist`, `CF Checklist`, `Follow Up Basic Docs`, `Call Client to complete File`, `Call CP to complete File`, `Reimbursement`, `Collection`, `Lead Management`, `Agreement Signing`, `Bank Follow Up` (27 values)
- **DB column(s):** `tasks.subject` (text — free text remains valid; dropdown adds "Other…" escape hatch)
- **Special rules:** canonical list for New Task form; older rows may hold values outside this list.

### EMPLOYEE_ROLES
- **Where defined:** `db/enums.ts:176`
- **Values:** `doer`, `initiator`, `both`
- **DB column(s):** `employees.role` (pgEnum `employee_role`)

### ACCOUNT_TYPES
- **Where defined:** `db/enums.ts:196`
- **Values:** `employee`, `candidate`, `system`
- **DB column(s):** `employees.account_type` (text, line 377, default `employee`)
- **Special rules:** `candidate` = applicant guest login (is_active=false, gated on candidate_active); `system` = test/demo accounts excluded from rosters.

### EMPLOYMENT_STATUSES
- **Where defined:** `db/enums.ts:217`
- **Values:** `active`, `former`, `anonymised`
- **DB column(s):** `employees.employment_status` (text, line 470, `$type<EmploymentStatus>`)
- **Special rules:** second axis orthogonal to `is_active` (offboarding 0212).

### EXIT_REASONS
- **Where defined:** `db/enums.ts:231`
- **Values:** `resigned`, `terminated_for_cause`, `redundancy`, `contract_ended`, `abandonment`, `retirement`, `deceased`, `other`
- **Labels:** `resigned`→"Resigned", `terminated_for_cause`→"Terminated for cause", `redundancy`→"Redundancy", `contract_ended`→"Contract ended", `abandonment`→"Abandonment", `retirement`→"Retirement", `deceased`→"Deceased", `other`→"Other"
- **DB column(s):** `exit_records.exit_reason` (text, line 8340, NOT NULL)
- **Used by:** `lib/validators/offboarding.ts:57`
- **Special rules:** CLOSED list; `other` is the escape hatch (requires `exitReasonOther` — `superRefine` in `offboarding.ts:96`).

### REHIRE_ELIGIBILITIES
- **Where defined:** `db/enums.ts:260`
- **Values:** `yes`, `no`, `with_review`
- **Labels:** `yes`→"Eligible for rehire", `no`→"Not eligible", `with_review`→"Eligible with review"
- **DB column(s):** `exit_records.rehire_eligibility` (text, line 8346)
- **Used by:** `lib/validators/offboarding.ts:61`

### WORKER_TYPES
- **Where defined:** `db/enums.ts:277`
- **Values:** `full_time`, `first_half`, `second_half`, `hybrid`, `project_remote`
- **DB column(s):** `employees.worker_type` (text, line 564, default `full_time`)
- **Used by:** `lib/validators/employee.ts:241`, `lib/validators/attendance.ts:81`, `lib/validators/salary.ts:23`; `lib/attendance/worker-type.ts` (EMPLOYEE_TYPE_OPTIONS + WORKER_TYPE_LABELS + LEGACY_WORKER_TYPES)
- **Special rules:** `first_half`/`second_half`/`hybrid` are renames of `afternoon_shift`/`part_time`/`afternoon_shift` (legacy map: `afternoon_shift`→`second_half`, `part_time`→`hybrid`); `project_remote` NOT offered in the picker but kept (Work Sessions grading).

### PAY_BASES
- **Where defined:** `db/enums.ts:286`
- **Values:** `monthly_ctc`, `hourly`, `fixed_fee`
- **DB column(s):** `salary_profiles.pay_type` (text, lines 3425, 3507, 6238, default `monthly_ctc`)
- **Special rules:** derived from worker_type server-side (never hand-set); see `payBasisFor` in `lib/attendance/worker-type.ts`.

### GRADING_MODES
- **Where defined:** `db/enums.ts:289`
- **Values:** `day`, `hours`, `session`
- **Special rules:** derived from worker_type (`gradingModeFor`).

### WORK_SESSION_SOURCES
- **Where defined:** `db/enums.ts:295`
- **Values:** `meet`, `capture`
- **DB column(s):** `work_sessions.source` (text, line 6434, NOT NULL)

### WORK_SESSION_STATUSES
- **Where defined:** `db/enums.ts:297`
- **Values:** `open`, `closed`, `reconciled`
- **DB column(s):** `work_sessions.status` (text, line 6440, default `open`)

### BROADCAST_PRIORITIES
- **Where defined:** `db/enums.ts:301`
- **Values:** `normal`, `important`, `high`, `critical`, `emergency`
- **DB column(s):** `broadcasts.priority` (text, line 6483, default `normal`)

### BROADCAST_CATEGORIES
- **Where defined:** `db/enums.ts:303`
- **Values:** `announcement`, `ceo`, `policy`, `compliance`, `emergency`, `department`, `event`, `holiday`, `recognition`, `it`, `payroll`, `other`
- **DB column(s):** `broadcasts.category` (text, line 6482, default `announcement`)

### BROADCAST_STATUSES
- **Where defined:** `db/enums.ts:308`
- **Values:** `draft`, `scheduled`, `published`, `paused`, `archived`
- **DB column(s):** `broadcasts.status` (text, line 6487, default `draft`)
- **Labels:** `lib/ecos/labels.ts:41` (BROADCAST_STATUS_LABELS)

### BROADCAST_ACK_MODES
- **Where defined:** `db/enums.ts:311`
- **Values:** `none`, `read`, `acknowledge`
- **DB column(s):** `broadcasts.ack_mode` (text, line 6484, default `read`)

### BROADCAST_AUTHOR_IDENTITIES
- **Where defined:** `db/enums.ts:313`
- **Values:** `hr`, `ceo`, `founder`
- **DB column(s):** `broadcasts.author_identity` (text, line 6489, default `hr`)

### BROADCAST_RECIPIENT_STATUSES
- **Where defined:** `db/enums.ts:315`
- **Values:** `pending`, `read`, `acknowledged`
- **DB column(s):** `broadcast_recipients.status` (text, line 6533, default `pending`)
- **Labels:** `lib/ecos/labels.ts:77` (RECEIPT_STATUS_LABELS)

### BROADCAST_RECURRENCES
- **Where defined:** `db/enums.ts:317`
- **Values:** `none`, `daily`, `weekly`, `monthly`
- **DB column(s):** `broadcasts.recurrence` (text, line 6497, default `none`)

### TASK_PRIORITIES
- **Where defined:** `db/enums.ts:320`
- **Values:** `imp_urgent`, `imp_not_urgent`, `not_imp_urgent`, `not_imp_not_urgent`
- **Labels:** `imp_urgent`→"Critical", `imp_not_urgent`→"Important", `not_imp_urgent`→"Urgent", `not_imp_not_urgent`→"Normal"
- **DB column(s):** `tasks.priority`, `weekly_goals.priority` (pgEnum `task_priority`)

### DEPARTMENTS
- **Where defined:** `db/enums.ts:342`
- **Values:** `Founder Office`, `Handholding`, `Apps`, `Sales`, `Marketing`, `Social Media`, `Accounts`, `Admin`, `HR`, `Consulting`, `CRM`
- **DB column(s):** `employees.department` (legacy text mirror) + `departments` table rows
- **Used by:** `lib/filters.ts:25`, `lib/task-filters.ts:17` (DEPT_SET)

### AGE_BUCKETS
- **Where defined:** `db/enums.ts:357`
- **Values (id→label):** `0-3`→"0-3 days", `4-7`→"4-7 days", `8-14`→"8-14 days", `15-20`→"15-20 days", `21-30`→"21-30 days", `31-45`→"31-45 days", `46-60`→"46-60 days", `60+`→"60+ days"
- **Special rules:** derived buckets (not stored); used by aging heatmap.

### ATTENDANCE_KINDS
- **Where defined:** `db/enums.ts:374`
- **Values:** `in`, `out`
- **DB column(s):** `attendance_logs.kind` (text, line 2188)

### ATTENDANCE_CODES
- **Where defined:** `db/enums.ts:379`
- **Values:** `P`, `H/D`, `A`, `W/O`, `incomplete`, `H`, `HP`, `H-H/D`, `PL`, `LWP`, `CO`
- **Labels:** `P`→"Present", `H/D`→"Half Day", `A`→"Absent", `W/O`→"Weekly Off", `incomplete`→"No Check-out", `H`→"Holiday", `HP`→"Holiday Present", `H-H/D`→"Holiday Half-Day", `PL`→"Paid Leave", `LWP`→"Unpaid Leave", `CO`→"Comp Off"
- **Values (numeric):** `P`=1, `H/D`=0.5, `A`=0, `W/O`=1, `incomplete`=0, `H`=1, `HP`=2, `H-H/D`=1.5, `PL`=1, `LWP`=0, `CO`=1
- **DB column(s):** `attendance_logs` derived codes (text columns, house norm)

### LEAVE_KINDS
- **Where defined:** `db/enums.ts:393`
- **Values:** `paid`, `unpaid`
- **Labels:** `paid`→"Paid Leave", `unpaid`→"Unpaid Leave"
- **DB column(s):** `leave_requests.kind` (text, line 3126, NOT NULL)
- **Used by:** `lib/validators/leave.ts:46,72`

### LEAVE_STATUS
- **Where defined:** `db/enums.ts:400`
- **Values:** `pending`, `approved`, `rejected`, `cancelled`
- **Labels:** `pending`→"Pending", `approved`→"Approved", `rejected`→"Rejected", `cancelled`→"Cancelled"
- **DB column(s):** `leave_requests.status` (text, line 3153)

### COMP_OFF_STATUS
- **Where defined:** `db/enums.ts:409`
- **Values:** `open`, `redeemed`
- **DB column(s):** `comp_off_credits.status` (text, line 3197)

### PUNCH_SOURCES
- **Where defined:** `db/enums.ts:411`
- **Values:** `self`, `admin`
- **DB column(s):** `attendance_logs.source` (text, line 2208, default `self`)

### PUNCH_REASONS
- **Where defined:** `db/enums.ts:413`
- **Values:** `client_visit`, `wfh`, `forgot`, `correction`
- **Used by:** `lib/validators/attendance.ts:22` (`z.enum(PUNCH_REASONS)`)

### REMOTE_WORK_MODES
- **Where defined:** `db/enums.ts:423`
- **Values:** `wfh`, `client_site`, `field`
- **Labels:** `wfh`→"WFH", `client_site`→"Client Site", `field`→"On Field"
- **DB column(s):** `remote_work_requests.work_mode` (text, line 2308, NOT NULL)
- **Used by:** `app/(app)/attendance/remote-work/actions.ts:40,145`
- **Special rules:** strict subset of `attendance_logs.work_mode` (which also carries `office` and `other` — those are NOT requestable).

### REMOTE_WORK_STATUSES
- **Where defined:** `db/enums.ts:441`
- **Values:** `pending`, `approved`, `rejected`
- **DB column(s):** `remote_work_requests.status` (text, line 2324, default `pending`)

### REMOTE_REASON_BUCKETS
- **Where defined:** `db/enums.ts:453`
- **Values:** `manan_approved`, `client_requested`, `manager_approved`
- **Labels:** `manan_approved`→"Manan Sir Approved", `client_requested`→"Client Requested", `manager_approved`→"Manager Approved"
- **DB column(s):** `remote_work_requests.reason_bucket` (text, line 2314)
- **Used by:** `app/(app)/attendance/remote-work/actions.ts:43,151`

### RECURRENCE_MODES
- **Where defined:** `db/enums.ts:475`
- **Values:** `none`, `daily`, `weekdays`, `weekly`, `custom`
- **Labels:** `none`→"Does not repeat", `daily`→"Daily", `weekdays`→"Every weekday (Mon–Fri)", `weekly`→"Weekly on this day", `custom`→"Custom…"
- **DB column(s):** `remote_work_requests.recurrence` (text, line 2320, default `none`)
- **Used by:** `app/(app)/attendance/remote-work/actions.ts:47`

### OFFICE_PHONE_AVAILABILITY
- **Where defined:** `db/enums.ts:493`
- **Values:** `yes`, `no`, `na`
- **Labels:** `yes`→"Yes", `no`→"No", `na`→"Not applicable"
- **DB column(s):** `leave_requests.avail_office_phone` (text, line 3150)
- **Used by:** `lib/validators/leave.ts:23`

### INCENTIVE_TYPES
- **Where defined:** `db/enums.ts:503`
- **Values:** `bss_conversion`, `sales_pitch`, `client_happiness`, `group_intro`, `leads_referrals`
- **Labels:** `bss_conversion`→"Conversion", `sales_pitch`→"Sales Pitch", `client_happiness`→"Client Happiness", `group_intro`→"Group Introduction", `leads_referrals`→"Leads / Referrals"
- **DB column(s):** `incentive_master.incentive_type` (text, line 3626)
- **Used by:** `lib/incentive/prepare-request.ts:28` (`z.enum(INCENTIVE_TYPES)`); `app/(admin)/admin/incentive-master/actions.ts:94`

### INCENTIVE_DURATIONS
- **Where defined:** `db/enums.ts:538`
- **Values:** `permanent`, `one_time`
- **Labels:** `permanent`→"Permanent", `one_time`→"One-Time"
- **DB column(s):** `incentive_master.duration` (text, line 3631, default `permanent`)
- **Used by:** `app/(admin)/admin/incentive-master/actions.ts:98`

### INCENTIVE_STATUSES
- **Where defined:** `db/enums.ts:554`
- **Values:** `pending`, `approved`, `rejected`, `due`, `not_due`, `reversed`, `revision_requested`
- **Labels:** `pending`→"Pending Approval", `approved`→"Approved", `rejected`→"Not Approved", `due`→"Due", `not_due`→"Not Due", `reversed`→"Reversed", `revision_requested`→"Revision Requested"
- **DB column(s):** `incentive_requests.status` (text, line 2702 `$type<...>`)
- **Used by:** `lib/incentive/workflow.ts` (transition rules)

### OUTSTANDING_STATUSES
- **Where defined:** `db/enums.ts:575`
- **Values:** `open`, `partial`, `paid`, `written_off`
- **Labels:** `open`→"Open", `partial`→"Partially Paid", `paid`→"Paid", `written_off`→"Written Off"
- **DB column(s):** `outstanding_contracts.status` (text, line 2838)

### STATUS_COLOR_TOKENS
- **Where defined:** `db/enums.ts:593`
- **Values:** `blue`, `green`, `amber`, `red`, `rose`, `purple`, `yellow`, `orange`, `slate`, `brown`, `stone`
- **DB column(s):** `status_settings.color_token` (text)
- **Used by:** `lib/validators/color-token.ts:10`
- **Special rules:** admin ColorPicker emits a token OR a raw hex string (validated by regex).

### OUTSTANDING_CYCLES
- **Where defined:** `db/enums.ts:610`
- **Values:** `subscription`, `monthly_bill`, `full_payment`, `partial_payment`, `slabs`
- **Labels:** `subscription`→"Subscription", `monthly_bill`→"Monthly Bill", `full_payment`→"Full Payment", `partial_payment`→"Partial Payment", `slabs`→"Slabs"
- **DB column(s):** `outstanding_contracts.cycle` (text, line 3311, NOT NULL)
- **Used by:** `lib/validators/outstanding.ts:125,166`

### SUBSCRIPTION_FREQUENCIES
- **Where defined:** `db/enums.ts:628`
- **Values:** `10_days`, `15_days`, `30_days`, `weekly`
- **Labels:** `10_days`→"10 Days", `15_days`→"15 Days", `30_days`→"30 Days", `weekly`→"Weekly"
- **DB column(s):** `outstanding_contracts.frequency` (text)
- **Used by:** `lib/validators/outstanding.ts:135,177`

### GST_RATES
- **Where defined:** `db/enums.ts:642`
- **Values:** `0`, `5`, `12`, `18`, `28` (numbers)
- **Special rules:** full legacy list.

### GST_FORM_RATES
- **Where defined:** `db/enums.ts:648`
- **Values:** `0`, `18` (numbers)
- **Used by:** `lib/validators/outstanding.ts:129,170` (`gstRate` `.refine(includes)`)

### OUTSTANDING_CONTRACT_STATUS
- **Where defined:** `db/enums.ts:650`
- **Values:** `active`, `closed`, `written_off`
- **DB column(s):** `outstanding_contracts` status (text, line 3328)

### INSTALLMENT_STATES
- **Where defined:** `db/enums.ts:658`
- **Values:** `not_due`, `due_soon`, `overdue`, `paid`
- **Special rules:** derived per-installment state, never stored.

### OUTSTANDING_OVERDUE_BUCKETS
- **Where defined:** `db/enums.ts:662`
- **Values (id→label):** `0-3`→"0–3 Days Overdue", `4-7`→"4–7 Days Overdue", `8-15`→"8–15 Days Overdue", `16-30`→"16–30 Days Overdue", `31-45`→"31–45 Days Overdue", `46-60`→"46–60 Days Overdue", `60+`→"60+ Days Overdue"

### SEED_RESPONSIBLES
- **Where defined:** `db/enums.ts:676`
- **Values:** `Anand Singh`, `Dhanashree Solkar`, `Jeevan Bharambe`, `Kiran Bhosale`, `Manan Vasa`, `Mishtie Kanani`, `Rohan Choudhary`, `Ruchita Ambre`, `Rutvisha Mehta`, `Sanket Thorat`, `Satish Sonawane`, `Siddesh Walve`

### SEED_ENTITIES
- **Where defined:** `db/enums.ts:690`
- **Values:** `Altus Corp`, `Unleashed`, `IJV`, `Khushboo`, `MJV HUF`, `JSV HUF`, `Dharav Enterprises`, `Colour Graphics`, `Smita Raut`, `Sunil Raut`
- **Special rules:** "IJV" renamed from "IGV" (migration 0217).

### SEED_PRODUCTS
- **Where defined:** `db/enums.ts:720`
- **Values:** `Altus Conclave`, `Billing`, `BSS`, `BSSO`, `Commission`, `Consulting`, `Graduate Programs`, `OS`, `PS`, `PSO`, `Rent`, `Retainer`
- **Special rules:** "Consulting" stays (retired via `is_active`, never dropped); BSU dropped from fresh-seed.

### SEED_PAYMENT_MODES
- **Where defined:** `db/enums.ts:750`
- **Values:** `Altus Kotak`, `Barter`, `CMV G Pay`, `Dattaram Kotak`, `Gpay - CMV`, `Gpay - JSV HUF`, `Gpay - MJV`, `IJV`, `Jodo`, `JSV HUF ICICI`, `JSV HUF Kotak`, `KAS Kotak`, `Kotak - Altus`, `Kotak - JSV HUF`, `Kotak - Khushboo`, `Kotak - MJV HUF`, `Kotak - Unleashed`, `MJV G Pay`, `MJV HUF Kotak`, `Parvez Kotak`, `Pay U`, `PDC`, `Razorpay`, `Smita`, `Sunil Kotak`, `Unleashed Kotak`

### EVENT_STATUSES
- **Where defined:** `db/enums.ts:785`
- **Values:** `tentative`, `confirmed`
- **Labels:** `tentative`→"Tentative", `confirmed`→"Confirmed"
- **DB column(s):** `calendar_events.status` (text, lines 6966, 7048, default `confirmed`)
- **Used by:** `app/api/mobile/events/route.ts:58`, `app/api/mobile/events/batches/route.ts:154`, `app/(app)/events/batches/actions.ts:67`, `app/(app)/events/calendar/actions.ts:44`

### EVENT_SOURCES
- **Where defined:** `db/enums.ts:794`
- **Values:** `manual`, `holiday`, `batch`, `obligation`
- **DB column(s):** `calendar_events.source` (text, line 7051, default `manual`)

### RELIGIONS
- **Where defined:** `db/enums.ts:798`
- **Values:** `hindu`, `christian`, `muslim`, `other`, `unspecified`
- **Labels:** `hindu`→"Hindu", `christian`→"Christian", `muslim`→"Muslim", `other`→"Other", `unspecified`→"Unspecified"
- **DB column(s):** `employees.religion` (text, line 604)

### HOLIDAY_APPLIES_TO
- **Where defined:** `db/enums.ts:810`
- **Values:** `all`, `hindu_only`, `christian`, `muslim`, `custom`
- **Labels:** `all`→"Everyone", `hindu_only`→"Hindu only", `christian`→"Christian add-on", `muslim`→"Muslim add-on", `custom`→"Custom"
- **DB column(s):** `holidays.applies_to` (text, line 7018, default `all`)

### GOAL_PERIODS
- **Where defined:** `db/enums.ts:825`
- **Values:** `year`, `quarter`, `month`, `week`, `day`
- **Labels:** `year`→"Yearly", `quarter`→"Quarterly", `month`→"Monthly", `week`→"Weekly", `day`→"Daily"
- **DB column(s):** `goals.period` (text)

### GOAL_SOURCES
- **Where defined:** `db/enums.ts:836`
- **Values:** `manual`, `cascade`
- **DB column(s):** `goals.source` (text)

### GOAL_TYPES
- **Where defined:** `db/enums.ts:867`
- **Values:** `kpi`, `strategic`, `operational`, `essential`
- **Labels:** `kpi`→"KPI", `strategic`→"Strategic", `operational`→"Operational", `essential`→"Essential"
- **DB column(s):** `goals.goal_type` + `weekly_goals.goal_type` (nullable text)
- **Used by:** `lib/goals/template-columns.ts:118` (goalTypeToCode)
- **Special rules:** replaces `goals.category` + `weekly_goals.kpi`; legacy "branding" no longer a goal type; backfill 0168.

### NON_KPI_GOAL_TYPES
- **Where defined:** `db/enums.ts:878`
- **Values:** `strategic`, `operational`

### AGREEMENT_TYPES
- **Where defined:** `db/enums.ts:885`
- **Values:** `appointment`, `employment`, `nda`, `ctc`, `probation_confirmation`, `training_completion`
- **Labels:** `appointment`→"Appointment Letter", `employment`→"Employment Agreement", `nda`→"NDA / Confidentiality", `ctc`→"CTC / Salary Letter", `probation_confirmation`→"Confirmation of Appointment (Post-Probation)", `training_completion`→"Confirmation - End of Free Training"
- **DB column(s):** `agreements.type` (text, line 6824, NOT NULL)
- **Used by:** `app/api/mobile/agreements/route.ts:111`, `app/(app)/agreements/actions.ts:34`

### AGREEMENT_STATUSES
- **Where defined:** `db/enums.ts:903`
- **Values:** `draft`, `sent`, `signed`
- **Labels:** `draft`→"Draft", `sent`→"Sent", `signed`→"Signed"
- **DB column(s):** `agreements.status` (text, line 6826, default `draft`)

### HR_TICKET_STATUSES
- **Where defined:** `db/enums.ts:921`
- **Values:** `new`, `in_progress`, `waiting_on_employee`, `resolved`, `closed`, `reopened`
- **Labels (HR):** `new`→"New", `in_progress`→"In Progress", `waiting_on_employee`→"Waiting on Employee", `resolved`→"Resolved", `closed`→"Closed", `reopened`→"Reopened"
- **Labels (employee):** `new`→"With HR", `in_progress`→"With HR", `waiting_on_employee`→"Waiting on you", `resolved`→"Resolved", `closed`→"Closed", `reopened`→"With HR"
- **DB column(s):** `hr_tickets.status` (text, line 7127, default `new`)
- **Special rules:** employees NEVER touch a status dropdown — transitions driven by HR actions + auto rules.

### HR_TICKET_OPEN_STATUSES
- **Where defined:** `db/enums.ts:952`
- **Values:** `new`, `in_progress`, `waiting_on_employee`, `reopened`

### HR_TICKET_PRIORITIES
- **Where defined:** `db/enums.ts:959`
- **Values:** `low`, `normal`, `high`, `urgent`
- **Labels:** `low`→"Low", `normal`→"Normal", `high`→"High", `urgent`→"Urgent"
- **DB column(s):** `hr_tickets.priority` (text, line 7128, default `normal`)
- **Used by:** `app/api/mobile/queries/route.ts:61`, `app/api/mobile/support/_desk.ts:141`
- **SLA:** `urgent`=2h/1d, `high`=4h/2d, `normal`=8h/3d, `low`=24h/5d (HR_TICKET_SLA).

### HR_TICKET_CATEGORIES
- **Where defined:** `db/enums.ts:985`
- **Values:** `payroll`, `leave_attendance`, `reimbursement`, `it_access`, `facilities`, `documents_letters`, `policy_question`, `grievance`, `other`
- **Labels:** `payroll`→"Payroll & Salary", `leave_attendance`→"Leave & Attendance", `reimbursement`→"Reimbursement", `it_access`→"IT & Access", `facilities`→"Facilities", `documents_letters`→"Documents & Letters", `policy_question`→"Policy Question", `grievance`→"Grievance (Confidential)", `other`→"Other"
- **DB column(s):** `hr_tickets.category` (text, line 7125), `hr_ticket_routes.category` (text, line 7217, UNIQUE)
- **Used by:** `app/api/mobile/queries/route.ts:60`, `app/api/mobile/support/_desk.ts:140`
- **Special rules:** `grievance` is CONFIDENTIAL (requester + assignee + super-admins only), born at priority ≥ high.

### HR_TICKET_SOURCES
- **Where defined:** `db/enums.ts:1010`
- **Values:** `support`, `query`
- **DB column(s):** `hr_tickets.source` (text, line 7136, default `support`)
- **Used by:** `app/api/mobile/support/_desk.ts:142` (`z.enum(["support","query"]).default("support")`)

### APPRAISAL_DIMENSIONS
- **Where defined:** `db/enums.ts:1021`
- **Values:** `kpi`, `skill`, `attitude`, `incentive`, `culture`, `knowledge_sharing`, `problem_solving`, `growth_mindset`, `ability`
- **Labels:** `kpi`→"KPI", `skill`→"Skill", `attitude`→"Attitude & Mindset", `incentive`→"Incentive", `culture`→"Culture (Constitution)", `knowledge_sharing`→"Knowledge Sharing", `problem_solving`→"Problem Solving Ability", `growth_mindset`→"Growth Mindset", `ability`→"Ability to Get Things Done"
- **DB column(s):** `appraisal_items.dimension` (text, line 7317); `appraisal_config.dimension_weights` (jsonb, line 7278)
- **Used by:** `app/(app)/appraisal/actions.ts:376` (inline enum of the same 9)

### APPRAISAL_MANAGER_ONLY_DIMENSIONS
- **Where defined:** `db/enums.ts:1047`
- **Values:** `problem_solving`, `growth_mindset`, `ability`

### APPRAISAL_AUTO_DIMENSIONS
- **Where defined:** `db/enums.ts:1054`
- **Values:** `incentive`, `knowledge_sharing`

### DEFAULT_APPRAISAL_DIMENSION_WEIGHTS
- **Where defined:** `db/enums.ts:1063`
- **Values:** `kpi`=25, `skill`=15, `attitude`=10, `incentive`=20, `culture`=10, `knowledge_sharing`=5, `problem_solving`=5, `growth_mindset`=5, `ability`=5 (sums to 100)

### APPRAISAL_CYCLE_STATUSES
- **Where defined:** `db/enums.ts:1076`
- **Values:** `draft`, `open`, `review`, `finalized`, `archived`
- **Labels:** `draft`→"Draft", `open`→"Self-Scoring Open", `review`→"In Review", `finalized`→"Finalized", `archived`→"Archived"
- **DB column(s):** `appraisal_cycles.status` (text, line 7254, default `draft`)

### APPRAISAL_ITEM_STATUSES
- **Where defined:** `db/enums.ts:1093`
- **Values:** `draft`, `awaiting_self`, `awaiting_manager`, `awaiting_management`, `finalized`
- **Labels:** `draft`→"Draft", `awaiting_self`→"Awaiting Self Score", `awaiting_manager`→"Awaiting Manager", `awaiting_management`→"Awaiting Management", `finalized`→"Final"
- **DB column(s):** `appraisal_items.status` (text, line 7337, default `draft`)

### APPRAISAL_SCORE_STAGES
- **Where defined:** `db/enums.ts:1112`
- **Values:** `self`, `manager`, `management`, `final`
- **DB column(s):** `appraisal_scores.stage` (text, line 7418, default `self`)
- **Used by:** `app/api/mobile/appraisal/score/route.ts:27` (`z.enum(["self","manager","management"])`), `app/(app)/appraisal/score-actions.ts:152` (`tier: z.enum(["self","manager","management"])`)

### KPI_FREQUENCIES
- **Where defined:** `db/enums.ts:1123`
- **Values:** `weekly`, `monthly`, `quarterly`, `annual`
- **Labels:** `weekly`→"Weekly", `monthly`→"Monthly", `quarterly`→"Quarterly", `annual`→"Annual"
- **DB column(s):** `kpi_assignments.frequency` (text, line 8013, default `monthly`)

### KPI_ASSIGNMENT_STATUSES
- **Where defined:** `db/enums.ts:1133`
- **Values:** `active`, `inactive`
- **Labels:** `active`→"Active", `inactive`→"Inactive"
- **DB column(s):** `kpi_assignments.status` (text, line 8023, default `active`)

### KPI_CHANGE_TYPES
- **Where defined:** `db/enums.ts:1142`
- **Values:** `assigned`, `updated`, `activated`, `deactivated`, `removed`, `weightage_changed`, `target_changed`
- **Labels:** `assigned`→"Newly assigned", `updated`→"Modified", `activated`→"Activated", `deactivated`→"Deactivated", `removed`→"Removed", `weightage_changed`→"Weightage changed", `target_changed`→"Target changed"
- **DB column(s):** `kpi_assignment_history.change_type` (text, line 8046, NOT NULL)

### DEFAULT_APPRAISAL_RATING_TERMS
- **Where defined:** `db/enums.ts:1164`
- **Values (min→label):** `90`→"Outstanding", `75`→"Exceeds Expectations", `60`→"Meets Expectations", `40`→"Needs Improvement", `0`→"Unsatisfactory"

### APPROVAL_LEVELS
- **Where defined:** `db/enums.ts:1177`
- **Values:** `none`, `manager`, `admin`
- **DB column(s):** `tasks.approval_level` (pgEnum `approval_level`)

### ALLOCATION_CATEGORIES
- **Where defined:** `db/enums.ts:1188`
- **Values (code):** `ps` (label "PS Participants", expected 6), `bss` (label "BSS Participants", expected 8), `retainer` (label "Retainer Clients", expected 1), `ecosystem` (short "Eco System", label "Ecosystem Clients (Apps)", expected 2)
- **Special rules:** `ALLOCATION_CATEGORY_CODES` = `ps, bss, retainer, ecosystem`; expected total 17.

### INTERN_SECTIONS
- **Where defined:** `db/enums.ts:1210`
- **Values:** `retainer`, `ecosystem`, `ps`, `bss`

### HH_CALL_TYPES
- **Where defined:** `db/enums.ts:1229`
- **Values (code→label):** `hh`→"HH Call", `tool`→"Tool Call", `checkin`→"Check-in Call"

### HH_DAYS
- **Where defined:** `db/enums.ts:1235`
- **Values (code→label/full):** `mon`→"Mon"/"Monday", `tue`→"Tue"/"Tuesday", `wed`→"Wed"/"Wednesday", `thu`→"Thu"/"Thursday", `fri`→"Fri"/"Friday", `sat`→"Sat"/"Saturday", `sun`→"Sun"/"Sunday"

### HH_PERSON_KINDS
- **Where defined:** `db/enums.ts:1257`
- **Values (code→label):** `employee`→"Employee", `intern`→"Intern"

### HH_EMPLOYEE_NAMES
- **Where defined:** `db/enums.ts:1262`
- **Values:** `Dattaram`, `Jeevan`, `Mishtie`, `Mitul`, `Namrata`, `Parvez`, `Prakash`, `Raj`, `Rohan`, `Ruchita`, `Rutvisha`

### HH_INTERN_NAMES
- **Where defined:** `db/enums.ts:1276`
- **Values:** `Danyal`, `Hardik`, `Krish`, `Nandini`, `Om`, `Proveeka`, `Shreya Randhe`, `Shreya Shukla`, `Suresh`, `Vinal`

### HH_PARTICIPANT_MODULES
- **Where defined:** `db/enums.ts:1302`
- **Values (code→label):** `ps`→"PS", `bss`→"BSS", `retainer`→"Retainer", `ecosystem`→"Eco System", `tool`→"Tool", `follow_up`→"Follow Up"

### HH_PARTICIPANT_CALLS
- **Where defined:** `db/enums.ts:1322`
- **Values:** `1`, `2`, `3`, `4`

### HH_ACCESS_ROLES
- **Where defined:** `db/enums.ts:1345`
- **Values (code→label):** `admin`→"Admin" (actions add/edit/delete), `hr`→"HR" (actions add), `ruchita`→"Ruchita" (actions add/edit/delete)

### HH_ACCESS_MODULES
- **Where defined:** `db/enums.ts:1379`
- **Values (code→label):** `handholding`→"Hand-holding" (sections employees/interns), `ambassadors`→"Ambassadors", `development`→"Development"

### HH_ACCESS_ACTIONS
- **Where defined:** `db/enums.ts:1401`
- **Values (code→label):** `add`→"Add", `edit`→"Edit", `delete`→"Delete"
- **Special rules:** "view" deliberately absent (old stored rows still render, cannot be created).

### HH_ACCESS_SECTIONS
- **Where defined:** `db/enums.ts:1420`
- **Values (code→label):** `employees`→"Employees", `interns`→"App Development (Interns)"

### DEVICE_KINDS
- **Where defined:** `db/enums.ts:1439`
- **Values:** `laptop`, `phone`
- **Labels:** `laptop`→"Laptop", `phone`→"Phone"
- **DB column(s):** `registered_devices.kind` (text, line 2397, default `phone`)

### ATTENDANCE_AUDIT_ACTIONS
- **Where defined:** `db/enums.ts:1455`
- **Values:** `create`, `update`, `delete`, `clear`
- **Labels:** `create`→"Created", `update`→"Changed", `delete`→"Deleted", `clear`→"Cleared"
- **DB column(s):** `attendance_audit_log.action` (text, line 2585, NOT NULL)

### AttendanceAuthorizationContext.basis
- **Where defined:** `db/enums.ts:1498` (interface, not an array)
- **Values:** `self`, `privileged`, `system`
- **DB column(s):** `attendance_audit_log.authorization_context` (jsonb, line 2603)

---

## 3. Zod enums in API validation (`app/api` route handlers)

### app/api/mobile/attendance/remote — REMOTE_MODES + kind
- **Where defined:** `app/api/mobile/attendance/remote/route.ts:19`
- **Values (REMOTE_MODES):** `wfh`, `client_site`, `field`, `other`
- **Values (kind):** `in`, `out`
- **Validation:** `kind: z.enum(["in","out"])`, `workMode: z.enum(REMOTE_MODES)`, `.strict()`

### app/api/mobile/communications — action
- **Where defined:** `app/api/mobile/communications/route.ts:102`
- **Values:** `read`, `acknowledge`, `poll`

### app/api/mobile/agreements/[id] — action
- **Where defined:** `app/api/mobile/agreements/[id]/route.ts:17`
- **Values:** `send`, `delete`

### app/api/mobile/agreements — type
- **Where defined:** `app/api/mobile/agreements/route.ts:111`
- **Values:** AGREEMENT_TYPES (see above)

### app/api/mobile/events — statusEnum
- **Where defined:** `app/api/mobile/events/route.ts:58`
- **Values:** EVENT_STATUSES (`tentative`, `confirmed`)

### app/api/mobile/events/batches — status
- **Where defined:** `app/api/mobile/events/batches/route.ts:154`
- **Values:** EVENT_STATUSES, `.default("confirmed")`

### app/api/mobile/events/masters — mode
- **Where defined:** `app/api/mobile/events/masters/route.ts:145`
- **Values:** `none`, `reassign`, `clear` (default `none`)

### app/api/mobile/appraisal/score — stage
- **Where defined:** `app/api/mobile/appraisal/score/route.ts:27`
- **Values:** `self`, `manager`, `management`

### app/api/mobile/queries — category + priority
- **Where defined:** `app/api/mobile/queries/route.ts:60-61`
- **Values:** `category: z.enum(HR_TICKET_CATEGORIES)`, `priority: z.enum(HR_TICKET_PRIORITIES).optional()`

### app/api/mobile/support/_desk — category + priority + source
- **Where defined:** `app/api/mobile/support/_desk.ts:140-142`
- **Values:** `category: z.enum(HR_TICKET_CATEGORIES)`, `priority: z.enum(HR_TICKET_PRIORITIES).optional()`, `source: z.enum(["support","query"]).default("support")`

### app/api/mobile/support/[id] — action
- **Where defined:** `app/api/mobile/support/[id]/route.ts:63`
- **Values:** `reply`, `note`, `assign`, `status`, `priority`, `reopen`

### app/api/hr/send-letter-email — contentKind
- **Where defined:** `app/api/hr/send-letter-email/route.ts:41`
- **Values:** `structured`, `rich`

### app/api/hr/letters/email-pdf — contentKind
- **Where defined:** `app/api/hr/letters/email-pdf/route.ts:35`
- **Values:** `structured`, `rich`

---

## 4. Zod enums in `lib/validators/` (all files)

### lib/validators/attendance.ts
- `kindField = z.enum(["in","out"])` (line 13)
- `reason: z.enum(PUNCH_REASONS)` (line 22) → `client_visit`, `wfh`, `forgot`, `correction`
- `workerType: z.enum(WORKER_TYPES).optional()` (line 81)

### lib/validators/ambassadors.ts
- `status: z.enum(["active","paused","archived"]).default("active")` (line 42)
- `payoutType: z.enum(["percent","flat"]).default("percent")` (line 43)
- `stage: z.enum(STAGES).default("received")` (line 62) — STAGES from `lib/ambassadors/stages.ts`
- `type: z.enum(["note","call","meeting","email","whatsapp"]).default("note")` (line 85)

### lib/validators/color-token.ts
- `z.enum(STATUS_COLOR_TOKENS)` (line 10) + hex regex union

### lib/validators/employee.ts
- `role: z.enum(["doer","initiator","both"])` (lines 41, 85, 233)
- `workerType: z.enum(WORKER_TYPES).optional()` (line 241)

### lib/validators/feedback.ts
- `type: z.enum(FEEDBACK_TYPES)` (line 9) → `consultant`, `trainer`, `in_call`

### lib/validators/leave.ts
- `availOfficePhone: z.enum(OFFICE_PHONE_AVAILABILITY).nullable().optional()` (line 23)
- `kind: z.enum(LEAVE_KINDS)` (lines 46, 72)
- `verdict: z.enum(["approved","rejected"])` (line 63)

### lib/validators/offboarding.ts
- `exitReason: z.enum(EXIT_REASONS)` (line 57)
- `rehireEligibility: z.enum(REHIRE_ELIGIBILITIES)` (line 61)
- `.superRefine` requires `exitReasonOther` when `exitReason === "other"`; `legalHoldReason` when `legalHold`; lastWorkingDay ≥ joinedAt (line 92)

### lib/validators/outstanding.ts
- `cycle: z.enum(OUTSTANDING_CYCLES)` (lines 125, 166)
- `frequency: z.enum(SUBSCRIPTION_FREQUENCIES).nullable().optional()` (lines 135, 177)
- `gstRate: z.number().refine(v => GST_FORM_RATES.includes(v))` (lines 129, 170)

### lib/validators/people-gives.ts
- `PG_LOOKUP_KINDS` (line 9): `reference_source`, `designation`, `business_category`, `sales_person`
- `kind: z.enum(PG_LOOKUP_KINDS)` (lines 64, 69)

### lib/validators/salary.ts
- `workerType: z.enum(WORKER_TYPES).optional()` (line 23)

### lib/validators/salary-ctc.ts
- `kind: z.enum(["deduct","ex_gratia"])` (line 47)

### lib/validators/task.ts
- `priority: z.enum(TASK_PRIORITIES)` (lines 23, 73)
- `recurrence: z.enum(TASK_RECURRENCES).nullable().optional()` (lines 45, 85)
- `approvalStatus: z.enum(APPROVAL_STATUSES).nullable()` (line 103)
- `decision: z.enum(["approved","not_approved"])` (line 124)

### lib/validators/training.ts
- `TC_LOOKUP_KINDS` (line 5): `subject`, `service`
- `fileType: z.enum(["video","pdf","xls"])` (line 32)
- `kind: z.enum(TC_LOOKUP_KINDS)` (lines 52, 57)
- `type: z.enum(["mcq","fill_blank"])` (line 64)
- `kind: z.union([z.literal(1), z.literal(2)])` (line 76)

### lib/validators/weekly-goal.ts
- `priority: z.enum(TASK_PRIORITIES).optional().default("imp_not_urgent")` (line 20)
- `incentiveType: z.enum(["adhoc","onetime","routine"]).nullable().optional()` (lines 23, 63)
- `status: z.enum(USER_TASK_STATUSES)` (line 99)
- `status: z.enum(TASK_STATUSES).optional()` (line 143, ReviewWeeklyGoalSchema)

### lib/validators/department.ts / subject.ts / client.ts / comp-off.ts / index-hub.ts / org-settings.ts / whatsapp.ts
- No enums; free-text names, uuid ids, regex/time constraints. (`org-settings.workingDays` is int 0–6; not a string enum.)

---

## 5. Zod enums in server actions (backend write paths, outside app/api)

- `app/(admin)/admin/incentive-master/actions.ts:94,98` — `type: z.enum(INCENTIVE_TYPES)` (union w/ "" + null), `duration: z.enum(INCENTIVE_DURATIONS).optional().default("permanent")`
- `app/(admin)/admin/settings/actions.ts:108` — `status: z.enum(TASK_STATUSES)`; `:195` `z.enum(NOTIFICATION_CHANNELS)`; `:224-225` `z.enum(NOTIFICATION_KINDS)` + `z.array(z.enum(NOTIFICATION_CHANNELS))`
- `app/(admin)/admin/task-reminders/actions.ts:32` — `scope: z.enum(["all","selected"])`
- `app/(app)/accounts/ca-handover/actions.ts:40` — `portalType: z.enum(CA_PORTAL_TYPES)`
- `app/(app)/accounts/cc-tracker/actions.ts:202` — `direction: z.enum(["up","down"])`
- `app/(app)/accounts/sip-tracker/loan-actions.ts:107` — `field: z.enum(["emi","closingBalance"])`
- `app/(app)/agreements/actions.ts:34` — `type: z.enum(AGREEMENT_TYPES)`
- `app/(app)/appraisal/actions.ts:376` — `dimension: z.enum([kpi, skill, attitude, incentive, culture, knowledge_sharing, problem_solving, growth_mindset, ability])`
- `app/(app)/appraisal/admin-actions.ts:68` — `roleClass: z.enum(["manager","non-manager"]).optional()`
- `app/(app)/appraisal/score-actions.ts:152` — `tier: z.enum(["self","manager","management"])`
- `app/(app)/attendance/actions.ts:79,94,669,1244` — `kind: z.enum(["in","out"])`
- `app/(app)/attendance/remote-work/actions.ts:40,43,47,54,72,108,145,151` — `workMode: z.enum(REMOTE_WORK_MODES)`, `reasonBucket: z.enum(REMOTE_REASON_BUCKETS)`, `recurrence: z.enum(RECURRENCE_MODES)`, `unit: z.enum(["day","week","month"])`, `end: z.enum(["until","count","never"])`, `decision: z.enum(["approved","rejected"])`
- `app/(app)/dashboard/creator-workload-actions.ts:19`, `manager-activity-actions.ts:24,66` — `period: z.enum(PERIODS)` (= `ACTIVITY_PERIOD_IDS`)
- `app/(app)/dashboard/drilldown-actions.ts:59-60` — `basis: z.enum(["original","revised"])`, `bucket: z.enum(["onTime","late","all"])`
- `app/(app)/dashboard/manager-activity-actions.ts:64-65` — `category: z.enum(["goals","tasks","commitments"])`, `split: z.enum(["delegate","counterpart","gt"])`
- `app/(app)/dcc/actions.ts:296` — `status: z.enum(["approved","needs_rework",""]).nullable().optional()`
- `app/(app)/documents/sign/actions.ts:274` — `signatureKind: z.enum(["drawn","typed"])`
- `app/(app)/events/batches/actions.ts:67` — `status: z.enum(EVENT_STATUSES).default("confirmed")`
- `app/(app)/events/calendar/actions.ts:44` — `statusEnum = z.enum(EVENT_STATUSES)`
- `app/(app)/events/masters/actions.ts:126` — `mode: z.enum(["none","reassign","clear"]).default("none")`
- `app/(app)/forms/actions.ts:134` — `status: z.enum(["approved","rejected","pending"])`; `:194` — `type: z.enum(FIELD_TYPES)`
- `lib/hr/letters/issue-core.ts:55` — `signatory: z.enum(["director","hr"]).optional()`
- `lib/hr/letters/issue-rich.ts:50` — `signingModel: z.enum(["none","acknowledge","esign"]).default("none")`
- `lib/incentive/prepare-request.ts:28` — `type: z.enum(INCENTIVE_TYPES)`
- `lib/filters.ts:19` — `view: z.enum(["doer","initiator"]).optional()`

---

## 6. Import layer (`lib/import/`, `lib/tasks/template-columns.ts`, `lib/goals/template-columns.ts`)

### lib/import/csv-schemas.ts
- `role: z.enum(["doer","initiator","both"])` (line 12, LegacyEmployeeRowSchema)
- `priority: z.enum(["imp_urgent","imp_not_urgent","not_imp_urgent","not_imp_not_urgent"]).optional().nullable()` (line 53, LegacyTaskRowSchema)

### lib/import/status-mapping.ts
- **Legacy status label → code map** (`mapLegacyStatus`, case/space insensitive):
  - `not started`→`not_started`, `initiated`→`initiated`, `follow up`→`follow_up`, `need help`→`need_info` (retired mapping), `done`→`done`, `approved`→`approved`, `not approved`→`not_approved`, `cancelled`→`cancelled`, `transferred`→`transferred`
- Returns null for unrecognised labels.

### lib/import/task-import.ts
- Uses `lib/tasks/template-columns` for `priorityToCode`, `statusToCode`, `recurrenceToCode`, `yesNoToBool`. Default priority `not_imp_not_urgent`; default status `dont_know`; blank recurrence → null.

### lib/import/incentive-import.ts
- `FIELD_ALIASES` (line 40) — header alias map (not a value enum, but the canonical import column names: srNo, entryDate, incentiveName, periodMonth, empName, participant, prospect, amount, approved, approvedAmt, paid, paidAmt, paidDate, note)
- `coerceBool` (line 76): recognises `true`, `yes`, `y`, `1`, `✓`, `x`, `approved`, `paid`, `done`

### lib/tasks/template-columns.ts (Tasks bulk-Excel manifest)
- `TASK_STATUS_CODES = USER_TASK_STATUSES` (line 91); labels via `prettyStatus` (`dont_know`→"Not Assessed")
- `RECURRENCE_CODES = ["none","daily","weekly","monthly","yearly"]` (line 122); labels `["None","Daily","Weekly","Monthly","Yearly"]`
- `YES_NO_LABELS = ["Yes","No"]` (line 137); `yesNoToBool` recognises yes/true/y/1
- `TaskColumnSource` (line 29): `priority`, `status`, `doer`, `initiator`, `recurrence`, `yesno`, `subject`, `client`, null — the master-data lists that back template dropdowns
- `TASK_TEMPLATE_COLUMNS` (line 148) — the 15-column typed manifest (field/header/schemaField/source/aliases)

### lib/tasks/subject-options.ts (subject retire/pin policy)
- `RETIRED_SUBJECTS = ["WMS","WMS App"]` (line 35)
- `PINNED_SUBJECTS = ["Altus Ecosystem"]` (line 39)
- `applySubjectPolicy()` drops retired, guarantees pinned, de-dupes case-insensitively

### lib/goals/template-columns.ts (Goals bulk-Excel manifest)
- `GOAL_STATUS_CODES = TASK_STATUSES.filter(!isDeprecatedStatus)` (line 99)
- `INCENTIVE_KIND_LABELS` (line 125): `one_time`→"One-time", `repetitive`→"Repetitive", `milestone`→"Milestone" (incentiveKindToCode returns `one_time|repetitive|milestone`)
- `VISIBILITY_LABELS = ["Private","Shared with team"]` (line 140)
- `ASSIGNMENT_TYPE_LABELS = ["Self","Assigned"]` (line 152)
- `YES_NO_LABELS = ["Yes","No"]` (line 153)
- `LEVEL_LABELS = ["Year","Quarter","Month","Week","Day"]` (line 154)
- `QUARTER_LABELS = ["Q1","Q2","Q3","Q4"]` (line 155)
- `MONTH_LABELS = ["01 Jan", …, "12 Dec"]` (line 156)
- `PRIORITY_LABELS_LIST = ["Critical","Important","Urgent","Normal"]` (line 162)

---

## 7. Seed / scripts option lists

### scripts/seed-dummy.ts
- `STATUSES = ["dont_know","not_started","initiated","follow_up","need_info","on_hold","done"]` (line 118)
- `PRIORITIES = ["imp_urgent","imp_not_urgent","not_imp_urgent","not_imp_not_urgent"]` (line 119)

### scripts/dummy-db-seed.ts (dummy mode roster)
- Departments seeded: `Operations`, `Finance`, `Technology`, `HR`
- Designations seeded: `Manager`, `Executive`, `Team Lead`
- `CLIENTS` (line 78): `Aurora Textiles`, `Bharat Logistics`, `Coastal Cements`, `Deccan Foods`, `Everest Pharma`, `Ganges Steel Rolling & Fabrication Works`, `Himalaya Motors`
- `SUBJECTS` (line 88): `Audit`, `Billing`, `Compliance`, `Dispatch`, `GST Filing`, `Onboarding`, `Quality Complaint`, `Site Visit`
- `TASKS`/`NODES` seed rows use live statuses/priorities (incl. deprecated `need_help`, `follow_up_1/2/3`, `cancelled` to exercise rendering)

### scripts/apply-0070-cash-to-igv.ts
- `TABLES = ["outstanding_entities","outstanding_payment_modes"]` (line 13)

### scripts/backfill-attendance.ts
- Inline literals: `source: "admin"` (line 195), `verifyMethod: "none"` (line 198)

### scripts/seed-events-holidays.ts
- `status: "confirmed"` (line 65), `source: "holiday"` (line 68)

---

## 8. Other backend option-set arrays (`as const`) outside db/enums.ts

### lib/ambassadors/stages.ts
- **STAGES** (line 7): `received`, `assigned`, `qualified`, `meeting`, `proposal`, `negotiation`, `won`, `payment`, `commission_generated`, `commission_paid`, `lost`
- **STAGE_LABELS** (line 26): Received/Assigned/Qualified/Meeting/Proposal/Negotiation/Won/Payment/Commission generated/Commission paid/Lost
- **PIPELINE_STAGES** = STAGES minus `lost`; **WON_STAGES** = `won`, `payment`, `commission_generated`, `commission_paid`
- **StageTone** = `neutral | progress | warm | win | money | lost` (STAGE_TONES map)

### lib/training/feedback-templates.ts
- **FEEDBACK_TYPES** (line 6): `consultant`, `trainer`, `in_call`

### lib/documents/signing.ts
- **DOC_KINDS** (line 11): `letter`, `agreement`, `exit_doc` (labels: Letter/Agreement/Exit Document)
- **SIGNATURE_STATUSES** (line 31): `pending`, `verified`, `signed`
- **SignatureKind** (line 35): `drawn`, `typed`
- **DB column(s):** `document_instances.doc_kind` (line 6867), `document_signatures.status` (line 6874), `document_signatures.signature_kind` (line 6890)

### lib/hr/ctc/model.ts
- **CTC_REASONS** (line 191): `initial`, `promotion`, `appraisal` (REASON_LABELS: Initial CTC/Promotion/Appraisal Revision)

### lib/dcc/util.ts
- **DCC_STATUSES** (line 6): `Done`, `Not done`, `NA`, `Pending`
- **WEEKDAY_LABELS** (line 170): `Mon`, `Tue`, `Wed`, `Thu`, `Fri`, `Sat`, `Sun`

### lib/accounts/cc.ts
- **CC_YESNO** (line 18): `Yes`, `No`, `NA`
- **CC_TALLY** (line 19): `Done`, `Pending`, `NA`
- **CC_BALANCE** (line 20): `Tallied`, `Pending`, `NA`

### lib/accounts/monthly.ts
- **MONTHLY_FREQUENCIES** (line 30): `Monthly`, `Quarterly`, `Annual`
- **FY_MONTHS** (line 33): `4,5,6,7,8,9,10,11,12,1,2,3` (Apr→Mar)
- **MONTHLY_CHECK_STATUSES** = WEEKLY_CHECK_STATUSES (line 23)

### lib/accounts/weekly.ts
- **WEEKLY_CHECK_STATUSES** (line 12): `Done`, `Pending`, `Need Help`, `Not Applicable`
- **MONTH_LABELS** (line 15): January…December; **MONTH_SHORT** (line 20): Jan…Dec

### lib/accounts/ca-constants.ts
- **CA_PORTAL_TYPES** (line 6): `income_tax`, `gst`, `tds`, `professional_tax`, `mlwf` (labels: Income Tax/GST/TDS/Professional Tax/MLWF)

### lib/goals/lookups.ts
- **BASE_AREAS** (line 20): `Sales`, `Collection`, `Marketing`, `Finances`, `App Devp`, `BSS App`, `PS`, `BSS`, `Altus Conclave`, `Handholding`, `Systems`, `Operations`, `Health`, `Learning`, `Self Devp`, `Training`, `Finance`, `Accounts`, `Admin`, `Renovation`, `Strategy`, `Family`
- **BASE_MEASURES** (line 46): `Rs.`, `Seats`, `Nos.`, `Yes/No`, `NA`
- **BASE_TYPES** (line 49): `Goal`, `Target`, `Milestone`, `Operational`
- **BASE_GOALTYPES** (line 53): KPI/Strategic/Operational/Essential labels
- **GoalLookupKind** (line 16): `area`, `measure`, `type`, `goaltype`
- Merged with admin-added `goal_lookups` rows via `listGoalLookups()`.

### lib/goals/types.ts
- **GoalPeriod** (line 14): `year`, `quarter`, `month`, `week`, `day`
- **FY_MONTH_ORDER** (line 30): `3,4,5,6,7,8,9,10,11,0,1,2`

### lib/employees/master-filters.ts
- **MASTER_STATUS_VALUES** (line 18): `active`, `probation`, `inactive`, `offboarded`
- **EMPLOYEE_STATUS_TABS** (line 43): `all`, `current`, `probation`, `past` (labels: All/Current/Probation/Past)
- **EMPLOYEE_STATUS_LABELS** (line 46)

### lib/attendance/worker-type.ts
- **EMPLOYEE_TYPE_OPTIONS** (line 31): `full_time`, `first_half`, `second_half`, `hybrid` (excludes `project_remote`)
- **WORKER_TYPE_LABELS** (line 17)
- **LEGACY_WORKER_TYPES** (line 135): `afternoon_shift`→`second_half`, `part_time`→`hybrid`

### lib/events.ts
- **TASK_EVENT_TYPES** (line 16): `created`, `field_updated`, `status_changed`, `reassigned`, `transferred_external`, `priority_changed`, `due_changed`, `archived`, `restored`, `commented`
- **EDITABLE_TASK_FIELDS** (line 37): `title`, `description`, `subject`, `priority`, `dueAt`, `notes`, `tags`, `startsAt`, `endsAt`, `allDay`, `recurrence`, `recurrenceRule`, `projectNodeId`

### lib/task-filters.ts
- **ACTIVITY_TYPES** (line 20): `goals`, `tasks`, `commitments`

### lib/notifications/resolve-channels.ts + lib/profile/notification-prefs.ts
- **NOTIFICATION_CHANNELS** (resolve-channels.ts:5; notification-prefs.ts:47): `email`, `slack`, `whatsapp`, `push`
- **NOTIFICATION_KINDS** (notification-prefs.ts:13): `task_assigned`, `task_initiated`, `status_changed`, `approved`, `declined`, `reassigned`, `transferred`, `cancelled`, `commented`, `broadcast`, `incentive_created`, `incentive_updated`, `incentive_eligibility_removed`, `incentive_deleted`, `incentive_request_approved`, `incentive_request_published`, `incentive_request_not_approved`, `incentive_request_revision`, `incentive_request_due`, `incentive_request_not_due`, `incentive_request_reversed`, `incentive_request_resubmitted`, `incentive_paid`
- **DB column(s):** `notification_channels` table (`channel` text, line 1989 `$type<"email"|"slack"|"whatsapp"|"web_push">`); `notifications.kind` (line 1898 `$type<NotificationKind>`)

### lib/dashboard/manager-activity-contract.ts
- **ACTIVITY_PERIODS** (line 150, id→label): `3d`→"Last 3 Days", `7d`→"Last 7 Days", `month`→"This Month", `last_month`→"Last Month", `year`→"This Year", `custom`→"Custom Range..."
- **ACTIVITY_PERIOD_IDS** (line 166); DEFAULT_ACTIVITY_PERIOD = `7d`

### lib/daily-goals/score.ts
- **DASH_PERIODS** (line 130): `day`, `week`, `mtd`, `custom` (labels: Daily/This Week/Month to Date/Custom Range)
- **THRESHOLD_CHOICES** (line 257): `90`, `80`, `75`, `70`, `60`

### lib/forms/field-types.ts
- **FormFieldType** (line 13): `text`, `textarea`, `select`, `buttons`, `product`, `date`, `number`, `email`, `tel`, `url`
- **OPTION_FIELD_TYPES** (line 26): `select`, `buttons`
- **FIELD_TYPE_LABELS** (line 76)

### lib/kanban-columns.ts (backend-computed board columns)
- **ARCHIVE_COL** (line 4): `__archived__` (synthetic, not a TaskStatus)
- **DEFAULT_ADMIN_COLUMN_ORDER** (line 36): `dont_know`, `not_started`, `initiated`, `follow_up`, `need_info`, `done`, `not_approved`, `approved`, `__archived__`, `on_hold`
- **USER_COLUMN_ORDER** (line 59): `...USER_TASK_STATUSES` + `not_approved`, `approved`, `__archived__`

### lib/format.ts (status label/tone fallback maps)
- **STATUS_LABELS_FALLBACK** (line 111): `dont_know`→"Not Read", `not_started`→"Not Started", `initiated`→"Initiated", `follow_up`→"Follow Up", `need_help`→"Need Help", `on_hold`→"On Hold", `need_info`→"Need Info", `follow_up_1`→"Follow Up 1", `follow_up_2`→"Follow Up 2", `follow_up_3`→"Follow Up 3", `done`→"Done", `approved`→"Approved", `not_approved`→"Not Approved", `cancelled`→"Cancelled", `transferred`→"Transferred"
- **STATUS_TONES_FALLBACK** (line 133): maps each TaskStatus to a STATUS_COLOR_TOKENS token

### lib/types.ts (backend types)
- **ViewMode** (line 4): `doer`, `initiator`
- **EisenhowerPriority** (line 6): `imp_urgent`, `imp_not_urgent`, `not_imp_urgent`, `not_imp_not_urgent`
- **assigneeMode** (line 32): `default`, `all`, `specific`
- **StatusCellBucket** (line 102): 16 derived status-count keys

---

## 9. Backend-computed filter option lists (distinct values served to dropdowns)

- `lib/queries/subjects.ts` → `listActiveSubjectNames()` (line 41): active `subjects.name` rows, with `applySubjectPolicy` (retire WMS/WMS App, pin "Altus Ecosystem") — feeds New/Edit Task subject dropdown + bulk template.
- `lib/goals/lookups.ts` → `listGoalLookups()` (line 89): BASE_AREAS/MEASURES/TYPES/GOALTYPES merged with active `goal_lookups` rows — feeds the goal composer Area/Measure/Type dropdowns.
- `lib/queries/accounts-ca.ts` re-exports `CA_PORTAL_TYPES`/`CA_PORTAL_LABELS`.
- No `.distinct()`/`distinctOn`/`SELECT DISTINCT` in `lib/queries` or `app/api` (the one `DISTINCT` mention is a comment in `lib/queries/tasks.ts:859` about `SELECT DISTINCT subject` being avoided in favor of the `subjects` table).

---

## 10. BACKEND ENUM INVENTORY (final list)

**Every `as const` array (canonical + derived option sets):**

db/enums.ts: `TASK_STATUSES`, `USER_TASK_STATUSES`, `DOER_TASK_STATUSES`, `PENDING_STATUSES`, `DEPRECATED_TASK_STATUSES`, `APPROVAL_STATUSES`, `TASK_RECURRENCES`, `TASK_SUBJECTS`, `EMPLOYEE_ROLES`, `ACCOUNT_TYPES`, `EMPLOYMENT_STATUSES`, `EXIT_REASONS`, `REHIRE_ELIGIBILITIES`, `WORKER_TYPES`, `PAY_BASES`, `GRADING_MODES`, `WORK_SESSION_SOURCES`, `WORK_SESSION_STATUSES`, `BROADCAST_PRIORITIES`, `BROADCAST_CATEGORIES`, `BROADCAST_STATUSES`, `BROADCAST_ACK_MODES`, `BROADCAST_AUTHOR_IDENTITIES`, `BROADCAST_RECIPIENT_STATUSES`, `BROADCAST_RECURRENCES`, `TASK_PRIORITIES`, `DEPARTMENTS`, `AGE_BUCKETS`, `ATTENDANCE_KINDS`, `ATTENDANCE_CODES`, `LEAVE_KINDS`, `LEAVE_STATUS`, `COMP_OFF_STATUS`, `PUNCH_SOURCES`, `PUNCH_REASONS`, `REMOTE_WORK_MODES`, `REMOTE_WORK_STATUSES`, `REMOTE_REASON_BUCKETS`, `RECURRENCE_MODES`, `OFFICE_PHONE_AVAILABILITY`, `INCENTIVE_TYPES`, `INCENTIVE_DURATIONS`, `INCENTIVE_STATUSES`, `OUTSTANDING_STATUSES`, `STATUS_COLOR_TOKENS`, `OUTSTANDING_CYCLES`, `SUBSCRIPTION_FREQUENCIES`, `GST_RATES`, `GST_FORM_RATES`, `OUTSTANDING_CONTRACT_STATUS`, `INSTALLMENT_STATES`, `OUTSTANDING_OVERDUE_BUCKETS`, `SEED_RESPONSIBLES`, `SEED_ENTITIES`, `SEED_PRODUCTS`, `SEED_PAYMENT_MODES`, `EVENT_STATUSES`, `EVENT_SOURCES`, `RELIGIONS`, `HOLIDAY_APPLIES_TO`, `GOAL_PERIODS`, `GOAL_SOURCES`, `GOAL_TYPES`, `NON_KPI_GOAL_TYPES`, `AGREEMENT_TYPES`, `AGREEMENT_STATUSES`, `HR_TICKET_STATUSES`, `HR_TICKET_OPEN_STATUSES`, `HR_TICKET_PRIORITIES`, `HR_TICKET_CATEGORIES`, `HR_TICKET_SOURCES`, `APPRAISAL_DIMENSIONS`, `APPRAISAL_MANAGER_ONLY_DIMENSIONS`, `APPRAISAL_AUTO_DIMENSIONS`, `APPRAISAL_CYCLE_STATUSES`, `APPRAISAL_ITEM_STATUSES`, `APPRAISAL_SCORE_STAGES`, `KPI_FREQUENCIES`, `KPI_ASSIGNMENT_STATUSES`, `KPI_CHANGE_TYPES`, `APPROVAL_LEVELS`, `ALLOCATION_CATEGORIES`, `INTERN_SECTIONS`, `HH_CALL_TYPES`, `HH_DAYS`, `HH_PERSON_KINDS`, `HH_EMPLOYEE_NAMES`, `HH_INTERN_NAMES`, `HH_PARTICIPANT_MODULES`, `HH_PARTICIPANT_CALLS`, `HH_ACCESS_ROLES`, `HH_ACCESS_MODULES`, `HH_ACCESS_ACTIONS`, `HH_ACCESS_SECTIONS`, `DEVICE_KINDS`, `ATTENDANCE_AUDIT_ACTIONS`

Other lib: `STAGES` (lib/ambassadors/stages.ts), `FEEDBACK_TYPES` (lib/training/feedback-templates.ts), `DOC_KINDS` + `SIGNATURE_STATUSES` (lib/documents/signing.ts), `CTC_REASONS` (lib/hr/ctc/model.ts), `DCC_STATUSES` + `WEEKDAY_LABELS` (lib/dcc/util.ts), `CC_YESNO` + `CC_TALLY` + `CC_BALANCE` (lib/accounts/cc.ts), `MONTHLY_FREQUENCIES` + `FY_MONTHS` (lib/accounts/monthly.ts), `WEEKLY_CHECK_STATUSES` + `MONTH_LABELS` + `MONTH_SHORT` (lib/accounts/weekly.ts), `CA_PORTAL_TYPES` (lib/accounts/ca-constants.ts), `BASE_AREAS` + `BASE_MEASURES` + `BASE_TYPES` (lib/goals/lookups.ts), `FY_MONTH_ORDER` (lib/goals/types.ts), `MASTER_STATUS_VALUES` + `EMPLOYEE_STATUS_TABS` (lib/employees/master-filters.ts), `EMPLOYEE_TYPE_OPTIONS` (lib/attendance/worker-type.ts), `TASK_EVENT_TYPES` + `EDITABLE_TASK_FIELDS` (lib/events.ts), `ACTIVITY_TYPES` (lib/task-filters.ts), `NOTIFICATION_CHANNELS` (lib/notifications/resolve-channels.ts, lib/profile/notification-prefs.ts), `NOTIFICATION_KINDS` (lib/profile/notification-prefs.ts), `ACTIVITY_PERIODS` (lib/dashboard/manager-activity-contract.ts), `DASH_PERIODS` + `THRESHOLD_CHOICES` (lib/daily-goals/score.ts), `RETIRED_SUBJECTS` + `PINNED_SUBJECTS` (lib/tasks/subject-options.ts), `RECURRENCE_CODES` + `YES_NO_LABELS` (lib/tasks/template-columns.ts), `GOAL_STATUS_CODES` + `VISIBILITY_LABELS` + `ASSIGNMENT_TYPE_LABELS` + `LEVEL_LABELS` + `QUARTER_LABELS` + `MONTH_LABELS` + `PRIORITY_LABELS_LIST` (lib/goals/template-columns.ts), `STATUSES` + `PRIORITIES` (scripts/seed-dummy.ts), `TABLES` (scripts/apply-0070-cash-to-igv.ts), `DEFAULT_ADMIN_COLUMN_ORDER` + `USER_COLUMN_ORDER` (lib/kanban-columns.ts, plain arrays not `as const` but option sets), `ARCHIVE_COL` (lib/kanban-columns.ts)

**pgEnums (5):** `task_status`, `employee_role`, `task_priority`, `approval_status`, `approval_level`

**zod `.enum` schemas (distinct option sets):**
`["in","out"]` (attendance kind — validators/attendance.ts, app/api/mobile/attendance/remote, app/(app)/attendance/actions), `PUNCH_REASONS`, `WORKER_TYPES`, `["active","paused","archived"]`, `["percent","flat"]`, `STAGES`, `["note","call","meeting","email","whatsapp"]`, `STATUS_COLOR_TOKENS`, `["doer","initiator","both"]`, `FEEDBACK_TYPES`, `OFFICE_PHONE_AVAILABILITY`, `LEAVE_KINDS`, `["approved","rejected"]`, `EXIT_REASONS`, `REHIRE_ELIGIBILITIES`, `OUTSTANDING_CYCLES`, `SUBSCRIPTION_FREQUENCIES`, `PG_LOOKUP_KINDS`, `["deduct","ex_gratia"]`, `TASK_PRIORITIES`, `TASK_RECURRENCES`, `APPROVAL_STATUSES`, `["approved","not_approved"]`, `TC_LOOKUP_KINDS`, `["video","pdf","xls"]`, `["mcq","fill_blank"]`, `["adhoc","onetime","routine"]`, `USER_TASK_STATUSES`, `TASK_STATUSES`, `["structured","rich"]`, `["read","acknowledge","poll"]`, `["send","delete"]`, `EVENT_STATUSES`, `["none","reassign","clear"]`, `["self","manager","management"]`, `HR_TICKET_CATEGORIES`, `HR_TICKET_PRIORITIES`, `["support","query"]`, `["reply","note","assign","status","priority","reopen"]`, `REMOTE_MODES` `["wfh","client_site","field","other"]`, `AGREEMENT_TYPES`, `INCENTIVE_TYPES`, `INCENTIVE_DURATIONS`, `NOTIFICATION_CHANNELS`, `NOTIFICATION_KINDS`, `["all","selected"]`, `CA_PORTAL_TYPES`, `["up","down"]`, `["emi","closingBalance"]`, `APPRAISAL_DIMENSIONS` (inline 9), `["manager","non-manager"]`, `REMOTE_WORK_MODES`, `REMOTE_REASON_BUCKETS`, `RECURRENCE_MODES`, `["day","week","month"]`, `["until","count","never"]`, `ACTIVITY_PERIOD_IDS`, `["original","revised"]`, `["onTime","late","all"]`, `["goals","tasks","commitments"]`, `["delegate","counterpart","gt"]`, `["approved","needs_rework",""]`, `["drawn","typed"]`, `["approved","rejected","pending"]`, `FIELD_TYPES`, `["director","hr"]`, `["none","acknowledge","esign"]`, `["doer","initiator"]` (view), `GST_FORM_RATES` (`.refine`)

**`as const`-typed `$type<>` text-column unions (schema.ts) not otherwise named above:** `"logo"|"signature"|"document"` (storage, line 214), `"available"|"focused"|"heads_down"|"away"` (line 429), `"off"|"daily"|"weekly"` (441), `"light"|"dark"|"system"` (445), `"cozy"|"compact"|"dense"` (446), `"task"|"project"|"document"` (640), `"pending"|"processing"|"done"|"failed"` (732), `"created"|"renamed"|"description_changed"|"file_replaced"|"deleted"` (1952), `"email"|"slack"|"whatsapp"|"web_push"` (1989), `"sent"|"skipped"|"failed"|"failed_terminal"` (1992), `"biometric"|"gps_only"|"none"` (2199), `"self"|"admin"` (2208), `"in"|"out"` (2589), `"approve"|"not_approve"|"due"|"not_due"|"reverse"|"publish"|"revise"|"legacy"` (2739), `"created"|"updated"|"deleted"` (2772), `"open"|"partial"|"paid"|"written_off"` (2838), `"paid"|"unpaid"` (3126), `"pending"|"approved"|"rejected"|"cancelled"` (3153), `"open"|"redeemed"` (3197), `"subscription"|"monthly_bill"|"full_payment"|"partial_payment"|"slabs"` (3311), `"active"|"closed"|"written_off"` (3328), `"contract"|"collection"` (3384), `"task"|"project"|"kpi"|"incentive"|"calendar"|"department"` (5100), `"depends_on"|"blocked_by"` (5163), `"ai"|"heuristic"` (5206), `"pending"|"approved"|"rejected"` (5414), `"salary_breakup"|"attendance_backfill"|"attendance_sheet"|"paid_leave"` (6331), `"cron"|"admin"|"script"` (6333), `"running"|"ok"|"error"` (6338), `"drawn"|"typed"` (6890), `"granted"|"started"|"expired"|"revoked"|"denied_after_expiry"|"denied"` (8490), `"all"|"selected"` (TaskReminderScope, 8066/8090), `TaskReminderStatusToken[]` (8095), `"not_approved"|"approved"|"on_hold"|"cancelled"` (project_nodes.approval_status, 1245), DOER 6-status union (project_nodes.status, 1241)

---
END OF AUDIT

### 3.8 — Android (Kotlin / Compose)

# Android Dropdown / Select / Picker Audit — Slice 8

App: `android-app` (Kotlin / Jetpack Compose), package root `com.altuscorp.altus`.
Scope: all `*.kt` under `app/src/main/java/com/altuscorp/altus` (build/ excluded).

Component legend: this codebase has exactly ONE Material `DropdownMenu` (ModuleForm product). There are NO `ExposedDropdownMenuBox`/`ExposedDropdownMenu` usages anywhere (the earlier hint that ModuleFormScreen uses ExposedDropdownMenu is inaccurate — it uses plain `DropdownMenu`). Every other "picker" is a chip row, a segmented control, a bottom-sheet option list, or a tri-state toggle, built on the shared `AltusChip` / `AltusBottomSheet` / `CommitControl` design-system pieces.

---

### Product (Module Form field)
- **Module/Screen:** Sales (moduleform) — `ui/feature/moduleform/ModuleFormScreen.kt`
- **Field/Key:** form field whose DTO `type == "product"`; value stored in `ModuleFormUiState.values[field.key]`
- **Source:** API — `GET /api/mobile/module/{key}` → `ModuleFormDto.productOptions` (List<String>), plus a hardcoded "None" clear row
- **Component:** DropdownMenu (custom sunken row + `DropdownMenu`/`DropdownMenuItem`)
- **Type:** Single
- **Required:** UNKNOWN — depends on `ModuleFieldDto.required` (server-driven); product field rendered with `" *"` suffix when required
- **Default:** empty (placeholder text "Select…")
- **Searchable:** No
- **Static/Dynamic:** Dynamic (options from API per module)
- **Options:** `None` (hardcoded, clears selection) + every `productOptions` value verbatim from the API
- **Add/Edit/Delete behavior:** No add/edit/delete of options; on pick the value is written to the form map
- **Validation:** server re-validates on submit; client required-check = `field.required && value.isBlank()`
- **On-select behavior:** `onPick(value)` → `ModuleFormIntent.FieldChanged(key, value)`; menu closes
- **Backend/API/DB:** reads `GET /api/mobile/module/{key}`; writes `POST /api/mobile/module/{key}/submit` (field values map)
- **Special rules:** DTO declares field `type` can also be `"select"` and `"buttons"` and carries a per-field `options: List<String>`, but the screen ONLY special-cases `"product"` — every other type (including `select`/`buttons`) falls through to a plain text field. The `ModuleFieldDto.options` list is unused in the UI. `UNKNOWN — NEEDS REVIEW` whether select/buttons fields are expected to render as pickers.
- **Code locations:** `ui/feature/moduleform/ModuleFormScreen.kt:199` (ProductPicker), `:238` (DropdownMenu), `:239-248` (DropdownMenuItem None + options), `:173` (type dispatch); `ui/feature/moduleform/ModuleFormViewModel.kt:40,146` (productOptions); `data/remote/dto/ModuleFormDto.kt:18,26,30`; `data/repository/ModuleFormRepository.kt:29-33`

---

### Doer (New Task)
- **Module/Screen:** Tasks (newtask) — `ui/feature/newtask/NewTaskScreen.kt` + `NewTaskSheets.kt`
- **Field/Key:** `NewTaskUiState.doer: EmployeeOption?`
- **Source:** API — `GET /api/mobile/task-form` → `TaskFormDto.employees` (id + name)
- **Component:** BottomSheet list (`OptionPickerSheet`)
- **Type:** Single
- **Required:** Yes (submit guard "Pick who will do this.")
- **Default:** none (empty; sheet opens on Enter from title when unset)
- **Searchable:** Yes — "Search people" field shown only when `rows.size > 8`
- **Static/Dynamic:** Dynamic (roster from API)
- **Options:** every employee `name` (value = employee `id`)
- **Add/Edit/Delete behavior:** No CRUD; pick-only
- **Validation:** `doerError = "Pick who will do this."` on submit when null
- **On-select behavior:** `DoerPicked(employee)`; sheet settles closed; haptic `commitTick`
- **Backend/API/DB:** reads `/api/mobile/task-form`; writes `POST /tasks` (doerId) via `NewTaskDraft`
- **Special rules:** cache-first via `TaskRepository.formOptions()`; online-only create
- **Code locations:** `NewTaskScreen.kt:245-251,466-481`; `NewTaskSheets.kt:67-165` (OptionPickerSheet), `:142` rows; `NewTaskUiState.kt:22,34`; `data/remote/dto/TaskFormDto.kt:15`; `domain/model/Models.kt:431-445`

---

### Initiator (New Task)
- **Module/Screen:** Tasks (newtask) — `NewTaskScreen.kt` + `NewTaskSheets.kt`
- **Field/Key:** `NewTaskUiState.initiator: EmployeeOption?`
- **Source:** API — `/api/mobile/task-form` → `TaskFormDto.employees`
- **Component:** BottomSheet list (`OptionPickerSheet`)
- **Type:** Single
- **Required:** No (defaults to signed-in user `options.me`)
- **Default:** `options.me` (seeded the moment options land)
- **Searchable:** Yes — "Search people" when `rows.size > 8`
- **Static/Dynamic:** Dynamic
- **Options:** every employee `name` (value = employee `id`)
- **Add/Edit/Delete behavior:** No CRUD
- **Validation:** none
- **On-select behavior:** `InitiatorPicked(employee)`; sheet closes
- **Backend/API/DB:** reads `/api/mobile/task-form`; writes `POST /tasks` (initiatorId, optional)
- **Special rules:** placeholder "Defaults to you"
- **Code locations:** `NewTaskScreen.kt:275-280,483-498`; `NewTaskSheets.kt:67-165`; `NewTaskViewModel.kt:92`

---

### Subject (New Task)
- **Module/Screen:** Tasks (newtask) — `NewTaskScreen.kt` + `NewTaskSheets.kt`
- **Field/Key:** `NewTaskUiState.subject: String?`
- **Source:** API — `/api/mobile/task-form` → `TaskFormDto.subjects` (List<String>)
- **Component:** BottomSheet list (`OptionPickerSheet`)
- **Type:** Single
- **Required:** No (placeholder "Optional")
- **Default:** null ("No subject" clear row selected)
- **Searchable:** Yes — "Search subjects" when `rows.size > 8`
- **Static/Dynamic:** Dynamic
- **Options:** `No subject` (hardcoded clear row, `clearLabel`) + every subject string verbatim
- **Add/Edit/Delete behavior:** No CRUD
- **Validation:** none
- **On-select behavior:** `SubjectPicked(subject)`; clear row sends `SubjectPicked(null)`
- **Backend/API/DB:** reads `/api/mobile/task-form`; writes `POST /tasks` (subject, optional)
- **Special rules:** `TaskFormDto.clients` is also returned by the API but is NOT surfaced in any picker in this screen
- **Code locations:** `NewTaskScreen.kt:268-273,500-514`; `NewTaskSheets.kt:67-165`; `data/remote/dto/TaskFormDto.kt:16-17`

---

### Due date (New Task)
- **Module/Screen:** Tasks (newtask) — `NewTaskScreen.kt` + `NewTaskSheets.kt`
- **Field/Key:** `NewTaskUiState.dueDate: LocalDate?`
- **Source:** other (locally generated: `LocalDate.now()` + next 30 days)
- **Component:** BottomSheet list (`DueDateSheet` — 56dp tappable rows, not the generic OptionPickerSheet)
- **Type:** Single
- **Required:** Yes (submit guard "Pick a due date.")
- **Default:** none
- **Searchable:** No
- **Static/Dynamic:** Dynamic (30-day window recomputed per open)
- **Options:** `Today`, `Tomorrow`, then `DateFormat.dayHeader` short dates (e.g. "Mon, 6 Jul") for days 2..29; right-side mono key is the ISO day key
- **Add/Edit/Delete behavior:** No CRUD
- **Validation:** `dueError = "Pick a due date."` on submit when null
- **On-select behavior:** `DuePicked(date)`; sheet closes; due = end-of-day in device zone on submit
- **Backend/API/DB:** writes `POST /tasks` (dueAt = `LocalTime(23,59)` zoned instant)
- **Special rules:** window constant `DUE_WINDOW_DAYS = 30L`
- **Code locations:** `NewTaskScreen.kt:260-266,516-520`; `NewTaskSheets.kt:173-260,263-267`; `NewTaskViewModel.kt:171-174`

---

### Priority (New Task)
- **Module/Screen:** Tasks (newtask) — `NewTaskScreen.kt`
- **Field/Key:** `NewTaskUiState.priority: PriorityOption?`
- **Source:** API — `/api/mobile/task-form` → `TaskFormDto.priorities` (`value` + `label`)
- **Component:** FilterChip row (`AltusChip`, horizontally scrollable)
- **Type:** Single
- **Required:** Yes (submit guard "Pick a priority.")
- **Default:** first option whose `value` equals `"normal"` (case-insensitive), else `"medium"`, else first option
- **Searchable:** No
- **Static/Dynamic:** Dynamic (priority options from API)
- **Options:** each priority's `label` (value = its `value`, e.g. "high")
- **Add/Edit/Delete behavior:** No CRUD
- **Validation:** `priorityError = "Pick a priority."` on submit when null
- **On-select behavior:** `PriorityPicked(priority)`; haptic `commitTick`
- **Backend/API/DB:** reads `/api/mobile/task-form`; writes `POST /tasks` (priority = `priority.value`)
- **Special rules:** chip `selected = priority.value == selected?.value`
- **Code locations:** `NewTaskScreen.kt:253-258,411-453`; `NewTaskUiState.kt:37`; `data/remote/dto/TaskFormDto.kt:18,28-33`; `NewTaskViewModel.kt:212-215`

---

### Task filter (Task List)
- **Module/Screen:** Tasks (tasklist) — `ui/feature/tasklist/TaskListScreen.kt`
- **Field/Key:** `TaskListUiState.filter: TaskFilter`
- **Source:** enum class (`TaskFilter`) — hardcoded labels
- **Component:** FilterChip row (`AltusChip` + mono count)
- **Type:** Single
- **Required:** n/a (always has a value)
- **Default:** `All` (or resolved from nav route filter arg)
- **Searchable:** No
- **Static/Dynamic:** Static (4 fixed options)
- **Options:** `All`, `Pending`, `Overdue`, `Done` (exact labels; counts shown alongside)
- **Add/Edit/Delete behavior:** No CRUD
- **Validation:** none
- **On-select behavior:** `TaskListIntent.FilterSelected(filter)`; haptic `commitTick` when changed
- **Backend/API/DB:** read-only view filter over cached tasks board (no API write)
- **Special rules:** route deep-link arg maps to a chip via `TaskFilter.fromRoute`
- **Code locations:** `TaskListScreen.kt:119,289-316`; `TaskListUiState.kt:22-38`

---

### Appearance / Theme (Profile)
- **Module/Screen:** You (profile) — `ui/feature/profile/ProfileScreen.kt`
- **Field/Key:** `ProfileUiState.themeMode: ThemeMode` → persisted to DataStore key `theme_mode`
- **Source:** enum class (`ThemeMode`) + hardcoded `THEME_ORDER` list
- **Component:** Segmented control (`ThemeSegmented` on a sunken bed)
- **Type:** Single
- **Required:** n/a (always set)
- **Default:** `System` (`ThemeMode.SYSTEM`)
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** `Light`, `Dark`, `System` (exact labels, order Light→Dark→System)
- **Add/Edit/Delete behavior:** No CRUD
- **Validation:** none
- **On-select behavior:** `ProfileIntent.SelectTheme(mode)`; haptic `commitTick` when changed; persists via `AltusPreferences.setThemeMode`
- **Backend/API/DB:** local DataStore prefs (`theme_mode` string) — device-local, survives sign-out
- **Special rules:** theme is a device preference, not account data
- **Code locations:** `ProfileScreen.kt:464-470,608-631,902-908`; `data/prefs/AltusPreferences.kt:21,56-66`

---

### WMS page selector (WMS Shell)
- **Module/Screen:** WMS workspace (wms) — `ui/feature/wms/WmsShell.kt`
- **Field/Key:** `page: WmsPage` (local `rememberSaveable` state)
- **Source:** enum class (`WmsPage`) — hardcoded labels
- **Component:** pill bar (horizontally scrollable single-select pills, `role = Tab`)
- **Type:** Single
- **Required:** n/a
- **Default:** `Dashboard` (or `initialPage` passed in)
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** `Dashboard`, `My Day`, `Tasks`, `Kanban`, `Projects`, `Weekly Goals`, `Team`, `Daily Checklist` (plus a leading "Hub" back pill)
- **Add/Edit/Delete behavior:** No CRUD
- **Validation:** none
- **On-select behavior:** sets `page`; swaps the rendered child screen (state-preserving via back-stack-scoped ViewModels)
- **Backend/API/DB:** none directly (page content loads its own data)
- **Special rules:** mirrors web main-nav WMS pill group order
- **Code locations:** `WmsShell.kt:64-73,181-185,215-252`

---

### DCC day selector
- **Module/Screen:** Fill / Daily compliance (dccfill) — `ui/feature/dccfill/DccComponents.kt`
- **Field/Key:** `DccUiState` selected day → `DccIntent.SelectDay(dayKey)`
- **Source:** other (locally generated: today minus `WINDOW_DAYS-1 .. 0` days)
- **Component:** FilterChip-like LazyRow of day chips (custom `DccDateChip`, not `AltusChip`)
- **Type:** Single
- **Required:** n/a (always a selected day)
- **Default:** today
- **Searchable:** No
- **Static/Dynamic:** Dynamic (7-day window)
- **Options:** last 7 days; each chip shows weekday short name (e.g. `SAT`) + day number
- **Add/Edit/Delete behavior:** No CRUD
- **Validation:** none
- **On-select behavior:** `DccIntent.SelectDay(dayKey)` re-subscribes the DCC board to that day; past days are read-only (`editable = isToday`)
- **Backend/API/DB:** reads `GET /api/mobile/dcc?date=YYYY-MM-DD`
- **Special rules:** `WINDOW_DAYS = 7`
- **Code locations:** `DccComponents.kt:59-115`; `DccViewModel.kt:297-311`; `DccScreen.kt:252`; `DccUiState.kt:53-59`

---

### DCC KPI commit (Done / NA) — CommitControl
- **Module/Screen:** Fill / Daily compliance (dccfill) + design system — `ui/designsystem/CommitControl.kt`
- **Field/Key:** `DccKpiRowUi.commit: CommitValue?` → DCC entry status (`"Done"` / `"NA"` / null)
- **Source:** enum class (`CommitValue { Done, Na }`) — hardcoded; mapped from server `DccStatus`
- **Component:** tri-state segmented morph control (Idle "Fill" pill → Choosing "Done / NA / ✕" → Committed chip)
- **Type:** Single (tri-state with clear)
- **Required:** No (nullable)
- **Default:** null (unfilled → "Fill")
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** `Done`, `NA`, plus a ✕ cancel (exact labels)
- **Add/Edit/Delete behavior:** committed chip tap reopens to change/clear
- **Validation:** none client-side (server maps `Done`→Done, filled-not-done→`NA`)
- **On-select behavior:** optimistic commit `onCommit(CommitValue)`; haptic `EFFECT_TICK`; reverted on outbox rejection
- **Backend/API/DB:** writes `POST /dcc/entry` (outbox `MutationKind.DCC_ENTRY`)
- **Special rules:** value-type KPIs pass `onFillClick` to open the numeric sheet instead of the tri-state
- **Code locations:** `CommitControl.kt:69,72-138,173-215`; `DccComponents.kt:167-173`; `DccUiState.kt:165-179`

---

### DCC roster person toggle (Done / NA)
- **Module/Screen:** Fill / Daily compliance (dccfill) — `ui/feature/dccfill/DccComponents.kt`
- **Field/Key:** `DccParticipantSubjectUi.commit: CommitValue?` → `DccIntent.CommitParticipant(subjectId, status)`
- **Source:** hardcoded ("Done" / "NA"), value via `DccStatus`
- **Component:** toggle pills (two `TogglePill`s)
- **Type:** Single (tri-state: tapping active state clears)
- **Required:** No
- **Default:** null (unset)
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** `Done`, `NA`
- **Add/Edit/Delete behavior:** tap active pill again clears
- **Validation:** none
- **On-select behavior:** `CommitParticipant(itemId, subjectId, status)`; haptic `commitTick`
- **Backend/API/DB:** writes `POST /dcc/participants` (outbox `MutationKind.DCC_PARTICIPANTS`)
- **Special rules:** editing only when `editable` (today's board)
- **Code locations:** `DccComponents.kt:336-396`

---

### DCC roster bulk bar (All done / All NA / Clear)
- **Module/Screen:** Fill / Daily compliance (dccfill) — `ui/feature/dccfill/DccComponents.kt`
- **Field/Key:** `DccIntent.BulkParticipants(itemId, status)` (status = `DccStatus.DONE` / `DccStatus.NA` / null)
- **Source:** hardcoded ("All done", "All NA", "Clear")
- **Component:** bulk chips (`BulkChip` row)
- **Type:** Single (wave action, one of three)
- **Required:** No
- **Default:** n/a (action)
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** `All done`, `All NA`, `Clear`
- **Add/Edit/Delete behavior:** n/a (bulk apply / clear)
- **Validation:** none
- **On-select behavior:** `BulkParticipants(itemId, status)`; sets/clears every participant at once
- **Backend/API/DB:** writes `POST /dcc/participants` (outbox `MutationKind.DCC_PARTICIPANTS`)
- **Special rules:** only when `editable`
- **Code locations:** `DccComponents.kt:263-333`

---

### HR attendance month switcher
- **Module/Screen:** Employees (hr-record) — `ui/feature/hr-record/hr-recordScreen.kt`
- **Field/Key:** `HrRecordIntent.SelectMonth(month)` (local `selectedMonth: String?`)
- **Source:** API — `GET /api/mobile/hr-record` → `HrRecordDto.months` (`HrMonthDto.value` "YYYY-MM-01" + `label` "June 2026")
- **Component:** FilterChip row (`AltusChip` in a LazyRow)
- **Type:** Single
- **Required:** n/a
- **Default:** newest month (server `month` when no explicit pick)
- **Searchable:** No
- **Static/Dynamic:** Dynamic (months from API)
- **Options:** each month `label` (value = month bucket)
- **Add/Edit/Delete behavior:** No CRUD
- **Validation:** none
- **On-select behavior:** `SelectMonth` re-subscribes the record flow to that month
- **Backend/API/DB:** reads `/api/mobile/hr-record?month=YYYY-MM`
- **Special rules:** read-only screen
- **Code locations:** `hr-recordScreen.kt:184,322-340`; `hr-recordViewModel.kt:49-53,183-187,213-215`; `data/remote/dto/HrRecordDto.kt:27,36-42`

---

### Salary month selector
- **Module/Screen:** Employees (salary) — `ui/feature/salary/SalaryScreen.kt`
- **Field/Key:** `SalaryIntent.SelectMonth(month.key)`
- **Source:** API — `GET /api/mobile/salary` → `SalaryDto.months` (`SalaryMonthDto.month` + `monthLabel`)
- **Component:** FilterChip row (`AltusChip`)
- **Type:** Single
- **Required:** n/a
- **Default:** newest month
- **Searchable:** No
- **Static/Dynamic:** Dynamic (months from API)
- **Options:** each month `shortLabel` (value = month `key`)
- **Add/Edit/Delete behavior:** No CRUD
- **Validation:** none
- **On-select behavior:** `SelectMonth` swaps the displayed payslip month
- **Backend/API/DB:** reads `/api/mobile/salary`
- **Special rules:** read-only
- **Code locations:** `SalaryScreen.kt:169,275-296`; `data/remote/dto/SalaryDto.kt:17,23-26`

---

### Reimbursements shelf (Active / Archived)
- **Module/Screen:** Employees (reimbursements) — `ui/feature/reimbursements/ReimbursementsScreen.kt`
- **Field/Key:** `ReimbursementsUiState.view: String` (`VIEW_ACTIVE` / `VIEW_ARCHIVED`)
- **Source:** hardcoded constants
- **Component:** FilterChip row (`AltusChip`, `ShelfPills`)
- **Type:** Single
- **Required:** n/a
- **Default:** `active`
- **Searchable:** No
- **Static/Dynamic:** Static
- **Options:** `Active`, `Archived`
- **Add/Edit/Delete behavior:** No CRUD
- **Validation:** none
- **On-select behavior:** `ReimbursementsIntent.SelectView(view)`
- **Backend/API/DB:** read filter over `/api/mobile/reimbursements` claims
- **Special rules:** none
- **Code locations:** `ReimbursementsScreen.kt:108,147,221-240`; `ReimbursementsUiState.kt:29,39-40,83`

---

### People-Gives category filter
- **Module/Screen:** Sales (people-gives) — `ui/feature/people-gives/PeopleGivesScreen.kt`
- **Field/Key:** `PeopleGivesUiState.selectedCategory: String?`
- **Source:** API-derived (distinct `businessCategory` values from `/api/mobile/people-gives` introductions, case-sensitive, sorted)
- **Component:** FilterChip row (`AltusChip`, `CategoryChips`)
- **Type:** Single (tapping selected category again clears → All)
- **Required:** No
- **Default:** null (`All`)
- **Searchable:** No
- **Static/Dynamic:** Dynamic
- **Options:** `All` + each distinct `businessCategory` value
- **Add/Edit/Delete behavior:** No CRUD
- **Validation:** none
- **On-select behavior:** `CategorySelected(category)`; null = All
- **Backend/API/DB:** read filter over `/api/mobile/people-gives`
- **Special rules:** if selected category disappears from data, treated as "all"
- **Code locations:** `PeopleGivesScreen.kt:168,232-258`; `PeopleGivesViewModel.kt:94-101`

---

### Incentive year selector
- **Module/Screen:** Employees (incentive) — `ui/feature/incentive/IncentiveScreen.kt`
- **Field/Key:** `IncentiveIntent.SelectYear(year: Int)`
- **Source:** API — `GET /api/mobile/incentive` → `IncentiveDto.years` (List<Int>)
- **Component:** FilterChip row (`AltusChip`, `YearPills`)
- **Type:** Single
- **Required:** n/a
- **Default:** newest year (first in list)
- **Searchable:** No
- **Static/Dynamic:** Dynamic (years from API)
- **Options:** each year as `"2026"` style string (value = Int year)
- **Add/Edit/Delete behavior:** No CRUD
- **Validation:** none
- **On-select behavior:** `SelectYear` swaps the displayed incentive year
- **Backend/API/DB:** reads `/api/mobile/incentive`
- **Special rules:** read-only
- **Code locations:** `IncentiveScreen.kt:107,149,247-267`; `IncentiveViewModel.kt:162`; `data/remote/dto/IncentiveDto.kt:19`

---

### Training subject filter + Induction toggle
- **Module/Screen:** Training (training) — `ui/feature/training/TrainingScreen.kt`
- **Field/Key:** `TrainingUiState.subjectFilter: String?` + `TrainingUiState.inductionOnly: Boolean`
- **Source:** API-derived (distinct `subject` values from `/api/mobile/training` materials, sorted) + hardcoded "All"/"Induction"
- **Component:** FilterChip row (`AltusChip`, `FacetRow`)
- **Type:** Single (subject: All + one subject, tap-again clears) + separate boolean Induction toggle chip
- **Required:** No
- **Default:** subjectFilter null (`All`), inductionOnly false
- **Searchable:** No
- **Static/Dynamic:** Dynamic (subjects from API)
- **Options:** `All`, each distinct subject, `Induction`
- **Add/Edit/Delete behavior:** No CRUD
- **Validation:** none
- **On-select behavior:** `SelectSubject(subject|null)`; `ToggleInductionOnly`
- **Backend/API/DB:** read filter over `/api/mobile/training`
- **Special rules:** subjectFilter is single-select; Induction is an independent toggle combinable with a subject filter
- **Code locations:** `TrainingScreen.kt:214-215,246-286`; `TrainingViewModel.kt:114-116`; `data/remote/dto/TrainingDto.kt:45`

---

### Task status transition (Task Detail action rail)
- **Module/Screen:** Tasks (taskdetail) — `ui/feature/taskdetail/TaskDetailScreen.kt` + `components/ActionRail.kt`
- **Field/Key:** `TaskDetailIntent.CommitStatus(status, note)` where status ∈ `detail.allowedTransitions`
- **Source:** API — task's `allowedTransitions` (server-ranked permission matrix) + `statusDisplay` labels
- **Component:** action rail — primary filled button (`transitions[0]`) + horizontally scrollable ghost chips for the rest (`AltusGhostButton`), with an optional-note bottom sheet (`StatusChangeSheet`)
- **Type:** Single (one transition action per tap)
- **Required:** n/a (only rendered when `allowedTransitions` non-empty)
- **Default:** n/a (no persistent selection)
- **Searchable:** No
- **Static/Dynamic:** Dynamic (server owns the transition matrix)
- **Options:** each allowed transition's display label (from `statusDisplay`); primary = first
- **Add/Edit/Delete behavior:** No CRUD; optimistic status commit
- **Validation:** none client-side (409 optimistic-lock → shake + snackbar)
- **On-select behavior:** primary commits immediately (`note=null`); others open `StatusChangeSheet` (note + "Move to {label}" confirm)
- **Backend/API/DB:** writes `POST /tasks/{id}/status` (outbox `MutationKind.TASK_STATUS`, `expectedUpdatedAt` token)
- **Special rules:** no transitions → no rail
- **Code locations:** `ActionRail.kt:39-97`; `TaskDetailScreen.kt:240-250,298-312,617-664`; `domain/model/Models.kt:238`

---

### Week pager (Weekly Goals) — stepper, not list-based
- **Module/Screen:** WMS Weekly Goals (weeklygoals) — `ui/feature/weeklygoals/WeeklyGoalsScreen.kt`
- **Field/Key:** `WeeklyGoalsIntent.PrevWeek/NextWeek/ThisWeek`
- **Source:** other (week label + prev/next from API board)
- **Component:** prev/next pager (`WeekPager` — chevrons + center label, "Back to this week" / "THIS WEEK")
- **Type:** Single (stepper)
- **Required:** n/a
- **Default:** current week
- **Searchable:** No
- **Static/Dynamic:** Dynamic
- **Options:** n/a (no option list; only prev/next/this-week)
- **Code locations:** `WeeklyGoalsScreen.kt:167,205-268`

---

### Month pager (Att Report) — stepper, not list-based
- **Module/Screen:** Employees (attreport) — `ui/feature/attreport/AttReportScreen.kt`
- **Field/Key:** `AttReportIntent.PrevMonth/NextMonth`
- **Source:** other (month label from API)
- **Component:** prev/next IconButton stepper in the hero card
- **Type:** Single (stepper)
- **Required:** n/a
- **Default:** current/latest month
- **Searchable:** No
- **Static/Dynamic:** Dynamic
- **Options:** n/a (no option list)
- **Code locations:** `AttReportScreen.kt:128-142`

---

## Borderline controls (booleans / non-list — NOT counted as pickers)

- **Daily Checklist item done toggle** — `CheckToggle` (done/not-done checkbox) in `DailyChecklistScreen.kt:505-522`; field `ChecklistRow.done: Boolean`; writes `POST` toggle of the checklist item. Two states, not an option list.
- **Profile biometric unlock** — `Switch` boolean in `ProfileScreen.kt:481-493`; field `ProfileUiState.biometricEnabled`; persists to DataStore `biometric_unlock_enabled`.
- **ModuleForm `select` / `buttons` field types** — declared in `ModuleFormDto` but currently rendered as plain text fields (see Product entry above).

Navigation-only surfaces (NOT pickers — tap-through to routes): bottom nav `TopLevelDestination` (Hub/Tasks/Fill/You), Hub workspace cards `HubWorkspace`, Today module row `ModuleId`, WorkspaceScreen module list.

---

## ANDROID ENUM INVENTORY

Every `enum class` found in scope (file:line + exact values).

- `navigation/TopLevelDestination.kt:24` — `TopLevelDestination(graph,label,icon,showsTaskBadge)`: `HUB`, `TASKS`, `FILL`, `YOU` (labels "Hub","Tasks","Fill","You")
- `data/supabase/SupabaseRealtime.kt:38` — `AltusTable(tableName,rlsConfirmed)`: `TASKS("tasks",false)`, `ATTENDANCE("attendance_logs",false)`, `DCC_ENTRIES("dcc_entries",false)`
- `data/prefs/AltusPreferences.kt:21` — `ThemeMode { SYSTEM, LIGHT, DARK }`
- `core/util/EffectiveDue.kt:22` — `DuePhase { NONE, LATER, SOON, TODAY, OVERDUE }` (nested in `EffectiveDue`)
- `feature/punch/PunchUiState.kt:16` — `PunchPhase { Idle, Authenticating, Submitting, Success }`
- `feature/punch/PunchUiState.kt:58` — `BiometricGate { Checking, Ready, Exempt, NotEnrolled, NoHardware, TemporarilyUnavailable, Unsupported }`
- `core/firebase/BiometricAuthenticator.kt:18` — `BiometricAvailability { Available, NotEnrolled, NoHardware, TemporarilyUnavailable, Unsupported }`
- `core/network/ApiResult.kt:23` — `EnrollmentBlock { NotEnrolled, Deactivated }`
- `core/network/GateError.kt:17` — `GateKind(route)`: `NeedsPlan("altus://plan")`, `NeedsDcc("altus://dcc")`, `NeedsGoals("altus://goals-fill")`
- `feature/punch/components/StatusLedger.kt:273` — `Tone { Neutral, Good, Bad }` (nested)
- `ui/designsystem/AltusBottomSheet.kt:68` — `AltusSheetValue { Hidden, Peek, Half, Full }`
- `ui/feature/accounts/AccountsViewModel.kt:30` — `SectionStatus { Built, Live, Coming }`
- `data/local/entity/OutboxEntity.kt:23` — `MutationKind { DCC_ENTRY, DCC_PARTICIPANTS, TASK_STATUS, TASK_COMMENT }`
- `ui/designsystem/CommitControl.kt:69` — `CommitValue { Done, Na }`
- `ui/designsystem/CommitControl.kt:140` — `CommitFace { Idle, Choosing, Committed }` (private)
- `ui/designsystem/DayRingState.kt:19` — `DaySegmentKind(title)`: `Plan("Plan")`, `ClockIn("Clock in")`, `TasksDue("Tasks")`, `Dcc("DCC")`, `ClockOut("Clock out")`
- `ui/designsystem/DayRingState.kt:32` — `DaySegmentState { Pending, InProgress, Done, Blocked }`
- `ui/feature/hr-record/hr-recordViewModel.kt:45` — `HrTone { Present, Absent, HalfDay, WeeklyOff, Holiday, HolidayPresent, None }`
- `ui/feature/overtime/OvertimeUiState.kt:37` — `OvertimeAccent { Employees, Success, Warn, Neutral }`
- `ui/feature/outstanding/OutstandingUiState.kt:49` — `OutstandingAccent { Sales, Success, Danger, Warn, Neutral }`
- `feature/punch/components/HoldToPunchControl.kt:237` — `ControlFace { Hold, Verifying, Recording, Stamped }` (private)
- `ui/feature/performance/PerformanceViewModel.kt:36` — `ScoreBand { Strong, OnTrack, NeedsFocus }`
- `ui/feature/performance/PerformanceViewModel.kt:113` — `SignalKind { Recognition, Promotion }`
- `ui/feature/hub/HubScreen.kt:247` — `HubWorkspace(slug,label,tagline)`: `Wms("wms","WMS",…)`, `Admin("admin","Admin",…)`, `Employees("employees","Employees",…)`, `Sales("sales","Sales",…)`, `Marketing("marketing","Marketing",…)`, `Training("training","Training",…)`, `Accounts("accounts","Accounts",…)`
- `ui/feature/attendancehistory/AttendanceHistoryViewModel.kt:37` — `PunchPresence { Complete, Open, MissingOut, Absent }`
- `ui/feature/login/LoginUiState.kt:15` — `LoginMode { Resuming, Biometric, Password }`
- `ui/feature/inbox/InboxUiState.kt:25` — `InboxCategory { Task, Dcc, Goals, Attendance, Digest, General }`
- `ui/feature/ambassadors/AmbassadorsUiState.kt:43` — `AmbAccent { Sales, Success, Warn, Neutral }`
- `ui/feature/people-gives/PeopleGivesScreen.kt:381` — `MetaTone { Sales, Neutral, Success }` (private)
- `ui/feature/wms/WmsShell.kt:64` — `WmsPage(label)`: `Dashboard("Dashboard")`, `MyDay("My Day")`, `Tasks("Tasks")`, `Kanban("Kanban")`, `Projects("Projects")`, `WeeklyGoals("Weekly Goals")`, `Team("Team")`, `DailyChecklist("Daily Checklist")`
- `ui/feature/newtask/NewTaskUiState.kt:22` — `NewTaskSheet { Doer, Initiator, Due, Subject }`
- `ui/feature/salary/SalaryViewModel.kt:40` — `SalaryLineKind { Component, Deduction, Net }`
- `ui/feature/reimbursements/ReimbursementsUiState.kt:45` — `ReimbursementAccent { Employees, Success, Warn, Neutral }`
- `ui/feature/incentive/IncentiveUiState.kt:40` — `IncentiveAccent { Employees, Success, Danger, Warn, Neutral }`
- `ui/feature/signals/SignalsUiState.kt:45` — `SignalsAccent { Employees, Success, Warn, Neutral }`
- `ui/feature/review360/Review360ViewModel.kt:34` — `GoalStatusKind { Active, Done, Dropped }`
- `ui/feature/today/TodayComponents.kt:295` — `PressureTone { Neutral, Danger }` (private)
- `ui/feature/training/TrainingUiState.kt:53` — `TrainingAccent { Training, Success, Neutral }`
- `ui/feature/training/TrainingUiState.kt:70` — `TrainingGlyph { Video, Pdf, Xls, Doc }`
- `ui/feature/tasklist/TaskCard.kt:56` — `SwipeAnchor { Resting, Armed }` (private)
- `ui/feature/tasklist/TaskListUiState.kt:22` — `TaskFilter(label)`: `All("All")`, `Pending("Pending")`, `Overdue("Overdue")`, `Done("Done")`
- `ui/feature/today/TodayUiState.kt:20` — `PunchKind { ClockIn, ClockOut, Done }`
- `ui/feature/today/TodayUiState.kt:59` — `ModuleId { Attendance, Tasks, Dcc, Goals, Inbox, More }`
- `ui/feature/team/teamViewModel.kt:35` — `TeamMemberStatus { NeedsHelp, Blocked, Working, ClockedOut, NoPlan, NotInYet }`

---

## 4. Duplicate / Shared Dropdowns

Concepts that appear in multiple screens with different implementations or option sets. NOT merged — recorded as-is.

### 4.1 Task status ("Status")
Same underlying column `tasks.status` (pgEnum `task_status`), but FIVE different option sets surface depending on role/context:
- `DOER_TASK_STATUSES` (6): dont_know, not_started, initiated, follow_up, need_info, done — the primary doer status chip + bulk "Doer Status". **`on_hold` deliberately absent.**
- `USER_TASK_STATUSES` (7): + on_hold — kanban columns, filter dropdowns, My Day inline select, importers.
- `ADMIN_TASK_STATUSES` (9): + approved, not_approved (minus deprecated) — admin pickers.
- Goals status uses the same enum but **different labels** (`goal-table-view.tsx:378`): "Not assessed" vs "Not Read", "In progress" vs "Initiated", "Follow-up" vs "Follow Up".
- `approval_status` column (separate): approved/not_approved/cancelled/transferred — admin verdict.
- Plus an Accounts "Task List" status (`accounts_lookups` kind `task_status`) and DCC status (`Done/Not done/NA/Pending`) — unrelated option sets sharing the word "status".
- **Risk:** merging these would silently change doer vs manager semantics. Labels are admin-overridable via `status_settings` (`STATUS_LABELS_FALLBACK`).

### 4.2 Employee / Person picker (roster selector)
The single most-repeated dropdown, implemented at least 6 different ways against the same `employees` roster:
- native `<select>` (many forms), `Select` (cmdk), `LookupSelect` (searchable), `MultiSelect`, `DoerMultiSelect` (custom), `MemberPicker`, `EmployeePicker`, `EmployeeCombobox`, `PersonPicker`, `SkillMultiSelect`.
- Same concept ("pick a person") with different labels (Employee / Doer / Initiator / Assignee / Person / Candidate / Owner / Handler / Delegate / Responsible), different search behavior, different add/delete affordances.
- **Risk:** a future centralization must preserve per-screen add/delete (candidate delete in Evaluation v2 is super-admin gated; accounts `ValueSelect` inline-add writes `accounts_lookups`).

### 4.3 Priority
Three unrelated priority scales share the name:
- `TASK_PRIORITIES` (Eisenhower → Critical/Important/Urgent/Normal) — tasks, weekly goals, bulk, filters, import.
- `HR_TICKET_PRIORITIES` (Low/Normal/High/Urgent) — support tickets.
- `BROADCAST_PRIORITIES` (normal/important/high/critical/emergency) — ECOS broadcasts.

### 4.4 Function / Department
- `DEPARTMENTS` enum (11 values, `db/enums.ts:342`) — task filters, some forms.
- `departments` admin master table — candidate intake, letter templates, agreements.
- JD `FUNCTION_LABELS` (`lib/org/functions.ts`) — 8 different functions (Sales/Marketing/Operations/Handholding/HR/Admin/Accounts/Apps).
- Letter "Department" dropdown uses the admin master.
- **Risk:** `employees.department` is a legacy text mirror of the enum, while `departments` is a table — two sources of truth.

### 4.5 Entity / Paying entity
- HR CTC / Letters / Policies use `ENTITY_LIST` (5 hardcoded: Altus Corp, Unleashed, The Gainmakers (MJV HUF), Legacy Creators (JSV HUF), The Perfect Blend (Khushboo Shah)).
- Agreements use `SEED_ENTITIES` (10: Altus Corp, Unleashed, IJV, Khushboo, MJV HUF, JSV HUF, Dharav Enterprises, Colour Graphics, Smita Raut, Sunil Raut) + distinct roster entities.
- Outstanding uses `outstanding_entities` table.
- Accounts uses `accounts_lookups` (kind `bank_entity`/`it_entity`/`cash_entity`/`cc_entity`/`fno_entity`/`shares_entity`/`sip_entity`/`loan_entity`).
- **Risk:** four different entity lists; "IJV" was renamed from "IGV" (migration 0217) and historical rows follow the UUID, not the string.

### 4.6 Product
- `SEED_PRODUCTS` (12) — outstanding seed; `products` table — admin master + dynamic form "product"; `ALLOCATION_CATEGORIES` (PS/BSS/Retainer/Eco System); goal `BASE_AREAS` (22) — a different taxonomy entirely.

### 4.7 Payment mode
- `SEED_PAYMENT_MODES` (26, incl. legacy "Kotak - X"/"Gpay - X" spellings kept alongside new) vs `outstanding_payment_modes` admin master.

### 4.8 Frequency / Recurrence / Repeat
At least 7 different option sets:
- Task recurrence `TASK_RECURRENCES` (none/daily/weekly/monthly/yearly) + custom RRULE units (DAILY/WEEKLY/MONTHLY/YEARLY).
- Remote-work `RECURRENCE_MODES` (none/daily/weekdays/weekly/custom) + repeat-unit/monthly-style/day-of-month/ordinal/weekday sub-pickers.
- Broadcast `BROADCAST_RECURRENCES` (none/daily/weekly/monthly).
- KPI `KPI_FREQUENCIES` (weekly/monthly/quarterly/annual).
- Outstanding `SUBSCRIPTION_FREQUENCIES` (10/15/30 days/weekly).
- JD `FREQUENCY_OPTIONS` (daily/mon/mwf/tue-sat/sat/d15/d30/sat2/mon1/custom).
- Accounts `MONTHLY_FREQUENCIES` (Monthly/Quarterly/Annual).

### 4.9 Month / Year selectors
~15 near-identical month/year pickers (Attendance dashboard + 4 insights × month+year, HR Record month, salary/payroll/my-salary month, HR holidays year/month, DCC, portal year). Same `MONTH_LABELS` concept, separate components/files.

### 4.10 Leave type vs Leave kind
`LEAVE_KINDS` (paid/unpaid) is the enum; the Apply-Leave UI derives eligibility per worker type and collapses to a static line when only one is eligible — different behavior from the legacy Request-Leave button pair.

### 4.11 Yes/No/NA
Repeated inline across accounts (CC/due-dates `CC_YESNO` = Yes/No/NA; ECS = Yes/No/Don't Know; `CC_TALLY` = Done/Pending/NA; `CC_BALANCE` = Tallied/Pending/NA) and leave availability (`OFFICE_PHONE_AVAILABILITY` yes/no/na) — several distinct small sets.

### 4.12 Worker / Employee type
`WORKER_TYPES` (full_time/first_half/second_half/hybrid/project_remote) vs `EMPLOYEE_TYPE_OPTIONS` (excludes project_remote) vs legacy renames (`afternoon_shift`→second_half, `part_time`→hybrid).

---

## 5. Hardcoded Dropdowns

Dropdowns whose options are literal inline arrays (not a named enum/constant and not DB-backed). Representative list with exact code locations:

- Tasks custom recurrence: repeat-unit + monthly-mode (`components/tasks/recurrence-control.tsx:307,352`).
- Bulk "Manager Status" actions (`components/tasks/bulk-action-bar.tsx:65-74`).
- Device status tabs + register-device type (`components/attendance/devices-client.tsx:123,360`).
- Remote-work repeat/ends/unit/monthly-style/day-of-month/ordinal/weekday/weekday-chips (`components/attendance/remote-work-workspace.tsx:48-74,418-581`).
- Remote check-in mode labels (`components/attendance/remote-checkin-dialog.tsx:16-21`).
- Leave duration Full/Half, availability ChoiceRows (`components/attendance/leave/apply-leave-dialog.tsx:43-47,356,454-469`).
- Leave-requests status tabs (`components/attendance/leave/leave-requests-client.tsx:17`).
- Profile timezone list + working days (`components/profile/workflow/working-hours.tsx:10-31`).
- HR candidate intake: Month of Passing, Size of House, Bathroom, Source (`lib/hr/candidate/intake-schema.ts:68-76,130-153`).
- Candidate record filters (status/form) (`components/hr/candidate/basic-details-screen.tsx:179,186`).
- JD Frequency options (`lib/jd/recurrence.ts`; `components/hr/job-description/jd-bank.tsx:302-312`).
- JD Function list (`components/hr/job-description/jd-bank.tsx:470-480`).
- Letter signatories + signing models + paragraph/font/spacing/size (`components/hr/letters/letter-editor.tsx:84-95,317-340`; `rich-letter-editor.tsx:291-340,685-726,973-984`).
- Policy categories (`lib/hr/policy-types.ts:22-30`).
- Accounts CC/due-dates cell selects: ECS / soft-copy / hard-copy / tally / balance / charges-reversed (`lib/accounts/cc.ts:18-20`; `components/accounts/cc-master/cc-client.tsx:529-564`; `components/accounts/due-dates/due-dates-client.tsx:17`).
- Evaluation weight-matrix designation ladder (`lib/hr/candidate/evaluation-v2.ts:501-512`).
- Status color tokens are a named enum (`STATUS_COLOR_TOKENS`) but the ColorPicker also accepts raw hex — a hardcoded escape hatch.

---

## 6. Dynamic Dropdowns

Dropdowns whose options come from API / database / computed values.

- **Employee / person / doer / initiator rosters** — `employees` table via server props (`listEmployeeOptions()`, `listActiveClientNames()`, roster queries). Every person picker is dynamic.
- **Subjects** — `subjects` table via `listActiveSubjectNames()` + `applySubjectPolicy()` (retire "WMS"/"WMS App", pin "Altus Ecosystem").
- **Clients** — `clients` table (`listActiveClientNames()`).
- **Accounts lookups** — `accounts_lookups` master, 22 kinds (`bank_entity`, `it_entity`, `cash_entity`, `cash_payee`, `cc_entity`, `due_area`, `due_frequency`, `fno_entity`, `fno_agency`, `shares_entity`, `sip_entity`, `sip_type`, `loan_entity`, `monthly_responsible`, `monthly_deadline`, `monthly_type`, `monthly_frequency`, `weekly_deadline`, `weekly_category`, `weekly_responsible`, `weekly_frequency`, `task_status`, `task_gear`) — inline add/soft-delete via `addAccountsLookup` / `softDeleteAccountsLookup`.
- **Goal lookups** — `BASE_AREAS`/`BASE_MEASURES`/`BASE_TYPES`/`BASE_GOALTYPES` merged with admin `goal_lookups` rows (`lib/goals/lookups.ts:89`).
- **Products / payment modes / entities / responsibles** — admin master tables (seeded from `SEED_*`, then admin-edited).
- **Departments** — `departments` table (admin master) for intake/letters/agreements; legacy `DEPARTMENTS` enum for task filters.
- **Skill lookups** — `skill_lookups` table merged with base constants.
- **Status labels** — `status_settings` table (`getStatusDisplayMap`) with `STATUS_LABELS_FALLBACK` fallback — labels are dynamic, option set is static.
- **Distinct-value filters** — client/subject/department/entity/type filters derive options from loaded rows or a `distinct` server query.
- **Computed calendars** — year/quarter windows (`quarterWindow(6,2)`), attendance month lists from punch history, holiday years, KPI effective quarters.
- **Notification channels/kinds, activity periods, dash periods** — `lib/notifications`, `lib/dashboard/manager-activity-contract.ts`, `lib/daily-goals/score.ts` constants consumed dynamically by admin settings.

---

## 7. Risk / Dependency Audit

Dropdowns where changing options could break data, reports, payroll, incentives, permissions, or workflows. DO NOT change without migration + regression proof.

- **Attendance codes** (`ATTENDANCE_CODES` + `ATTENDANCE_CODE_VALUES`) — numeric values feed attendance grading and salary; changing a code's value (e.g. `P`=1, `H/D`=0.5, `HP`=2) silently changes payroll. Leave type (`paid`/`unpaid`) drives Absent marking + salary deduction.
- **Worker types** (`WORKER_TYPES`) — drives pay basis (`PAY_BASES`), grading mode (`GRADING_MODES`), and leave eligibility. Legacy renames (`afternoon_shift`→`second_half`, `part_time`→`hybrid`) must keep mapping intact; `project_remote` is kept but not offered in the picker (Work Sessions grading).
- **Incentive statuses / types / durations** — `INCENTIVE_STATUSES` is the approval workflow (workflow.ts transition rules); `INCENTIVE_TYPES` keys are stored and read by `incentiveLabel`/salary calc; `INCENTIVE_DURATIONS` (permanent/one_time) is intent, not the `valid_until` date.
- **Appraisal dimensions** — `DEFAULT_APPRAISAL_DIMENSION_WEIGHTS` sums to 100; `APPRAISAL_MANAGER_ONLY_DIMENSIONS` and `APPRAISAL_AUTO_DIMENSIONS` drive score renormalization; changing dimensions breaks scoring and appraisal reports.
- **Task status** — deprecated values (`follow_up_1/2/3`, `cancelled`, `transferred`, `need_help`) are filtered everywhere via `isDeprecatedStatus()`; re-adding one to a picker breaks the retire/migrate contract. `status` and `approval_status` are two columns that must not be conflated.
- **Status color tokens + `status_settings`** — admin-editable labels/colors propagate to every status chip, kanban column, and filter. A rename changes rendering globally.
- **Payment modes / entities / products masters** — historical rows reference UUIDs; the "IGV"→"IJV" rename (migration 0217) and kept-legacy payment-mode spellings mean option labels must not be silently merged. `SEED_*` are seed-only; live data diverges immediately.
- **Accounts lookups** (`accounts_lookups`, 22 kinds) — soft-delete only; deleting a value affects every historical row using that kind.
- **Exit reasons / rehire eligibility** — closed list feeding attrition reports and rehire decisions; `other` + `exit_reason_other` superRefine must stay coupled.
- **HR ticket categories** — `grievance` is CONFIDENTIAL (requester + assignee + super-admins only) and forces priority ≥ High; routing table `hr_ticket_routes.category` is UNIQUE.
- **Departments** — enum mirror (`employees.department`) vs `departments` table; a mismatch breaks filters.
- **Permission/role dropdowns** (HH access roles/actions, approval levels, employee roles) — fixed matrices; making them data could grant HR delete or change approval flow.

---

## 8. Missing / Unclear Items

- `FloatingSelect` in `components/hr/exit/exit-fields.tsx:351` — **dead component**, defined but no call site. Excluded from live count.
- `app/(app)/fill-weekly-goals` — referenced in the task brief but **does not exist**; weekly-goals live under `app/(app)/weekly-goals`.
- Several "dropdowns" are actually segmented buttons / radio groups / pill filters / button grids / weekday chips (documented as option pickers in Section 3). They behave like single/multi-select but are not `<select>` or popover menus. Treat as option pickers, not classic dropdowns.
- Android slice reports some pickers as prev/next steppers (not true dropdowns) — counted separately.
- Source tallies in Section 1 are approximate: several slice entries use condensed one-line records without an explicit `Source:` field, so hardcoded/constant/database buckets are lower bounds.
- `UNKNOWN — NEEDS REVIEW` appears inline in Section 3 wherever a field could not be determined with certainty (rare; the audit team did not guess).
