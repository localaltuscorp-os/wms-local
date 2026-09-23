# Incentive Applicability, Employee vs Intern, Internship and Probation Dates

**Date:** 22 September 2026
**Migration:** `db/migrations/0244_incentive_applicability_and_intern_type.sql` — **APPLIED 2026-09-22**
**SQL to hand to another database:** [`SQL/09-apply-incentive-applicability.sql`](./SQL/09-apply-incentive-applicability.sql),
verified by [`SQL/10-verify-incentive-applicability.sql`](./SQL/10-verify-incentive-applicability.sql)
**Written for:** anyone, including people who did not build this.

---

## Read this first

**The migration has been run** against the Supabase database this branch points
at, on 2026-09-22, through `pnpm db:migrate`. It is recorded in
`__schema_applied` and the five new columns are present. `/incentive`, the
Admin Panel's Incentive Master and the Employee Master read those columns and
now work.

**One statement in it changed who earns money.** It translated each existing
incentive's audience from the old tick-box model into the new one. The result on
the live database: **6 schemes ALL_EMPLOYEES, 14 SELECTED_EMPLOYEES**, and the
migration's design was that no scheme changes audience on the day it runs.

**`0244` also had to repair a year-old schema drift before it could apply.** It
is the first thing the file does, in SECTION 0. See
[the drift](#0-the-drift-0244-had-to-repair-first) below — it was a live
production bug with the Incentive Master screen down, not something this change
set introduced.

```bash
pnpm db:migrate:dry     # dry run: reports EVERY file pending by design, see the note in SQL/README.md
pnpm db:migrate         # applies what is genuinely outstanding, and says so
```

**One list needs a person, not a migration:** 13 active non-intern employees have
no Probation End Date, and the new rule requires one before their next save. They
are named in `SQL/10-verify-incentive-applicability.sql` query 9. This is the
intended "flag the legacy blanks" behaviour; it is HR work, not a fault.

---

## 0. The drift `0244` had to repair first

`0232_incentive_master.sql` defines `incentive_eligibility` with
`create table if not exists`. A different table of the same name — from
`0216_incentive_eligibility.sql`, since deleted from the tree — already existed
around a column called `incentive_id`. The `if not exists` therefore did nothing,
and the table kept the old shape: no foreign key, a bare unique index, and the
wrong column name for a year.

`db/schema.ts` and the application both name the column `catalog_id`, so every
read of that table failed:

```
Error [PostgresError]: column "catalog_id" does not exist
  severity_local: 'ERROR', code: '42703'
```

That took **the Incentive Master screen and incentive request submission** down.
The same failure class as the `0240` incident recorded in
[`SQL/README.md`](./SQL/README.md), with the same cause: a migration recorded as
applied whose objects were never created.

SECTION 0 of `0244` repairs it — rename `incentive_id` → `catalog_id`, add the
missing foreign key to `incentive_catalog`, replace the bare unique index with
0232's partial one (`where removed_effective_from is null`, so somebody removed
can be added again later), and set `NOT NULL`. The table held 0 rows, so the
repair moved a name, not data. Every statement is guarded, so a database built
from the migrations in order skips all of it.

---

## 1. What the Incentive Master's audience means now

Every incentive stores **how its audience is decided**, in one of three ways:

| Applies to | What it means |
|---|---|
| **All Employees** | Company-wide. What every new incentive defaults to. |
| **Function** | The functions picked from the Function master (Admin → Functions). |
| **Selected Employees** | The people listed on the incentive's Eligible employees tab, each from their own effective date. |

The old model was two tick boxes — "Sales eligible" and "Interns eligible" —
resolved against the employee's designation, with one hidden exception: if the
incentive had *ever* had a named employee, the named list quietly took over and
the tick boxes stopped applying. That exception is now a visible choice, so what
an admin sees is what decides.

**Nothing changed audience on its own.** The migration translates each existing
scheme so it reaches exactly the people it reached before, with two deliberate
consequences:

- A scheme whose only audience was **interns** now reaches **nobody**, because
  interns cannot earn incentives at all (§2). It was previously paying them.
- A scheme that reached **nobody** (neither box ticked) still reaches nobody,
  rather than becoming company-wide through the default.

