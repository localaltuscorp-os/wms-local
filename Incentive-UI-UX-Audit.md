# Incentive Module — UI/UX Audit & Restructuring Plan

**Prepared:** 16 September 2026
**Scope:** audit and design plan only. No application code, database, backend logic or existing functionality was changed while producing this document.
**Reference design language:** `design-system/SKILL.md` (Altus OS UI language), `components/layout/page-command-bar.tsx`, `components/layout/page-shell.tsx`, `components/admin/ui/data-table.tsx`, and the WMS Dashboard (`app/(app)/dashboard/page.tsx` + `components/dashboard/*`).

---

## 0. What the Incentive module actually is today

### 0.1 Routes and files

| Surface | Route | Entry file |
| --- | --- | --- |
| Incentive module (6 areas on one route) | `/incentive?tab=…` | `app/(app)/incentive/page.tsx` |
| Incentive Table (catalog) | modal on `/incentive`, deep link `?view=table` | `components/incentive/incentive-catalog-dialog.tsx` |
| Catalog exports | `/incentive/export.pdf`, `/incentive/export.xlsx` | `app/(app)/incentive/export.*/route.ts` |
| Incentive Master + Incentive Chart (eligibility) | `/admin/incentive-master` | `app/(admin)/admin/incentive-master/page.tsx` |
| Incentive payout (Accounts) | `/salary/incentive-payout` | `app/(app)/salary/incentive-payout/page.tsx` |
| Mobile API | `/api/mobile/incentive` | `app/api/mobile/incentive/route.ts` |
| Digest cron | `/api/cron/incentive-digest` | `app/api/cron/incentive-digest/route.ts` |

The module is a **single-page, six-area module**. `IncentiveTabs` (`components/incentive/incentive-tabs.tsx`) reads `?tab=` and renders one of: `dashboard`, `targets`, `billing`, `requests`, `entries` (admin), `status` (admin + `INCENTIVE_STATUS_UI` flag). The horizontal tab strip was already removed (2026-09-16) in favour of the sidebar rail — that decision is correct and this plan keeps it.

### 0.2 Navigation

- Incentive is its own room/workspace (`lib/workspaces.ts:28,99`, `lib/module-theme.ts:247`), landing on `/incentive`.
- The rail is declared once in `components/layout/main-nav.tsx:443-452`: Dashboard · Targets · Billing · Requests · Entries (adminOnly) · Status (adminOnly). Each item links to `/incentive?tab=<key>`.
- Hub card colour is magenta (`#F6E3F4` / `#8E298E`, `app/(app)/hub/page.tsx:134`) while the room's accent inside is red (`lib/module-theme.ts:253`). Deliberate and documented.
- `navTitleFor` special-cases `/incentive` because the six rail entries share one href (`main-nav.tsx:695-696`).

### 0.3 Permissions actually in force (do not invent new ones)

| Capability | Rule | Source |
| --- | --- | --- |
| Decide a request (approve / reject / due / not due / reverse / publish / revise) | Founder (Manan Vasa) only | `lib/auth/incentive-permissions.ts` |
| See everyone's analytics | admin OR super-admin OR reviewer | `lib/incentive/analytics/scope.ts` |
| See team | self + transitive downline via `getDownlineIds` | `lib/incentive/analytics/scope.ts` |
| Team/User switch shown at all | `scope.all || employeeIds.size > 1` | `applyAnalyticsView` |
| Entries area | `me.isAdmin` | `app/(app)/incentive/page.tsx`, `incentive-tabs.tsx` |
| Status area | `me.isAdmin && incentiveStatusUiEnabled()` | `app/(app)/incentive/page.tsx` |
| Company KPI strip in the page header | `scope.all` (dashboard is `null` otherwise) | `app/(app)/incentive/page.tsx` |
| Incentive Master view/edit | permission matrix node `admin.incentive.master` | `lib/permissions/catalog.ts:710` |
| Change eligibility (Incentive Chart) | `incentive_eligibility.manage` — Manan only, effective **and** real identity | `lib/incentive/eligibility-guard.ts` |
| Incentive payout screen | `requireAdmin()` + node `accounts.payroll.incentive-payout` | `app/(app)/salary/incentive-payout/page.tsx`, `lib/permissions/catalog.ts:391` |
| Module route node | `employees.incentive` → `/incentive` | `lib/permissions/catalog.ts:190` |

Everything proposed below adapts **presentation** to these existing rules. No new permission, role or hierarchy rule is introduced anywhere in this plan.

---

## 1. Page-by-page audit

Each page is assessed against the requested checklist: what is good, what is confusing, what is duplicated, what is oversized, what should move, what should be removed from the UI, what should become a filter, a table or a sidebar item, and what should stay as it is.

### 1.1 Dashboard (`?tab=dashboard`)

Composed of three stacked blocks:

1. The page-level **Company KPI strip** (`CompanyKpis` in `app/(app)/incentive/page.tsx`) — company-wide viewers only.
2. `IncentiveAnalyticsDashboard` (`components/incentive/analytics/incentive-analytics-dashboard.tsx`, 780 lines).
3. A collapsed `<details>` "Year overview" holding the legacy `IncentiveDashboard` (charts, podium, leaderboard, per-employee YTD, per-incentive-name YTD) — company-wide viewers only.

**Good**

- The reading order inside the analytics dashboard is already close to right: scope → period → warning → status totals → your performance → detail table.
- Status cards are *filters*, not decoration: clicking one swaps the detail region to the records behind that status (`setActive`). This is the best interaction in the module and must be preserved.
- The Team/User switch is server-resolved and hidden when the viewer has no team — correct, and matches how the app hides rooms rather than disabling them.
- Grade Report and the status detail table both use the shared `DataTable`, so they already have search, dropdown filters, sortable headers and dense mode.
- The target warning is actionable in place (inline ₹ inputs + Save target), not a link to another screen.

**Confusing**

- **Two different time controls on one screen.** The page header has *year* pills (`?year=`, server round-trip); the dashboard body has *period* pills (Current Month / Specific Month / Last 3 / Last 6 / YTD, client fetch). The KPI strip obeys the year; everything below obeys the period. Nothing on screen explains that the four cards at the top and the six cards below are measured over different windows.
- **Two KPI rows with overlapping meaning.** Header: Total earned / Paid / Unpaid / Avg attainment (year). Body: Not Approved / Approved / Due / Not Due / Paid / Unpaid (period). "Paid" and "Unpaid" appear twice with different numbers.
- The collapsed "Year overview" is a second dashboard hiding inside the first. A `<details>` element is not a navigation pattern used anywhere else in the app.
- Scope is stated in three places: the `hint` on the command bar, the `data.scope.label` chip at the right of the period bar, and the "All employees / Your team" line in the performance strip.

**Duplicated**

- KPI card implemented four separate times across the module: `KpiCard` (`page.tsx`), `SummaryCard` (`incentive-targets.tsx`), `MetricCard` (`billing-dashboard.tsx`), `Kpi` (`salary/incentive-payout/page.tsx`). Plus `SplitCard` (`incentive-dashboard.tsx`) and `WindowCard` (`incentive-status-report.tsx`) as near-relatives.
- "Paid" and "Unpaid" totals are computed and rendered in the header strip, the status cards, the year overview's `SplitCard`s and the per-employee YTD table.

**Unnecessarily large**

- Status cards: `px-3.5 py-3`, a 19px value and a two-line caption, six across. They are the module's primary filter control and are roughly twice the height the WMS stat-chip recipe needs.
- The year-overview podium (`PodiumCard`) is a large decorative block for three rows of data that the leaderboard list already shows directly beneath it.
- `CardGrid min={240}` on the header KPIs forces four wide cards, each with an icon tile, a 27px numeral, a caption and a progress bar.

**Should move**

- Year selection moves out of the page header into the same control group as the period (one period model — see §3).
- The company KPI strip moves *into* the dashboard body as the top row of the period-scoped summary, so the strip and the cards below always agree.
- Year-overview charts (Monthly Incentive, Incentive Mix) become an optional Dashboard section, not a `<details>` element; the leaderboard belongs with them.

**Should be removed from the UI**

- The `<details>` "Year overview" wrapper (keep the content, drop the disclosure pattern).
- The podium (rank 1/2/3 cards) — the leaderboard list beneath it carries the same three rows with a bar and a total.
- Duplicate scope labelling: keep one.
- `wg-sheen` / gradient sheen treatments on cards.

**Should become a filter**

- Year (merged into the period control).
- Team/User (already a filter; keep, in one toolbar row).
- Grade (already a `DataTable` filter on the Grade Report; keep).
- "With a target / without a target" — currently only readable by scanning the Target column.

**Should become a table**

