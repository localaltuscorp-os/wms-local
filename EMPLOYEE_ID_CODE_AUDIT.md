# Employee ID / Employee Code Audit

**Mode:** Read-only audit. No application code modified.

## 1. Source of Truth

### Internal employee identity

**File:** `db/schema.ts:371+`

- Field: `employees.id`
- Database column: `id`
- Type: UUID
- Required: Yes
- Primary key: Yes
- Default: `defaultRandom()`
- Used as `employeeId` throughout most WMS modules.
- This is the actual canonical relational identity.

### Display Employee Code

**File:** `db/schema.ts:563`

- Field: `employees.employeeCode`
- Database column: `employee_code`
- Type: nullable text
- Required: No
- Default: None
- Unique: Case-insensitive partial unique index.
- Migration: `db/migrations/0225_employee_master.sql:110-116`
- Index: `employees_employee_code_uq`
- Uncoded employees are valid.

### Historical code registry

**Files:** `db/schema.ts:3248-3294`, `db/migrations/0225_employee_master.sql:134-207`

Table: `employee_code_registry`

- `code`
- `prefix`
- `seq`
- nullable `employee_id`
- `employee_name`
- `status`
- issued/retired metadata

Constraints:

- Code unique across all time.
- `(prefix, seq)` unique.
- Maximum one active code per employee.
- Retired codes remain permanently reserved.
- Employee deletion does not delete registry history.

### Legacy fields

No separate legacy employee ID/code column was found beyond:

1. `employees.id` — internal UUID identity.
2. `employees.employee_code` — display code.
3. `employee_code_registry` — code history.

## 2. Generation Logic

### Generator

**File:** `lib/employees/employee-code.ts`

- Generated format: `A-101`, `U-101`, `UI-101`.
- Prefix is one entity letter.
- Intern prefix adds `I`: `U` → `UI`.
- Sequence begins at `101`.
- Next number is `max(all historical sequence values) + 1`.
- Retired numbers are never reused.
- Gaps are not filled.
- Prefix comes from `paying_entities.code_prefix`.
- Intern detection uses designation text matching: `intern`, `trainee`, `apprentice`.

### Allocator

**File:** `lib/employees/code-registry.ts:55`

`issueEmployeeCode()`:

1. Validates prefix.
2. Acquires a PostgreSQL advisory lock per prefix.
3. Reads all historical sequence numbers.
4. Calculates next sequence.
5. Retires the employee’s current active code.
6. Inserts the new registry row.
7. Updates `employees.employee_code`.
8. Executes inside one transaction.

### Retirement

**File:** `lib/employees/code-registry.ts:145`

`retireEmployeeCode()` marks the registry row retired, clears `employees.employee_code`, and preserves historical code ownership.

### Intern conversion

**File:** `lib/employees/code-registry.ts:199`

`confirmInternCode()` retires `UI-xxx` and issues the next regular entity code. It does not rename the old code.

### Manual adoption

**File:** `lib/employees/code-registry.ts:302`

`adoptEmployeeCode()` supports legacy/backfill codes and prevents historical reuse.

Potential edge case: generated allocation starts at `101`, but manual adoption accepts syntactically valid lower values such as `A-1` because parsing does not enforce the `101` minimum.

## 3. Employee Creation Status

### Admin invitation

**File:** `app/(admin)/admin/employees/actions.ts:344`

`inviteEmployee()` inserts employee/profile fields but does not assign `employeeCode`.

### Candidate creation

These paths also create employee rows without a code:

- `app/(app)/hr/candidate-invite-actions.ts:217`
- `app/(app)/hr/candidate-account-actions.ts:97`

### Employee Master edit

**Files:** `app/(admin)/admin/employee-master/actions.ts:328`, `components/admin/employee-master/workspace.tsx:235-280`

`syncEmployeeCode()` runs only when `payingEntityId` or `designationId` changes.

