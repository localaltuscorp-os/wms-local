# 18 — Incentive dashboard: employee viewer, dynamic title, year period, table headers

**Date:** 24 September 2026
**Migration:** **none** for this slice. (The redesign as a whole needs
`db/migrations/0250_incentive_target_period_type.sql` — see §6, it is **NOT
applied**.)
**Written for:** anyone, including people who did not build this.

---

## 0. READ THIS FIRST — this change set was built by TWO sessions at once

The Incentive redesign was being implemented in this same working tree by
another session when this one picked it up. Rather than fight it for the same
files, this change set **took only the parts that session had not started**, so
the two could not overwrite each other.

| Requirement | Built by | State |
|---|---|---|
| 1 — dynamic `Incentive \| [Employee]` title | **this session** | done |
| 2 — employee viewer, server-enforced | **this session** | done |
| 3 — period navigation (Current Month / Specific Month / Specific Quarter) | other session | done |
| 3 — **Specific Year** | **this session** | done |
| 4 — visuals replacing the empty area | **this session** (see §3b) + other session's month/quarter controls | done |
| 5 — compact KPI band (Grade, % of CTC as cards) | other session | done — verified |
| 6 — period-aware target setting | other session | needs its migration (§6) |
| 7 — Manan-only Edit/Delete on the Incentive Table | other session | done — verified |
| 8 — table header layout | **this session** | done |
| 9 — compact layout | other session + §3b | done |

**Two consequences.** (a) The other session's part was **not complete and not
verified at the time of writing** — in fact the tree does not typecheck because
of its in-flight edit to `app/(app)/incentive/admin-actions.ts` and
`lib/import/incentive-import.ts` (21 errors, none in a file this change set
touched). (b) Its migration is **unapplied**, which will break the dashboard at
runtime the moment its code ships (§6).

---

## 1. THE TITLE (requirement 1)

`Incentive \| <employee>` — `incentivePageTitle()` in
`lib/incentive/analytics/viewer.ts`, applied to `PageCommandBar` in
`app/(app)/incentive/page.tsx`.

It names the employee being **viewed**, which for most people is themselves, so
everyone's tab and heading read `Incentive | Om Jadhav` on their own dashboard
and `Incentive | Shreya Randhe` while somebody else's is open.

**The title cannot be made to name a colleague.** The id it prints comes from
`viewedId`, which is `null` unless `canViewEmployee` accepted the requested id
against the scope the server resolved (see §2). The subtitle and the Incentive
Table / New request actions are unchanged.

## 2. THE EMPLOYEE VIEWER (requirement 2)

A compact **`Viewing: <name>`** control in the page's action row
(`components/incentive/analytics/employee-viewer.tsx`): a pill showing who you
are looking at, opening a searchable list. Choosing somebody writes `?emp=<id>`
and lets the **server** re-render, so the whole dashboard — KPIs, charts, table,
targets — is that person's.

### Who may see whom

Nothing new was invented. The picker offers exactly the people
`incentiveAnalyticsScopeFor` already resolved for the caller, and no more:

| Viewer | May view |
|---|---|
| The incentive reviewer (Manan Vasa), super-admins, anyone Access Control has granted the organisation to | everybody |
| A manager / team lead | themselves and their downline |
| An ordinary employee | themselves only — **no picker is drawn at all** |

### How it is enforced, in three places

1. **The UI.** An ordinary employee's picker list holds only themselves, so
   `hasViewableOthers` is false and the control is not rendered. That is
   presentation, not the boundary.
2. **The page, before any query.** `viewedId` is `canViewEmployee(scope,
   requestedEmp) ? requestedEmp : null`, so an id typed into the URL is dropped
   before it can reach the title or the loader.
3. **The loader.** `narrowToEmployee(scope, id, name)` returns **null** for
   anybody outside the scope, and the caller falls back to the scope it already
   had — never to the requested id. An unauthorised `?emp=` therefore degrades
   to your own dashboard instead of erroring or leaking.

The client-side period switcher carries the same id on every fetch
(`viewEmployeeId`, passed down **already validated**, not read from the URL in
the browser) — without that, changing the period while viewing somebody would
have quietly dropped back to the viewer's own figures.

### The one thing that had to be added to the engine

