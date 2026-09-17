# Handoff: production database work for the `Om` branch

**For:** the Claude session that is connected to the production database.
**From:** local Claude session working in the `wms-local-main` checkout, branch `Om`.
**Date:** 17 September 2026.
**Source of truth for the issues below:** merge review memo "Merging Om's branch" by Mohit (shared artifact `3xzy6CKYBHyV7PYTdETTMc`). Facts from that memo were re-verified against this checkout where possible; verified items are marked.

---

## 1. Environment facts

| Item | Value |
| --- | --- |
| Production database | Supabase project `fjopgyqytfvbudkwhdto`, region `aws-0-ap-northeast-1` |
| Database previously (incorrectly) used for validation | a database on `aws-0-ap-south-1` — **not** production |
| Branch under review | `Om` at `43ae5d96`, cut from `ae58385` (12 Sep) — branch name confirmed locally |
| Merge target | `main` at `8217fcb8`, which already contains Vinal's and Rakesh's work |
| Migrations owned by this branch | `0225`–`0234` and `0240` under `db/migrations/` |
| Existing production SQL bundle | `Change-made/SQL/01-apply-production.sql`, `02-verify-production.sql`, `README.md` |

`Change-made/SQL/README.md` currently claims everything is already applied. That claim is about the `aws-0-ap-south-1` database, not production. Treat the README as wrong until you have re-checked it against `fjopgyqytfvbudkwhdto` and corrected it.

---

## 2. Ground rules

1. **Read before write.** Start every task with read-only queries against production. Do not run DDL or DML on production until the audit in section 3 is complete and a human has approved the resulting plan.
2. **Get explicit approval for each write.** Post the exact SQL you intend to run, the affected table and the expected row counts, and wait for a human to say yes. This applies to every `CREATE`, `ALTER`, `DROP`, `INSERT`, `UPDATE` and `DELETE`.
3. **Never `DROP` anything on production in this task.** Nothing in this handoff requires dropping a table, a column or an index. If your plan needs a drop, stop and raise it instead.
4. **Wrap applies in a transaction.** Use `BEGIN; ... COMMIT;` so a failed statement leaves nothing half-applied, and keep each migration's statements in one transaction where Postgres allows it.
5. **Confirm a backup or point-in-time recovery window exists before the first write**, and say in your report which one you confirmed.
6. Report what actually happened, including failures and skipped steps. Do not report a step as done unless you ran it and saw the result.

---

## 3. Task A — audit production against `db/schema.ts` (read-only)

The memo reports that a column-by-column comparison of production against this branch's `db/schema.ts` found:

- **9** tables in the schema missing from production, including `functions` and `shift_types`;
- **41** columns in the schema missing from production, including the `reversed` columns added by `0240_incentive_entry_reversal.sql`;
- **0** of this branch's migrations recorded in production's migration ledger.

Reproduce that comparison yourself and produce the authoritative list. Do not trust the numbers above as final — they are the memo's figures, and your audit replaces them.

Deliverables for this task:

1. A table of every missing table, with the migration file that creates it.
2. A table of every missing column: table name, column name, type, nullability, default, and the migration that adds it.
3. The current contents of the migration ledger on production, and which of `0225`–`0234`, `0240` are recorded there.
4. Any column that exists on production with a **different** type, nullability or default from `db/schema.ts` — the memo only counted missing objects, so drift of this kind is still unknown.

---

## 4. Task B — resolve the `incentive_eligibility` clash (blocker)

Two developers built "who may earn this incentive" on the same table name with different columns. Rakesh's version reached `main` on 15 September, after the `Om` branch was cut, and the code running on staging already reads it. **The decision is to keep Rakesh's table.** Om's version is to be removed from this branch.

### Column comparison (from the memo)

| Concern | Rakesh's version — keep | Om's version — drop |
| --- | --- | --- |
| `incentive_catalog` | `applies_to_all` boolean, default `true` | — |
| Incentive link | `incentive_id` | `catalog_id` |
| Employee link | `employee_id` | `employee_id` |
| History | none; saving replaces the whole list | `effective_from`, `removed_effective_from`, `added_by_id`, `removed_by_id`, `updated_at` |
| Uniqueness | one row per `(incentive_id, employee_id)` | one *current* row per pair (partial index) |

### Why it breaks on a real Postgres

Running Om's migration after Rakesh's fails. `CREATE TABLE IF NOT EXISTS` silently skips Om's version because Rakesh's table already exists, and the next statement then expects Om's columns:

```
0232_incentive_master.sql
ERROR: column "removed_effective_from" does not exist
```

### Code changes required on the `Om` branch

These are source edits, not production DDL. Verified locally: `db/migrations/0232_incentive_master.sql` creates `incentive_eligibility` at line 87 with `catalog_id`, and declares the three indexes at lines 114, 118 and 121.

