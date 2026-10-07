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

---

## 9. Task F — Admin Panel master-data handoff (SQL prepared, **NOT EXECUTED**)

This section was traced against the current Admin Panel actions, queries,
`db/schema.ts`, and migrations. No production connection or SQL write was run.
Apply only after a Senior Developer reviews the preflight result and approves
the exact transaction.

### 9.1 Verified storage map

| Admin master | Admin implementation | Table / key | Value and dependency facts |
| --- | --- | --- | --- |
| Subjects | `/admin/subjects`, `app/(admin)/admin/subjects/actions.ts` | `subjects.id`; `name`, `is_active`, `sort_order` | Task records store `tasks.subject` as text. Rename propagation is application code; there is no FK. Preserve rows and deactivate obsolete values. |
| Products | `/admin/products`, `/admin/billing-products`, product actions and `lib/queries/products.ts` | `outstanding_products.id`; `name`, `code`, `display_name`, `is_active`, `sort_order` | `outstanding_contracts.product_id`, `incentive_catalog.product_id`, `incentive_target_plan_products.product_id`, and `billing_document_lines.product_id` reference this UUID with `ON DELETE SET NULL`. Never delete a referenced row. |
| Billing Codes | No Admin route, action, schema table, or reader for a billing-code master was found. | `billing_sac_codes` is SAC (code + description), not billing-code data; `billing_lookups` has no `billing_code` kind. | **NEEDS SR DEV VERIFICATION** — do not invent a table or lookup kind. |
| Billing Master | `/admin/billing-master` and `app/(admin)/admin/billing-master/actions.ts` | `paying_entities.id`; `name`, `is_active`, `sort_order`; optional `billing_entity_profiles.paying_entity_id` | This screen manages paying/legal entities, not an employee-name roster. Existing migration `0259_masters_billing_part2.sql` already contains the requested person-name rows; verify production before reapplying. |
| Designations | `/admin/designations` and salary/employee selectors | `designations.id`; `name`, `employee_type`, `is_active`, `sort_order` | `employees.designation_id` is `ON DELETE SET NULL`; `dcc_master_items.designation_id` is `ON DELETE CASCADE`. Rename where the semantic match is certain; otherwise deactivate only when unreferenced. |
| Clients | `/admin/clients`, `app/(admin)/admin/clients/actions.ts` | `clients.id`; `name`, `is_active`, `sort_order` | Tasks retain client text, not a client FK. Preserve historical text and deactivate obsolete roster rows rather than deleting them. |

### 9.2 Subjects — final active roster

The following transaction makes the **active** subject roster exactly the final
list, preserves IDs, and keeps obsolete rows inactive for historical task text.
The preflight also exposes case-only duplicates before the write.

```sql
BEGIN;

-- Preflight: case variants must be resolved before applying the roster.
SELECT lower(name) AS normalized_name, array_agg(id ORDER BY id) AS ids,
       array_agg(name ORDER BY name) AS names
FROM subjects
GROUP BY lower(name)
HAVING count(*) > 1;

DO $$
DECLARE
  wanted text[] := ARRAY[
    'Accounts','Admin','Altus Ecosystem','Altus Tribe App','App','Approvals',
    'Back Office','Billing','BSS','BSS App','Collaboration','Collection',
    'Consulting','CRM','Dashboard','Data','DCC','Documentation','Follow Ups',
    'Handholding','HR','Incentive','Insta Videos','Internal Development',
    'Interviews','Jodo','KPI','Marketing','MIS','Operations','Others','Pay U',
    'Personal','Project','PS','PS App','PS Manual','PSO','PSO App',
    'Recruitment','Red Flag','Reimbursement','Sales','Social Media','SOP',
    'System','Systems','Tally','Test','Training','Website'
  ];
  item text;
  item_order integer;
BEGIN
  FOR item, item_order IN
    SELECT value, ordinality::integer
    FROM unnest(wanted) WITH ORDINALITY AS u(value, ordinality)
  LOOP
    UPDATE subjects
       SET name = item, is_active = true, sort_order = item_order * 10,
           updated_at = now()
     WHERE lower(name) = lower(item);
    IF NOT FOUND THEN
      INSERT INTO subjects (name, is_active, sort_order)
      VALUES (item, true, item_order * 10);
    END IF;
  END LOOP;

  UPDATE subjects s
     SET is_active = false, updated_at = now()
   WHERE NOT EXISTS (
     SELECT 1 FROM unnest(wanted) AS w(value)
      WHERE lower(w.value) = lower(s.name)
   );
END $$;

-- Final verification: only wanted names are active; inactive legacy rows are
-- retained intentionally because tasks.subject is historical text.
SELECT name, is_active, sort_order
FROM subjects
ORDER BY is_active DESC, sort_order, name;
COMMIT;
```

