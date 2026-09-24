# SQL — production database changes for the `Om` branch

> **SUPERSEDED (merge, 2026-09-19). Do not run the files in this folder on production.**

## Latest: Employee ID standardization and Control Panel

Use [`19-apply-employee-id-and-control-panel.sql`](./19-apply-employee-id-and-control-panel.sql)
for the idempotent Control Panel permission-key transition and safe Employee
Code inventory. Run [`19-verify-employee-id-and-control-panel.sql`](./19-verify-employee-id-and-control-panel.sql)
afterwards. Employee Code allocation remains application-owned; do not generate
missing codes with raw SQL.
>
> Everything below was checked against `aws-0-ap-south-1`, which is **not** production
> (production is Supabase project `fjopgyqytfvbudkwhdto`, `aws-0-ap-northeast-1`), so
> "everything is already applied" does not hold there. And `0232` has changed since:
> it no longer creates its own `incentive_eligibility` (Rohan's 0216 table is kept).
>
> Use instead, in order, from the repository's `db/` folder:
> 1. `PREFLIGHT-OM-0225-0241.sql` — read-only; nothing may say STOP
> 2. `RUN-IN-SUPABASE-OM-0225-0241.sql` — the change, one transaction
> 3. `VERIFY-OM-0225-0241.sql` — read-only; every row PASS, HR count not lower
>
> Those were built from the merged migrations and tested on Postgres 18 against a
> production-shaped schema, including a column-by-column comparison with a database
> built from every migration in order.

**Read this before running anything.**

| File | What it is |
|---|---|
| [`01-apply-production.sql`](./01-apply-production.sql) | The SQL to run. Additive, idempotent, re-runnable. |
| [`02-verify-production.sql`](./02-verify-production.sql) | Read-only checks. Run before and after. |
| [`03-apply-upload-master.sql`](./03-apply-upload-master.sql) | The `template_files` table for the Upload Master. Additive, idempotent. |
| [`04-verify-upload-master.sql`](./04-verify-upload-master.sql) | Read-only checks for `template_files`. |
| [`05-apply-access-control.sql`](./05-apply-access-control.sql) | The `visibility_grants` table for Access Control — Task Visibility **and** Incentive Visibility. Renames the earlier `task_view_grants` in place if it exists. Additive, idempotent. |
| [`06-verify-access-control.sql`](./06-verify-access-control.sql) | Read-only checks for `visibility_grants` and the grants in force. |
| [`07-apply-incentive-product-master.sql`](./07-apply-incentive-product-master.sql) | Adds the three sold products the Product Master was missing (Key Note, 2-Day Workshop, Inhouse PS). Additive, idempotent. |
| [`08-verify-incentive-product-master.sql`](./08-verify-incentive-product-master.sql) | Read-only checks for the seven products and the shift master. |
| [`09-apply-incentive-applicability.sql`](./09-apply-incentive-applicability.sql) | **Applied to the branch's database on 2026-09-22.** Migration `0244`: repairs `incentive_eligibility` (the drift that was breaking the Incentive Master), adds the Incentive Master audience column and the two new request types, the `employee_type` flags, and the internship dates. Additive, idempotent. |
| [`10-verify-incentive-applicability.sql`](./10-verify-incentive-applicability.sql) | Read-only checks for `0244`, with the numbers read off the live database on 2026-09-22 beside each query. Includes the list of employees who now need a Probation End Date. |
| [`11-apply-global-logs.sql`](./11-apply-global-logs.sql) | **Applied to the branch's database on 2026-09-22.** Migration `0245`: the Global Logs tables (`daily_sessions`, `activity_logs`) plus the append-only trigger. Additive, idempotent. |
| [`12-verify-global-logs.sql`](./12-verify-global-logs.sql) | Read-only checks for `0245`, including the immutability proof (a commented-out `UPDATE` that must fail). |
| [`13-apply-control-panel.sql`](./13-apply-control-panel.sql) | **Applied to the branch's database on 2026-09-22.** Migration `0246`: the Roles template tables (`roles`, `role_permissions`, `employee_roles`) + the seeded "Super Admin" role. Additive, idempotent. |
| [`14-verify-control-panel.sql`](./14-verify-control-panel.sql) | Read-only checks for `0246`. |
| [`15-apply-training-learning.sql`](./15-apply-training-learning.sql) | **Applied 2026-09-23.** Migrations `0248` + `0249` + `0250`: the Training & Learning (LMS) schema — extended `tc_sessions`/`tc_session_attendees`/`tc_watch_progress`/`tc_self_learning`, the six new tables (`tc_training_surveys`, `tc_survey_questions`, `tc_survey_responses`, `tc_learning_targets`, `tc_share_schedule`, `tc_share_attendees`), the share → self-learning link columns, and the `tc_lookups` writable master-data table (seeded with 26 options). Additive, idempotent. |
| [`16-verify-training-learning.sql`](./16-verify-training-learning.sql) | Read-only checks for `0248`. Every query returns 0 rows on a correctly-applied database. |
| [`17-apply-control-panel-module.sql`](./17-apply-control-panel-module.sql) | **Applied to the branch's database on 2026-09-24.** Migration `0251`: moves the Control Panel's stored permission nodes from the old `admin.*` keys to the new top-level `control-panel.*` keys, in `module_permissions` **and** `role_permissions`. Data only — an `UPDATE`, no DDL, no DELETE — and idempotent. |
| [`18-verify-control-panel-module.sql`](./18-verify-control-panel-module.sql) | Read-only checks for `0251`: no rows left on the old keys, the ledger row, and a row count to compare against the pre-migration number. |

---

## `0250_incentive_target_period_type.sql` — APPLIED 2026-09-24

There is no copy of this file in this folder because it was written and applied
by another session. It adds `period_type` to `incentive_targets` so a quarterly
target can coexist with the monthly target anchored on the same first month, and
it is a **hard prerequisite**: the application code reads that column
(`lib/queries/incentive-analytics.ts`, `lib/incentive/analytics/model.ts`), so
`/incentive` fails at runtime without it.

Applied `2026-09-24T09:31Z` and verified independently:

```
column    period_type · text · NOT NULL · default 'month'
indexes   incentive_targets_name_period_type_uq, incentive_targets_pkey
          (the narrower incentive_targets_name_period_uq is gone, as intended)
rows      0 — the table is empty, so no row was re-tagged or lost
```

If you are applying this branch to **another** database, run the file from
`db/migrations/` directly — it is additive and idempotent. See doc 18 §6.

**NOTE ON NUMBERS:** there are now two `0250`s — this one and
`0250_training_lookups.sql` (applied 2026-09-23) — and `0251` is taken by
`0251_control_panel_module.sql`. The ledger keys on filename so nothing is
broken, but the numbers collide across two authors and ought to be renumbered
before this reaches `main`.

---

## The short version

**On the database this branch points at, everything is applied, and the migration
ledger `__schema_applied` records 286 files.** Run
[`10-verify-incentive-applicability.sql`](./10-verify-incentive-applicability.sql)
to confirm that rather than take this document's word for it, then
[`02-verify-production.sql`](./02-verify-production.sql).

Checked live on 2026-09-17 against `aws-0-ap-south-1.pooler.supabase.com:6543` (the host in `.env.local`):

```
tables    all 15 required tables present
columns   all 26 checked columns present
index     incentive_entries_reversed_idx present
ledger    0240_incentive_entry_reversal.sql recorded in __schema_applied
functions 18 rows; 26 employees with a department_id; 0 orphaned links
claims    0 duplicate rows in incentive_notification_deliveries
```

Checked again on 2026-09-22, after the remaining `0244` set was applied through
`pnpm db:migrate`:

```
tables    323 in public; 29 employees, 1026 tasks, 119 salary_runs untouched
pending   6 files were outstanding (0222, 0226, 0227, 0228, 0241, 0244); all applied
ledger    286 rows in __schema_applied
drift     incentive_eligibility had `incentive_id`, NOT `catalog_id` — see below
```

> Note on reading the ledger: the applier's DRY RUN reports every file as
> `pending`, because it short-circuits the "already applied?" lookup when it is
> not going to write (`isApplied = APPLY && await alreadyApplied(...)`). To see
> what is genuinely outstanding, either run `--apply` (it skips and says so), or
> diff `db/migrations/*.sql` against `select filename from __schema_applied`.

### The drift that `0244` had to repair first

`0232_incentive_master.sql` creates `incentive_eligibility` with
`create table if not exists`. A **different** table of the same name, from the
since-deleted `0216_incentive_eligibility.sql`, already existed around a column
called `incentive_id` — so the `if not exists` did nothing, and the table kept
the old shape for a year.

`db/schema.ts` and the application (`lib/queries/incentive-master.ts`,
`lib/incentive/prepare-request.ts`) both name the column `catalog_id`, so every
read of that table failed at runtime:

```
Error [PostgresError]: column "catalog_id" does not exist
  severity_local: 'ERROR', code: '42703'
```

That is the Incentive Master screen and incentive request submission, broken —
the same failure class as the `0240` incident described below, and it had the
same cause: a migration that was recorded as applied while its objects were
never actually created. SECTION 0 of `0244` repairs it (rename, foreign key,
partial unique index). The table held 0 rows, so nothing but a name moved.

So if production **is** that Supabase project, the only useful thing to run is
[`02-verify-production.sql`](./02-verify-production.sql) — to confirm it rather than take this document's word for it.

If production is a **different** database, run [`01-apply-production.sql`](./01-apply-production.sql) first, then the verification, then `09`.

---

## What actually had to change, and why

### The one real defect — `0240_incentive_entry_reversal.sql`

**This was a live production bug.** `db/schema.ts` declares three reversal columns on `incentive_entries`, so every Drizzle `select()` on that table expands to include them. The migration that creates them had never been applied, so every query on the table failed:

```
Error [PostgresError]: column "reversed" does not exist
  severity_local: 'ERROR', code: '42703'
```

That took the whole `/incentive` page down — the failure surfaced in a React error boundary, not as a failed action.

The fix is three `add column if not exists` statements and one `create index if not exists`, reproduced verbatim in SECTION A of the apply file. **It has been applied to the Supabase database and recorded in `__schema_applied`.**

### Everything else was already there

`0229` (split), `0230` (approval workflow), `0231` (notification tables), `0232` (incentive master columns) and `0234` (functions rename) are all present in the database and recorded in the ledger. Nothing in this push requires a new table, a new column or a new index beyond `0240`.

**This change set adds no schema.** The Accounts ledger, the Billing scope, the breakup-letter mail and the dashboard work all read tables that already exist.

---

## The one thing that is genuinely missing (and harmless)

`incentive_requests` has **14** columns; `lib/ensure-incentive-schema.ts` lists **nine more** — `amount`, `paid`, `paid_amt`, `paid_date`, `conditions`, `label`, `source`, `source_ref`, `archived` — introduced by migration `0060`, which **is** recorded as applied.

This is the documented "the ledger can lie" case that `scripts/apply-one-migration.ts` describes in its own header: a database restored from a backup inherits the **source** database's `__schema_applied` history and can claim migrations that never ran against it. The same thing happened to `employees.performance_criteria` and `employees.kra` in this project's history.

**It breaks nothing today.** Every Drizzle query against `incentive_requests` selects an explicit column list, and no code path reads or writes those nine fields — verified by searching for each as a field access. They are in SECTION B of the apply file as an **optional** block, because the moment an INSERT touches one of them it fails on the first missing column, and adding them costs nothing.

---

## How to run

### Supabase Dashboard

1. SQL Editor → New query.
2. Paste `01-apply-production.sql` (or just SECTION A if you want the minimum change).
3. Run. Every statement is `if not exists`; a second run changes nothing.
4. Paste `02-verify-production.sql` → Run → confirm every "EXPECT" comment.

### psql

```bash
psql "$DATABASE_URL" -f Change-made/SQL/01-apply-production.sql
psql "$DATABASE_URL" -f Change-made/SQL/02-verify-production.sql
```

---

## Do NOT use the bulk migration runner

`pnpm db:migrate` runs `scripts/apply-all-migrations.ts`, whose **own header** warns:

> that bulk applier's ledger backfill only stamps up to 0028, so on a populated prod DB it re-attempts migrations 0029–0104.

Its dry run currently reports **37 migrations pending** — including `0229`, `0230`, `0231`, `0232` and `0234`, every one of which is already applied and already recorded in `__schema_applied`. The two ledgers disagree. Running that script against a live database on the strength of its dry run is the mistake its header was written to prevent.

For a single known migration, use the targeted applier instead:

```bash
npx tsx --env-file=.env.local scripts/apply-one-migration.ts \
  db/migrations/0240_incentive_entry_reversal.sql          # dry run, prints the SQL
npx tsx --env-file=.env.local scripts/apply-one-migration.ts \
  db/migrations/0240_incentive_entry_reversal.sql --apply  # apply
```

---

## SECTION C — do not run blindly

`0234_functions_replace_departments.sql` is the **only** statement in this push that moves identity data. It copies `departments` into `functions`, re-points `employees.department_id`, and **NULLs any `department_id` with no counterpart in `functions`**.

It is already applied on the Supabase database — `functions` holds 18 rows, 26 employees carry a `department_id`, and **zero** of them point at a non-function, so step 3 has nothing to null. It is reproduced (commented out) in the apply file as a record, not as a task.

**Before running it anywhere else**, run SECTION 5 of the verification file. Query 5b is the one that matters: every row it returns is an employee whose department link would be silently cleared. Query 5c counts employees pointing at a department that has not been carried across yet.

Take a backup first.

---

## Order, if you are applying to a fresh database

1. `02-verify-production.sql` — record the starting state.
2. `01-apply-production.sql` SECTION A — the reversal columns. **Required.**
3. `01-apply-production.sql` SECTION B — the nine request columns. Optional.
4. `01-apply-production.sql` SECTION C — the functions rename. **Only after** queries 5b and 5c come back clean.
5. `02-verify-production.sql` again — confirm sections 1 and 2 now report zero rows.

---

## Rolling back

Everything here is reversible, and none of it needs to be:

- **SECTION A** — `drop index if exists incentive_entries_reversed_idx;` then `alter table incentive_entries drop column if exists reversed, drop column if exists reversed_at, drop column if exists reversed_by_id;`. **Do not do this while the reversal feature is in use** — the columns are what make the reversal idempotent, and dropping `reversed` re-creates the original bug.
- **SECTION B** — `alter table incentive_requests drop column if exists <name>;` for each. Safe; nothing reads them.
- **SECTION C** — not cleanly reversible. It nulls `department_id` links that have no counterpart. Back up `employees.department_id` before running it, and restore from that.

No statement in this folder deletes a row.