- Incentive-name YTD and Employee-wise YTD are already tables but hand-rolled; they should be `DataTable` instances so they gain search, sort and filters for free.

**Should become a sidebar item**

- Nothing new. The six existing rail entries are the right set (plus the Admin/Master entry proposed in §2, which is an existing route, not a new area).

**Should remain unchanged**

- Scope resolution and Team/User semantics (`applyAnalyticsView`).
- The click-a-status-card-to-drill interaction.
- Grade bands, rank movement, % of CTC, CTC visibility rules.
- The inline target-fill form and its server action.

### 1.2 Targets (`?tab=targets`)

`components/incentive/incentive-targets.tsx` — three summary cards, then one large card holding a hand-rolled sortable table (Person / Target / Actual / Attainment / Set), a person drill-down dialog and an admin "Set target" dialog.

**Good**

- Data-first: a real table with a totals row, sortable columns, per-row attainment.
- The admin affordance (`Set`) is on the row, where the decision is made.
- Row click opens a person drill-down — the right level of detail progression.

**Confusing**

- Attainment is encoded three ways in a single cell (ring with % text, colour, and a full-width bar). One of the three is enough.
- "Set" as a column header for an action column reads as a data column.
- Search is a `CollapsibleSearch` with a different shell from `DataTable`'s search and from the Status tab's search.
- The year comes from the page header pills, but the table header repeats "· {year}" in its subtitle.

**Duplicated**

- `SummaryCard` duplicates the header `KpiCard`.
- `SortTh` / `Td` duplicate `DataTable`'s header and cell behaviour.
- Total target / Total actual / Attainment also exist in the page header KPI strip (as Total earned / Avg attainment) for company-wide viewers.

**Unnecessarily large**

- The `rounded-[22px] p-6` section wrapper with a 9×9 icon tile and a 21px display heading above a table that already has its own header row.
- Three summary cards at `px-4.5 py-4` with 27px numerals; a `min-w-[200px]` attainment column pushes the table wide.

**Should move**