`AnalyticsScope` gains `ctcUnrestricted`, and `buildIncentiveAnalytics` consults
it in the CTC-restriction rule. The rule exists to stop a team lead reading
their reports' pay. Narrowing a **company-wide** viewer's view to one person is
not that situation — they could already read every CTC on the page — so the
entitlement travels with the narrowing and Grade and % of CTC stay populated.
A manager narrowing to a report keeps the restriction, unchanged. Set only by
`narrowToEmployee`, so every existing caller behaves exactly as before.

### What was deliberately NOT done

**Admins do not gain company-wide eligibility.** The brief says
"Managers/Admins: can select and view other employees", and a plain
`isAdmin` account with no reports gets **no picker** — because
`lib/incentive/analytics/scope.ts` documents, at length, that being an admin is
deliberately *not* a reason to see everybody's earnings, and the same brief
forbids exposing employee data to unauthorized users. Admins with reports see
their reports, through the same hierarchy rule everyone else uses. If admins are
meant to see the whole company, that is a one-line change to the scope resolver
— and a decision to make on purpose, not as a side effect of a layout change.

## 3. THE SPECIFIC YEAR PERIOD (requirement 3, the missing third)

`PERIOD_KINDS` gains `"year"`, with `selectableYears()` and `isSelectableYear()`
in `lib/incentive/analytics/periods.ts` and a year `<select>` beside the month
and quarter ones. The existing kinds — Current Month, Specific Month, Specific
Quarter, Last 3 / Last 6 Months, YTD — are untouched, which is what the brief
asks for ("retain useful existing period views").

- **A year is the whole calendar year**, twelve months, January to December —
  deliberately not the same control as **YTD**, which runs January to *today*.
  Both are kept: YTD answers "how is this year going", Specific Year answers
  "what did that year do".
- Rank movement compares against the previous year.
- Bounded like the month and quarter pickers: 2020 up to the **current** year. A
  future year has no incentives to analyse, and refusing it server-side is what
  stops a crafted request asking for one.
- The label reads `2026`, never `Jan – Dec 2026`.

## 3b. THE VISUALS (requirement 4)

The other session built the period controls and the KPI band but left the area
below them as the Grade Report table; the brief's "replace the large empty area
with useful visual reporting" was unimplemented. This change set adds it as ONE
new component, `components/incentive/analytics/period-progress.tsx`, rendered
between the KPI band and the grade report.

**Target vs Actual**, for the selected period and the scope on screen: the two
figures, **Attainment %**, the shortfall or surplus, and a bar with a reference
line where the target sits — so "how far along" and "how far to go" are one
glance. This is also what gives a SOLO viewer the brief's five KPIs: the Team
summary band that carries the totals is not drawn for somebody with no team, so
without this block Target, Actual and Attainment would not appear as figures
anywhere on their dashboard. Grade and % of CTC are the other session's cards in
the band above.

**Earned by month** — a compact bar strip, one bar per month of the period, with
a dashed tick where a monthly target is set. Shown only when the period spans
more than one month AND at least one month has something in it: a single bar at
100% is decoration, not information.

**No invented data, and no filled-in gaps.** Every bar is a sum of rows that
exist. A month with nothing in it is a genuine zero drawn at zero. A month with
no target reads "no target", never ₹0 — the same distinction the target warning
already makes. And a period holding nothing at all collapses to ONE compact line
(`IncentiveEmptyState`, the module's existing compact variant) saying which
period is empty and what to do about it — not a chart of zeroes and not a
large empty box.

To feed the strip, `buildIncentiveAnalytics` gains a `monthly` series (one entry
per month, ascending). A QUARTERLY target is deliberately **not** spread across
its months — it is one commitment for the period, and dividing it into three
monthly targets nobody set would be exactly the invented data the brief forbids.

**A bug this uncovered, fixed here.** Auditing the KPI band for this work showed
that `me` — the row the band's **Grade** and **% of CTC** cards are read from —
meant "the signed-in employee", not "the employee this dashboard is about". The
two agree until somebody opens somebody else's dashboard with `?emp=`, at which
point the band printed the READER's grade and pay share under the VIEWED
person's name and title. `BuildInput` gains `subjectId` (defaulting to the
viewer, so every other caller is unchanged) and `me` now resolves to the
subject. `viewer` — which the CTC restriction is computed from — is deliberately
NOT reused for this, or a manager would be handed the report's pay.