- No current code: automatically issues one if a valid entity prefix exists.
- Matching code: unchanged.
- Mismatched code: proposes a move.
- Administrator must explicitly call `applyCodeMove()`.

**Result:** automatic generation on every employee creation path is **NOT IMPLEMENTED**. Automatic generation after selected Employee Master edits is **PARTIALLY IMPLEMENTED**.

## 4. Archive / Inactive Behavior

The registry preserves retired numbers permanently.

Automatic coupling between every archive/deactivate/offboarding path and `retireEmployeeCode()` is **NOT VERIFIED**. Explicit code retirement exists, but a complete automatic archive hook was not confirmed.

## 5. Employee Master Usage

Relevant files:

- `lib/employees/master-query.ts:268,363`
- `app/(admin)/admin/employee-master/page.tsx:38,58`
- `components/admin/employee-master/master-table.tsx:139,358,378`
- `components/admin/employee-master/workspace.tsx:387,614`
- `components/admin/employee-master/code-panel.tsx`

Employee Code is displayed, sortable, searchable, and filterable. Admin controls support issue, adopt, retire, intern confirmation, and history.

**Status:** IMPLEMENTED in Employee Master.

## 6. Usage Across WMS

| Module | Identity used | Employee Code used? | Status |
|---|---|---:|---|
| Employee Master | UUID plus `employee_code` display | Yes | Implemented |
| Attendance | `employees.id` UUID | No | UUID-only |
| Salary records | `employees.id` UUID | No | UUID-only |
| Salary import | Normalized employee name → UUID | No | Name-based |
| Salary payslip | Shortened UUID shown as “Employee ID” | No | Mislabelled UUID |
| Incentive records | UUID `employeeId` | No | UUID-based |
| Incentive template | UUID values under “Employee ID” | No | Not Employee Code |
| Goals | UUID `employeeId` | No | UUID-only |
| Weekly Goals | UUID `employeeId` | No | UUID-only |
| Tasks | UUID storage; name/email import | No | Name/email-based |
| Training | UUID `employeeId` | No | UUID-only |
| Compliance | Name → UUID | No | Name-based import |
| Job Description | Name → UUID | No | Name-based import |
| Checklist | UUID roster selections | No | UUID-only |
| Project Plan | UUID owner | No | UUID-only |
| Billing | Text responsible and/or UUID | No verified code usage | Not verified |
| Logs | Employee Code searchable/displayed | Yes | Display/search only |
| Control Panel | Employee Code displayed | Yes | Display only |
| Incentive analytics | Employee Code displayed | Yes | Display/report only |
| HR exit handover | `employeeCode ?? employee.id` | Mixed | Conflicting identity values |

Most WMS modules use `employees.id` as relational identity, not `employees.employee_code`.

## 7. Name ↔ ID Mapping

### Employee Code ↔ Employee Name

No shared application-wide Employee Code ↔ Employee Name resolver was found.

**Status:** NOT IMPLEMENTED.

### UUID ↔ Employee Name

Explicit implementation exists in Incentive:

- `lib/import/incentive-import.ts:130-158`
- `app/(app)/incentive/admin-actions.ts:79-86`

Behavior:

- Employee ID is matched against `employees.id` UUID.
- Employee Name is matched against current roster.
- Duplicate names are rejected.
- If both are supplied, they must refer to the same UUID.
- Name can be fallback when unique.

Other modules independently implement name/email → UUID resolution. No shared resolver exists.

## 8. Import / Template Usage

### Incentive template

**Files:** `lib/exports/incentive-entry-template.ts`, `lib/import/incentive-import.ts`

The column named `Employee ID` contains `employees.id` UUID values, not `employees.employee_code` values.

- ID dropdown uses UUIDs.
- Name dropdown uses names.
- ID → Name formula exists.
- Name → ID is not formula-driven.
- Selecting a name can overwrite the formula.
- Import verifies UUID/name consistency.
- Duplicate names are rejected.