### 9.3 Products — final active product names and safe display-name mapping

The product table has separate `name`, `code`, and `display_name` columns. The
supplied final list contains values with spaces, while the application validates
`code` as a space-free identifier. Also, the supplied full-name mappings use
`OS` and `TR`, while the final list says `OS App` and `Training`. Therefore the
following code/name interpretation **requires Senior Developer approval**:

* apply the supplied list to `outstanding_products.name`;
* use machine-safe codes `OS` and `TR` for the `OS App` and `Training` rows;
* use `display_name` for the five supplied full names.

If the business instead intends every supplied list item to be a code, stop:
the current validation/schema cannot store values such as `OS App` or `Inhouse PS`
in `code` without a separate approved schema change.

```sql
BEGIN;

-- Preflight: do not silently steal an existing code from another product.
SELECT lower(code) AS normalized_code, array_agg(id ORDER BY id) AS ids,
       array_agg(name ORDER BY name) AS names
FROM outstanding_products
WHERE code IS NOT NULL
GROUP BY lower(code)
HAVING count(*) > 1;

SELECT p.id, p.name, p.code, p.is_active,
       coalesce(c.contract_refs, 0) AS contract_refs,
       coalesce(i.incentive_refs, 0) AS incentive_refs,
       coalesce(t.target_refs, 0) AS target_refs,
       coalesce(b.billing_refs, 0) AS billing_refs
FROM outstanding_products p
LEFT JOIN (
  SELECT product_id, count(*) AS contract_refs
  FROM outstanding_contracts WHERE product_id IS NOT NULL GROUP BY product_id
) c ON c.product_id = p.id
LEFT JOIN (
  SELECT product_id, count(*) AS incentive_refs
  FROM incentive_catalog WHERE product_id IS NOT NULL GROUP BY product_id
) i ON i.product_id = p.id
LEFT JOIN (
  SELECT product_id, count(*) AS target_refs
  FROM incentive_target_plan_products WHERE product_id IS NOT NULL GROUP BY product_id
) t ON t.product_id = p.id
LEFT JOIN (
  SELECT product_id, count(*) AS billing_refs
  FROM billing_document_lines WHERE product_id IS NOT NULL GROUP BY product_id
) b ON b.product_id = p.id
ORDER BY p.is_active DESC, p.sort_order, p.name;

DO $$
DECLARE
  wanted text[] := ARRAY[
    'PSO','PS','BSSO','BSS','Retainer','OS App','Inhouse PS','AC','Rent',
    'Commission','Key Note','2-Day','Billing','Training'
  ];
  item text;
  item_order integer;
  target_code text;
  target_display text;
BEGIN
  FOR item, item_order IN
    SELECT value, ordinality::integer
    FROM unnest(wanted) WITH ORDINALITY AS u(value, ordinality)
  LOOP
    target_code := CASE item
      WHEN 'PSO' THEN 'PSO' WHEN 'PS' THEN 'PS' WHEN 'BSSO' THEN 'BSSO'
      WHEN 'BSS' THEN 'BSS' WHEN 'AC' THEN 'AC' WHEN 'OS App' THEN 'OS'
      WHEN 'Training' THEN 'TR' ELSE NULL END;
    target_display := CASE item
      WHEN 'PSO' THEN 'Productivity Shastra Orientation'
      WHEN 'BSSO' THEN 'Business Scale Up Shastra Orientation'
      WHEN 'OS App' THEN 'Operating System'
      WHEN 'AC' THEN 'Altus Conclave'
      WHEN 'Training' THEN 'Training Fees'
      ELSE NULL END;

    IF EXISTS (
      SELECT 1 FROM outstanding_products
       WHERE lower(code) = lower(target_code)
         AND lower(name) <> lower(item)
    ) THEN
      RAISE EXCEPTION 'Product code % is already owned by another product', target_code;
    END IF;

    UPDATE outstanding_products
       SET name = item, code = target_code, display_name = target_display,
           is_active = true, is_billable = true, sort_order = item_order * 10,
           updated_at = now()
     WHERE lower(name) = lower(item);
    IF NOT FOUND THEN
      INSERT INTO outstanding_products
        (name, code, display_name, is_active, is_billable, sort_order)
      VALUES (item, target_code, target_display, true, true, item_order * 10);
    END IF;
  END LOOP;

  -- No DELETE: referenced historical products retain their UUID and become
  -- unavailable to new selections through is_active = false.
  UPDATE outstanding_products p
     SET is_active = false, updated_at = now()
   WHERE NOT EXISTS (
     SELECT 1 FROM unnest(wanted) AS w(value)
      WHERE lower(w.value) = lower(p.name)
   );
END $$;

SELECT name, code, display_name, is_active, sort_order
FROM outstanding_products
ORDER BY is_active DESC, sort_order, name;
COMMIT;
```

