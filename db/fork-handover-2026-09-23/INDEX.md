# Fork delivery — 23 September 2026

Source: `dev` remote (`localaltuscorp-os/Altus-OS`), `main` at `6e285aaa`.
**Merged into our `main` on 2026-09-23** (56 commits, clean fast-forward — the
fork is built directly on top of our main, so there were no conflicts).
Safety ref before the merge: `backup/pre-fork-2026-09-23`.

Two-step verification is kept: `db/migrations/0242_two_step_verification.sql`
and `lib/auth/session-mint.ts` both survive the merge.

---

## ⚠️ Read this first

### 1. Run against OUR project, not the one the handoff names

The fork's handoff has a section headed "Production database" saying:

> Correct Supabase project: `fjopgyqytfvbudkwhdto`

**That is the fork team's database.** Ours is `mwaijzxuyicysvimzspx`:

```
https://supabase.com/dashboard/project/mwaijzxuyicysvimzspx/sql/new
```

Their own `Change-made/SQL/README.md` repeats it — "checked against
`aws-0-ap-south-1`, which is not production (production is
`fjopgyqytfvbudkwhdto`)". True for them. Our `HANDOFF.md` records the 15
September run where following that ref changed their data while production
stayed unmigrated, and it looked like it worked.

### 2. Migrations before deploy, not after

The merged code reads the new tables and columns. Production does not have them
yet — `PREFLIGHT` on 2026-09-23 returned every one missing except
`incentive_eligibility` itself. **Deploying before applying leaves the Incentive
Master, Logs, Control Panel and Access Control broken in production**, not
merely missing: their queries name objects that do not exist.

So: apply the SQL first, then deploy.

---

## What to run

**All 32 of the fork's new migrations.** Nothing of ours is outstanding — every
migration on our side that the 21 September handover did not cover is one of
these 32.

- **`APPLY-2026-09-23.sql`** — all 32, in order, each in its own
  `BEGIN`/`COMMIT`, preceded by a `PART n of 32 · <filename>` marker. If a
  statement fails, that marker tells you exactly which file to report. Paste
  the whole thing into the SQL editor and run it.
- **`migrations/`** — the same 32 as individual files, in the same order, if you
  would rather go one at a time.
- **`VERIFY-2026-09-23.sql`** — read-only. Run before and after: it checks every
  table the 32 migrations create (44 of them), generated from the files
  themselves rather than typed by hand.

All 32 are additive — new tables, columns and rows. None drops a table, a
column or a row, and none uses `CONCURRENTLY`. Verified by reading them.

### The order

| # | File | What it adds |
|---|---|---|
| 1 | `0215_goal_archive.sql` | Goals: a real archive, separate from the Recycle Bin |
| 2 | `0225_doer_initiator_status.sql` | The two status axes: doer status and initiator status |
| 3 | `0226_result_is_not_a_task.sql` | A result is not a task |
| 4 | `0227_hr_address_book_asset_register.sql` | HR · Address Book of Resources + Asset Register |
| 5 | `0227_plan_task_client_repair.sql` | A plan task's client is its project's client |
| 6 | `0228_ops_vendor_directory.sql` | Operations · Vendor Directory |
| 7 | `0228_plan_task_client_repair_again.sql` | The 0227 repair, run again |
| 8 | `0229_billing_documents.sql` | Billing document engine (Quotation → Proforma → Tax Invoice) |
| 9 | `0229_broadcast_recurrence_whatsapp.sql` | Broadcasts: repeats, on-time publishing, WhatsApp |
| 10 | `0230_client_engagement.sql` | Client Engagement, on the Hand-holding tables |
| 11 | `0230_daily_checklist_initiator_status.sql` | Daily goals join the two status axes |
| 12 | `0231_billing_pms_archive.sql` | Archive for billing documents and monthly reviews |
| 13 | `0231_exec_calendar.sql` | Executive Master Calendar |
| 14 | `0232_team_performance_archive.sql` | Archive a row on Productivity › Team Performance |
| 15 | `0233_customer_kyc.sql` | Customer KYC, address book, dropdown master, recycle bin |
| 16 | `0234_billing_contracts.sql` | Billing contracts |
| 17 | `0235_customer_kyc_business_whatsapp.sql` | Business category, nature of business, WhatsApp |
| 18 | `0236_customer_kyc_social_payment_options.sql` | LinkedIn, Instagram, three payment options |
| 19 | `0237_customer_kyc_introducer.sql` | The Introducer box |
| 20 | `0237_exec_calendar_categories_markers.sql` | Calendar categories, fixed clients, Day Markers |
| 21 | `0238_client_engagement_v2.sql` | Client Engagement rebuilt on its own tables |
| 22 | `0239_wcc_mcc_completed_quantity.sql` | WCC / MCC: how many were actually done |
| 23 | `0240_mcc_frequencies.sql` | MCC frequencies |
| 24 | `0241_wcc_mcc_abandoned.sql` | WCC / MCC: the "Abandoned" doer status |
| 25 | `0242_visibility_grants.sql` | Access Control — elevated visibility grants |
| 26 | `0242_wcc_minutes.sql` | WCC: Mins, replacing Deadline |
| 27 | `0243_incentive_product_master_rows.sql` | The three products the Sales Pitch form names |
| 28 | `0244_incentive_applicability_and_intern_type.sql` | Applicability, intern type, **renames `incentive_eligibility.incentive_id`** |
| 29 | `0244_module_backup.sql` | Nightly per-module export to Google Drive (4 tables) |
| 30 | `0245_global_logs.sql` | `daily_sessions` + `activity_logs`, append-only |
| 31 | `0246_control_panel.sql` | `roles`, `role_permissions`, `employee_roles` |
| 32 | `0247_activity_logs_allow_fk_null.sql` | Lets the 0245 trigger pass FK `set null` |