## 4. THE TABLE HEADERS (requirement 8)

Two tables, both fixed.

**The Incentive Table** (`components/incentive/incentive-catalog-dialog.tsx`) —
every header is `whitespace-nowrap`, so a narrow dialog can no longer break
"Amount" or "Eligible" onto a second line and leave the heading reading as part
of the row beneath it. The table carries a sensible **minimum width (520px)** and
its wrapper scrolls sideways when the dialog is narrower than that — rather than
shrinking every column until the figures are unreadable.

**The entries ledger** (`components/incentive/incentive-entries.tsx`) — Month,
Amount, Approved and Paid are `whitespace-nowrap` on both the header and the
cell, because a broken rupee figure is the worst thing a money column can do.
Employee and Incentive are left free to wrap: they hold names, where wrapping is
the right answer. The long "Negative payable adj." badge may wrap *under* its
amount; the amount itself stays on one line.

## 5. WHAT THIS CHANGE SET TOUCHED

**Added**

- `lib/incentive/analytics/viewer.ts` — the narrowing helpers (§2)
- `components/incentive/analytics/employee-viewer.tsx` — the picker
- `components/incentive/analytics/period-progress.tsx` — the Target vs Actual /
  earned-by-month block (§3b)
- `tests/unit/incentive-employee-viewer.test.ts` — 31 assertions on the
  enforcement, the title, the CTC entitlement, the subject fix, the monthly
  series and the year period

**Changed**

- `lib/incentive/analytics/periods.ts` — the `year` kind
- `lib/incentive/analytics/model.ts` — `ctcUnrestricted`, `viewablePeople`,
  `subjectId`, the `monthly` series
- `components/incentive/analytics/incentive-analytics-dashboard.tsx` — the
  `PeriodProgress` block (§3b)
- `lib/queries/incentive-analytics.ts` — the `emp` narrowing + the picker rows
- `app/(app)/incentive/page.tsx` — title, `?emp=` validation, the picker
- `app/(app)/incentive/analytics-actions.ts` — `emp` and `year` accepted
- `components/incentive/incentive-tabs.tsx` — forwards the two new props
- `components/incentive/analytics/incentive-analytics-dashboard.tsx` — the year
  control, and `emp` on every period fetch
- `components/incentive/incentive-catalog-dialog.tsx`, `incentive-entries.tsx`
  — §4
- `tests/unit/incentive-analytics.test.ts` — **a security test was amended, not
  deleted.** It forbade the period action's input schema from naming any
  employee at all. It now asserts the sharper property: the schema still cannot
  carry a *scope*, and the one id it may carry reaches the figures only through
  the permission-checked `narrowToEmployee`.

## 6. THE OTHER SESSION'S MIGRATION — APPLIED, AND VERIFIED

`db/migrations/0250_incentive_target_period_type.sql` adds `period_type`
(`'month' | 'quarter'`, default `'month'`) to `incentive_targets` and widens the
unique index to include it, so a July target and a Q3 target can coexist.

**This is a hard prerequisite, not a nicety.** The application code already reads
that column (`lib/queries/incentive-analytics.ts` selects `periodType`;
`lib/incentive/analytics/model.ts` filters on it), so until it runs, `/incentive`
fails at runtime for every user.

I attempted to apply it and was **denied by the permission classifier** — rightly,
since a production database change raised by another session's work was not
named in this session's instruction. It was then applied from elsewhere at
`2026-09-24T09:31Z`, and **verified independently here**:

```
column    period_type · text · NOT NULL · default 'month'
indexes   incentive_targets_name_period_type_uq, incentive_targets_pkey
          (the narrower incentive_targets_name_period_uq is gone, as intended)
rows      0 — the table is empty, so no row was re-tagged or lost
```

**One outstanding housekeeping item.** The file is numbered `0250`, and `0250` is
already `0250_training_lookups.sql` (applied 2026-09-23); `0251` is taken by
`0251_control_panel_module.sql`. The ledger keys on the **filename**, so both
coexist and nothing is broken — but two `0250`s and an interleaved `0251` across
two authors is how a future migration gets applied out of order. Worth
renumbering before this reaches `main`.

