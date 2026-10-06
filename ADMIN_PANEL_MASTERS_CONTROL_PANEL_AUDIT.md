# WMS Admin Panel, Masters and Control Panel Audit

Audit date: 2026-09-26
Repository scope: `wms-local-main/`
Method: static repository audit. No application, database, migration, UI, API, permission, or data changes made.

## Evidence rules

`VERIFIED` means directly supported by source code, schema, or migration. `INFERENCE` means a likely architectural conclusion from verified references. `UNVERIFIED` means repository inspection cannot prove runtime database state, deployed RLS state, or production usage.

## 1. Executive Summary

The repository contains two overlapping administration surfaces:

- `/admin`: broad Admin Panel, gated mainly by `employees.is_admin`; contains employee, roster, HR, billing, finance, logs, settings, upload, and master screens.
- `/control-panel`: newer access-management surface with Users, Roles, Permissions, Effective Access, and Temporary Access.
- `/master-admin`: separate permission-matrix recovery surface. It is gated by the database-backed `master_admin.manage` capability, not by the `/admin` layout.

Verified master families include employee identity and organization, task rosters, status labels, attendance/leave/holiday, goals, incentive, DCC/events, billing, outstanding, accounts lookups, training, recruitment/operations, products, clients, subjects, and upload templates. Exact page count is not equal to master count: several pages operate multiple tables, while several tables have no dedicated page. A conservative inventory below lists 40+ implemented master or configuration registries, excluding ordinary transactional tables.

Main sources of truth:

- PostgreSQL tables in `db/schema.ts` and migrations.
- Code catalogs and enums in `db/enums.ts`, `lib/permissions/catalog.ts`, `lib/security/capabilities.ts`, and module constants.
- Runtime authorization from `employees.is_admin`, capability grants, workspace predicates, role tables, direct module overrides, and delegated-access grants.

Major inconsistencies:

- `employees.department` free text remains beside canonical `employees.department_id` to `functions`; migration 0234 calls `departments` a backup and `functions` live, while code still uses the old column name.
- Entities have multiple registries: `paying_entities`, `outstanding_entities`, billing `entityId` text, Accounts lookup kinds, and hardcoded HR entity constants.
- Products have at least `products`, `outstanding_products`, `product_options`, and module-specific constants.
- Roles, code capabilities, `isAdmin`, and the module permission matrix coexist. They are not interchangeable.
- Many option sets remain code-defined, including task, leave, recurrence, HR candidate, letter, Accounts, broadcast, and training values.

Major access risks:

- Module permission reads fail open in `lib/permissions/resolve.ts`.
- The module matrix narrows existing access but does not grant access. Runtime behavior still depends on many legacy `isAdmin`, capability, workspace, manager, and module-specific checks.
- RLS evidence in repository is sparse and table-specific. Most server code uses Drizzle/server credentials; deployed Supabase policy state is `UNVERIFIED`.
- Direct module permissions and role permissions are both exposed in Control Panel, but the central effective-access view is an explanatory composition, not one universal authorization engine.

Important observation: source comments describe intended safety properties, but static inspection cannot prove every page/action calls the intended guard. The enforcement table therefore marks only directly verified guard calls.

## 2. Admin Panel Structure

### Hierarchy

```text
Admin Panel (/admin)
├── Dashboard (/admin)
├── Employee and organization
│   ├── Employee Master
│   ├── Employees
│   ├── Functions
│   ├── Departments (legacy-labelled alias)
│   ├── Designations
│   ├── Hierarchy
│   ├── Paying Entities
│   ├── Holidays
│   └── Leave Categories
├── WMS and rosters
│   ├── Clients
│   ├── Subjects
│   ├── Products
│   ├── Task Reminders
│   └── Access Control
├── Finance and billing
│   ├── Billing Master
│   ├── Billing Customers
│   ├── Billing Products
│   ├── Billing Payment Terms
│   ├── Billing SAC Codes
│   ├── Billing Profiles
│   ├── Outstanding Entities
│   ├── Outstanding Payment Modes
│   ├── Outstanding Products
│   ├── Outstanding Responsibles
│   └── Salary Profiles
├── Incentive and configuration
│   ├── Incentive Master
│   ├── Settings
│   ├── Notifications
│   ├── Module Backups
│   └── Upload Master
├── Observability
│   ├── Activity
│   └── Logs
└── Separate access surfaces
    ├── Control Panel (/control-panel)
    └── Master Admin (/master-admin)
```

Routes and page evidence: `app/(admin)/admin/**/page.tsx`; navigation: `components/admin/admin-nav-config.ts`; shell gate: `app/(admin)/admin/layout.tsx`.

`/admin` layout calls `requireUser()`, permits an ordinary admin or the task-roster capability, and gives roster-only users a reduced navigation. Individual pages/actions add module, capability, manager, or feature-specific checks. `app/(admin)/admin/layout.tsx:22-57`.

| Section | Route/pages | Main tables or sources | Guard evidence | Access users |
|---|---|---|---|---|
| Admin shell | `/admin` and descendants | `employees`, module tables | `requireUser`; `isAdmin` or roster capability | Active admin; limited roster managers for roster paths |
| Employee Master | `/admin/employee-master` | `employees`, `designations`, `paying_entities`, `functions`, salary profile tables | page/action-specific admin checks; inspect `actions.ts` | Admin users |
| Roster masters | `/admin/clients`, `/admin/subjects`, `/admin/functions`, `/admin/designations` | `clients`, `subjects`, `functions`, `designations` | Admin/capability checks; clients/subjects also task-roster capability | Admin or named roster managers depending on path |
| Finance masters | `/admin/products`, `/admin/paying-entities`, `/admin/outstanding-*`, `/admin/billing-*` | master tables listed in Sections 3–4 | `requireAdmin`, module edit, billing-specific capability on some destructive actions | Admin; billing-authorized users where module guard permits |
| Settings | `/admin/settings`, `/admin/notifications`, `/admin/task-reminders` | settings tables and code registries | Admin plus setting/action checks | Admin users |
| Audit/logs | `/admin/activity`, `/admin/logs` | activity/global log tables | admin and export checks | Admin or log-authorized users |
| Upload Master | `/admin/upload-master` | `template_files`, storage bucket, `lib/templates/registry.ts` | `requireAdmin` plus `admin.masters.upload-master` view/edit | Admin users with module permission |
| Control Panel | `/control-panel/*` | `roles`, `role_permissions`, `employee_roles`, `module_permissions`, `delegated_access_grants` | workspace/module gate; mutations require master admin or delegation policy | Admin/master-admin/eligible managers, per screen |
| Master Admin | `/master-admin` | `module_permissions`, `module_permission_events`, capability grants | `isMasterAdmin` in layout and every action | Database-backed master admins |