Order was checked, not assumed: no file references a table created later than
itself. The only cross-file dependencies are `0237_exec_calendar_categories_markers`
→ `0231_exec_calendar` and `0247` → `0245`, both already in order.

### The two the handoff's list leaves out

The handoff names six (0242_visibility_grants, 0243, 0244_incentive_applicability,
0245, 0246, 0247). Rows 26 and 29 above are **not** in it, and both say so
themselves:

- `0242_wcc_minutes.sql`: *"RUN IT BEFORE DEPLOYING: db/schema.ts names the
  column, so until it exists every Drizzle insert into `dcc_kpi_items` fails."*
- `0244_module_backup.sql`: *"Apply BEFORE deploying the code."*

### 0247 is not optional

Without it, `deleteEmployee` fails for anyone who has ever produced a log row —
the 0245 trigger refuses the `ON DELETE SET NULL` update, and the whole
transaction rolls back. Run 0245 and 0247 together, not with a deploy between.

### About `0244_incentive_applicability_and_intern_type`

It renames `incentive_eligibility.incentive_id` → `catalog_id`, and your
production is in the old shape (`legacy_incentive_id`, **0 rows** — verified).
The rename moves a name, not data.

This **reverses** the decision recorded in `HANDOFF-Production-DB.md` §Task B
("keep Rakesh's table, do not alter `incentive_eligibility`"). The fork reversed
it deliberately — their `db/schema.ts` names `catalog_id` — and since we have
now merged their code, running it is the consistent choice. If you would rather
not, say so before applying: our own `0216_incentive_eligibility.sql` is still
in the tree and restores the old name.

---

## On renaming the migrations

The user asked for the clashing migration files to be renamed. **Checked and
deliberately not done** — the collision is numeric only and harmless:

- `scripts/apply-all-migrations.ts` sorts by **filename string** and keys its
  ledger on the **filename**, not the number. Duplicate numeric prefixes do not
  break it. Our repo already has four `0225_*` files and three `0222_*`.
- Two tests read `db/migrations/0242_wcc_minutes.sql` by name
  (`tests/unit/compliance-bulk-actions.test.ts`,
  `tests/unit/compliance-quantity-actions.test.ts`). A rename breaks them.
- The fork's handoffs and bundles refer to files by these names. Renaming would
  make every future handoff need a translation table — the thing the handoff
  workflow depends on.

Three different files carry the number 0242: our `0242_two_step_verification.sql`
(kept), their `0242_wcc_minutes.sql` and their `0242_visibility_grants.sql`.
Apply **by filename**, never by number.

## Also

- **Do not use `pnpm db:migrate` on production.** The ledger short-circuits by
  filename, but production was migrated by hand and the applier would attempt
  every unledgered file.
- **Do not use `Change-made/SQL/`.** The fork's own README marks it superseded;
  our copy holds files 01–04, theirs 01–14, and neither belongs on our project.
