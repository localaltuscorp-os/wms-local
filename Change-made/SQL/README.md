# SQL — production database changes for the `Om` branch

**Read this before running anything.**

| File | What it is |
|---|---|
| [`01-apply-production.sql`](./01-apply-production.sql) | The SQL to run. Additive, idempotent, re-runnable. |
| [`02-verify-production.sql`](./02-verify-production.sql) | Read-only checks. Run before and after. |

---

## The short version

**On the database this branch points at, everything is already applied. Run only the verification.**

Checked live on 2026-09-17 against `aws-0-ap-south-1.pooler.supabase.com:6543` (the host in `.env.local`):

```
tables    all 15 required tables present
columns   all 26 checked columns present
index     incentive_entries_reversed_idx present
ledger    0240_incentive_entry_reversal.sql recorded in __schema_applied
functions 18 rows; 26 employees with a department_id; 0 orphaned links
claims    0 duplicate rows in incentive_notification_deliveries
```

So if production **is** that Supabase project, the only useful thing to run is [`02-verify-production.sql`](./02-verify-production.sql) — to confirm it rather than take this document's word for it.

If production is a **different** database, run [`01-apply-production.sql`](./01-apply-production.sql) first, then the verification.

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