## 3. Complete Masters Inventory

Status uses actual repository evidence, not page naming.

| Master | Route | DB table | Purpose | Used by | Source of truth | CRUD | Bulk upload | Status |
|---|---|---|---|---|---|---|---|---|
| Employee | `/admin/employee-master`, `/admin/employees` | `employees` plus FK masters | Identity, employment, auth linkage, hierarchy | Nearly all modules | `employees`; legacy mirrors remain | Create/edit/archive | Employee export; no general employee import verified | Active, duplicated pages |
| Function | `/admin/functions` | `functions` | Organization function | Employees, JD, filters, goals, permissions display | `functions` through `department_id` | CRUD/soft deactivate | None verified | Active; old `departments` backup remains |
| Department alias | `/admin/departments` | `functions` / `departments_backup` | Legacy label for Function | HR/task legacy paths | Mixed | Page exists | None | Duplicate/legacy-labelled |
| Designation | `/admin/designations` | `designations` | Employee designation and employee type | Employee, incentive, HR, salary | Table | CRUD/soft deactivate | None | Active |
| Paying entity | `/admin/paying-entities` | `paying_entities` | Legal/payroll entity and employee-code prefix | Employee, payroll, billing | Table | CRUD/soft deactivate | None | Active |
| Shift type | Employee editor/configuration | `shift_types` | Work shift roster | Employee/salary/attendance | Table | Table exists; dedicated CRUD page not verified | None | Partially used / page unverified |
| Client | `/admin/clients` | `clients` | Task/client roster | Tasks, weekly goals, projects, billing links | Table, task stores free-text mirror | CRUD/soft deactivate | Tasks template references client names | Active with denormalized consumer |
| Subject | `/admin/subjects` | `subjects` | Task subject roster | Tasks and filters | Table, task stores free text | CRUD/soft deactivate | Tasks template | Active with denormalized consumer |
| Task status labels | `/admin/settings` | `status_settings` | Labels/colors/order for task enum | Tasks, goals display, reports | Enum values plus table labels | Edit settings; no arbitrary status CRUD | None | Active; option set remains enum |
| Leave category | `/admin/leave-categories` | `leave_categories` | Leave classification | Leave requests, reports | Table | CRUD/soft deactivate | None | Active |
| Holiday | `/admin/holidays` | `holidays` | Holiday calendar | Attendance, salary, HR | Table | CRUD | None | Active |
| Product | `/admin/products` | `products` | Product roster | Dynamic forms, billing/incentive paths | Table plus constants | CRUD | None | Active but concept overlaps |
| Outstanding product | `/admin/outstanding-products` | `outstanding_products` | Outstanding contract product | Outstanding | Table | CRUD/soft deactivate | None | Active, distinct from Product |
| Payment mode | `/admin/outstanding-payment-modes` | `outstanding_payment_modes` | Outstanding collection mode | Outstanding | Table | CRUD/soft deactivate | None | Active; seed constants duplicate |
| Outstanding entity | `/admin/outstanding-entities` | `outstanding_entities` | Outstanding entity | Outstanding | Table | CRUD/soft deactivate | None | Active, separate entity registry |
| Outstanding responsible | `/admin/outstanding-responsibles` | `outstanding_responsibles` | Outstanding owner roster | Outstanding | Table | Read/edit page; CRUD action not fully verified | None | Partially used |
| Billing payment term | `/admin/billing-payment-terms` | `billing_payment_terms` | Due-date rules | Billing invoices | Table | CRUD/soft deactivate | None | Active |
| Billing SAC code | `/admin/billing-sac-codes` | `billing_sac_codes` | Service accounting codes | Billing lines/entity profiles | Table | CRUD/soft deactivate | None | Active |
| Billing profile | `/admin/billing-profiles` | `billing_entity_profiles` | Seller legal/bank/signature data | Billing documents | Table plus `paying_entities` link | Edit/upsert | None | Active |
| Billing customer | `/admin/billing-customers` | `billing_customers`, contacts, addresses | Bill-to customer master | Billing | Tables | CRUD | None | Active |
| Billing product | `/admin/billing-products` | billing lookup/product structures | Billing line selection | Billing | Table/code registry | CRUD status mixed | None | Partially used; exact table mapping needs runtime check |
| Incentive catalog | `/admin/incentive-master` | `incentive_catalog`, eligibility/scope tables | Incentive types/products/eligibility | Incentive, salary, goals | Tables plus code constants | CRUD | None | Active |
| Accounts lookup | No single admin route verified | `accounts_lookups` | 22 Accounts option kinds | Accounts forms and task list | Table per `kind` | Inline add/soft-delete | Accounts task list upload | Active |
| Goal lookup | Goals pages; admin CRUD page not verified | `goal_lookups` plus base constants | Goal areas/measures/types | Goals, appraisal | Table merged with constants | CRUD through goal settings paths | Goals uploads | Active, dual source |
| Event category | `/events/masters`, `/operations/masters/events` | `event_categories` | Event classification | Monthly events/calendar | Table | CRUD | None | Active |
| Event batch type | `/events/masters` | `event_batch_types` | Event batch classification | Events | Table | CRUD | None | Active |
| Event holiday | Events pages | `event_holidays` | Event holiday records | Events | Table | CRUD | None | Active |
| DCC master items | `/dcc/masters` | DCC master tables from migration 0230 | DCC checklist/KPI definitions | DCC, dashboards | Tables | CRUD | None | Active |
| Recruitment/JD | `/operations/masters/recruitment-jd`, `/operations/masters/jd` | `jd_positions`, job description tables | Positions, JD, recurrence | HR, recruitment, operations | Tables plus hardcoded frequency/function options | CRUD | None verified | Active, hardcoded alternatives |
| Training lookups | Training pages | migration 0250 training lookup tables | Training subject/type/session values | Training, mobile training | Tables plus code options | CRUD status mixed | Training uploads target data, not lookup masters | Partially used |
| Template registry | `/admin/upload-master` | `template_files` plus built-in registry | Site-wide workbook templates | Tasks, goals, projects, Accounts | `lib/templates/registry.ts` and storage overrides | Replace/delete override | N/A; it controls uploads | Active |
| Module permission matrix | `/control-panel/permissions`, `/master-admin` | `module_permissions` | Per-employee show/view/edit narrowing | Navigation and guarded pages/actions | `lib/permissions/catalog.ts` + table | Upsert/delete override | None | Active |
| Roles | `/control-panel/roles` | `roles`, `role_permissions`, `employee_roles` | Reusable role grants | Control Panel effective access | Tables + permission catalog | CRUD; system role protected | None | Active, runtime adoption mixed |
| Temporary access | `/control-panel/temporary-access` | `delegated_access_grants`, events | Time-limited target-account session | All current identity resolution | Tables + expiry functions | Create/revoke/activate | None | Active |

