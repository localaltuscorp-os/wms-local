# Change-made — `Om` branch working set

**Branch:** `Om` · **Repo:** `https://github.com/localaltuscorp-os/wms-local`
**Audience:** an engineer or a terminal Claude picking this up cold, and whoever runs the SQL against production.
**Last updated:** 2026-09-24

---

## What this folder is

A complete, self-contained record of the changes on the `Om` branch that are **not yet on `main`**. It exists so that a fresh session can understand every change in detail — what it does, which files carry it, how it was verified, and what could go wrong — without re-deriving any of it from the diff.

It also carries the **SQL to run against the production database**, in [`SQL/`](./SQL/README.md) — one `-apply` and one `-verify` file per change set that needed schema, both in plain `.sql` so they can be pasted into the Supabase SQL editor or run with `psql`.

**Which changes carry SQL:** anything that adds a table, a column, an index or a
constraint. Everything else is code only, and its document says so under
`Migration: none`. As of 2026-09-22 every migration on this branch has been
applied to the branch's database, and `SQL/` exists for other databases.

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
| 9 | [`09-upload-master-registry-and-task-visibility.md`](./09-upload-master-registry-and-task-visibility.md) | Upload Master as the single template source (8 templates, one download door) + hierarchy-scoped WMS task visibility with Access Control grants |
| 10 | [`10-incentive-module-complete.md`](./10-incentive-module-complete.md) | The Incentive module end to end: Sales Pitch (products, shifts, CTC), visibility without an admin bypass, the "Negative Payable Adjustment" rename, the slip's incentive and reimbursement lines, the ledger gap for hand-recorded payments, and ranking by percentage |
| 11 | [`11-three-page-salary-slip.md`](./11-three-page-salary-slip.md) | The employee salary slip rebuilt as exactly three pages (slip · attendance · incentive statement), with VIEW dropdowns backed by PDF layers and no figure calculated in the PDF layer |
| 12 | [`12-incentive-applicability-intern-employee-type.md`](./12-incentive-applicability-intern-employee-type.md) | **Migration `0244`, applied 2026-09-22.** Incentive applicability (All Employees / Function / Selected Employees), interns barred from incentives via a Designation flag, the two new request types, My Incentives, and required Probation End + computed Internship End dates. Its SECTION 0 also repairs a year-old `incentive_eligibility` drift that was breaking the Incentive Master at runtime |
| 13 | [`13-salary-statement-and-pdf-redesign.md`](./13-salary-statement-and-pdf-redesign.md) | **No migration.** The salary statement as a web page (week options generated from the ledger, one empty state) and the PDF rebuilt as exactly three fixed pages with no layers, no form fields and no JavaScript |
| 14 | [`14-global-logs-system.md`](./14-global-logs-system.md) | **Migration `0245`, applied 2026-09-22.** Admin Panel → Logs: an immutable append-only activity log + per-employee daily sessions, a client tracker (IndexedDB → batched HTTP), midnight finalization, a filterable admin UI and server-side Excel export |
| 15 | [`15-control-panel.md`](./15-control-panel.md) | **Migration `0246`, applied 2026-09-22.** Admin Panel → Control Panel (Users / Roles / Permissions / Effective Access / Temporary Access), Temporary Access relocated (reused), a Roles template layer over the existing permission matrix, and Salary Profile renamed to Salary Breakup |
| 16 | [`16-training-learning-module.md`](./16-training-learning-module.md) | **Migrations `0248` + `0249` + `0250`, applied 2026-09-23.** Training & Learning (LMS) built by extending the Training Centre: scheduling/audience/recurrence/lifecycle, self check-in + per-second recording progress, anonymous per-training surveys, per-role learning targets with history, daily learning-share rotation, role-aware dashboard, target-vs-actual, analytics, month/week/day calendar grids, and writable master data |
| 17 | [`17-control-panel-module.md`](./17-control-panel-module.md) | **Migration `0251`, applied 2026-09-24.** Control Panel out of the Admin Panel and into a module of its own at `/control-panel`, visible only to people the permission matrix lets in — and absent everywhere, not greyed out, for everybody else. Same five screens, same write paths, same tables; node keys moved with the screens and the stored grants moved with the keys. Supersedes part of doc 15 |
| 18 | [`18-incentive-dashboard-redesign.md`](./18-incentive-dashboard-redesign.md) | **Migration `0250_incentive_target_period_type.sql` — applied 2026-09-24** (another session's file; verified here). Built by TWO sessions in one working tree: this document covers the employee viewer, the dynamic `Incentive \| [Employee]` title, the Specific Year period, the Target-vs-Actual visuals and the table-header layout, plus the repair of the other session's abandoned mid-edit (21 type errors and an unguarded route handler) and a `me`-vs-subject bug the audit uncovered. The period controls, KPI band and Manan-only Edit/Delete are the other session's. **Read §0 and §6 before touching this module** |
| — | [`SQL/`](./SQL/README.md) | Production SQL: what to run, in what order, and how to verify it |

Read `07-files-changed.md` last if you are reviewing; read it first if you are about to execute the SQL.

**Read-only audits** (no code changed) live at the repo root beside this folder, not in it: `DROPDOWN_MASTER_AUDIT.md` (every dropdown/picker, 630 web + Android + backend enums), `Incentive-Implementation-Audit.md`, `Incentive-UI-UX-Audit.md`, `Incentive-UI-UX-Findings.md`.

## The one thing to know before anything else

**The production database already has every object these changes need, except one migration that has since been applied.**

A live check against the Supabase database (`aws-0-ap-south-1.pooler.supabase.com`, the one `.env.local` points at) confirmed:

- all 15 tables the Incentive/Accounts work touches exist,
- all 26 columns checked exist,
- `0240_incentive_entry_reversal.sql` is present in `__schema_applied` with its index `incentive_entries_reversed_idx`.

So if production **is** that Supabase project, the SQL has already run and only the verification block in [`SQL/02-verify-production.sql`](./SQL/02-verify-production.sql) is worth executing, to confirm. If production is a **different** database, run [`SQL/01-apply-production.sql`](./SQL/01-apply-production.sql) — it is additive and idempotent.

See [`SQL/README.md`](./SQL/README.md) for the exact reasoning and the one genuine defect found.

## State of the branch

- Everything on `Om` is committed and pushed to `origin/Om` (latest `82758dd`, pushed 2026-09-22) — the change sets below are no longer working-tree only.
- Deploy is gated by `scripts/assert-main-branch.mjs`, which refuses unless `HEAD` is `main`. **Pushing `Om` does not deploy.** Shipping requires a merge into `main`.

## Verification performed

```
npx tsc --noEmit                       exit 0
incentive + accounts test files        17 files, 514 tests passed
full unit suite                        3528 tests: 3520 passed, 7 failed, 1 skipped
```

The 7 failures are pre-existing and unrelated (see [`07-files-changed.md`](./07-files-changed.md#known-failing-tests-not-caused-by-this-work)).

## Latest change set: Employee ID standardization and Control Panel completion

See [`19-employee-id-standardization-and-control-panel.md`](./19-employee-id-standardization-and-control-panel.md).
The SQL runbook is [`SQL/19-apply-employee-id-and-control-panel.sql`](./SQL/19-apply-employee-id-and-control-panel.sql),
with read-only checks in [`SQL/19-verify-employee-id-and-control-panel.sql`](./SQL/19-verify-employee-id-and-control-panel.sql).

## Latest change set: Control Panel simplification and Role UI

See [`22-control-panel-simplification-and-role-ui.md`](./22-control-panel-simplification-and-role-ui.md).
There is no apply SQL because this change set creates, modifies, and deletes no
database objects or rows. Use read-only
[`SQL/20-verify-control-panel-simplification.sql`](./SQL/20-verify-control-panel-simplification.sql)
to inventory existing role and permission data.