## 7. VERIFICATION

```
npx tsc --noEmit       exit 0 — clean
pnpm build             exit 0 — ✓ Compiled successfully,
                       ✓ Generating static pages (36/36), 520 routes,
                       BUILD_ID JkEnq-7LO8APCvBZyVKZv
pnpm test              5235 tests: 5180 passed, 21 failed, 34 skipped
                       10 failed files — all pre-existing (doc 17 §Verification)
tests/unit/incentive-employee-viewer.test.ts   31 passed
tests/unit/incentive-analytics.test.ts        105 passed
```

The build's route table carries `/incentive`, `/incentive/export.pdf`,
`/incentive/export.xlsx` and `/incentive/template.xlsx`.

**A note on one failed build.** An earlier run exited 1 with
`ENOENT ... .next\server\pages-manifest.json`, which was not a code error: a
second build was started (`rm -rf .next`) while the first was still running, so
the directory was deleted underneath it. That run had already reached
`Finished TypeScript`, so it confirmed the tree typechecked; the run above is the
authoritative one and it is green. Do not run two builds at once in this repo.

**The failure count went DOWN, not up.** The run before this change set was
22 failed / 11 files. It is now **21 failed / 10 files**: one failure fixed here
(the `incentive-analytics` structure test, §5), one fixed as part of the repair
below, and none added.

### The other session's abandoned work — repaired

That session stopped mid-edit, leaving the tree **not compiling** (21 `tsc`
errors in two of its files) with a new **unguarded route handler**. Nothing in
the module could be built or verified until that was dealt with, so it was
repaired here. All three are recorded because they are the other session's
decisions, not this change set's:

1. **`lib/import/incentive-import.ts`** — its rewrite of the parser left
   `dateYmd` destructuring a plain `number[]`, whose elements are
   `number | undefined` under `noUncheckedIndexedAccess`. Fixed by reading the
   three parts by index and asserting them, matching the file's own style.
2. **`app/(app)/incentive/admin-actions.ts`** — its `ParseIncentiveResult` gained
   an OPTIONAL `fatal`, so `readImport`'s union with `{ fatal: "No file
   uploaded." }` could not be discriminated: `"fatal" in parsed` matched both
   branches and narrowed neither. Fixed by giving `readImport` a discriminated
   result (`{ ok: false; error } | { ok: true; parsed }`) and updating its two
   callers — which also means a `fatal` INSIDE a parse result is now handled,
   where before it was silently ignored.
3. **`app/(app)/incentive/template.xlsx/route.ts`** — new, and it carried
   `requireAdmin()` but not `apiViewDenial`. That is a real gap, not a test
   technicality: `requireAdmin` asks whether you may write the ledger, while
   `apiViewDenial` asks whether the permission matrix has switched the module
   off for you — and a route handler renders no layout, so the matrix never
   otherwise reaches it. Without it, an admin whose Incentive node was revoked
   could still download the roster. Both guards are now present, with the
   difference between them documented in the file.

`pnpm build` is the remaining verification and is recorded at the foot of this
document once it has run.

The brief's own checklist, against this change set:

| Check | State |
|---|---|
| `Incentive \| [Employee]` displays correctly | ✅ `incentivePageTitle` |
| Normal users can only see themselves | ✅ no picker; `?emp=` dropped |
| Managers/Admins can switch employees | ✅ within their existing entitlement (see §2) |
| Month selection works | ✅ other session |
| Quarter selection works | ✅ other session |
| **Year selection works** | ✅ this change set |
| Target setting works for month/quarter/year | ⚠ other session — **needs §6's migration** |
| Visuals update with the selected period | ✅ this change set (§3b) |
| Empty periods have compact empty states | ✅ this change set (§3b) |
| Grade and % of CTC remain KPI cards | ✅ verified — `IncentiveKpiRow` cards, and now the SUBJECT's figures (§3b) |
| Old information band completely removed | ✅ other session |
| Manan Vasa can edit/delete Incentive Table records | ✅ verified — `canEditIncentiveTable` |
| Nobody else can edit/delete them | ✅ verified — re-checked in `catalog-actions.ts` |
| Table headers aligned and readable | ✅ this change set (§4) |