### 9.4 Billing Codes — blocked until the real master is identified

Repository tracing found no billing-code master. `billing_sac_codes` is used by
`/admin/billing-payment-terms` for SAC values; `billing_lookups` is the KYC
dropdown registry and has no billing-code kind. The requested codes therefore
must **not** be inserted into either table by assumption.

Run only this read-only discovery query in the target database, then update this
handoff with the verified table/column and a separate reviewed transaction:

```sql
SELECT table_schema, table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    lower(table_name) LIKE '%billing%code%'
    OR lower(column_name) LIKE '%billing%code%'
    OR lower(column_name) IN ('code','billing_code')
  )
ORDER BY table_name, ordinal_position;
```

**NEEDS SR DEV VERIFICATION:** intended table, primary key, order column, and
all foreign-key consumers. No billing-code write SQL is supplied until this is
resolved.

### 9.5 Billing Master — existing paying-entity path

The current Admin Billing Master is `paying_entities`, not an employee/user
roster. `billing_entity_profiles.paying_entity_id` and `employees.paying_entity_id`
are the known relationships. The repository already contains the requested
four person-name rows in `db/migrations/0259_masters_billing_part2.sql`; do not
duplicate that data in a new SQL file. Senior Developer must first verify those
rows in production and re-use the existing migration’s guarded `INSERT ... ON
CONFLICT (name)` and profile backfill if any are absent. Per repository PII
rules, the names are intentionally not copied into this handoff.

Read-only verification:

```sql
SELECT pe.id, pe.name, pe.is_active, pe.sort_order,
       count(DISTINCT e.id) AS employee_refs,
       count(DISTINCT bp.id) AS profile_refs
FROM paying_entities pe
LEFT JOIN employees e ON e.paying_entity_id = pe.id
LEFT JOIN billing_entity_profiles bp ON bp.paying_entity_id = pe.id
GROUP BY pe.id, pe.name, pe.is_active, pe.sort_order
ORDER BY pe.name;
```

**NEEDS SR DEV VERIFICATION:** confirm the four supplied names are intended as
paying/legal entities (not employees) and apply the already-reviewed 0259
statements only for missing rows.

### 9.6 Designations — final active roster