Pages also called “masters” but not all are standalone lookup masters: billing customers, profiles, module backups, activity, notifications, logs, hierarchy, and salary profiles are administrative data/configuration surfaces.

## 4. Master Field-Level Audit

The following field groups cover every master table materially connected to Admin/Control Panel. Exact column evidence comes from `db/schema.ts`; migrations define historical transitions.

| Master/table | Field-level facts | Create/edit/consume | Integrity and deletion notes |
|---|---|---|---|
| `employees` | `id` UUID PK; `name`, `email`, `role` required; `email` unique; `firebaseUid` unique nullable; `isAdmin`, `isActive` default false/true; `department` nullable text legacy; `departmentId` nullable FK to `functions`; `designationId`, `payingEntityId`, manager and employee-code fields are FK/identity links; candidate fields distinguish candidate accounts | Employee actions/editor create and update; auth/current/session, every module, Control Panel user list consume | `department` and `departmentId` duplicate concept. Archive preserves history and affects tasks, reports, and role assignments. `onDelete` varies by FK; deletion is not equivalent to archive. |
| `functions` | UUID PK, required `name`, `isActive` default true, `sortOrder` default 100, timestamps; case-insensitive unique index on name | `/admin/functions`; employee, JD, goals, task filters, Control Panel display | Employee FK uses `ON DELETE SET NULL`; employee multi-function join uses cascade. `departments` alias/backup is legacy evidence. |
| `designations` | UUID PK; required unique `name`; `isActive`, `sortOrder`; required `employeeType` constrained to `employee`/`intern`; timestamps | `/admin/designations`; Employee Master; incentive employee-type resolver; HR/salary | Renaming affects displays. Inactive rows may remain referenced. Employee type is correctly stored on master, but other code still has worker-type constants. |
| `paying_entities` | UUID PK; unique `name`; active/sort; nullable `codePrefix` unique when present; legal/billing fields nullable; SAC array; timestamps | Paying entity page, employee code allocator, payroll, billing profile link | Employee/entity references must be retired or set null, not blindly deleted. Billing `entityId` text registry is not FK-canonical. |
| `clients` / `subjects` | UUID PK; unique required name; active/sort/timestamps | Admin actions; task pickers and templates | `tasks.client` and `tasks.subject` are text snapshots, not FKs. Rename behavior must update or intentionally preserve old labels; client UI states it updates task labels. |
| `status_settings` | PK is `task_status` enum; required label/color/order; updater FK; timestamp | Settings page; status display helpers and task UI | Cannot add arbitrary statuses through this table. Enum and display table are separate sources. |
| `leave_categories` / `holidays` | Table-specific UUID/date/name/active fields; exact runtime validation varies by action | Leave and attendance actions/pages | Historical attendance/salary calculations can depend on dates and labels. Deletion risk is high if hard delete is allowed; repository shows mixed soft-delete conventions. |
| Outstanding masters | `outstanding_products`, `outstanding_entities`, `outstanding_payment_modes`, `outstanding_responsibles`: UUID, name, active/sort/timestamps; contracts/collections reference IDs | Outstanding admin pages and contract/collection forms | FK history is protected in schema; migration 0217 explicitly preserves IDs and renames `IGV` to `IJV`. Separate from general product/entity masters. |
| Billing masters | Payment terms: label, nullable due days, default/active/sort. SAC: code, description, nullable GST rate, active/sort. Entity profile: text entity key, optional paying entity FK, legal/bank/signature fields, default payment-term FK, active/timestamps | Billing pages/actions and invoice generation | Many fields nullable by design. `billing_entity_profiles.entityId` is text and not the same as `paying_entities.id`. SAC default is text in profile while SAC master is UUID-based: duplicate linkage model. |
| `accounts_lookups` | UUID, `kind`, value, sort, active/deleted fields; 22 kinds documented in dropdown audit | Inline `ValueSelect`; Accounts forms and task list | One polymorphic table contains unrelated concepts. Kind spelling becomes part of API/data contract. Soft deletion preserves history. |
| `goal_lookups` | Lookup value rows merged with static `BASE_*` arrays | Goal forms, filters, imports | Active DB values do not fully replace code base arrays. Duplicate/ordering conflict possible. |
| Event/DCC masters | UUID/name/active/sort fields for categories, batch types, schedules; DCC item fields include section/KPI/value/config fields per migration 0230 | Event/DCC master pages and runtime boards | DCC value semantics are consumed by web/mobile; deleting a referenced item risks historical board interpretation. |
| Roles | UUID PK; required unique case-insensitive name; description; `isSystem`; creator/timestamps | Role actions and Control Panel tables | System role cannot be renamed/deleted in action code. Role deletion cascades permissions and employee assignments in schema. |
| Role permissions | UUID; role FK cascade; `nodeKey`, `action`, optional `scope`; unique role/node/action/scope | Role editor; effective-access query | Node/action/scope are text constrained by application validation, not shown as DB FK. Orphaned persisted keys are possible after catalog changes. |
| Module permissions | Employee UUID FK; node key; `canShow`, `canView`, `canEdit`; updater/timestamps; unique employee/node | Master Admin and Control Panel Permissions | Null absent row means no override; explicit false narrows. Master admins are exempt from enforcement. Catalog key rename can orphan rows. |
| Delegated access | UUID; target/delegate employee FKs; hashed token; start/expiry/revoke/use timestamps; reason; events | Temporary Access actions, current-session resolver | Expiry is computed and checked on access. One live grant per delegate is documented/backstopped by partial unique index. Target account is impersonated for effective app behavior; actor remains separately logged. |
| Template files | Key, storage path, content type/name/size, updater/timestamps | Upload Master and download resolver | Registry key validation prevents arbitrary file targets. Old object removal is best effort after DB commit. |