**Status:** PARTIAL. Strong UUID/name validation, but not Employee-Code-based.

### Tasks

- No Employee ID or Employee Code column.
- Doer/Initiator resolve by employee name/email.
- Stored task identity is UUID.

**Status:** Name/email-based.

### Salary

- XLSX importer matches normalized employee names.
- Employee Code is not accepted.
- Resolved database UUID is stored.

Files:

- `app/(app)/salary/import/actions.ts:104-166`
- `app/(app)/salary/import/profile-actions.ts:82-129`

**Status:** Employee Code is not canonical.

### Goals / Weekly Goals

Employee fields resolve to UUIDs. No Employee Code matching found.

### Compliance

Employee values resolve by name; stored value is owner UUID. No Employee Code lookup.

### Job Description

Person/assignment fields resolve by name; stored values are UUIDs. No Employee Code lookup.

### Checklist / Project Plan

Employee selectors use UUID roster values. No Employee Code fields found.

### Attendance

No Employee Code input or lookup. Employee identity comes from session UUID or UUID parameters.

### Billing

No verified Employee Code lookup. Uses internal UUID and/or responsible-person text.

## 9. Duplicate / Competing Logic

Three identity systems operate in parallel:

1. Internal UUID: `employees.id`.
2. Employee Code: `employees.employee_code`.
3. Name/email resolution: independent importer-specific matching.

Additional mixed implementation:

- `components/hr/exit/exit-handover-form.tsx:53` uses `employeeCode ?? employee.id` under one `header_employeeId` field.
- `lib/auth/dev-bypass.ts:89` sets `employeeCode: null`.
- Incentive analytics/master display `employeeCode`, while incentive entry storage uses UUID.

No separate Employee ID generator distinct from the UUID generator was found.

## 10. Final Status

| Area | Status | Evidence | Problem |
|---|---|---|---|
| DB field | IMPLEMENTED | `employees.id`, `employees.employee_code` | Two meanings are both called ID/code |
| ID generation | PARTIAL | `employee-code.ts`, `code-registry.ts` | Not automatic on every creation |
| Employee creation | PARTIAL | Admin and candidate inserts | New employees can remain uncoded |
| Employee Master | IMPLEMENTED | Master query/table/code panel | Mainly admin display/control |
| Employee lookup | PARTIAL | Master/log search | Most modules do not search by code |
| Name → ID | PARTIAL | Incentive and separate resolvers | Usually resolves to UUID, not Employee Code |
| ID → Name | PARTIAL | Incentive UUID formula/server check | No Employee Code-wide resolver |
| Imports | PARTIAL | Incentive accepts UUID; others name/email | Employee Code is not canonical |
| Attendance | NOT USED | UUID foreign keys/actions | No Employee Code lookup |
| Salary | PARTIAL | UUID storage; name-based import | Salary import ignores Employee Code |
| Incentive | PARTIAL | UUID/name consistency validation | “Employee ID” is UUID, not Employee Code |
| Other modules | PARTIAL | Goals/tasks/training/compliance/JD/project UUIDs | Widespread UUID/name/email identity |

## Overall Employee ID Status

**PARTIALLY IMPLEMENTED / IMPLEMENTED BUT NOT USED EVERYWHERE**

## Current Source of Truth

Relational employee identity:

```text
employees.id
```

Current human-readable code:

```text
employees.employee_code
```

Historical allocation and uniqueness:

```text
employee_code_registry
```

## Actual Generation Rule

```text
Prefix + "-" + next sequence
```

- Prefix: entity letter, optionally followed by `I` for interns.
- First generated sequence: `101`.
- Next value: maximum historical sequence for that prefix plus one.
- Retired numbers are never reused.
- Allocation is transactionally locked.

## Main Gap

Employee Code exists and is safely generated, but WMS modules still primarily use internal UUIDs or name/email matching; Employee Code is not the application-wide canonical employee identifier.