This transaction preserves designation IDs, marks exact final values active, and
only deactivates obsolete values that have no employee or DCC-master references.
Rows still referenced remain active and are reported for manual retirement or
semantic rename review.

```sql
BEGIN;

SELECT d.id, d.name, d.employee_type, d.is_active,
       count(DISTINCT e.id) AS employee_refs,
       count(DISTINCT m.id) AS dcc_refs
FROM designations d
LEFT JOIN employees e ON e.designation_id = d.id
LEFT JOIN dcc_master_items m ON m.designation_id = d.id
GROUP BY d.id, d.name, d.employee_type, d.is_active
ORDER BY d.sort_order, d.name;

DO $$
DECLARE
  wanted text[] := ARRAY[
    'Intern - First Year','Intern - Second Year','Intern - Third Year',
    'Executive','Sr. Executive','Consultant','Sr. Consultant',
    'Assistant Manager','Deputy Manager','Manager','Associate Vice President',
    'Deputy Vice President','Vice President','Senior Vice President',
    'President','Sr President','Assistant General Manager','General Manager',
    'Sr. General Manager','Associate Director','Deputy Director','Director',
    'Senior Director','CEO','Managing Director','Chairman'
  ];
  item text;
  item_order integer;
BEGIN
  FOR item, item_order IN
    SELECT value, ordinality::integer
    FROM unnest(wanted) WITH ORDINALITY AS u(value, ordinality)
  LOOP
    UPDATE designations
       SET name = item,
           employee_type = CASE WHEN item LIKE 'Intern - %' THEN 'intern' ELSE 'employee' END,
           is_active = true, sort_order = item_order * 10, updated_at = now()
     WHERE lower(name) = lower(item);
    IF NOT FOUND THEN
      INSERT INTO designations (name, employee_type, is_active, sort_order)
      VALUES (item, CASE WHEN item LIKE 'Intern - %' THEN 'intern' ELSE 'employee' END,
              true, item_order * 10);
    END IF;
  END LOOP;

  UPDATE designations d
     SET is_active = false, updated_at = now()
   WHERE NOT EXISTS (
     SELECT 1 FROM unnest(wanted) AS w(value)
      WHERE lower(w.value) = lower(d.name)
   )
   AND NOT EXISTS (SELECT 1 FROM employees e WHERE e.designation_id = d.id)
   AND NOT EXISTS (SELECT 1 FROM dcc_master_items m WHERE m.designation_id = d.id);
END $$;

SELECT d.name, d.employee_type, d.is_active, d.sort_order
FROM designations d
ORDER BY d.is_active DESC, d.sort_order, d.name;
COMMIT;
```

### 9.7 Clients — final active roster

Clients are a text picker; no task FK exists. The safe operation is upsert plus
deactivation, never physical deletion. The supplied list contains several
person-name values; they are **NEEDS SR DEV VERIFICATION** under the repository
PII rule and are intentionally not copied into this handoff. All non-person
values can be applied with the same pattern below after the final approved list
is substituted.

```sql
BEGIN;

DO $$
DECLARE
  -- Replace the three <REDACTED_PERSON_CLIENT_*> placeholders only after the
  -- Senior Developer completes the approved PII review.
  wanted text[] := ARRAY[
    'AICL','Altus Corp','Aria Aerial','Arihant Lubricants',
    'Bellavita','BSS','Carbide India','Crish Metalworks','Dharav Enterprises',
    'Ehara Engineering','JMT Drive Solutions','<REDACTED_PERSON_CLIENT_1>',
    'Niaa Jewels','Nirman Corp','Prime Graphite','PSO','<REDACTED_PERSON_CLIENT_2>',
    '<REDACTED_PERSON_CLIENT_3>',
    'Saaro','Sattva Logistics','Stellary','Sukhson','VPinnacle'
  ];
  item text;
  item_order integer;
BEGIN
  FOR item, item_order IN
    SELECT value, ordinality::integer
    FROM unnest(wanted) WITH ORDINALITY AS u(value, ordinality)
  LOOP
    UPDATE clients
       SET name = item, is_active = true, sort_order = item_order * 10,
           updated_at = now()
     WHERE lower(name) = lower(item);
    IF NOT FOUND THEN
      INSERT INTO clients (name, is_active, sort_order)
      VALUES (item, true, item_order * 10);
    END IF;
  END LOOP;

  UPDATE clients c
     SET is_active = false, updated_at = now()
   WHERE NOT EXISTS (
     SELECT 1 FROM unnest(wanted) AS w(value)
      WHERE lower(w.value) = lower(c.name)
   );
END $$;

SELECT name, is_active, sort_order
FROM clients
ORDER BY is_active DESC, sort_order, name;
COMMIT;
```