The two old columns are still in the database and are still written into every
historical change record. Nothing reads them for a decision any more, and the
Admin Panel no longer offers them.

## 2. Interns cannot earn incentives

An intern cannot be eligible in **any** mode — not company-wide, not by
function, not even if somebody is named individually.

Intern status is a **fact on the designation**, not a word in its name:

- `designations.employee_type` — `employee` or `intern`. Set once per
  designation in **Admin → Designations**, and it applies to everybody holding
  it.
- `employees.employee_type` — an optional per-person override, on the Employee
  Master's "Employee Type" field. Left empty, the person follows their
  designation.

Until now the app decided this by matching `intern|trainee|apprentice` against
the designation's name at runtime. Migration 0244 performs that match **once**,
inside the migration, to mark the designations that already meant intern — and no
code reads a designation's name for this again. A rename can no longer change who
gets paid without anyone noticing.

Where this is enforced:

- **Requesting** — the shared server gate both the web form and the mobile API
  pass through refuses an intern's request outright, and refuses a request from
  anyone the scheme does not cover. The reason shown comes from the same rule the
  employee's own screen uses.
- **Eligibility lists** — interns are not offered in the employee picker used to
  name people, and are excluded from the notification audience.
- **Historical records are untouched.** Approved or paid incentives from an
  intern's past stay exactly as they are; the ledger, the approvals and the audit
  trail were not modified.

## 3. My Incentives

A new tab on the incentive module, second on the rail, for every employee.

- **Eligible** — what they can earn, what each one pays, and why they qualify
  (Company-wide, In your function, Selected employee).
- **Not available to you (N)** — closed by default, listing everything else with
  the reason: "Interns are not eligible", "Not your function", "Not on offer",
  "Not selected".

**The rate is read live from the Incentive Master.** There is no rate stored on
the employee and no rate written into the page. An admin changing an amount sees
it reflected on the employee's screen immediately; the only place a figure is
ever copied is a ledger entry for an incentive already earned, where it is a
historical fact rather than a price.

## 4. The two new incentive types

**Breakthrough Idea** and **Employment Referral** work like every other request
type: a form, a review, a rate configured in the Incentive Master.

- Breakthrough Idea asks for a title, a category, what the idea was, an optional
  link and notes.
- Employment Referral asks for the candidate's name, mobile, email, the position
  applied for, an optional résumé link and notes.

Neither has a default amount. The amount is the Incentive Master's, set by an
admin, exactly as the brief requires — a request starts as "amount not set"
rather than guessing.

## 5. Probation End Date is required

An employee who is not an intern cannot be saved without a **Probation End
Date** — on invite, on edit, and on bulk edit. The refusal message is "Set the
Probation End Date before saving this employee."

- **Existing records with no date are not invented.** They are shown as
  "Not set — required" in red, and the next save of that employee is refused
  until somebody fills it in. That is what "required" means here.
- **The column stays nullable in the database.** Two unrelated features read
  NULL as a real state — the paid-leave cycle ("no accrual before this date") and
  the HR confirmation reminder ("not scheduled yet"). Making the column
  non-null would have rewritten both.
- **The status is derived from the date, never stored.** A date in the future
  shows the date with an amber **On Probation** tag; a date in the past shows the
  date with a green **Completed** tag. The word "Completed" never replaces the
  date, because the date is the historical record an audit asks for.

## 6. Internship dates

An employee can carry an **Internship Start** date. The **Internship End** date
is computed by the database as start + 6 months — a generated column, so nothing
in the app, no script and no import can set a start and an end that disagree.
31 August + 6 months lands on 28/29 February, which is what "six months" means.

A new invite of an intern asks for the start date instead of a probation date.
There is no HR override for the end date today; if one is ever needed it must be
a separate column that wins when set, never a write to the generated one.

---

## Files, and what changed in each

### Database

| File | What |
|---|---|
| `db/migrations/0244_incentive_applicability_and_intern_type.sql` | **New.** Applicability column + CHECK, `incentive_function_scope` table, the two new request types in the type CHECK, `designations.employee_type`, `employees.employee_type`, `internship_start`, generated `internship_end`, and the audience backfill. |
| `db/schema.ts` | The same, declared for Drizzle. `incentive_requests.type` now takes its vocabulary from `INCENTIVE_TYPES` instead of an inline copy of the five old values. |
| `db/enums.ts` | `INCENTIVE_TYPES` gained `breakthrough_idea` and `employment_referral` (appended — the order is read by every type picker); new `INCENTIVE_APPLICABILITIES` and `EMPLOYEE_TYPES`. |