- Search and any future filter into a single toolbar row (the command bar's `toolbar` slot, or one toolbar strip), matching WMS.
- Summary numbers into a compact stat row consistent with the Dashboard.

**Should be removed from the UI**

- The attainment ring in the row (keep the bar plus % text; a ring may stay in the summary card).
- The section icon tile and the 21px section heading — the page title already says Targets.

**Should become a filter**

- "Has target / no target"; "At or above target / behind".
- Team/User, so Targets answers the same scope question the Dashboard does.

**Should become a table**

- It already is one; convert to `DataTable` so search, sort, filters, dense mode and empty state come from the shared component.

**Should remain unchanged**

- `setIncentiveYearTarget` and its admin-only gate.
- The person drill-down dialog contents.
- Scope narrowing via `restrictTargetVsActual`.

### 1.3 Billing (`?tab=billing`)

`components/incentive/billing-dashboard.tsx`, streamed through `<Suspense>` from a live Google Sheet.

**Good**

- Streaming it off the critical path is right and should not change.
- Self-healing: an empty or errored summary renders a readable state rather than throwing.
- Four metrics + per-salesperson table + deal ledger is the correct information set for Accounts.

**Confusing**

- This area is *billing*, not incentive: nothing on it is scoped to the viewer, so an employee sees the whole company's deals, while every other area respects `scope`. Flagged as an observation for a product decision — **not** changed by this plan (see §12).
- Four stacked `Panel`s each with an icon tile and a 21px display heading produce four competing section titles on one screen.
- "Monthly Billing" is a list of bars, not a chart, sitting between two tables.

**Duplicated**

- `Panel`, `Th`, `Td`, `MetricCard`, `PodiumCard`, `orderPodium` are near-copies of `incentive-dashboard.tsx`'s equivalents.
- The leaderboard (podium + ranked list) repeats the per-salesperson table immediately below it — the same rows, twice.

**Unnecessarily large**

- The podium block; `p-6` panels; the `p-10` centred loading/empty card.

**Should move**

- Nothing off the area. Internal order becomes: metrics → per-salesperson table (with search) → deals table → monthly trend last.

**Should be removed from the UI**

- The billing podium (duplicate of the ranked list).
- The separate "Billing Leaderboard" panel — fold rank and share bar into the per-salesperson table as a leading rank column.

**Should become a filter**

- Salesperson, entity, and "outstanding > 0" on the deals table.

**Should become a table**

- The monthly bar list becomes a compact table (month, billed, share) or one small chart.

**Should remain unchanged**

- `getBillingDashboard` and the Suspense boundary.
- The error and empty summaries (restyled only).

### 1.4 Requests (`?tab=requests`)

`components/incentive/incentive-list.tsx` (card list) + `incentive-form-dialog.tsx` (1,178 lines) + `incentive-decision-panel.tsx` + `incentive-history.tsx`.

**Good**

- Three genuinely different experiences from one component (reviewer queue / admin read-only / employee own), each with the right default.
- The resubmit callout is visible **without** expanding the card — the employee sees the reason and the action immediately. Keep exactly as is.
- Expanding a card reveals submitted fields, split, history and (for the reviewer) the decision panel, in a sensible order.
- `focusRequestId` deep-linking from notifications, with scroll-into-view.

**Confusing**

- Cards, not rows. For a reviewer with dozens of requests there is no sort, filter or search — the only structure is "Needs your review" vs "All other requests".
- The "New request" button floats in a right-aligned bare `div` above the list rather than in the page command bar, where every other module puts its primary action.
- Card titles are the incentive **type**; the employee name is demoted to a small grey line. For a reviewer, "who" is usually the primary key.
- Three labels on one toggle ("Open request" / "Details" / "Close").

**Duplicated**

- Status is shown as a pill *and* repeated as prose ("{Status} by {name} · {date}").
- `IncentiveFormDialog` is mounted twice — once as "New request", once per resubmittable card.

**Unnecessarily large**

- `rounded-[18px] p-5` cards with `space-y-3` between them; a 40-request queue is a very long scroll.
- Expanded cards use a two-column `<dl>` that pushes the decision panel far down the page.

**Should move**

- "New request" → page command bar `actions` slot.
- Filters (status, type, employee, date range) → one toolbar row.

**Should be removed from the UI**

- The duplicated status prose line (keep the pill plus one decided-by/at line).
- The "Content review" chip duplication when the decision panel already announces content review.

**Should become a filter**

- Status (Pending Approval, Approved, Not Approved, Due, Not Due, Reversed, Revision Requested).
- Incentive type; employee (reviewer/admin); "needs review".

**Should become a table**

- The list becomes a **compact table with expandable rows**: Employee · Type · Incentive date · Amount · Status · Submission · Action. The expanded row keeps exactly today's content (details, split, history, decision panel). The card layout is retained for mobile.

**Should remain unchanged**

- Workflow logic: `availableDecisions`, `canResubmit`, `needsReview`, `isContentReviewRequest`, `checkDecision`.
- Required-note rules and the confirm step in the decision panel.
- History immutability and the submission-number model.
- The resubmit callout behaviour.

### 1.5 Entries (`?tab=entries`, admin only)

`components/incentive/incentive-entries.tsx` — a hand-rolled table of Employee / Incentive / Month / Amount / Approved / Paid / Actions, plus an add/edit dialog and an import dialog.

**Good**

- Genuinely data-first. Row actions are icon buttons at the end of the row.
- Import and Add sit together above the table.
- The edit dialog groups the three money fields in one three-column row.

**Confusing**

- No search, sort, filter or pagination. This is the module's largest dataset (a full year of entries) rendered as one unbounded `<tbody>`.
- Delete fires immediately with no confirmation, while the catalog dialog uses `window.confirm` and the Master uses a typed-name confirmation. Three destructive-action standards in one module.
- "Employee (Roster)" and "Employee Name" are two fields with no stated relationship.
- Approved / Paid exist as both a boolean checkbox and an amount, with the checkbox not visually tied to its amount.

**Duplicated**

- `Th` / `Td` / `Field` / `Input` / `Checkbox` re-implemented locally.
- The "Add Entry" gradient button duplicates the same button in three other components.

**Unnecessarily large**

- `rounded-[22px]` card wrapper around a table that needs only a hairline.
- The count line ("N entries · year") occupies a full row on its own.

**Should move**

- Count, Import and Add into the page command bar / toolbar row.

**Should be removed from the UI**

- The standalone count paragraph (show the count in the toolbar).

**Should become a filter**

- Month, incentive name, approved/paid state, employee.

**Should become a table**

- Convert to `DataTable` with `searchText`, `filters`, `initialSort`, `dense` and `rowActions`. `bulkActions` only if a suitable server action already exists — today it does not (see §12).

**Should remain unchanged**

- `createIncentiveEntry` / `updateIncentiveEntry` / `deleteIncentiveEntry` and the import pipeline (`lib/import/incentive-import.ts`).

### 1.6 Status (`?tab=status`, admin + `INCENTIVE_STATUS_UI`)

`incentive-status-tab.tsx` → `incentive-status-report.tsx` (banner + three window cards + per-person YTD table) + an admin editor table (Booked/Accrued/Paid + Split) with `incentive-status-editor.tsx` and `incentive-team-split.tsx` dialogs.

**Good**

- The Booked / Accrued / Paid definitions banner prevents a real misreading (PMS counts Paid only).
- Three time windows (This month / Last 3 / YTD) side by side is the right comparison.
- The admin editor table puts Status and Split actions on the row.

**Confusing**

- Two tables on one screen with near-identical columns (per-person YTD report vs per-entry editor), each with its own search box.
- The area duplicates Entries' subject matter: an admin must know that "amounts" live in Entries and "status of those amounts" lives in Status.
- The window cards' "target" figure is a fourth definition of target, alongside the Targets area, the dashboard target warning and the grade report's Target column.

**Duplicated**

- Two more copies of `Th` / `Td`.
- The explanatory banner repeats what the per-bar `STATUS_META` hints already say.

**Unnecessarily large**

- `space-y-7` between sections; `rounded-[22px] p-6` on both sections; three `p-5` window cards each with three labelled progress bars.

**Should move**

- The admin editor table should merge into the Entries table as row actions plus the Booked/Accrued columns — Entries and Status become one data area with two views (see §2 recommendation and §11.5/§11.7).

**Should be removed from the UI**

- One of the two search boxes.
- The permanent banner, replaced by an inline legend under the three cards or a "What do these mean?" popover.

**Should become a filter**

- Window (This month / Last 3 / YTD) as a segmented control, if density demands it. Optional — three cards is defensible.

**Should become a table**

- The per-person YTD report → `DataTable`.

**Should remain unchanged**

- Booked/Accrued/Paid semantics, `getIncentiveStatusReport`, the flag gate, and the editor and split dialogs' behaviour and validation.

### 1.7 Incentive Master + Incentive Chart (`/admin/incentive-master`)

`app/(admin)/admin/incentive-master/page.tsx` → `AdminSection` + `IncentiveMasterTable` (`DataTable`) → `IncentiveWorkspace` full-screen editor with Details / Eligibility / History sections.

**Good**

- The **best-built screen in the module.** Shared `DataTable`, shared `AdminSection` shell, server-resolved `canEdit` / `canManageChart`, eight deliberate columns, dropdown filters including "On offer today", and bulk activate/deactivate.
- The workspace's three-section split (Details / Eligibility / History) is the right decomposition, with an internal rail on desktop and a `<select>` on mobile.
- Status is honestly modelled as two facts (active switch vs expiry date).
- Dirty-state guard, unsaved pill, typed-name delete confirmation.

**Confusing**

- The workspace uses a **different visual system** from the rest of the app: `aura` glass, `aura-blob` gradient field, grain overlay, `chrome-bar`, `chrome-rail`, `glass`, `pill state ok|warn|idle`, `btn`, `btn-quiet`, `icon-btn`, pointer-tracked sheen. Nothing else in Incentive looks like this.
- It is reached only from the Admin Panel, so the Incentive rail gives no hint the master exists; meanwhile the in-module "Incentive Table" dialog edits the *same rows* through a smaller form.

**Duplicated**

- Catalog editing exists twice: `IncentiveCatalogDialog` (name, amount, description, notes, sales/interns flags) and `IncentiveWorkspace` Details (the same plus type, product, duration, valid-until, active).

**Unnecessarily large**

- `h-[94vh] w-[94vw] max-w-[1500px]` overlay for a form that is mostly a two-column field grid.

**Should move**

- An **Admin / Master** entry should appear in the Incentive rail (gated on `admin.incentive.master`) linking to `/admin/incentive-master`, so the module owns its own front door.

**Should be removed from the UI**

- The `aura` decorative layers (blobs, grain, pointer sheen), in favour of the standard card and overlay treatment.

**Should become a filter**

- Already has Status; add Type, Product and Duration dropdown filters (`DataTable` supports them declaratively).

**Should remain unchanged**

- Everything server-side: the catalog as single source of truth, the eligibility guard, history/audit writes, and the delete confirmation rules.

### 1.8 Incentive Table / catalog dialog (modal on `/incentive`)

**Good**

- Read access for everyone; PDF/XLSX export re-reads the full catalog server-side rather than the rendered subset — correct and must be preserved.
- Deep link `?view=table` from notifications works.

**Confusing**

- An 80vw × 80vh modal is effectively a page: its own title, description, toolbar and table — everything a route has, minus a URL.
- The inline editor appears *above* the table inside the scroll area, so on a long catalog the row being edited scrolls out of sight.
- Row actions appear only on hover (`opacity-0 group-hover:opacity-100`) — invisible on touch devices.
- `window.confirm` for delete, unlike every other delete in the module.
- The dialog title uses `font-serif italic` at 24px — a type treatment used nowhere else.

**Should move**

- The dialog becomes a **route inside the module** (see §2): `/incentive?tab=chart`, with the admin Master remaining the editing surface.

**Should be removed from the UI**

- Hover-only actions; the serif italic title; the duplicate inline editor.

**Should become a table**

- It already is one; convert to `DataTable` for search, sort and an eligibility filter.

**Should remain unchanged**

- The export routes and their `Content-Disposition` behaviour.
- Read-for-everyone access.

### 1.9 Incentive payout (`/salary/incentive-payout`, Accounts)

**Good**

- The right KPI set for the job (Booked / Accrued-payable / Paid / Remainder) and an honest caption that it records rather than disburses.
- Month pills are the right control for this screen.

**Confusing**

- It is an Accounts surface for an Incentive job, and neither room's rail links to it (`main-nav.tsx` has no `/salary/incentive-payout` entry).
- It does not use `PageShell` or `PageCommandBar`: it hand-rolls `<main className="mx-auto max-w-[1200px] px-8 …">` plus a 26px-radius glass hero with a red uppercase eyebrow pill — exactly the two patterns `PageCommandBar` documents as removed.
- The file names its red constants `GREEN` / `GREEN_DEEP` (`const GREEN = "#E10600"`), which is a maintenance trap.

**Should move**

- Add it to the Accounts rail (it already has a permission node) and cross-link it from Incentive → Status. Keep the route where it is so existing links survive.

**Should be removed from the UI**

- The eyebrow pill ("SALARY · INCENTIVE PAYOUT") and the 42px hero title; replaced by `PageCommandBar` with the month strip in the `toolbar` slot.

**Should remain unchanged**

- `getIncentivePayoutBoard`, the payout flag, and all payout math (`lib/incentive/payout*.ts`).

### 1.10 Modal / drawer inventory

| Surface | File | Size | Note |
| --- | --- | --- | --- |
| New / Resubmit request | `incentive-form-dialog.tsx` | `max-w-[980px]`, two panes | Best form in the module; keep structure |
| Incentive Table | `incentive-catalog-dialog.tsx` | `80vw × 80vh` | Should be a route |
| Set year target | `incentive-targets.tsx` → `SetTargetDialog` | `max-w-md` | Fine |
| Person drill-down | `incentive-person-drilldown.tsx` | `max-w-2xl` | Fine |
| Add / Edit entry | `incentive-entries.tsx` → `EntryDialog` | `max-w-lg` | Fine |
| Import entries | `incentive-import-dialog.tsx` | `max-w-lg` | Fine |
| Set status (Booked/Accrued/Paid) | `incentive-status-editor.tsx` | `max-w-md` | Fine |
| Team split | `incentive-team-split.tsx` | `max-w-2xl` | Fine; has a real mobile fallback grid |
| Incentive workspace | `admin/incentive-master/workspace.tsx` | `94vw × 94vh` | Different design system |
| Delete confirmation | `workspace.tsx` → `DeleteConfirm` | typed-name confirm | Best destructive pattern — standardise on it |

Modal corner radii in use: `rounded-2xl` (16px), `rounded-[20px]`, `rounded-[22px]`, `rounded-[24px]`, `rounded-[26px]`, `rounded-section`. Five different modal radii for one module.

---

## 2. Information architecture

### 2.1 Final sidebar structure

```
Incentive                       (room; landing = /incentive)
├── Dashboard                   ?tab=dashboard        everyone
├── Requests                    ?tab=requests         everyone
├── Targets                     ?tab=targets          everyone (scope-narrowed)
├── Entries                     ?tab=entries          admin
├── Status                      ?tab=status           admin + INCENTIVE_STATUS_UI
├── Billing                     ?tab=billing          as today
├── Incentive Chart             ?tab=chart            everyone (read) — was the modal
└── Admin / Master              /admin/incentive-master   node: admin.incentive.master
```

Changes from today, and why:

1. **Order changes to match how the module is used.** Dashboard → Requests → Targets first: filing and reviewing a request is the module's most frequent job, and it currently sits fourth. Entries/Status/Billing are periodic admin and accounts work.
2. **Incentive Chart becomes a rail entry** instead of an 80vw modal launched from a header button. The existing `?view=table` deep link keeps working by redirecting to `?tab=chart`.
3. **Admin / Master becomes a rail entry** pointing at the existing `/admin/incentive-master` route, gated by the existing `admin.incentive.master` node. No new permission, and the Admin Panel entry stays where it is.
4. **No horizontal navigation is re-introduced anywhere.** The rail is the only navigation. Inside a page, the only segmented controls are *filters* (Team/User, period), never area switches.
5. `Entries` and `Status` may optionally merge into one `Entries` area with a Status view toggle (§11.5). Recommended, but it can follow later — the rail supports either shape.

### 2.2 Dashboard scope switch

```
[ Team ] [ User ]
```

- **Team** = the manager's team = the scope the server already resolved (`AnalyticsScope`), which for a company-wide viewer is everyone and for a manager is self + transitive downline.
- **User** = the signed-in user's own data only.
- Rendered only when `scope.canSeeTeam` is true — exactly today's rule in `applyAnalyticsView`.
- An employee with no reports gets no switch and sees their own data; nothing changes for them.

The same `[Team] [User]` control should also govern **Targets**, so the two areas answer the same "whose numbers am I looking at" question with the same control in the same position. No new server rule is needed — Targets already narrows via `restrictTargetVsActual`.

### 2.3 What the URL owns

- `?tab=` — the area (rail-driven, as today).
- `?period=` / `?month=` — the period (today this is client state only; promoting it to the URL makes a dashboard view shareable and survivable across a refresh).
- `?view=team|user` — the scope switch.
- `?request=<id>` — deep link to a request (unchanged).
- `?year=` — **retired** once period covers it; keep accepting it and map `?year=YYYY` to the YTD period of that year so existing links and bookmarks do not break.

---

## 3. Dashboard audit and recommended order

### 3.1 The question the Dashboard must answer

"What is happening with incentives — for the people I am responsible for, over the window I care about?" The screen should answer it above the fold, on a 1366×768 laptop, without scrolling.

### 3.2 Recommended order

| # | Block | Notes |
| --- | --- | --- |
| 1 | **Control row** — `[Team][User]` · period segmented (Current Month / Month ▾ / Last 3 / Last 6 / YTD) · resolved-window label · scope label | One row, one card, height ≈ 44px. Year folds into the period control: picking a specific month or YTD sets the year. |
| 2 | **Target warning** | Only when `missingCurrent || missingNext`. It is an action, so it outranks numbers. Inline inputs stay. |
| 3 | **KPI row (period-scoped)** — Earned · Paid · Unpaid · Attainment | Replaces today's year-scoped header strip. Same window as everything below. For company-wide viewers it is company-wide; otherwise it is the viewer's scope. |
| 4 | **Status summary (6)** — Not Approved · Approved · Due · Not Due · Paid · Unpaid | Compact, clickable, in one row at ≥1280px. These are filters; style them as stat chips, not cards. |
| 5 | **Your performance** — Grade · Incentive · % of CTC · Rank (+ movement) · Target vs Actual | One dense row, as today. Keep. |
| 6 | **Team summary line** — headcount · incentive · target · grade distribution A/B/C/D | Keep as the thin strip it already is. |
| 7 | **Detail region** — Employee Grade Report, replaced in place by the status drill-down table when a status chip is selected | Keep exactly this behaviour. It is the module's best idea. |
| 8 | **Trends (company-wide viewers only, collapsible section, not `<details>`)** — Monthly incentive, incentive mix, leaderboard, per-incentive-name YTD | Demoted below the table, since the table answers the daily question. |

Search/filter placement: search belongs to the **table**, inside the `DataTable` toolbar — not to the page. There is no page-level search on the Dashboard today and none should be added.

### 3.3 What not to add

- No new charts. The module is labelled Analytics but the operative question is "who earned what, and what state is it in" — a table answers that better than a chart. The existing two charts are enough, and they belong in the demoted Trends section.
- No sparklines in KPI cards, no donut for grade distribution (the A/B/C/D chip row is denser and readable).
- No third time control.

### 3.4 Expected density gain

Today, on a 1366×768 laptop, a company-wide viewer sees the command bar, four large KPI cards and roughly the top of the status card row. Under the proposed order the same viewport shows: control row, KPI row, all six status chips, the performance row, the team line and the first four or five rows of the grade table. That is the goal — "what is happening with incentives" answered without scrolling.

---

## 4. Consistency audit against the WMS UI

`design-system/SKILL.md` is the contract. The table below lists where Incentive departs from it, with the concrete fix.

| Area | WMS / design-system standard | Incentive today | Fix |
| --- | --- | --- | --- |
| **Sidebar** | One rail per room, declared in `main-nav.tsx` | Correct — six entries, no duplicate horizontal nav | Add Chart + Admin/Master entries; reorder |
| **Header** | `PageCommandBar` — `rounded-[20px]`, hairline, title + inline hint, `actions`, `toolbar` | Used on `/incentive`; **not** used on `/salary/incentive-payout` (glass hero + eyebrow pill) | Move payout page onto `PageCommandBar` + `PageShell` |
| **Page container** | `PageShell` with `--page-gutter` | Used on `/incentive`; payout page hand-rolls `mx-auto max-w-[1200px] px-8` | Use `PageShell width="wide"` |
| **Primary button** | `.pastel-cta` — 12% accent fill on white, `--color-altus-red-deep` ink, `h-9 rounded-pill px-3.5 text-[13px]` | Solid `linear-gradient(135deg,#E10600,#A80400)` white-text buttons in at least 8 places (`incentive-entries`, `incentive-targets`, `incentive-catalog-dialog`, `incentive-form-dialog`, `analytics-dashboard`, `master-table`, payout page) | Replace with `.pastel-cta`; keep solid red only for a destructive confirm |
| **Secondary button** | Neutral hairline pill, `h-9` | Ad-hoc `inset 0 0 0 1px var(--color-hairline-strong)` pills at several heights | One neutral recipe |
| **Segmented toggle** | `h-9`, `rounded-pill`, `bg-surface-soft` track, active = accent gradient, white ink | Year pills, period pills, Team/User pills and decision buttons each use their own geometry | One `SegmentedControl` used by all four |
| **Tabs** | Rail only | Rail only (strip already removed) | No change |
| **Filters** | Filter pill dropdown (`h-9`, chevron, active tint) and/or `DataTable.filters` | Only `DataTable` instances have filters; Targets, Entries, Status tables and the Requests list have none | Adopt `DataTable` filters everywhere |
| **Tables** | `DataTable`, `th` at `10.5px/700/uppercase/tracking-[0.1em]`, `td` `12.5–13.5px`, rows `border-b border-hairline`, hover `bg-surface-soft` | Two `DataTable` users; **seven** hand-rolled `Th`/`Td` pairs; `th` at 11px and 10.5px; hover tinted `color-mix(#E10600 3%)` | Migrate all tables to `DataTable` |
| **Cards** | `rounded-2xl` (16px) or `rounded-section`, hairline, `0 1px 2px` + soft drop | `rounded-[18px]`, `[20px]`, `[22px]`, `[24px]`, `[26px]`, plus `inset 0 0 0 1px` + `inset 0 1px 0 rgba(255,255,255,0.7)` + `0 10px 28px -20px` triple shadows | Two card recipes only: flat (`rounded-2xl`, hairline) and raised (adds the soft drop) |
| **Modals** | Radix dialog, hairline border, `rounded-2xl`, sized to content | Five radii, sizes from `max-w-md` to `94vw × 94vh` | Four sizes: `sm` 480 / `md` 640 / `lg` 980 / `full` (Master workspace only) |
| **Forms** | `FieldShell` + labels at 13px/700, required `*` in accent, error under the field | `incentive-form-dialog` is exemplary; `incentive-entries`, `incentive-catalog-dialog`, `incentive-status-editor` each re-implement `Field`/`Input` | Extract the form-dialog primitives and reuse |
| **Typography** | Page title `clamp(22px,2vw,32px)`/800; section heading 16px/800 display; body 13.5px | Section headings at 20–21px with `fontWeight: 900` (display font clamps at 800 — a documented trap); body sizes 13, 13.5, 14, 14.5, 15 | Section headings 16px/800; body 13.5px; secondary 12.5px |
| **Spacing** | 4/8/12/16/24 rhythm; `mb-4` under the command bar | `space-y-5`, `space-y-7`, `space-y-8`, `gap-3.5`, `p-6`, `px-4.5`, `py-4.5` | One scale: `gap-2` controls, `gap-3` cards, `space-y-4` sections |
| **Icons** | lucide only, 13–16px, stroke 2.2–2.4 | lucide only ✅ but sizes 10.5–22 and strokes 2.2–2.8 | 14px/2.4 in chrome, 16px/2.6 inside filled buttons |
| **Status badges** | `rounded-pill px-2 py-0.5 text-[11px] font-bold`, `-deep` ink on a tinted fill | `IncentiveStatusPill` is close (12px, `px-2.5`) but uses literal `rgba()` instead of tokens; grade badges use a second hardcoded map; master uses `pill state ok/warn/idle` | One badge component reading from the token families |
| **Colours** | `var(--color-altus-red*)` — user-overridable accent | Literal `#E10600` / `#A80400` in at least 14 files, plus `#16a34a`, `#15803d`, `#d97706`, `#B45309`, `#0F766E`, `#1D4ED8`, `#D4AF37`, `#334155` | Token families (`green`, `amber`, `blue`, `teal`, `slate`) and `var(--color-altus-red)` |
| **Empty states** | Icon tile + heading + "what to do next" body, `px-8 py-14` | Six different empty states, from a bare `<p>` to a `p-10` centred card | One `EmptyState` component |
| **Loading states** | Route `loading.tsx` / skeletons | Billing shows a text card ("Loading billing from the live sheet…"); the dashboard's period refetch dims content to `opacity-60` + a spinner; no `loading.tsx` for `/incentive` | Add `app/(app)/incentive/loading.tsx` skeleton; keep the dim-and-spin refetch (it is good); replace the billing text card with a table skeleton |

### 4.1 The single most valuable consistency fix

Replacing the seven hand-rolled tables with `DataTable` gets, in one change: consistent header typography and padding, a consistent search field with the `Local search — <what>` naming convention, dropdown filters, sortable columns, dense mode, a select-all/bulk bar where useful, and consistent empty states. It removes roughly 400 lines of duplicated markup from the module.

---

## 5. Density and spacing

### 5.1 Where space is wasted

| Symptom | Where | Cost |
| --- | --- | --- |
| Oversized KPI cards | `CompanyKpis`, `SummaryCard`, `MetricCard`, `Kpi` — icon tile + 27px numeral + caption + progress bar | ~110px tall × 4, for four numbers |
| Oversized status cards | analytics dashboard status grid | ~86px tall × 6 |
| Section chrome repeated | `Panel` in `incentive-dashboard` and `billing-dashboard`: `p-6` + 9×9 icon tile + 21px heading + description | ~70px per section, ×4 on Billing alone |
| Podiums | year overview + billing | ~180px each, duplicating the ranked list below |
| Card lists instead of rows | Requests | ~150px per request vs ~44px per table row |
| Nested rounded containers | card inside card inside `<details>` on the Dashboard | Three borders around one table |
| Double headers | page command bar title *and* a 20–21px section heading beneath it on Targets, Status, Billing | ~48px per screen |
| `space-y-7` / `space-y-8` between sections | Status tab, Requests | 28–32px gaps where 16px reads fine |
| Duplicate navigation | none — already fixed by removing the tab strip | — |

### 5.2 Target density

- Command bar 56px, toolbar row 40px, KPI row ≤ 84px, status chip row ≤ 56px, table rows 40px dense.
- Section gap 16px (`space-y-4`); card padding `p-4` (`p-3` on mobile); toolbar gap 8px.
- Maximum of **two** nested rounded containers on any screen.
- A section heading appears only when a screen has more than one section; the page title is not repeated.

### 5.3 What must not become cramped

- The target warning keeps its padding and its inline inputs — it is an action, and a shrunken alert is a missed alert.
- Expanded request detail keeps `gap-y-2.5` between field pairs; it is read carefully, not scanned.
- Money figures keep `tabular-nums` and never drop below 13px.

---

## 6. Admin vs manager vs employee experience

### 6.1 Does the current UI mix them?

Yes, in four specific places:

1. **The page header KPI strip** shows company totals to company-wide viewers, sitting directly above a dashboard scoped to the viewer's `Team`/`User` selection. Switching to `User` does not change the strip — so an admin looking at one person still sees company numbers above that person's numbers.
2. **Billing** is company-wide for everyone, inside a module where every other area is scoped.
3. **Targets** shows a Set-target action column to admins, interleaved with rows a manager sees read-only — correct, but the column header ("Set") does not say it is an admin action.
4. **Requests** mixes "my requests" and "everyone's requests" in one list for admins and the reviewer, separated only by whether the employee name is rendered.

### 6.2 Recommended adaptation (using only existing rules)

| Viewer | Rail | Dashboard | Targets | Requests | Entries / Status | Billing | Chart | Admin/Master |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Employee (no reports)** | Dashboard · Requests · Targets · Billing · Chart | Own data; no Team/User switch; own grade, rank, % of CTC; target warning actionable | Own row(s), read-only | Own requests + New request + resubmit | hidden | as today | read-only | hidden |
| **Manager / team lead** | same | `[Team][User]`; Team = self + downline | Same scope, `[Team][User]` | Own requests (no decision controls) | hidden | as today | read-only | hidden |
| **Admin** | + Entries · Status | `[Team][User]`, Team = everyone; company KPI row | Everyone + Set target | Everyone, read-only (no decisions) | visible | as today | read-only | visible if `admin.incentive.master` |
| **Reviewer (Manan)** | as admin | company-wide | everyone | "Needs your review" queue first + decision panel | per admin flags | as today | read-only | visible; eligibility editable |
| **Accounts** | Billing (+ payout link) | per their own scope | per scope | own | per admin flags | primary surface | read-only | per node |

Rules that make this work without touching permissions:

- The KPI row is **always** the current scope's roll-up, so it agrees with the cards under it. `scope.all` still decides whether company-wide data is even fetched.
- Admin-only columns are labelled as actions, not data, and appear last in the row.
- The Requests table gets an "Mine / All" filter for admins and the reviewer — a display filter over rows they are already allowed to see, not a permission.
- Nothing is disabled-and-greyed: areas a viewer cannot use stay hidden, as the app does elsewhere.

---

## 7. Tables and filters

### 7.1 Per-table recommendations

**Dashboard → Employee Grade Report** (already `DataTable`)
Keep: Employee (+ code, "You"), CTC (period), Incentive Earned, % of CTC, Grade, Rank (+ movement), Target, Difference.
Change: freeze the Employee column on horizontal scroll; keep `initialSort` on rank; add a "Has target" filter next to the existing Grade filter; keep search ("Search employee or code").

**Dashboard → Status drill-down** (already `DataTable`)
Keep: Employee, Incentive Type (+ product), Incentive Date, Amount, Status, Review, Payment.
Change: move Review (reviewer + date + note) into an expandable row detail — it is the widest column and is read rarely; keep the note in a tooltip until expanded.

**Targets** (convert to `DataTable`)
Keep: Person, Target, Actual, Attainment (bar + %), Set (admin only).
Remove: the per-row ring.
Add: filters "Has target / No target", "At or above target / Behind"; search "Local search — person"; totals row preserved.
Freeze: Person.

**Requests** (convert to an expandable-row table)
Columns: Employee (admin/reviewer only) · Type · Incentive date · Amount · Status · Submission · Action.
Row detail: today's full expansion (fields, links, split, history, decision panel).
Filters: Status, Type, "Needs review" (reviewer), "Mine / All" (admin, reviewer).
Sort: default "needs review first, then newest".
Search: employee, type, product, client name.

**Entries** (convert to `DataTable`)
Keep: Employee, Incentive, Month, Amount, Approved (✓ + amount), Paid (✓ + amount), Actions.
Move to row detail: Note.
Filters: Month, Incentive name, Approved, Paid.
Search: employee or incentive.
Pagination: needed — this is the only unbounded list in the module.
Bulk actions: only if an existing server action supports the operation; none exists today, so do not add one in a UI-only change.

**Status → per-person YTD** (convert to `DataTable`)
Keep: Person, Target, Booked, Accrued, Paid, Attain.
Add: search (one box for the area, not two), "Behind / On target" filter.

**Status → admin editor** (merge into Entries, or convert to `DataTable`)
Keep: Employee (+ participant count), Incentive, Booked, Accrued, Paid, Actions (Status, Split).

**Billing → per salesperson** (convert to `DataTable`)
Keep: rank, Salesperson, Deals, Billed, Collected, Outstanding. Fold the leaderboard's bar into this table.

**Billing → deals** (convert to `DataTable`)
Keep: Client, Salesperson, Entity, Billed, Collected.
Add: search and a salesperson filter; sort by billed descending by default.

**Incentive Chart** (convert to `DataTable`)
Keep: Incentive, Amount, Eligible (Sales / Interns), description as row detail.
Add: search, eligibility filter; keep the PDF/Excel export buttons in the toolbar.

**Incentive Master** (already `DataTable`)
Keep all eight columns and the bulk activate/deactivate.
Add: Type, Product, Duration filters.

### 7.2 Cross-cutting table rules

- **Search placement:** inside the table toolbar, left; labelled `Local search — <what it filters>` with the documented `title`, per `design-system/SKILL.md`.
- **Filter placement:** same toolbar, right of search, as filter pills. Never a separate filter card above the table.
- **Sorting:** header click; default sort stated per table above; `tabular-nums` on every numeric column.
- **Pagination:** required for Entries and the Status editor; everything else is bounded by scope or by the year.
- **Frozen columns:** the identity column (Employee / Person / Salesperson / Incentive) on every table that scrolls horizontally.
- **Row actions:** last column, right-aligned, icon buttons with `aria-label`, revealed always (never hover-only).
- **Bulk actions:** only where a server action already exists — today that is Incentive Master (activate/deactivate) alone.
- **Destructive actions:** one pattern — the Master's typed-name confirmation for irreversible deletes; a Radix confirm dialog (never `window.confirm`, never silent) elsewhere.

---

## 8. Forms and modals

### 8.1 `IncentiveFormDialog` (new / resubmit) — the reference

Already correct on: two-pane layout at `md`, field grouping (`pane`, `half`), conditional fields per type, a required-field summary that focuses the offending field, an always-visible footer with a `*` legend, per-field error messages, `noValidate` with custom validation, and a resubmission section that shows the decision before asking for a justification.

Recommended refinements only:

- Extract `FieldShell`, `FieldControl`, `NotesInput` and the problem-summary block into shared form primitives so the other four dialogs stop re-implementing them.
- On mobile the right pane stacks under the left; the empty-state hint ("Choose an incentive type…") is hidden — correct. Keep.
- Keep the split editor exactly as it is, including the equal-split behaviour and the 2-decimal percentage rule.

### 8.2 The other dialogs

| Dialog | Issue | Fix |
| --- | --- | --- |
| Entry add/edit | Local `Field`/`Input`/`Checkbox`; checkbox not tied to its amount; roster vs free-text employee unexplained | Shared primitives; pair each checkbox with its amount in one row; one hint line explaining the roster/free-text pair |
| Import | Fine | Restyle only |
| Set target | Fine | Restyle only |
| Status editor | Local field markup | Shared primitives |
| Team split | Good mobile fallback grid | Keep; restyle |
| Catalog editor (inline in the modal) | Editor scrolls away above the table; duplicates the Master's Details form | Remove once the Chart becomes read-only in-module and editing lives in the Master |
| Master workspace | Different design system; 94vw×94vh | Restyle onto app tokens; keep the three-section rail; reduce to `max-w-[1200px]`, `h-[88vh]` |

### 8.3 Modal rules

- Four sizes only: `sm` 480px (confirm, single field), `md` 640px (one form), `lg` 980px (two-pane form), `full` (Master workspace).
- Header: title (18px/800) + one-line description; close button top-right.
- Body scrolls; header and footer are `shrink-0` — as `IncentiveFormDialog` already does.
- Footer: secondary left-of-primary, right-aligned; primary is `.pastel-cta`; destructive is solid red and always behind a confirm.
- Errors: under the field, plus a summary block at the top of the pane for more than two errors.
- Mobile: full-width minus a 12px gutter, `max-h-[calc(100dvh-24px)]`; two-column grids collapse to one.

---

## 9. Visual system

### 9.1 Primary colour

**Use `var(--color-altus-red)` / `var(--color-altus-red-deep)` — the app accent, which each employee can override.** Do not introduce a separate Incentive primary and do not hardcode `#E10600`: `lib/appearance.ts` rewrites the accent family per request, so a literal hex silently opts the module out of the user's own theme.

Incentive keeps its identity through the **magenta hub card** (`#F6E3F4` / `#8E298E`) and the Award mark that already exist, not through a second in-module accent.

### 9.2 Status colours (map to existing token families)

| Meaning | Family | Used by |
| --- | --- | --- |
| Approved / Published / Paid | `green` (`--color-green` fill, `--color-green-deep` ink) | request status, status cards, paid amounts |
| Pending Approval / Revision Requested | `amber` | request status, "waiting on someone" |
| Not Approved / Reversed | `red` (accent family) | request status |
| Due | `blue` | request status |
| Not Due | `slate` | request status |
| Booked (client paid partial) | `amber` | status report |
| Accrued (client paid in full) | `green` | status report |
| Paid to employee | `teal` or `green-deep` | status report, payout |
| Unpaid / outstanding | `red` | KPI, billing |

`IncentiveStatusPill` already centralises the request-status map — keep the component, swap its literal `rgba()` values for the token families, and have the grade badges, the status cards and the Master's `pill state` chips all read from it.

### 9.3 Grade colours

Keep the current semantics, expressed as tokens: **A** `green`, **B** `blue`, **C** `amber`, **D** `red`, **no grade** `slate`. One shared `GradeBadge`, used by the performance strip, the grade report and any future report card.

### 9.4 Button hierarchy

1. **Primary** — `.pastel-cta` (12% accent fill, `-deep` ink). One per screen region: "New request", "Add entry", "New incentive", "Save".
2. **Secondary** — neutral hairline pill (`Import`, `PDF`, `Excel`, `Cancel`).
3. **Tertiary / row action** — icon button, `size-8 rounded-lg`, hairline, `aria-label`.
4. **Destructive** — solid red, only inside a confirmation.

Retire the module-wide `linear-gradient(135deg,#E10600,#A80400)` white-text button; it currently reads as "primary" in eight places on one screen, which leaves no hierarchy at all.

### 9.5 Card style, radius, shadow

- **Flat card** — `rounded-2xl`, `1px var(--color-hairline)`, no shadow. Default for tables, panels and toolbars.
- **Raised card** — the same plus `0 1px 2px rgba(15,23,42,0.05), 0 18px 44px -30px rgba(15,23,42,0.22)`. For the command bar and modals only.
- Retire: `rounded-[18px]`, `[22px]`, `[24px]`, `[26px]`; the `inset 0 1px 0 rgba(255,255,255,0.7)` highlight; `wg-sheen`; the `aura` glass layers.
- Keep `.wg-rise` for entrance and `.wg-btn` for hover lift — both are in the design system.

### 9.6 Typography hierarchy

| Role | Value |
| --- | --- |
| Page title | `clamp(22px,2vw,32px)` · 800 · display · `-0.03em` |
| Section heading | 16px · 800 · display |
| Card / KPI value | 20–22px · 800 · display · `tabular-nums` |
| KPI label | 11px · 700 · uppercase · `tracking-[0.12em]` · `--color-ink-subtle` |
| Body | 13.5px · 500 |
| Secondary | 12.5px · 400–500 · `--color-ink-muted` |
| Table header | 10.5px · 700 · uppercase · `tracking-[0.1em]` |
| Table cell | 13px numeric (`tabular-nums`) / 13.5px name |
| Badge | 11px · 700 |

Note the documented trap: the display font stops at weight 800, so the module's `fontWeight: 900` headings are not bolder than 800 — they only look inconsistent with the rest of the app.

### 9.7 Spacing and icons

- Spacing scale: 4 / 8 / 12 / 16 / 24. Section gap 16px, card padding 16px (12px mobile), control gap 8px.
- Icons: lucide only; 14px `strokeWidth 2.4` in chrome; 16px `strokeWidth 2.6` inside filled buttons; 13px in badges. Retire 10.5px and 22px one-offs.
- Keep the existing rail icons (`LayoutDashboard`, `Target`, `IndianRupee`, `ListChecks`, `Table2`, `Layers`); add `BookOpen` for Chart and `Gift` for Admin/Master, matching the Master page's own icon.

---

## 10. User flows

### 10.1 Employee — Hub → Incentive → Dashboard → Request → Status → Resubmit

Today: Hub card → `/incentive` (Dashboard) → rail "Requests" → **scroll to the right-aligned "New request" button** → fill the dialog → submit → toast → the card appears in the list. On rejection the employee returns via a notification deep link (`?request=<id>`) — good — or via rail → Requests → find the card → read the callout → Justify & Resubmit.

Friction:

- "New request" is not in the command bar, so on a long list it is above the fold only by luck.
- An employee has no way to see "what is waiting on me" without reading every card.
- The word "Status" in the rail means the admin Booked/Accrued/Paid area, not "the status of my request" — a genuine label collision for the employee.

Proposed: New request lives in the command bar on every area of the module. Requests opens with a "Needs your attention" filter pre-applied when the viewer has any resubmittable request. The admin area keeps the name "Status" but is hidden from employees anyway; if the collision still bites, rename it "Payment status".

### 10.2 Manager — Hub → Incentive → Dashboard → Team/User → Requests

Today: Hub → Dashboard → `[Team][User]` (client refetch, good) → rail → Requests (own requests only — a manager sees no team requests, by design).

Friction: the Team/User choice does not carry over to Targets, so a manager re-establishes scope on each area. Proposal: one `view` parameter in the URL, honoured by Dashboard and Targets. No permission change — `applyAnalyticsView` already refuses to widen.

### 10.3 Admin — Hub → Incentive → Admin/Master → Incentive → Eligibility

Today: Hub → Incentive → *no rail entry for the Master* → open the profile menu → Admin Panel → Incentive → Incentive Master → row → workspace → Eligibility section. That is five or six clicks and a room change.

Proposed: rail entry "Admin / Master" → Master table → row → workspace → Eligibility. Three clicks, no room change. `/admin/incentive-master` keeps its existing gate and its Admin Panel entry.

### 10.4 Accounts — Incentive → Billing → Payment

Today: the Billing area and the payout screen are on different routes in different rooms, with no link between them. An Accounts user must know that `/salary/incentive-payout` exists.

Proposed: keep the route, add it to the Accounts rail, and cross-link from Incentive → Status ("Pay incentive with salary →") gated on the existing `accounts.payroll.incentive-payout` node. No new permission.

### 10.5 Unnecessary clicks removed

| Flow | Today | Proposed |
| --- | --- | --- |
| File a request | 3 clicks + scroll | 2 clicks, button always visible |
| Open the Incentive Chart | header button → modal (no URL) | rail entry (shareable URL) |
| Reach the Master | 5–6 clicks, room change | 3 clicks, same room |
| Change dashboard period and year | two separate controls, one a full page reload | one control, no reload |
| Find a specific entry | manual scan of an unbounded table | search + month filter |
| Reach the payout screen | direct URL only | rail entry + cross-link |

---

## 11. Final proposed structure

### 11.1 Sidebar

```
Incentive
├── Dashboard          /incentive?tab=dashboard
├── Requests           /incentive?tab=requests
├── Targets            /incentive?tab=targets
├── Entries            /incentive?tab=entries      (admin)
├── Status             /incentive?tab=status       (admin + flag)
├── Billing            /incentive?tab=billing
├── Incentive Chart    /incentive?tab=chart
└── Admin / Master     /admin/incentive-master     (admin.incentive.master)
```

No horizontal navigation anywhere inside the pages.

### 11.2 Dashboard

```
PageCommandBar  "Incentive"  · hint: scope sentence · actions: [New request]
  toolbar row:  [Team][User] | [Current month][Month ▾][Last 3][Last 6][YTD] | window label · scope
────────────────────────────────────────────────────────────────────────────
[ Target warning — only when a target is missing; inline ₹ inputs + Save ]
[ KPI row (period-scoped):  Earned · Paid · Unpaid · Attainment ]
[ Status chips ×6: Not Approved · Approved · Due · Not Due · Paid · Unpaid ]
[ Your performance: Grade · Incentive · % of CTC · Rank(+move) · Target vs Actual ]
[ Team line: people · incentive · target · A/B/C/D distribution ]
[ Detail table — Employee Grade Report  ⇄  the selected status's records ]
[ Trends (company-wide only, collapsible): monthly · mix · leaderboard · name YTD ]
```

### 11.3 Targets

```
PageCommandBar  "Targets" · hint: "Year target compared with incentive earned."
  toolbar: [Team][User] | Search | [Has target ▾] [Attainment ▾] | period/year
────────────────────────────────────────────────────────────────────────────
[ Stat row: Total target · Total actual · Attainment ]
[ DataTable: Person* · Target · Actual · Attainment(bar + %) · Set(admin) ]
   *frozen; row click → person drill-down; totals row pinned at the bottom
```

### 11.4 Requests

```
PageCommandBar  "Requests" · actions: [New request]
  toolbar: Search | [Status ▾] [Type ▾] [Mine/All ▾ (admin, reviewer)] | count
────────────────────────────────────────────────────────────────────────────
[ Reviewer only: "Needs your review · N" section header ]
[ DataTable, expandable rows:
    Employee* · Type · Incentive date · Amount · Status · Submission · ▸
    expanded → submitted fields · links · split · history · decision panel ]
[ Employee: a resubmittable request shows its callout inline, always visible ]
```

### 11.5 Entries

```
PageCommandBar  "Entries" · actions: [Import] [Add entry]
  toolbar: Search | [Month ▾] [Incentive ▾] [Approved ▾] [Paid ▾] | N entries
────────────────────────────────────────────────────────────────────────────
[ DataTable, paginated:
    Employee* · Incentive · Month · Amount · Approved · Paid · Actions
    row detail → note, participants
    Actions → Edit · Set status · Split · Delete (confirm dialog) ]
```

Optional consolidation: with "Set status" and "Split" available here, the Status area becomes a **report only** (§11.7).

### 11.6 Billing

```
PageCommandBar  "Billing" · hint: "Live from the billing sheet."
  toolbar: Search | [Salesperson ▾] [Outstanding ▾] | year
────────────────────────────────────────────────────────────────────────────
[ KPI row: Billed · Collected · Outstanding · Salespeople ]
[ DataTable: # · Salesperson* · Deals · Billed · Collected · Outstanding + share bar ]
[ DataTable: Client · Salesperson · Entity · Billed · Collected ]
[ Monthly trend — one compact block, last ]
```

### 11.7 Status

```
PageCommandBar  "Status" · hint: "Booked = client paid partial · Accrued = client paid
                                  in full · Paid = paid to the employee. PMS counts Paid."
  toolbar: Search | [Window ▾ This month / Last 3 / YTD] | link → Pay with salary
────────────────────────────────────────────────────────────────────────────
[ Three window cards: This month · Last 3 months · YTD (target, booked, accrued, paid) ]
[ DataTable: Person* · Target · Booked · Accrued · Paid · Attain ]
[ Admin editor table — or removed entirely once its actions live on Entries ]
```

### 11.8 Admin / Master

```
AdminSection "Incentive Master" + stats (Incentives · Active · With an end date · Nobody eligible)
  toolbar: Search | [Status ▾] [Type ▾] [Product ▾] [Duration ▾] | [New incentive]
────────────────────────────────────────────────────────────────────────────
[ DataTable: Incentive · Type · Product · Amount · Duration · Eligible · Status · Actions
             bulk: Activate / Deactivate ]
[ Workspace overlay (max-w-[1200px], h-[88vh]), app tokens, internal rail:
    Details · Eligibility (Incentive Chart) · History ]
```

### 11.9 Common UI patterns

1. `PageShell width="wide"` + `PageCommandBar` on every page in the module, including the payout screen.
2. One toolbar row per page; it holds scope, period, search and filters, in that order.
3. `DataTable` for every table; no hand-rolled `Th`/`Td`.
4. Two card recipes (flat, raised); `rounded-2xl` everywhere else.
5. One button hierarchy (`.pastel-cta` → neutral → icon → destructive).
6. One badge component per family (status, grade), reading from tokens.
7. One empty state and one skeleton loader.
8. One confirmation pattern for destructive actions; typed-name only for irreversible deletes.
9. Money always `formatInr` + `tabular-nums`; dates always `formatDMonY` / `formatMonthKey`.
10. Every page-level search field is labelled `Local search — <what it filters>`.

### 11.10 Mobile and responsive

- Rail is hidden below `md` (`max-md:hidden` on `SidebarRail`); the mobile menu is the navigation. No change.
- Command bar wraps: title, then hint, then actions full-width.
- Toolbar scrolls horizontally rather than wrapping into three rows.
- KPI row: 2 columns at `sm`, 4 at `lg`. Status chips: 2 at `sm`, 3 at `md`, 6 at `xl` (today's grid is already close).
- Tables: the identity column stays; secondary columns collapse into the row detail below `md`. Where a table is unusable at phone width (the Requests table, the Billing deal ledger), fall back to the existing card layout — do not force a horizontal scroll.
- Modals: full-width minus a 12px gutter; two-pane forms stack (already implemented in `IncentiveFormDialog` and `IncentiveTeamSplit`).
- Touch: no hover-only affordances anywhere; minimum 40px hit targets on row actions.

---

## 12. Do not touch

The following must survive the restructuring untouched. They are either legally/financially load-bearing, security boundaries, or the module's genuinely good ideas.

**Security and permissions**

- `lib/auth/incentive-permissions.ts` — reviewer identity.
- `lib/incentive/analytics/scope.ts` — `incentiveAnalyticsScopeFor`, `applyAnalyticsView` (including the "a browser-supplied view can never widen scope" property).
- `lib/incentive/eligibility-guard.ts` — effective **and** real identity check.
- Every server action's own re-check. Hiding a control is presentation; the server decides.
- `lib/permissions/catalog.ts` nodes: `employees.incentive`, `admin.incentive`, `admin.incentive.master`, `accounts.payroll.incentive-payout`.

**Workflow and data**

- `lib/incentive/workflow.ts` / `workflow-server.ts`: `availableDecisions`, `needsReview`, `canResubmit`, `isContentReviewRequest`, `checkDecision`, and the required-note rules.
- Submission numbering, request history immutability, and the resubmission model.
- `lib/incentive/analytics/grading.ts` — bands, rounding rule, rank/movement.
- `lib/incentive/analytics/periods.ts` — period definitions, IST "now", calendar-year YTD.
- `lib/incentive/payout*.ts`, `lib/incentive/split.ts`, `lib/incentive-amount.ts`, `lib/incentive-fields.ts`.
- `lib/queries/incentive*.ts` and `lib/ensure-incentive-schema.ts`.
- The catalog as the single source of truth (`incentive_catalog`) — do not create a second incentive table.

**Behaviour that must keep working**

- Deep links `?request=<id>`, `?view=table`, `?tab=<key>`, and `?year=` (map it to a period rather than dropping it).
- Notification, email and push links produced by `lib/incentive/notifications/*`.
- The exports `/incentive/export.pdf` and `/incentive/export.xlsx`, which re-read the full catalog server-side.
- `/api/mobile/incentive` and the Android app's expectations — the mobile app was **not** updated for the 2026-09 changes (`incentive-changes.md`), so do not change API shapes as part of a UI pass.
- The Billing tab's `<Suspense>` streaming off the critical path, and `withRetry` on the page's reads.
- The `INCENTIVE_STATUS_UI` and payout flags.
- The Master's audit/history writes and the typed-name delete confirmation.

**Open questions, deliberately not decided here**

- Billing is company-wide inside a scoped module. Narrowing it is a product decision with permission consequences; this plan leaves it as it is and flags it.
- Bulk approve/pay on Entries has no server action today. Do not add one during a UI pass.
- Renaming the "Status" area (label collision with request status for employees) needs a call from the module owner.

---

## Incentive UI/UX Audit — summary

### Current problems

1. **Two competing time models** on one screen — `?year=` pills in the header and period pills in the dashboard body — driving two KPI rows that disagree.
2. **Duplicated components at scale** — four KPI-card implementations, seven hand-rolled table implementations, two `Panel`s, two podiums, three search-field shells, two catalog editors.
3. **Low information density** — oversized cards, `p-6` panels with icon tiles and 21px headings, nested rounded containers, card lists where tables belong. On a 1366×768 laptop the Dashboard answers almost nothing above the fold.
4. **Inconsistent with the documented design language** — hardcoded `#E10600` (defeats the user-overridable accent), gradient white-text buttons as the default primary, five modal radii, `fontWeight: 900` on a font that stops at 800, table headers at two different sizes.
5. **No filtering on the areas that need it most** — Requests, Entries, Targets and the Status tables have no filters, and Entries has no pagination.
6. **Three destructive-action standards** — silent delete (Entries), `window.confirm` (catalog), typed-name confirmation (Master).
7. **Admin, manager and employee information is mixed** — company KPIs above scoped data; Billing company-wide inside a scoped module.
8. **The Master is orphaned** — the module's own rail does not reach it, and it uses a different visual system from everything around it.
9. **Discovery gaps** — the Incentive Chart is a modal with no URL; the payout screen is on no rail at all.
10. **Missing skeletons** — no `loading.tsx` for `/incentive`; Billing shows a sentence where a skeleton belongs.

### Recommended changes

- One period control (absorbing the year); one scope control (`[Team][User]`) shared by Dashboard and Targets, both reflected in the URL.
- One KPI row, always matching the scope and period of the cards beneath it.
- Every table on `DataTable`, with search, filters, sort, dense mode, frozen identity column and pagination where the data is unbounded.
- Requests becomes an expandable-row table with status/type/mine filters, keeping today's expansion content exactly.
- Incentive Chart and Admin/Master become rail entries; the catalog modal becomes a route.
- One button hierarchy, two card recipes, one badge system, one empty state, one skeleton, one confirmation pattern.
- All colour through tokens; retire every literal hex in the module.
- Payout screen moved onto `PageShell` + `PageCommandBar` and added to the Accounts rail.

### Final navigation structure

```
Incentive
├── Dashboard
├── Requests
├── Targets
├── Entries          (admin)
├── Status           (admin + flag)
├── Billing
├── Incentive Chart
└── Admin / Master   (admin.incentive.master)
```

Dashboard scope: `[Team] [User]` — Team is the manager's existing downline scope, User is the signed-in person. Shown only where `scope.canSeeTeam` is already true.

### Page-by-page restructuring

See §11. In one line each:

- **Dashboard** — control row → warning → KPI row → status chips → your performance → team line → detail table → trends.
- **Targets** — stat row → one `DataTable` with scope, search and attainment filters.
- **Requests** — command-bar action, filter row, expandable-row table, reviewer queue first.
- **Entries** — toolbar with search/filters, paginated `DataTable`, row actions including status and split.
- **Status** — three window cards + one per-person table; the editor merges into Entries.
- **Billing** — KPI row, salesperson table with rank folded in, deals table, monthly trend last.
- **Chart** — read-only `DataTable` on its own route, with the existing exports.
- **Admin / Master** — unchanged structurally; restyled onto app tokens, reachable from the module rail.

### Common design rules

1. `PageShell` + `PageCommandBar` on every page.
2. One toolbar row: scope → period → search → filters.
3. `DataTable` for every table.
4. Two card recipes; `rounded-2xl`; two shadow levels.
5. `.pastel-cta` primary; neutral secondary; icon tertiary; solid red only behind a confirm.
6. Colour only through tokens — never a literal hex, never a Tailwind palette colour.
7. Type: 16px/800 section headings, 13.5px body, 10.5px table headers, `tabular-nums` on numbers.
8. Spacing 4/8/12/16/24; at most two nested rounded containers.
9. One empty state, one skeleton, one destructive-confirm pattern.
10. Nothing hover-only; hidden rather than disabled for areas a viewer cannot use.

### Priority order for implementation

**P0 — structural, highest value per unit of risk**

1. Unify the time model: one period control, `?year=` mapped onto it, the KPI row moved into the dashboard body and scoped to the same window.
2. Extract shared primitives: `IncentiveKpiCard`, `IncentiveStatusBadge`, `GradeBadge`, `EmptyState`, `ConfirmDialog`.
3. Migrate Targets, Entries and the two Status tables to `DataTable`.

**P1 — navigation and discovery**

4. Rail: reorder; add Incentive Chart and Admin / Master; redirect `?view=table` → `?tab=chart`.
5. Requests → expandable-row table with filters; move "New request" into the command bar.
6. Add `app/(app)/incentive/loading.tsx` and a billing table skeleton.

**P2 — visual consistency**

7. Replace every literal hex with tokens; retire the gradient primary button in favour of `.pastel-cta`.
8. Normalise radii, shadows, section headings and spacing; delete the duplicated `Panel` / `Th` / `Td` / KPI implementations.
9. Move the payout screen onto `PageShell` + `PageCommandBar`; add it to the Accounts rail.

**P3 — density and consolidation**

10. Billing: fold the leaderboard into the salesperson table; demote the monthly trend.
11. Dashboard: demote the year overview into a Trends section; remove the podium.
12. Merge the Status editor into Entries, leaving Status as a report.
13. Restyle the Master workspace onto app tokens (keep its structure and its guards).

### Functionality that must not be touched

Summarised from §12: the reviewer identity rule; `incentiveAnalyticsScopeFor` / `applyAnalyticsView`; the eligibility guard's dual-identity check; every server-side re-check; the decision workflow and its note requirements; submission history and immutability; grade bands and rounding; period definitions and IST handling; split, payout and amount maths; the catalog as the single source of truth; all deep links (`?request`, `?view=table`, `?tab`, `?year`); notification, email and push links; the PDF/XLSX export routes; `/api/mobile/incentive` (the Android app is not updated); the Billing Suspense stream and `withRetry`; the `INCENTIVE_STATUS_UI` and payout flags; and the Master's audit writes and typed-name delete confirmation.