### 9.8 Rollback / execution notes

* No production SQL from this section was executed.
* Before applying, run every preflight query and capture row counts.
* Use a backup/PITR checkpoint and apply one reviewed transaction at a time.
* The SQL intentionally uses soft deactivation for referenced/history-bearing
  rows. A rollback should restore the prior `name`, `code`, `display_name`,
  `is_active`, and `sort_order` values from the captured preflight snapshot;
  do not infer rollback values after the fact.
* Billing Codes and the person-name portions of Billing Master/Clients remain
  blocked until their destination/PII approvals are recorded.

## 10. Task G — Incentive workflow consolidation

**Status:** application changes are implemented locally. The production
migration below has **not** been executed.

This section documents the incentive consolidation change. The new incentive
entry path is now:

```text
New Incentive Request
  → approval decision
  → approved amount finalization
  → incentive_entries ledger
  → existing incentive payout flow
  → incentive_payout_events / salary_payments
  → My Salary and Accounts views
```

Rejected, revision-requested, due/not-due, and otherwise non-approved requests
do not create a ledger entry. Historical `incentive_entries` remain supported.

### 10.1 Verified data lineage

| Concern | Authoritative table/path | Notes |
| --- | --- | --- |
| Request state and request details | `incentive_requests` | Request, status, approved amount, product/scheme and split data. |
| Submission snapshot | `incentive_request_submissions` | Immutable submission history. |
| Approval history | `incentive_request_decisions` | Immutable decision/audit records. |
| Incentive ledger | `incentive_entries` | Existing payout-compatible ledger; now optionally linked to its request. |
| Split legs | `incentive_participants` | Created/replaced from the finalized request split. |
| Payout audit | `incentive_payout_events` | Existing payout event stream. |
| Salary payment record | `salary_payments` | Existing incentive payment record (`kind = 'incentive'`). |
| Approval handoff audit | `compensation_approvals` | Approval audit only; not a second incentive payment path. |

The finalization seam is the existing approval transaction. It locks the
request, writes the decision, and creates the linked ledger row idempotently.
There is no separate employee direct-entry workflow anymore.

### 10.2 Application files changed

* `lib/incentive/finalize-request.ts` — approved-request ledger creation and
  reversal handling.
* `lib/incentive/workflow-server.ts` — decision recording and transactional
  finalization/reversal call.
* `app/(app)/incentive/actions.ts` — approved amount input/validation.
* `app/(admin)/admin/approvals/actions.ts` — passes approved amount through.
* `components/incentive/incentive-decision-panel.tsx` — approved amount UI.
* `lib/incentive/payout-sources.ts` — reversed ledger rows are excluded from
  payout folding.
* `components/incentive/incentive-entries.tsx` — historical Ledger view is
  read-only for creation/import; legacy edit/delete/reversal support remains.
* `components/incentive/incentive-tabs.tsx`,
  `app/(app)/incentive/page.tsx`, and `components/layout/main-nav.tsx` — the
  historical Ledger remains available without exposing New Entry.
* `app/(app)/incentive/admin-actions.ts` — direct entry and legacy entry-import
  actions return a retired-workflow response.
* `app/(app)/incentive/template.xlsx/route.ts` and
  `app/api/templates/[key]/route.ts` — legacy Incentive Entries templates return
  HTTP 410 and are no longer active creation paths.