Fields not fully verifiable from static source: live database nullability after all migrations, deployed constraints/RLS, and actual row population. Marked `UNVERIFIED` rather than inferred.

## 5. Master–Module Dependency Map

```text
employees, functions, designations, paying_entities
  Employees, HR, salary, attendance, goals, incentive, training, billing, Control Panel

clients, subjects, task status settings
  Tasks, My Day, Weekly Goals, Projects, imports, reports, notifications

goal_lookups, project_nodes, incentive_catalog
  Goals, appraisal, PMS, team productivity, dashboards, imports

leave_categories, holidays, shift_types, attendance settings
  Attendance, Leave, Salary, HR records, dashboards

outstanding_* masters, products, accounts_lookups
  Outstanding, Accounts, Billing, dynamic forms, exports

event_categories, event_batch_types, event_holidays, DCC masters
  Monthly Events, Operations, DCC, Team Dashboard, mobile app

billing_* masters and paying_entities
  Billing customers, invoice documents, payment terms, SAC/GST, PDF/email output

module_permissions, roles, capability_grants, delegated_access_grants
  Navigation, page guards, server actions, device/attendance/admin exceptions
```

Shared masters: employees, functions, designations, entities, clients, subjects, status labels, goal lookups, products, and permission catalog.

Single-module or near-single-module masters: DCC definitions, outstanding rosters, Accounts lookup kinds, billing SAC/payment terms, event batch types, template files.

Modules bypassing masters: task subject/client values are stored as text; HR candidate fields use hardcoded choices; HR entities use code constants; recurrence and many status-like controls use local arrays; Accounts uses one polymorphic lookup table rather than domain-specific FKs.

## 6. Hardcoded Values Audit

Representative occurrences, with exact locations. Full dropdown census is broader; `_audit_scratch/part-a.md` records approximately 630 web/Android picker controls and identifies repeated option families.

| Value/concept | File/location | Current source | Expected/candidate source | Impact |
|---|---|---|---|---|
| Department/function | `db/enums.ts:342`; `lib/org/functions.ts`; `components/hr/job-description/jd-bank.tsx:470-480` | Enum/code arrays plus `functions` table | `functions` master | Filters and JD can disagree with Employee Master |
| Entity names | `lib/hr/entities.ts`; HR letter/CTC components; `SEED_ENTITIES` | Hardcoded arrays, seed arrays, tables | `paying_entities` or an explicit domain registry | Payroll, HR, Outstanding, Billing can show different legal entities |
| Product names | `db/migrations/0217_masters_payment_modes_and_products.sql`; `product_options`; `ALLOCATION_CATEGORIES`; goal constants | Multiple tables/constants | Domain-specific canonical product registry | Similar label can mean revenue product, form answer, or allocation category |
| Task statuses | `db/enums.ts`; `status_settings`; task/goals components | Enum plus display table plus local status lists | Enum for storage, display table for labels | Doer/admin/goal status sets intentionally differ; accidental merging would change behavior |
| Task priorities | `db/enums.ts`; task components | Enum/static arrays | Task enum; no evidence one global priority exists | HR tickets and broadcasts use different scales |
| Recurrence/frequency | `components/tasks/recurrence-control.tsx:307,352`; `lib/jd/recurrence.ts`; remote work and broadcast components | Inline arrays/constants | Domain-specific code tables only if business-configurable | Seven+ incompatible frequency vocabularies |
| Candidate intake choices | `lib/hr/candidate/intake-schema.ts:68-76,130-153` | Zod literals | Candidate lookup masters if admin-configurable | Validation and UI can drift |
| Letter options | `components/hr/letters/letter-editor.tsx:84-95,317-340`; rich editor | Hardcoded signatories, models, typography | Some are presentation constants; signatories may be entity/user data | Stale signatory options possible |
| Accounts statuses/cell values | `lib/accounts/cc.ts:18-20`; due-dates client | Constants | `accounts_lookups` for business-editable values | Several Yes/No/NA and Tally vocabularies coexist |
| Permissions/module names | `lib/permissions/catalog.ts`; `lib/security/capabilities.ts` | Code catalog and code capability map | Catalog is appropriate for route authorization; UI labels should not be independently duplicated | Role rows can become orphaned if keys change |
| Role names | `roles` table plus system-role rules; `security_role_grants.role` text | Two role systems | Decision needed: reusable module roles vs narrow security capabilities | Same user can have `isAdmin`, DB role, security role, and code capability |
| Worker/employee type | `db/enums.ts`; designation `employeeType`; employee editor constants | Enum, designation column, legacy names | Designation for classification; worker type for pay basis | Payroll semantics can diverge from HR labels |
| Timezone/working days | `components/profile/workflow/working-hours.tsx:10-31` | Literal options | Configuration only if business-managed | Low risk; not a master requirement unless policy changes |
| Upload template structure | `lib/templates/registry.ts`; module template builders | Code registry and built-in XLSX builders | Registry is canonical for supported template keys | Replacement file can diverge from importer if no shape test runs |

Not every hardcoded value is a defect. Enums that define storage protocols, UI-only display choices, and security catalog keys are legitimate code sources. Risk begins when the same business concept is editable in a table elsewhere.

## 7. Control Panel Architecture

Routes:

- `/control-panel` is a guarded forwarder to `/control-panel/users` (`app/(app)/control-panel/page.tsx`).
- `/control-panel/users` lists employees joined to functions, designations, paying entities, and reusable roles.
- `/control-panel/roles` manages role templates, role permissions, and assignments.
- `/control-panel/permissions` exposes existing per-employee `show/view/edit` matrix.
- `/control-panel/effective-access` composes role permissions, direct overrides, and temporary-access state.
- `/control-panel/temporary-access` creates/revokes/activates delegated sessions.

