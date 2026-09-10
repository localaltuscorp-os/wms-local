# HANDOFF — `Om` branch

**Date:** 2026-09-10
**Branch:** `Om` → `https://github.com/localaltuscorp-os/wms-local`
**Audience:** whoever picks this up next, and the Supabase owner who has to run the SQL.

This branch carries a day of feature work plus **five new migrations that nobody has run
yet**. Read the SQL section before deploying, because the app code assumes tables that do
not exist in Supabase today.

---

## 1. Run this SQL in Supabase — the short version

**Nothing here is destructive.** All five migrations are additive (`CREATE TABLE IF NOT
EXISTS`, `CREATE INDEX IF NOT EXISTS`, additive `ALTER TABLE`). There are zero `DROP TABLE`,
`TRUNCATE` or `DELETE FROM` statements, so the runner's destructive guard will not fire and
no existing row is at risk.

**Prerequisite:** `DATABASE_URL` set in `.env.local`, pointing at the Supabase Postgres
connection string (session pooler or direct — not the transaction pooler; DDL needs
transactions).

```bash
# 1. VALIDATE FIRST. Runs 0217-0220 against the real schema inside a transaction,
#    then ROLLS BACK. Changes nothing. A broken migration fails here, loudly.
npx tsx --env-file=.env.local scripts/validate-migrations-0217-0220.ts

# 2. APPLY. Only these four files, in order.
npx tsx --env-file=.env.local scripts/apply-migrations-0217-0220.ts
```

### ⚠️ `0216` is NOT covered by those scripts

`scripts/apply-migrations-0217-0220.ts` hard-codes only `0217`–`0220`. Migration
`0216_module_submission_attachments.sql` is asserted by a unit test but has **no apply
script**. Run it by hand:

```bash
psql "$DATABASE_URL" -f db/migrations/0216_module_submission_attachments.sql
```

Do `0216` **before** `0217`–`0220` to keep filename order.

---

## 2. The five migrations, by file

| # | File | Creates | Why |
|---|------|---------|-----|
| 0216 | `db/migrations/0216_module_submission_attachments.sql` | `module_submission_attachments` + index | Reimbursement receipts become files the firm holds, replacing the free-text `bill_url` Drive link that silently 404s at audit time |
| 0217 | `db/migrations/0217_masters_payment_modes_and_products.sql` | `ALTER TABLE outstanding_products` (adds product code) | Master data: payment modes (IGV → IJV + new accounts) and a real product code. Tables already exist since 0055 — nothing new is created |
| 0218 | `db/migrations/0218_delegated_access.sql` | `delegated_access_grants`, `delegated_access_events` + 6 indexes | Temporary delegated access. No credential is stored; the employee's Firebase account and password are untouched |
| 0219 | `db/migrations/0219_permission_matrix.sql` | `module_permissions`, `module_permission_events` + 4 indexes | Permission matrix: module → sub-module → sub-sub-module with SHOW/VIEW/EDIT. Only the *grants* live in the DB; the tree is code in `lib/permissions/catalog.ts` |
| 0220 | `db/migrations/0220_manager_hierarchy_history.sql` | `employee_manager_history` + 2 indexes | Reporting-manager history. `employees.manager_id` stays canonical and is untouched |

---

## 3. Why not just `npm run db:migrate`

You can, but understand what it does first. There are **239 `.sql` files** in
`db/migrations/`, and the drizzle journal (`db/migrations/meta/_journal.json`) is stale —
its last entry is `0019`. Everything from `0020` on is applied by
`scripts/apply-all-migrations.ts` against its own by-filename ledger.

So on a database whose ledger has not been backfilled, `db:migrate` will try to apply **two
dozen-plus older pending migrations that have nothing to do with this work**. That is
precisely why the targeted `0217-0220` scripts exist.

```bash
npm run db:migrate:dry   # list what is pending — ALWAYS run this first
npm run db:migrate       # apply everything pending
```

Use the targeted scripts for this handoff. Use `db:migrate` only when you actually intend
to bring the whole schema forward.

---

## 4. Verify it worked

```bash
# tables exist
psql "$DATABASE_URL" -c "\dt module_permissions|delegated_access_grants|employee_manager_history|module_submission_attachments"

# the unit tests covering this work
npx vitest run tests/unit/master-data.test.ts \
  tests/unit/permission-catalog.test.ts tests/unit/permission-effective.test.ts \
  tests/unit/delegated-access-authorization.test.ts tests/unit/delegated-expiry.test.ts \
  tests/unit/manager-hierarchy.test.ts \
  tests/unit/reimbursement-attachments.test.ts \
  tests/unit/reimbursement-attachments-migration.test.ts
```

---

## 5. What shipped on this branch

- **master-admin** module — `app/master-admin/`
- **Permission matrix** — `lib/permissions/{catalog,effective,resolve}.ts`, `components/admin/permission-matrix.tsx`
- **Delegated access** — `lib/auth/delegated-{access,expiry,permission}.ts`, `components/auth/delegation-banner.tsx`
- **Manager hierarchy** — `lib/employees/manager-history.ts`, `lib/queries/hierarchy.ts`, `components/admin/hierarchy-board.tsx`
- **Product / payment-mode masters** — `lib/products/label.ts`, `lib/queries/products.ts`, `components/admin/product-master-list.tsx`
- **Reimbursement attachments** — `lib/reimbursements/attachment-{rows,rules}.ts`, `components/reimbursements/rb-claim-attachments.tsx`
- **Daily salary report + salary refresh** — `lib/salary/{day-ledger,refresh-run}.ts`, `components/salary/daily-salary-report.tsx`
- **Incentive catalog exports** — `lib/exports/incentive-catalog{,-pdf,-xlsx}.ts`
- ~20 new unit tests, including `tests/unit/no-merge-conflicts.test.ts`

---

## 6. Decisions made during the merge — please sanity-check

Three conflicts were resolved in favour of `Om` (`HEAD`) when merging `origin/Om`. Two are
mechanical; **the third is a product-behaviour decision and deserves a second pair of eyes.**

1. **`app/globals.css`** — kept the two closing braces on the
   `@media (prefers-reduced-motion: reduce)` block. The other side left it unclosed, which
   is the exact Vercel build break that main fixed in `ea0a8bf`.
2. **`vercel.json`** — kept `"29 18 * * *"` for `/api/cron/attendance-autoout`
   (the other side had `"0 18 * * *"`). This matches the earlier resolution against main.
3. **`lib/attendance/mobile-devices.ts` — ⚠️ REAL BEHAVIOUR FORK.** The two branches
   implemented opposite flows:
   - **Kept (this branch):** admin approval was removed 2026-09-09; a registered device is
     `approved` immediately and usable at once, capped per kind by `0214`/`0215`.
     `"pending"` is retired; over-cap registration returns `device_limit`.
   - **Discarded (`origin/Om`):** devices enrol as `pending` and wait for HR approval.

   The whole file was taken from this branch, because a partial merge left the comment
   claiming approval was removed while the code still wrote `pending` — incoherent either
   way. **If HR is still meant to approve devices, this needs reverting.**

---

## 7. Known issue: duplicate migration prefixes

These share a numeric prefix:

- `0212_employee_offboarding.sql`, `0212_goals_client.sql`, `0212_project_node_attachments.sql`
- `0213_dont_know_label_not_read.sql`, `0213_project_node_intake.sql`
- `0214_project_node_links.sql`, `0214_two_approved_devices_any_kind.sql`

The runner orders by filename, so ordering is deterministic but alphabetical within a
prefix. None of them depend on each other today. Worth renumbering before the next batch.