* `app/(app)/accounts/approvals/actions.ts`,
  `app/(app)/accounts/approvals/page.tsx`, and
  `lib/compensation/workflow.ts` — generic Accounts approval/payment paths
  reject or hide incentive payments so incentive payout has one owner.

The existing `app/(app)/salary/incentive-payout/actions.ts` payout flow remains
the authoritative payment path and was not replaced.

### 10.3 Production migration (review and execute separately)

Migration file: `db/migrations/0269_incentive_request_ledger.sql`

```sql
ALTER TABLE incentive_entries
  ADD COLUMN IF NOT EXISTS incentive_request_id uuid
  REFERENCES incentive_requests(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS incentive_entries_request_uq
  ON incentive_entries (incentive_request_id);
```

The link is nullable so all historical ledger rows remain valid. The unique
index permits at most one ledger parent row per request while preserving
historical rows with a null link. Split participants remain in
`incentive_participants` and are not duplicated as additional request parents.

### 10.4 Duplicate and reversal protection

* Finalization locks the request and checks for an existing linked ledger row.
* The unique index is the database-level final guard against duplicate ledger
  parents.
* Split rows are replaced only for the finalized request's participant set.
* Reversed ledger rows are excluded from payout folding.
* Reversal is guarded by the ledger `reversed` state and posts the existing
  negative payout event/payment only once.
* Generic Accounts compensation approval is not allowed to create a second
  incentive payment.

### 10.5 Retired active paths

* `createIncentiveEntry` no longer creates new ledger rows.
* Legacy validate/confirm/bulk Incentive Entries import actions return a retired
  workflow response.
* Legacy Incentive Entries template endpoints return HTTP 410.
* The UI exposes New Incentive Request as the only new submission workflow.
* Existing ledger rows and maintenance code remain for historical/payout
  compatibility; no historical rows are deleted or rewritten.
* Bulk Incentive Request Upload remains out of scope and untouched.

### 10.6 Production preflight and verification

Run these read-only checks before applying the migration:

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'incentive_entries'
  AND column_name = 'incentive_request_id';

SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'incentive_entries'
  AND indexname = 'incentive_entries_request_uq';

SELECT count(*) AS linked_ledger_rows,
       count(DISTINCT incentive_request_id) AS linked_requests
FROM incentive_entries
WHERE incentive_request_id IS NOT NULL;
```

Take a backup/PITR checkpoint and obtain Senior Developer approval before
executing the migration. Do not run production SQL from this handoff update.
If the column/index already exists, treat the migration as already applied and
verify the definitions rather than recreating them.

### 10.7 Local verification

* Targeted incentive/route Vitest runs passed (latest focused run: 3 files,
  11 tests; earlier complete relevant run: 4 files, 48 tests).
* Targeted ESLint completed with zero errors; only existing warnings remain.
* Full TypeScript build remains blocked by unrelated pre-existing errors in
  generated route types, billing master, salary, employee-master, and
  `lib/salary/my-salary.ts`.
* Full `pnpm test` was unavailable because pnpm registry signature
  verification failed in the environment.
* No production database migration or SQL was executed.

## 11. Code-only update — Incentive target calculation (2026-10-06)

No production database write or schema change was made for this update.

- Monthly default target is 10% of employee monthly salary.
- Quarterly default base is monthly target × 3.
- Yearly default base is monthly target × 12.
- User-entered Stretched Target overrides period base for monthly, quarterly,
  and yearly targets.
- Target-plan validation now uses period-scaled base target.

Changed files:

- `app/(app)/incentive/analytics-actions.ts`
- `app/(app)/incentive/target-actions.ts`
- `lib/incentive/target-calculation.ts`
- `tests/unit/incentive-target-calculation.test.ts`

Validation:

- 84 focused tests passed.
- Changed-file ESLint passed.
- Full TypeScript check was attempted but produced no output and was stopped.