The route/module catalog is code-defined in `lib/permissions/catalog.ts`. It contains hierarchical nodes, route mappings, and three actions: `show`, `view`, `edit`. Catalog nodes include Control Panel children and the separate Master Admin node. Persisted keys are text, so catalog key changes are data migrations in practice even when no schema migration is required.

The Control Panel is not one authorization system. It is a management UI over several layers:

```text
Auth/session identity
  plus employees.isAdmin and workspace predicates
  plus code/database capability grants
  plus reusable roles and role_permissions
  plus direct module_permissions narrowing
  plus delegated target-account session
  plus page/action-specific checks
  plus table-specific RLS where configured
```

## 8. Users Audit

User representation is `employees`.

- Primary employee identifier: UUID `employees.id`.
- Human login identity: `employees.email`, unique; session resolution uses employee lookup.
- Firebase linkage: nullable unique `firebase_uid`.
- Employee code: nullable human-readable `employee_code`; allocation history in `employee_code_registry`.
- Auth user relationship: repository uses Firebase/session helpers and employee rows; no Supabase `auth.users` FK was verified in `db/schema.ts`.
- Active state: `is_active`; candidate accounts also use `account_type`, `candidate_active`, and `candidate_intake_id`.
- Admin state: `is_admin` boolean, separate from `master_admin.manage` capability.
- Organization: `department_id` to `functions`, designation and paying entity FKs, manager fields, and employee-department join/history structures.
- Roles: `employee_roles` many-to-many with `roles`.
- Direct module permissions: `module_permissions` keyed by employee UUID and catalog node.
- Temporary permissions: delegated session targets another employee account for a bounded time; it does not mint a target session.
- Archived/inactive behavior: inactive employees are generally excluded from rosters; exact behavior differs by page and candidate flow.

Identity duplication is material: UUID, email, employee code, Firebase UID, and legacy/free-text department each appear in different layers. Email is the capability key; UUID is the relational key; employee code is display/business identity; Firebase UID is auth-provider linkage. No single “user ID” spans all integrations.

## 9. Roles Audit

| Role/source | Permissions | Assignment | Runtime use | Notes |
|---|---|---|---|---|
| DB reusable role (`roles`) | `role_permissions`: catalog node + action + optional data scope | `employee_roles`; master-admin-only actions | Effective-access query verified; runtime adoption is not universal | `isSystem` protects system role from rename/delete |
| `Super Admin` system role | Role permissions as stored | DB assignment | Exact runtime bypass not established from all callers | Action explicitly says it cannot be renamed/deleted; do not equate with `isAdmin` without runtime proof |
| Employee `isAdmin` | Broad legacy admin gates | Employee editor/actions | Widely used across modules | Boolean grants broad access unrelated to role table |
| Security role grant | Text role from code `SECURITY_ROLES` | `security_role_grants` | Narrow capabilities/features | Separate from reusable roles; RLS exists in migration 0238 |
| Code capability grant | Capability string, some code-defined, `master_admin.manage` DB-backed | `capability_grants` for DB-backed capability; code map for others | Direct guards in device, attendance, billing, incentive, task roster, temporary access, Master Admin | Capability names are not role records |
| Manager/hierarchy status | No role row required | `employees.manager_id` and org queries | Temporary-access eligibility, team scopes, doer permissions | Organizational relationship, not reusable role |

Verified mutation policy: role create/update/delete, assign/remove, and role-permission grant/revoke actions call `masterAdmin()` which requires `requireAdmin()` plus `isMasterAdmin()` (`app/(app)/control-panel/roles/actions.ts:26-35`).

## 10. Permissions Audit

The actual model is:

```text
Employee
  ├── isAdmin / workspace / department predicates
  ├── reusable Roles
  │     └── role_permissions(nodeKey, action, scope)
  ├── direct module_permissions(nodeKey, show, view, edit)
  ├── security/capability grants
  └── delegated target identity for temporary access
```

Permission IDs are UUIDs for role/direct rows. Permission names are catalog `nodeKey` strings. Action values are `show`, `view`, `edit`; role action/scope validation comes from `lib/permissions/vocabulary.ts`. Data scope is optional and stored as text.

Enforcement findings:

- Frontend: navigation uses hidden module keys and can hide nodes. UI buttons also receive server-computed edit state in several pages.
- Backend/page: `requireModuleView` and `requireModuleEdit` are server guards in `lib/permissions/resolve.ts`.
- Server actions: upload, roles, temporary access, Master Admin, and many module actions re-check authorization server-side.
- API routes: individual routes often use `requireUser`, `isAdmin`, manager, or capability checks. Complete route-by-route proof is not possible from one central middleware because guards are distributed.
- RLS: verified only for selected tables/migrations listed in Section 13. No repository evidence proves universal RLS coverage.

Permissions enforced only frontend: any UI-only hidden control with no corresponding action guard is a risk candidate. Static search found many direct `isAdmin` branches and module-specific actions; each needs per-action review. This report does not label every such branch as bypass because some actions have independent guards.

Permissions enforced only backend: legitimate for server actions and API routes, but users can see stale navigation or get redirects. `requireModuleView` logs denial and redirects to `/hub` unless the hub is also denied.

## 11. Effective Access Audit

Verified computation in `lib/queries/control-panel.ts:effectiveAccessFor`:

1. Load employee role assignments and join role permissions.
2. Merge duplicate permanent lines from roles.
3. Load direct `module_permissions` rows.
4. Load delegated grants where employee is delegate.
5. Label temporary rows `live`, `expired`, or `revoked` from `expiresAt`/`revokedAt`.

Runtime module permission resolution in `lib/permissions/resolve.ts` is narrower:

- Load direct overrides by current effective employee ID.
- If no override exists, use application’s existing authorization.
- Explicit direct false values narrow access.
- The matrix never grants access.
- Master admins bypass matrix enforcement for recoverability.
- A database read failure returns an empty override map, therefore preserves existing authorization and fails open relative to matrix restrictions.

Role permissions are visible in Effective Access, but this file does not prove that every module authorization call evaluates role permissions. Many modules still call `me.isAdmin`, manager predicates, code capabilities, or domain-specific access functions directly. Therefore “effective access” is a composed report, not verified as a universal runtime decision function.

Conflict rules verified:

- Direct matrix override narrows existing module access.
- Master admin bypasses direct matrix enforcement.
- Temporary access changes current effective identity to target for app behavior, while audit actor remains delegate.
- Deny-vs-allow behavior of reusable roles is not fully defined in inspected code; role permissions appear additive, with no explicit deny row.
- Precedence among role permissions, `isAdmin`, capabilities, workspace access, and page-specific guards varies by module.

## 12. Temporary Access Audit

Creation path: `/control-panel/temporary-access` page checks signed-in user, `control-panel.temporary-access` view, and `canOpenDelegatedAccess`. Action checks user, rate limit, grant permission, Zod input, valid duration, target/delegate eligibility, then calls `createDelegatedGrant`.

Verified properties:

- Start and expiry are stored; duration is validated by `delegated-expiry.ts`.
- Grant stores a hash, not the presented token.
- Target and delegate are employee UUIDs.
- Candidate, inactive, privileged, self, and out-of-team delegates are rejected by policy unless the narrow `delegated_access.grant_any` capability applies to hierarchy scope.
- One live grant per delegate is documented and guarded by a partial unique index.
- Revocation is supported. Revoke authority is checked against grant ownership/capability.
- Expiry is checked by `isDelegationLive` during resolution and displayed as `expired` in Effective Access.
- Activation sets a delegation cookie; current-session resolver loads target account context.
- Events record grant, first use, invalid token, expiry/revocation-related actions, and end-session activity.

UNVERIFIED: whether every API route and background job resolves delegated identity consistently. Core page/action/session paths do.

## 13. Permission Enforcement Audit

| Area | Frontend | Backend/page | API/action | RLS | Risk |
|---|---|---|---|---|---|
| Admin shell | Navigation filters/reduced shell | `app/(admin)/admin/layout.tsx` | Page actions vary | No universal RLS evidence | Medium: broad `isAdmin` legacy gate |
| Control Panel Users | UI tabs/buttons | Workspace/module gate | Read page query; mutation paths mostly role/temp actions | Not verified | Medium |
| Control Panel Roles | Role editor UI | Page itself loads data; mutation `masterAdmin()` | Server actions re-check master admin | Not verified for role tables | Low/Medium |
| Control Panel Permissions | Matrix UI | `requireModuleView`/page | Master Admin actions re-check capability; Control Panel client uses existing permission actions | Not verified | Low for intended matrix; key drift risk |
| Effective Access | Read-only UI | Page loads selected user | Query is composition, not write path | Not verified | Informational mismatch risk |
| Temporary Access | Panel hides unavailable actions | `requireModuleView` plus hierarchy/capability | Grant/revoke actions re-check | Not verified for delegated tables | Medium if any consumer skips resolver |
| Upload Master | Edit UI uses server `canEdit` | `requireAdmin` + module view | Upload/delete re-check module edit, validate key/file | Storage/table policy not fully shown | Medium: replacement workbook can mismatch importer |
| Attendance audit | UI guards present in route comments/code | Capability functions | Actions check capabilities | `attendance_audit_log` RLS verified in migration 0215 | Low/Medium |
| Security role tables | No broad UI evidence beyond control/security flows | Server code | Migration 0238 enables RLS | RLS verified in migration | Low, deployed state unverified |
| General WMS modules | Many module-specific guards | Mixed `isAdmin`, manager, capability, workspace | Distributed actions | Mostly no repository RLS evidence | High investigation priority |

RLS evidence search found explicit policies/enabling for `attendance_audit_log`, HR records drive tables, and security role tables. It did not find an equivalent universal RLS policy set for `employees`, `module_permissions`, `roles`, or most business tables. This is a repository fact, not proof that production lacks policies: deployed Supabase state is `UNVERIFIED`.

## 14. Control Panel–WMS Dependency Map

| Module | Control Panel setting | Backend check | Frontend behavior |
|---|---|---|---|
| WMS/tasks | `platform.wms` and child nodes; direct matrix; task roster capability; task permissions | `requireModuleView/Edit`, task permission functions, `isAdmin`, roster capability | Nav hides module; task actions hide/disable based on server props |
| Goals | Goals nodes; manager/admin scope; direct matrix | Goals access functions and action-specific checks | Goal pages/tabs filtered; imports use admin flags and page guards |
| Team Productivity | Productivity/team nodes; manager hierarchy | Team/dashboard scope functions | Employee/team selectors restricted by scope |
| Billing | Billing nodes; billing capabilities including entity delete | Billing-specific access and capability checks | Billing admin nav/pages/actions vary by permission |
| HR | HR/recruitment nodes; admin/manager/capability checks | HR actions use domain predicates | HR pages and fields hide based on admin/scope |
| Sales | Workspace/department and module nodes | Workspace predicates and feature actions | Workspace cards/navigation filtered |
| Accounts | Workspace and Accounts nodes, often super-admin/finance access | Finance access and module action checks | Accounts shown only to permitted users |
| Training | Training node, manager/admin checks | Training APIs check admin/manager in inspected routes | Upload/session controls vary by server flags |
| Employees | Employee/admin nodes | Employee Master/admin actions | User roster and edit controls gated |
| Monthly Event Master | Events/DCC nodes | Event master actions and module checks | Masters workbench pages hidden/redirected |
| Team Dashboard | Dashboard/team nodes, manager/admin | Mobile/web dashboard functions | Cards/filters show only scope-allowed data |
| Admin Panel | `admin.*` catalog nodes and `employees.isAdmin` | Admin layout plus per-action guards | Reduced roster-only navigation possible |

No single Control Panel row directly overrides payroll, device, attendance, or billing capabilities. The matrix is a ceiling/narrowing layer, not a grant source.

## 15. Upload Master Audit

`lib/templates/registry.ts` is the supported-template registry. It contains eight verified template keys:

| Template | Source/feature | Target/import path | Validation/handling | Permission/page |
|---|---|---|---|---|
| Tasks | Built-in `lib/templates/tasks.ts`; Tasks Bulk Upload | Tasks importer/actions | XLSX validation, required columns, employee name/email matching, duplicate/import handling in task importer | Tasks page; Upload Master replacement requires admin + node edit |
| Goals | Goals builder/resolver | Goals cascade importer and board levels | Level taken from board; one level-agnostic key | Goals import; same Upload Master node |
| Weekly Goals | `lib/templates/weekly-goals.ts` and `template-columns.ts` | Weekly goals importer | Header manifest shared with importer; columns documented in registry | Weekly Goals page |
| Monthly Goals | Goals resolver | Monthly board | Pre-scoped month | Goals page |
| Quarterly Goals | Goals resolver | Quarterly board | Pre-scoped quarter | Goals page |
| Yearly Goals | Goals resolver | Yearly board | Pre-scoped financial year | Goals page |
| Projects | `lib/templates/projects.ts` | Project Plan importer | Kind parameter selects project/milestone/result/action/sub-action structure | Projects page |
| Accounts Task List | `lib/templates/accounts-task-list.ts` | Accounts task-list importer | Two-sheet workbook | Accounts page |

Requested checks:

- Weekly, monthly, yearly, quarterly goals: verified.
- Tasks and Projects: verified.
- No separate “daily goals” or “yearly/quarterly task” template key verified.
- Training, HR, DCC, billing, and incentive upload APIs exist in places, but no corresponding Upload Master registry key was verified. They are separate upload features, not Upload Master entries.

Upload Master replaces a built-in file globally by key. It validates file extension/shape and registry key, writes `template_files`, uploads to storage, deletes old objects after commit, and audits settings events. It does not prove semantic compatibility between replacement workbook columns and importer beyond the shared built-in builder/column manifest. This is a medium integrity risk.

## 16. Source-of-Truth Audit

| Concept | Source 1 | Source 2 | Source 3 | Conflict? | Canonical-source observation |
|---|---|---|---|---|---|
| Function | `functions` | `employees.department` | `DEPARTMENTS` / `lib/org/functions.ts` constants | Yes | Migration 0234 makes `functions` live; legacy text/constants remain |
| Entity | `paying_entities` | `outstanding_entities` | HR hardcoded entity list, billing text `entityId`, Accounts lookup kinds | Yes | No single canonical entity across modules |
| Product | `products` | `outstanding_products` | `product_options`, allocation/goal constants | Yes, domain-dependent | Separate domains may be valid, but names overlap |
| Payment mode | `outstanding_payment_modes` | seed constants | Accounts-specific values | Yes | Outstanding table is canonical only for Outstanding |
| Employee type | `designations.employee_type` | employee worker/pay enums | legacy labels/constants | Yes | Designation classification and pay basis are different concepts but UI wording overlaps |
| Task status | `task_status` enum | `status_settings` | local doer/admin/goal arrays and Accounts `task_status` lookup | Intentional plus risk | Enum storage; status_settings display; local transitions are domain rules |
| Permissions | catalog keys | role permission rows | direct matrix and code capabilities | Yes, layered | Catalog defines route nodes; no universal grant/deny engine |
| Admin identity | `employees.is_admin` | `master_admin.manage` | code super-admin email/capability maps | Yes | Separate privileges, but users may assume one admin role |
| User identity | employee UUID | email | Firebase UID / employee code | Layered | UUID relational; email capability; Firebase auth; code display |
| Upload templates | code registry/builders | `template_files` overrides | importer column manifests | Potential | Replacement can be semantically incompatible |
| Billing seller entity | `paying_entities` | `billing_entity_profiles.entityId` text | `billingEntityProfiles.payingEntityId` FK | Yes | Profile FK offers linkage, but text key remains parallel |

## 17. Orphan and Legacy Audit

Verified or strongly evidenced candidates:

- `departments_backup` and the old `departments` naming are preserved as migration backup/legacy surface. Migration 0234 says it is not read or written after migration.
- `employees.department` remains a legacy free-text mirror written for compatibility.
- `shift_types` table exists, but a dedicated Admin Panel CRUD page was not found in route inventory. Consumer coverage is `UNVERIFIED`.
- `product_options` is intentionally separate from revenue `products`; it is not orphaned, but it is easy to misclassify as duplicate.
- `security_role_grants` is a second role-like system, distinct from reusable `roles`; runtime consumers are narrow but real.
- `module_backups` page/table is administrative backup/configuration, not a business master; actual restore behavior needs separate verification.
- Upload Master contains only registry keys. Existing upload APIs outside registry are not automatically orphaned.
- Permissions persisted under removed/renamed catalog keys are possible because node keys are text and no FK/catalog migration was found. Exact orphan rows are `UNVERIFIED`.
- Roles with zero members and permissions are surfaced by `memberCount`/`permissionCount`; actual zero-row roles depend on production data and are `UNVERIFIED`.
- UI routes with no callers and API routes with no callers require call-graph/runtime analysis; repository search alone cannot prove deadness.

## 18. Security and Integrity Findings

### HIGH

1. **Authorization is distributed across incompatible mechanisms.** Evidence: widespread `isAdmin` checks, code capability checks, role tables, direct module matrix, workspace/manager predicates, and delegated identity. A permission change in Control Panel cannot be assumed to control every module. Impact: inconsistent access and difficult auditability.

2. **Module-permission database read fails open.** Evidence: `lib/permissions/resolve.ts` catches DB errors and returns an empty override map. This preserves prior app access but ignores configured restrictions during a database/schema failure. Impact: availability wins over restriction; security expectation must be explicit.

3. **Most RLS coverage is not evidenced in repository.** Explicit RLS appears only for selected tables/migrations. If server credentials or a future client path exposes unguarded tables, application guards may be the only boundary. Production state is `UNVERIFIED`.

### MEDIUM

4. **Direct matrix and role permissions have different semantics.** Direct matrix narrows; role permissions appear additive. Effective Access displays both, but precedence/deny semantics are not universal. Impact: operator may expect a direct deny to override a role grant when runtime code never reads role rows or vice versa.

5. **Entity and product duplication can route records to different rosters.** Evidence: multiple tables/constants above, plus migration 0217 preserving Outstanding UUIDs separately. Impact: labels can match while IDs and historical behavior differ.

6. **Legacy employee department field creates identity ambiguity.** Evidence: `employees.department` and `departmentId`; migration 0234 keeps old column for compatibility. Impact: stale text can disagree with canonical function.

7. **Template replacement has semantic mismatch risk.** File shape is checked, but replacement is stored by registry key and served site-wide. Impact: valid XLSX can still disagree with importer columns.

