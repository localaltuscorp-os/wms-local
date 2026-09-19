# Vinal — changes of 19 September 2026, and the SQL they need

Branch `Vinal` → `localaltuscorp-os/wms-local`. Everything here is new since
`a416c839` (WCC / MCC, 18 September).

| | |
|---|---|
| **Areas** | WCC (Weekly Compliance Checklist), MCC (Monthly Compliance Checklist), the app-wide top bar |
| **SQL** | 4 migrations — `0239`, `0240`, `0241`, `0242` — one paste sheet: [`db/RUN-IN-SUPABASE-0239-0242.sql`](../../db/RUN-IN-SUPABASE-0239-0242.sql) |
| **Run the SQL** | **Before** deploying. Until `0240` and `0242` exist, adding a compliance on DCC, WCC or MCC fails |
| **Needs first** | `0238_wcc_mcc.sql` (18 Sep) |

---

## 1. What changed

### WCC — Weekly Compliance Checklist (`/dcc/wcc`)

1. **Grouped by day.** All the Dailys first, then all the Mondays, all the
   Tuesdays, all the Wednesdays… then Once a week. A compliance due Mon & Wed
   appears under Monday **and** under Wednesday, as two separate compliances.
   The team view keeps its teams, each divided the same way.
2. **Headings show the name only**, e.g. `Daily · Sat 19 Sep · today`,
   `Tuesday · 15 Sep · carried forward`. No counts; the heading stays pinned
   in view when the table scrolls sideways.
3. **Mins column replaces Deadline.** Minutes each compliance takes, each time
   it is due (1–1440). Click the cell to set it: `15`, `1h 30m` and `1:30`
   all work. Each group's total sits under the Mins column. A **Total Compliance
   Mins** row at the foot totals the view, or only the rows shown when a filter
   or search is on. Also in the Add/Edit pop-up and the Excel upload.
   *Migration `0242`.*
4. **Frequency unchanged** — `Mon to Sat`, `Mon & Wed`, `Weekly (Sat)` as before.
5. **Carried forward, then lapsed.**
   - A daily row is open on its own day only.
   - A chosen-days row stays open to the day before its next day, and never past
     Saturday.
   - Anything still open lapses on Sunday.
   - Weekly rows missed on their day now say *carried forward* in the heading.

### MCC — Monthly Compliance Checklist (`/dcc/mcc`)

1. **Seven frequencies**: Monthly · 2 times/month · 3 times/month · Alternate
   Month · Quarterly · Half Yearly · Annually. A quarterly one shows only in its
   months. *Migration `0240`.*
2. **Frequency column shows the day only**: a red pill, `2nd`, `15th`, `30th`,
   the Accounts style. Month-end shows that month's last day. The full wording
   ("Quarterly — by the 30th · Sep, Dec, Mar, Jun") appears on hover. It sorts
   by day.
3. **Compact period switcher**: `[Month | Quarter]  ‹  📅 September 2026 ▾  ›`.
   - The name opens a small picker of the financial year's months or quarters.
   - `This month` appears only when you are away from it.
   - It replaces the long month strip, and the page subtitle is gone.
4. Carried forward to the day before the next deadline, the last one to
   month-end — then lapsed.

### Both checklists

1. **Quantity Done.** A compliance with a target above one ("Send 25 emails")
   asks how many were done when it is marked Done. The answer is shown as
   `18 of 25`. The same number goes to DCC's own value, so the 10 pm DCC report
   and the Android app agree. *Migration `0239`.*
2. **Doer Status "Abandoned"** — given up; never counts as Done, never carried
   forward. *Migration `0241`.*
3. **Approver Status** on WCC / MCC is Approved · Not Approved · On Hold ·
   **Archive**. There is no Cancelled; unruled rows read Pending.
