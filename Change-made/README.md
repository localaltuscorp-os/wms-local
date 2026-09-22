# Change-made — `Om` branch working set

**Branch:** `Om` · **Repo:** `https://github.com/localaltuscorp-os/wms-local`
**Audience:** an engineer or a terminal Claude picking this up cold, and whoever runs the SQL against production.
**Last updated:** 2026-09-17

---

## What this folder is

A complete, self-contained record of the changes on the `Om` branch that are **not yet on `main`**. It exists so that a fresh session can understand every change in detail — what it does, which files carry it, how it was verified, and what could go wrong — without re-deriving any of it from the diff.

It also carries the **SQL to run against the production database**, in [`SQL/`](./SQL/README.md).

## How to read it

| Order | File | Covers |
|---|---|---|
| 1 | [`01-error-fixes.md`](./01-error-fixes.md) | The two console/runtime errors fixed on the Incentive page |
| 2 | [`02-accounts-incentive-payments.md`](./02-accounts-incentive-payments.md) | Incentive payable ledger inside Accounts, above Reimbursement |
| 3 | [`03-billing-team-user-scope.md`](./03-billing-team-user-scope.md) | Team / User scoping for the Billing area |
| 4 | [`04-incentive-breakup-letter.md`](./04-incentive-breakup-letter.md) | Breakup letter mailed on the payment edge + employee entry point |
| 5 | [`05-dashboard-presentation.md`](./05-dashboard-presentation.md) | Dashboard summary bar and status KPI cards |
| 6 | [`06-prior-session-incentive-module.md`](./06-prior-session-incentive-module.md) | The Incentive module rework already in the working tree (reversal, weekly report, Incentive Master, Entries paid-notice, functions rename) |
| 7 | [`07-files-changed.md`](./07-files-changed.md) | Full file inventory, tracked and untracked |
| 8 | [`08-upload-master.md`](./08-upload-master.md) | Upload Master — admin management of the bulk-import template files (Tasks, Goals, Accounts) |
| — | [`SQL/`](./SQL/README.md) | Production SQL: what to run, in what order, and how to verify it |

Read `07-files-changed.md` last if you are reviewing; read it first if you are about to execute the SQL.

## The one thing to know before anything else

**The production database already has every object these changes need, except one migration that has since been applied.**

A live check against the Supabase database (`aws-0-ap-south-1.pooler.supabase.com`, the one `.env.local` points at) confirmed:

- all 15 tables the Incentive/Accounts work touches exist,
- all 26 columns checked exist,
- `0240_incentive_entry_reversal.sql` is present in `__schema_applied` with its index `incentive_entries_reversed_idx`.

So if production **is** that Supabase project, the SQL has already run and only the verification block in [`SQL/02-verify-production.sql`](./SQL/02-verify-production.sql) is worth executing, to confirm. If production is a **different** database, run [`SQL/01-apply-production.sql`](./SQL/01-apply-production.sql) — it is additive and idempotent.

See [`SQL/README.md`](./SQL/README.md) for the exact reasoning and the one genuine defect found.

## State of the branch

- Nothing is committed on top of `639e165` (`Merge branch 'main' … into Om`) — every change below is working-tree only, until the accompanying commit.
- `origin/Om` is at the same commit, so the first push needs `git push -u origin Om`.
- Deploy is gated by `scripts/assert-main-branch.mjs`, which refuses unless `HEAD` is `main`. **Pushing `Om` does not deploy.** Shipping requires a merge into `main`.

## Verification performed

```
npx tsc --noEmit                       exit 0
incentive + accounts test files        17 files, 514 tests passed
full unit suite                        3528 tests: 3520 passed, 7 failed, 1 skipped
```

The 7 failures are pre-existing and unrelated (see [`07-files-changed.md`](./07-files-changed.md#known-failing-tests-not-caused-by-this-work)).