8. **Persisted permission keys can outlive catalog keys.** Evidence: `nodeKey` is text, catalog keys are code-defined, and comments warn renaming revokes/orphans rows. Impact: inaccessible or ineffective grants after catalog changes.

### LOW / INFORMATIONAL

9. **Multiple month/year, priority, recurrence, Yes/No/NA, and person-picker implementations increase UI/data vocabulary drift.** Evidence: `_audit_scratch/part-a.md` and `part-c.md`. Some differences are intentional domain rules.

10. **RLS deployment state cannot be confirmed from migration files alone.** Migration presence is not proof that all scripts ran in current Supabase.

No verified critical authorization bypass was proven by static inspection alone. Do not classify UI/backend mismatches as bypass until action/API call paths are traced and tested.

## 19. Final Architecture Map

```text
AUTH PROVIDER / SESSION
        |
        v
employees.id (UUID) -- email -- firebase_uid -- employee_code
        |
        +-- is_active / is_admin / account_type
        +-- manager hierarchy / functions / designations / paying_entities
        +-- employee_roles -------- roles -------- role_permissions
        |                                      (catalog node, action, scope)
        +-- capability_grants / security_role_grants
        +-- module_permissions (show, view, edit narrowing)
        +-- delegated_access_grants (delegate acts as target temporarily)
        |
        v
PAGE NAVIGATION / WORKSPACE ACCESS / SERVER ACTIONS / API ROUTES
        |
        +-- WMS, Goals, HR, Attendance, Salary, Billing, Sales, Accounts,
        |   Training, DCC, Events, Employees, Dashboards
        |
        +-- RLS where selected migration policies exist

MASTER TABLES
        |
        +-- employees, functions, designations, shift_types, paying_entities
        +-- clients, subjects, status_settings, leave_categories, holidays
        +-- goal_lookups, project_nodes, incentive_catalog, DCC/event masters
        +-- products, outstanding_* masters, accounts_lookups
        +-- billing payment terms, SAC codes, profiles, customers, lookups
        +-- template registry + template_files
        |
        v
BUSINESS DATA
        |
        +-- FK-linked rows: salary, attendance, contracts, collections, billing
        +-- denormalized text: tasks.client, tasks.subject, legacy department
        +-- JSON/text labels: dynamic forms, historical submissions, some imports
        |
        v
REPORTS / SALARY / DASHBOARDS / EXPORTS / MOBILE API
```

## 20. Final Findings

### A. What is working correctly

- Admin and Control Panel routes are clearly separated in source.
- Master Admin layout and every inspected Master Admin action re-check the database-backed master-admin capability.
- Role mutations validate catalog node, action, and scope values before write.
- Temporary access has bounded expiry, revocation, token hashing, eligibility checks, and audit events.
- Upload Master validates registry keys and XLSX shape, uses storage indirection, and records replacement/delete events.
- Employee function migration preserves IDs and creates FK constraints to `functions`.
- Outstanding migration preserves historical UUID references during `IGV` to `IJV` rename.
- Permission catalog maps nodes to routes and central resolver provides server-side view/edit checks for callers that invoke it.

### B. What is inconsistent

- `isAdmin`, reusable roles, security roles, code capabilities, direct matrix, and hierarchy predicates overlap without one universal precedence model.
- Role permissions are shown in Effective Access, but module runtime adoption is not universal in inspected source.
- Functions/departments, entities, products, payment modes, status options, and employee identity use multiple sources.
- Legacy free-text fields coexist with canonical FK masters.
- RLS evidence is incomplete and deployed policy state is unknown.
- Many business options remain hardcoded beside editable masters.
- Upload registry, built-in templates, and importer manifests can drift semantically.

### C. What is unused/legacy

- `departments_backup` and post-0234 department naming are legacy.
- `employees.department` is a compatibility mirror.
- `shift_types` has no verified standalone admin route.
- Some security-role and module-permission infrastructure may have sparse runtime consumers; production row usage is unverified.
- Several old/admin pages and APIs cannot be called dead from static search alone; they need runtime telemetry or test coverage.

### D. What should be investigated next

- Decide whether Control Panel roles become runtime-authoritative or remain an administrative reporting layer.
- Define explicit precedence among `isAdmin`, roles, capabilities, direct denies, workspace rules, and temporary access.
- Verify deployed Supabase RLS for every Control Panel and master table.
- Query production for orphaned permission node keys, zero-member roles, inactive referenced masters, duplicate entity/product labels, and employee department mismatches.
- Trace every mutating server action/API route against its page node and `requireModuleEdit` call.
- Decide canonical boundaries for entity, product, function, employee type, payment mode, and status concepts.
- Add semantic template compatibility verification for Upload Master replacements.
- Confirm whether `shift_types`, training lookup tables, module backups, and security-role grants have active users and owners.

## Appendix: principal evidence locations

- Admin routes: `app/(admin)/admin/**/page.tsx`
- Admin gate: `app/(admin)/admin/layout.tsx`
- Control Panel routes: `app/(app)/control-panel/**`
- Role actions: `app/(app)/control-panel/roles/actions.ts`
- Temporary access actions: `app/(app)/control-panel/temporary-access/actions.ts`
- Master Admin: `app/master-admin/page.tsx`, `layout.tsx`, `actions.ts`
- Permission catalog: `lib/permissions/catalog.ts`
- Permission resolver: `lib/permissions/resolve.ts`
- Effective access query: `lib/queries/control-panel.ts`
- Delegation policy/session: `lib/auth/delegation-permission.ts`, `lib/auth/delegated-access.ts`, `lib/auth/delegated-expiry.ts`
- Capabilities: `lib/security/capabilities.ts`, `lib/security/capability-grants.ts`
- Schema: `db/schema.ts`
- Key migrations: `db/migrations/0217_masters_payment_modes_and_products.sql`, `0218_delegated_access.sql`, `0219_permission_matrix.sql`, `0225_employee_master.sql`, `0234_functions_replace_departments.sql`, `0238_security_role_grants.sql`, `0246_control_panel.sql`, `0251_control_panel_module.sql`
- Upload registry: `lib/templates/registry.ts`, `lib/templates/resolve.ts`, `app/(admin)/admin/upload-master/**`
- Existing dropdown census: `_audit_scratch/part-a.md`, `_audit_scratch/part-c.md`