1. In `db/migrations/0232_incentive_master.sql`, delete the `create table if not exists incentive_eligibility (...)` block and its three indexes (`incentive_eligibility_current_uq`, `incentive_eligibility_catalog_idx`, `incentive_eligibility_employee_idx`), along with the two related check constraints. **Keep** the `incentive_catalog` columns and constraints, and the `incentive_catalog_events.effective_date` column.
2. In `db/schema.ts`, keep Rakesh's `incentiveEligibility` definition through the merge and discard this branch's version (currently at line 3651, with the comment block at 3608 and the exported types at 4566–4567).
3. Point the Incentive Master at `incentive_id` and `applies_to_all`. Files that read Om's shape:
   - `app/(admin)/admin/incentive-master/actions.ts`
   - `lib/queries/incentive-master.ts`
   - `components/admin/incentive-master/workspace.tsx`
   - `lib/incentive/master.ts`
   - `scripts/verify-incentive-master.ts`
   - `scripts/verify-incentive-eligibility.ts`
4. Reuse Rakesh's reader and writer instead of adding a second pair: `lib/queries/incentive-eligibility.ts` and `lib/incentive/eligibility.ts`. The `incentive_eligibility.manage` capability and the `mayManageIncentiveEligibility()` guard on this branch can stay — put the guard in front of Rakesh's writer.

### Production side of this task

- Confirm which version of `incentive_eligibility` actually exists on production today, column by column, and report it. The memo describes `main` and staging; production may be behind both.
- Do **not** create, alter or drop `incentive_eligibility` on production as part of this task. Removing Om's definition is a source change; production keeps whatever Rakesh's migration gives it.
- If production turns out to have Om's shape rather than Rakesh's, stop and report that. It changes the plan and needs a human decision.

If the effective-date history is a genuine requirement, it goes into a **new** migration, agreed with Rakesh first. Rakesh's unique pair index and his "replace the whole list" save both assume removed people are deleted rather than retained.

---

## 5. Task C — remove the hardcoded dev super-admin entry

Verified locally: `lib/auth/super-admin.ts` defines `LOCAL_DEV_SUPER_ADMINS` at line 61 and uses it inside `isSuperAdmin` at line 80.

The list is dead code in production builds, but the decision is that dev-only super-admin grants stay out of shared code — each developer keeps their own on their own machine. Remove the `LOCAL_DEV_SUPER_ADMINS` constant and the extra check in `isSuperAdmin`, and leave the rest of the function's behaviour unchanged.

`lib/auth/dev-bypass.ts` is already on `main` and needs nothing.

No production database change is involved. If any super-admin grant needs to exist on production, it belongs in the database as data, and must be raised with a human before you write it.

---

## 6. Task D — merge `main` into `Om`

Thirteen files conflict. This is source work, listed here so the production SQL is written against the post-merge tree rather than the pre-merge one.

| File | Note |
| --- | --- |
| `app/(app)/hub/page.tsx` | |
| `app/(app)/incentive/page.tsx` | |
| `components/hr/job-description/jd-bank.tsx` | deleted on `main`, edited on `Om` |
| `components/incentive/incentive-catalog-dialog.tsx` | |
| `components/layout/main-nav.tsx` | |
| `db/schema.ts` | contains the eligibility clash from Task B |
| `lib/module-theme.ts` | |
| `lib/security/capabilities.ts` | |
| `lib/shortcuts-catalog.ts` | |
| `lib/workspaces.ts` | |
| `tests/unit/hub-letter-shortcuts.test.tsx` | |
| `tests/unit/module-shortcut-letters.test.ts` | |
| `vercel.json` | keep `main`'s crons **plus** this branch's `incentive-weekly-report` |

After the merge, run `tsc` and the unit suite, then push `Om`.

Migration numbers `0225`–`0234` on this branch share numbers with Vinal's on `main`. The runner orders by full filename, so this is fine and nothing needs renaming.

---

## 7. Task E — write and test the production SQL

Only after Tasks A–D are done and the branch is pushed.

Scope: this branch's own migrations only. Vinal's and Rakesh's production SQL is prepared and tested separately, and both are already merged and pushed.

1. Rebuild `Change-made/SQL/01-apply-production.sql` from the post-merge migrations, in filename order, against the real gap list from Task A. Anything already present on production must not be re-applied; make each statement idempotent where that is safe and correct.
2. Rebuild `Change-made/SQL/02-verify-production.sql` so it asserts the post-state: every table and column from Task A's gap list exists with the right type, nullability and default, and the migration ledger records `0225`–`0234` and `0240`.
3. Correct `Change-made/SQL/README.md`: state which database it was validated against, name production explicitly as `fjopgyqytfvbudkwhdto`, and remove the claim that everything is already applied.
4. Rehearse the apply on a copy or a branch database first, not on production.

### The `departments` → `functions` move (0234)

The memo reports this migration as safe on production, with every pre-flight check the branch author wrote passing there:

| Check on production | Expected result |
| --- | --- |
| Departments to copy into `functions` | 17 |
| Employees whose department link would be cleared | 0 |
| `employee_departments` rows that would be deleted | 0 |
| Duplicate department names (would break the unique index) | 0 |
| `jd_positions` pointing at a missing department | 0 |
| HR department members carried across (HR access depends on it) | 7 |

Re-run all six against production immediately before the apply and compare. HR access depends on the last one, so if the HR member count is not 7, stop and report rather than proceeding.

---

## 8. Reporting

When you finish, report:

- the audit tables from Task A;
- which production writes you ran, with the exact SQL and the resulting row counts;
- which checks passed and which failed, quoting the failure text;
- anything you skipped, and why;
- the rollback position: which statements were committed, and what would undo them.

Do not mark anything complete that you did not run and verify.