### The rule

| File | What |
|---|---|
| `lib/incentive/master.ts` | `resolveIncentiveEligibility` — the whole rule, in one function: on offer → current employee → not an intern → then the mode. `applicabilityOf` also reconstructs a pre-0244 change record's audience from its old flags, so old notifications still resolve. `resolveEligibility` folds a roster through it. |
| `lib/employees/employee-type.ts` | **New.** `resolveEmployeeType` (override → designation → employee) and `isIntern`. In the employees module because it is a fact about an employee; re-exported by the incentive rule so callers still import one module. |
| `lib/incentive/prepare-request.ts` | The request gate. Refuses an intern unconditionally, then refuses anybody the scheme does not cover. Both server entry points already pass through here, so the web form and the mobile API cannot answer differently. |
| `lib/incentive/notifications/eligibility.ts` | The audience for a change notice now goes through the same rule, and the snapshot carries `applicability` and `functionIds` so a scope change is reported as the audience change it is. |

### Admin

| File | What |
|---|---|
| `app/(admin)/admin/incentive-master/actions.ts` | Saves applicability and the function scope in the same transaction as the catalog row. Changing the audience needs the same capability as naming a person — otherwise it could be rewritten by editing the amount in the same payload. |
| `components/admin/incentive-master/workspace.tsx` | "Applies to" control, function multi-select with Select all / Deselect all, and the two dead tick boxes removed. |
| `components/admin/incentive-master/master-table.tsx` | An "Applies to" column and a filter over the three modes. |
| `app/(admin)/admin/designations/*`, `lib/outstanding/roster-actions.ts`, `lib/queries/outstanding-rosters.ts`, `components/admin/outstanding-roster-list.tsx` | The Intern flag, editable per designation. Opt-in, so the other five rosters render exactly as before. |

### Employee

| File | What |
|---|---|
| `components/incentive/my-incentives.tsx`, `lib/queries/my-incentives.ts` | **New.** The My Incentives tab and its query — four queries folded in memory, rate read from the catalog row. |
| `components/incentive/incentive-tabs.tsx`, `components/layout/main-nav.tsx` | The new tab, second on the rail. |
| `lib/employees/master-query.ts` | Carries the override, the designation's flag and the effective type; resolves the effective type once so no screen re-derives it. |
| `components/admin/employee-master/probation-cell.tsx` | **New.** The date plus its derived tag, in every state. |
| `components/admin/employee-master/{master-table,workspace}.tsx` | Probation cell, Employee Type field, internship dates. |
| `components/admin/invite-employee-dialog.tsx`, `app/(admin)/admin/employees/actions.ts`, `lib/validators/employee.ts` | Designation and type at invite, the required probation date (checked before the Firebase account is created, so a refused invite leaves nothing behind), and the internship start date. `ISO_DATE` now rejects a day that does not exist (31 Feb), not just a mis-shaped one. |

## Tests

New: `tests/unit/employee-type-and-internship.test.ts` (24),
`tests/unit/incentive-applicability-enforcement.test.ts` (14). Rewritten:
`tests/unit/incentive-master.test.ts` (70 → 83),
`tests/unit/incentive-notifications.test.ts`, plus the export column contract and
the rail-order test. **3697 pass, 0 fail from this change** — see the note below.

Five test files already failed on this machine before this work began
(`task-actions`, `done-on-time`, `global-search-provider`,
`device-exemption-login`, `delegated-access-authorization`); they are unrelated
and untouched.

## What was deliberately NOT done

- **The incentive TARGET system is untouched** — no targets, no target amounts,
  no target commitment, no 10% CTC rule. It is being redesigned separately.
- **The Android app was not updated.** It cannot file a request for the two new
  types. Its requests go through the same server gate, so it cannot file one it
  is not eligible for either.
- **No rate was hardcoded anywhere.** Not in the frontend, not in the employee
  records, not in the new forms.