4. **Bulk upload from Excel**, with downloadable templates at
   `/dcc/wcc/template.xlsx` and `/dcc/mcc/template.xlsx` (dropdowns, examples,
   a preview with every row's errors before anything is added).
5. **One-line toolbar**: search, status filter chips (Not filled, each Doer
   Status, Carried forward, Lapsed), Clear, Bulk upload, Add.
   - Below 1680px the buttons shorten to an icon and "Add".
   - Where the chips still do not fit, they scroll sideways (the mouse wheel
     works too).
6. **Columns** sort (ascending → descending → off) and can be dragged. Each
   person's order is saved in their browser. Mins takes the place where that
   person kept Deadline.
7. **Groups open by default** (one person: all; the team view: the first team), including after stepping to another month or week.
8. **10:02 pm Wednesday & Saturday email to Manan Sir** now also lists
   compliances marked Done **short of their target** in the last 3 days.

### The top bar, everywhere

- **WMS · Goals · Project · More ▾.** Every other room (Performance, Billing,
  HR, Sales, Accounts, Employees, Operations) is under More.
- When you are inside one of those rooms, More shows highlighted, like an active
  tab.
- A room the person cannot open gets no tab.
- On a narrow window the tabs move into More, one at a time.
- **Fixed:** tabs that had moved into More on a narrow window never came back
  when the window was widened, until a reload. Also, at about 900px More slid
  under the search box.

### Smaller fixes

- `components/training/obligations/obligation-bar.tsx` is no longer a client
  component. The Obligations page (a server page) calls it and passes it a
  function, which a client component cannot receive.
- `ApproverChip` takes per-module labels (WCC / MCC say "Archive").
- `scripts/dummy-db-seed-wcc-mcc.ts` seeds Mins, targets and frequencies for
  local dummy data.

---

## 2. SQL

### How to run

1. **Check `0238` has been run** (`db/migrations/0238_wcc_mcc.sql`, part of
   `db/RUN-IN-SUPABASE-0237-0238.sql`). If it has not, the sheet below stops
   with an error and changes nothing.
2. Supabase → SQL Editor → New query → paste
   **[`db/RUN-IN-SUPABASE-0239-0242.sql`](../../db/RUN-IN-SUPABASE-0239-0242.sql)**
   → **Ctrl+A** → Run.
3. Paste **[`db/VERIFY-0239-0242.sql`](../../db/VERIFY-0239-0242.sql)** → Run.
   All 12 rows must read `ok`.
4. Then deploy.

All four migrations only **add** columns and rules: no table, column or row is
removed or changed. They are safe to run twice, and they run in one
transaction. Tested on Postgres (PGlite):

- Running twice changes nothing more.
- Bad values are refused.
- Without `0238`, the sheet fails and leaves the database untouched.

> ⚠️ **Same numbers as three migrations on `main`.** `main` also has
> `0240_incentive_entry_reversal.sql`, `0241_template_files.sql` and
> `0242_two_step_verification.sql` (Om's / the two-step sign-in). They are
> **different files**. Both sets are needed. Name them by full filename.

### The queries

**0239 — Quantity Done** (`db/migrations/0239_wcc_mcc_completed_quantity.sql`)

```sql
alter table dcc_entries add column if not exists completed_quantity integer;

alter table dcc_entries drop constraint if exists dcc_entries_completed_quantity_chk;
alter table dcc_entries add constraint dcc_entries_completed_quantity_chk
  check (completed_quantity is null or completed_quantity >= 0);
```

**0240 — MCC frequencies** (`db/migrations/0240_mcc_frequencies.sql`)

```sql
alter table dcc_kpi_items add column if not exists mcc_frequency text;
alter table dcc_kpi_items add column if not exists mcc_days smallint[];
alter table dcc_kpi_items add column if not exists mcc_start_month smallint;

alter table dcc_kpi_items drop constraint if exists dcc_kpi_items_mcc_frequency_chk;
alter table dcc_kpi_items add constraint dcc_kpi_items_mcc_frequency_chk
  check (mcc_frequency is null
         or mcc_frequency in ('monthly', 'twice_monthly', 'thrice_monthly', 'alternate_month',
                              'quarterly', 'half_yearly', 'annually'));

alter table dcc_kpi_items drop constraint if exists dcc_kpi_items_mcc_days_chk;
alter table dcc_kpi_items add constraint dcc_kpi_items_mcc_days_chk
  check (mcc_days is null
         or (cardinality(mcc_days) between 2 and 3 and 1 <= all(mcc_days) and 31 >= all(mcc_days)));

alter table dcc_kpi_items drop constraint if exists dcc_kpi_items_mcc_start_month_chk;
alter table dcc_kpi_items add constraint dcc_kpi_items_mcc_start_month_chk
  check (mcc_start_month is null or mcc_start_month between 1 and 12);
```

- `NULL` in `mcc_frequency` means Monthly, so every existing MCC compliance
  stays as it was. No backfill is needed.
- `mcc_days` holds the 2 or 3 deadline days (31 = month-end).
- `mcc_start_month` is a month the compliance is due in, for Alternate,
  Quarterly, Half Yearly and Annually.

**0241 — Abandoned** (`db/migrations/0241_wcc_mcc_abandoned.sql`)

```sql
alter table dcc_entries drop constraint if exists dcc_entries_doer_status_chk;
alter table dcc_entries add constraint dcc_entries_doer_status_chk
  check (doer_status is null
         or doer_status in ('dont_know', 'not_started', 'initiated', 'follow_up', 'need_info', 'done', 'abandoned'));
```

**0242 — Mins** (`db/migrations/0242_wcc_minutes.sql`)

```sql
alter table dcc_kpi_items add column if not exists minutes integer;

alter table dcc_kpi_items drop constraint if exists dcc_kpi_items_minutes_chk;
alter table dcc_kpi_items add constraint dcc_kpi_items_minutes_chk
  check (minutes is null or minutes between 1 and 1440);
```

---

## 3. Checked

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npx eslint` on every changed / new file | clean |
| `npx vitest run --no-file-parallelism` | see the handoff ([`vinal.md`](./vinal.md)) for the numbers of this push |
| Browser, on dummy data | WCC Today / 3 / 6 days and team view, MCC month / quarter / team, the top bar on the hub, WMS, WCC, Goals and Project from 1920px down to 900px |
| Independent review | 29 findings on the toolbar, month switcher and headings, each checked by a second reviewer. The 24 worth fixing were fixed and re-checked in the browser |

**New tests:**

- `compliance-minutes`
- `compliance-wcc-groups`
- `compliance-mcc-frequency`
- `compliance-quantity`
- `compliance-quantity-actions`
- `compliance-carry-forward`
- `compliance-statuses`
- `compliance-bulk`
- `compliance-bulk-template`
- `compliance-bulk-actions`
- `aura-top-bar-tabs`

`compliance-columns` and `compliance-wcc-mcc` were extended.

---

## 4. For whoever merges

- `Vinal` is behind `main` by 26 commits. `db/schema.ts` changed on both
  sides, so expect a small merge there: this branch adds `completed_quantity`,
  `mcc_frequency`, `mcc_days`, `mcc_start_month` and `minutes`.
- Local dummy database: stop the dev server, then `npm run dummy:setup` to get
  the new columns and the seeded Mins.
