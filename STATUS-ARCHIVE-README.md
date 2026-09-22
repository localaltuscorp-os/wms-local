# STATUS-ARCHIVE SQL — the six migrations BILLING-SQL-TO-RUN.sql does not cover

Compiled 2026-09-21, branch `Shreya`. Companion to `BILLING-SQL-TO-RUN.sql`,
which covers the other 8 of this branch's 14 migrations.

The three files carry **no `--` comments**: the Supabase SQL editor pre-parses
the text and misreads an apostrophe inside a comment as an opening quote, which
makes it fail with errors naming tables the query never mentions. Every
explanation lives here instead.

## Run order

| # | File | Why it is separate |
|---|------|--------------------|
| 1 | `STATUS-ARCHIVE-1-ENUMS.sql` | Postgres will not let a new enum value be used in the transaction that adds it. File 2 uses both values, so this has to commit first, on its own. |
| 2 | `STATUS-ARCHIVE-2-APPLY.sql` | The 20 columns, 8 indexes and 3 data repairs, in migration order, inside one `BEGIN; … COMMIT;`. |
| 3 | `STATUS-ARCHIVE-3-VERIFY.sql` | Read-only. One result set, 37 rows, `PASS`/`FAIL` per object. |

## What file 2 contains, in order

| Migration | Contribution |
|-----------|--------------|
| `0215_goal_archive` | `goals.archived_at`, `weekly_goals.archived_at` + 2 partial indexes |
| `0225_doer_initiator_status` | `approval_status` / `approval_by_id` / `approval_at` on `goals` and `weekly_goals`; `approval_by_id` / `approval_at` on `tasks` and `project_nodes`; 2 indexes; **and the data move** that takes `on_hold` off the doer axis |
| `0226_result_is_not_a_task` | Archives tasks linked to a `kind='result'` plan node |
| `0227_plan_task_client_repair` | Recomputes a plan task's client from its project |
| `0228_plan_task_client_repair_again` | The same repair, re-applied (see note below) |
| `0230_daily_checklist_initiator_status` | 4 columns on `daily_checklist` + 2 indexes |
| `0231_billing_pms_archive` | **PMS half only** — `pms_monthly_review.archived` / `.archived_at` + index. The billing half is already in `BILLING-SQL-TO-RUN.sql` and is deliberately not repeated. |
| `0232_team_performance_archive` | `employees.performance_archived` / `.performance_archived_at` + index |

## Two things worth knowing

**The 0225 data move is included, and was not on the request list.** The request
named 0225 only for its columns. But the migration also moves every row whose
doer status is `on_hold` onto the initiator axis (`approval_status = 'on_hold'`,
`status = 'initiated'`), across `tasks`, `goals`, `weekly_goals` and
`project_nodes`. Without it the columns exist and no row uses them, and the app's
status pickers keep offering a retired doer value. It is the reason file 1 has to
run first. Leave it out only deliberately.

**0228 is byte-identical to 0227.** It existed because migrations run once by
filename and the repair had to sweep again after a later code fix. Run inside
one transaction directly after 0227, it is a guaranteed no-op. It is kept for
fidelity with the branch, not because it does work.

## Why the repairs need their own verify rows

`0226`, `0227` and `0228` create nothing, so no structural check can tell whether
they ran. File 3 therefore ends with 7 data rows that read the repaired state
directly — no `on_hold` left on any doer axis, no live task on a Result node, no
plan task whose client disagrees with its project, no stale client on a branch
that names none. Each prints its remaining row count, so a `FAIL` says how many.

## How this was checked

Applied to a throwaway PGlite database (real PostgreSQL, in-process — the same
engine `pnpm dummy:setup` uses), built by running all 285 other migrations and
holding back exactly these 8. Nothing was run against any Supabase project.

- File 2 applies clean; a second run applies clean and leaves every row byte-identical.
- Verify goes 35 FAIL → 0 FAIL of 37 rows across the apply.
- Seeded with deliberately-wrong rows, the repairs did the right thing: a Result's
  task archived, a held task moved to the initiator axis, an action filed under
  `"Install readers"` re-filed under its project's client `Acme Ltd`, a
  `"thesdrv"` client on a clientless branch cleared to NULL, and a non-plan task
  left untouched.
- `project_nodes_status_check` (migration 0204, `NOT VALID`) forbids
  `status = 'on_hold'` on new and updated rows but never scanned the existing
  table, so a legacy row can still hold it. The 0225 move writes `'initiated'`,
  which the constraint allows — verified against the constraint in place.
