# Incentive Module — Complete Findings Register

**Prepared:** 16 September 2026
**Companion to:** `Incentive-UI-UX-Audit.md` (the plan). This file is the exhaustive evidence list — every individual finding produced by the audit, numbered, located and rated.
**Status:** audit only. No application code, database, backend logic or existing functionality was changed.

## How to read this file

| Column | Meaning |
| --- | --- |
| **ID** | Stable reference, e.g. `NAV-03`. Use it in tickets. |
| **Severity** | `S1` blocks a user goal or breaks a documented rule · `S2` real friction or systemic duplication · `S3` polish / consistency · `INFO` observation, no action implied |
| **Type** | `bug-risk` · `duplication` · `density` · `consistency` · `IA` (information architecture) · `a11y` · `flow` · `good` (keep as-is) · `open` (needs an owner's decision) |
| **Evidence** | `path:line` at the time of extraction, or a verifiable count |
| **Recommendation** | What to do. Nothing here was executed. |

Counts quoted below were measured with `grep`/`wc` against the working tree on 16 September 2026.

---

## Contents

1. [Module-wide quantified findings](#1-module-wide-quantified-findings)
2. [Navigation & information architecture](#2-navigation--information-architecture)
3. [Permissions & scope presentation](#3-permissions--scope-presentation)
4. [Dashboard](#4-dashboard)
5. [Targets](#5-targets)
6. [Billing](#6-billing)
7. [Requests](#7-requests)
8. [Entries](#8-entries)
9. [Status](#9-status)
10. [Incentive Chart / catalog dialog](#10-incentive-chart--catalog-dialog)
11. [Incentive Master & workspace](#11-incentive-master--workspace)
12. [Incentive payout (Accounts)](#12-incentive-payout-accounts)
13. [Forms & modals](#13-forms--modals)
14. [Tables & filters](#14-tables--filters)
15. [Visual system: colour, type, radius, shadow, spacing, icons](#15-visual-system)
16. [Density & layout](#16-density--layout)
17. [Empty, loading & error states](#17-empty-loading--error-states)
18. [Accessibility & input](#18-accessibility--input)
19. [Mobile & responsive](#19-mobile--responsive)
20. [User flows](#20-user-flows)
21. [Things that are good — do not "fix"](#21-things-that-are-good--do-not-fix)
22. [Open questions for the module owner](#22-open-questions-for-the-module-owner)
23. [Must-not-touch register](#23-must-not-touch-register)
24. [Findings index by severity](#24-findings-index-by-severity)

---

## 1. Module-wide quantified findings

| ID | Sev | Type | Finding | Evidence | Recommendation |
| --- | --- | --- | --- | --- | --- |
| MOD-01 | S1 | consistency | **68 literal `#E10600` / `#A80400` occurrences** across 21 incentive files. `lib/appearance.ts` rewrites `--color-altus-red*` per request, so every literal opts that pixel out of the user's chosen accent. `design-system/SKILL.md` §6 lists this as a known trap. | `grep -rn "#E10600\|#A80400"` over incentive files = 68 hits in 21 files | Replace with `var(--color-altus-red)` / `var(--color-altus-red-deep)` |
| MOD-02 | S2 | duplication | **17 solid-gradient primary buttons** (`linear-gradient(135deg,…)` + white text). The design system's primary is `.pastel-cta`; solid red is reserved for destructive confirms. | 17 matches across `components/incentive/*`, `components/admin/incentive-master/*`, `app/(app)/incentive/page.tsx`, `app/(app)/salary/incentive-payout/page.tsx` | One `.pastel-cta` primary; solid red only behind a confirm |
| MOD-03 | S2 | duplication | **17 locally defined table cell helpers** (`Th` / `Td` / `SortTh`) across 9 files; only 2 screens use the shared `DataTable`. | `billing-dashboard.tsx:139,142`; `inc-employee-table.tsx:165`; `incentive-dashboard.tsx:89,106`; `incentive-entries.tsx:405,416`; `incentive-person-drilldown.tsx:296,307`; `incentive-status-report.tsx:270,289`; `incentive-status-tab.tsx:203,222`; `incentive-targets.tsx:509,543`; `salary/incentive-payout-panel.tsx:261,287` | Migrate every table to `components/admin/ui/data-table.tsx` |
| MOD-04 | S2 | duplication | **6 KPI/summary card implementations** with the same anatomy (icon tile → label → display numeral → caption → optional bar). | `app/(app)/incentive/page.tsx:313` `KpiCard`; `incentive-targets.tsx:450` `SummaryCard`; `billing-dashboard.tsx:74` `MetricCard`; `salary/incentive-payout/page.tsx:150` `Kpi`; `incentive-dashboard.tsx:131` `SplitCard`; `incentive-status-report.tsx:78` `WindowCard` | One `IncentiveKpiCard` with variants |
| MOD-05 | S2 | duplication | **2 identical `Panel` section wrappers** (icon tile + 21px display heading + description + `p-6`). | `incentive-dashboard.tsx:26`, `billing-dashboard.tsx:21` | One shared section header, at 16px/800 |
| MOD-06 | S2 | duplication | **2 podium implementations** (`orderPodium` + `PodiumCard`), each duplicating the ranked list rendered immediately beneath it. | `incentive-dashboard.tsx:492,509`; `billing-dashboard.tsx:387,401` | Delete both; fold rank + share bar into the table |
| MOD-07 | S2 | consistency | **7 distinct corner radii** in module markup: `rounded-[18px]` ×1, `[20px]` ×3, `[22px]` ×13, `[24px]` ×1, `[26px]` ×1, plus `rounded-2xl`, `rounded-section`, `rounded-chip`, `rounded-pill`. | radius census over incentive files | Two card recipes: `rounded-2xl` flat, `rounded-2xl` raised. `rounded-[20px]` only for `PageCommandBar` |
| MOD-08 | S2 | consistency | **19 `fontWeight: 900`** declarations on display-font headings. The self-hosted variable display font tops out at 800 — 900 silently clamps (documented trap). | 19 matches in `components/incentive/*`, `app/(app)/incentive/page.tsx`, `app/(app)/salary/incentive-payout/page.tsx` | Use 800 |
| MOD-09 | S2 | consistency | **13 distinct Tailwind text sizes** (`10.5–19px`) plus **15 distinct inline `fontSize` values** (`10.5–24`). The design system defines 9 roles. | size census over `components/incentive` | Collapse onto the documented scale (§15) |
| MOD-10 | S2 | density | **7 vertical rhythm values** in use (`space-y-0,2,3,4,5,6,7,8`), including `space-y-7` and `space-y-8` between sections. | spacing census | One scale: `space-y-4` sections, `gap-3` cards, `gap-2` controls |
| MOD-11 | S2 | consistency | **5 search-field implementations**: 2 via `DataTable`, 4 hand-rolled (three with an icon shell, one bare), all inside `CollapsibleSearch`. | `analytics-dashboard.tsx:640,770`; `master-table.tsx:89`; `inc-employee-table.tsx:67`; `incentive-status-report.tsx:200`; `incentive-status-tab.tsx:100`; `incentive-targets.tsx:193` | One field from `DataTable`; keep the `Local search — <what>` naming convention |
| MOD-12 | S1 | consistency | **3 destructive-action standards in one module**: silent delete, `window.confirm`, typed-name confirmation. | silent: `incentive-entries.tsx:36` `onDelete`; `confirm()`: `incentive-catalog-dialog.tsx:73`; typed-name: `admin/incentive-master/workspace.tsx` `DeleteConfirm` | Standardise: Radix confirm dialog everywhere; typed-name for irreversible deletes |
| MOD-13 | S2 | consistency | **8 distinct empty-state treatments**, from a bare `<p>` to a `p-10` centred card with an icon tile. | `analytics-dashboard.tsx:537,656`; `billing-dashboard.tsx:176`; `incentive-catalog-dialog.tsx:160`; `incentive-entries.tsx:84`; `incentive-list.tsx:60`; `incentive-status-report.tsx:212`; `incentive-status-tab.tsx:112`; `incentive-targets.tsx:205` | One `EmptyState` component per the design-system recipe |
| MOD-14 | S3 | consistency | Icon sizes span 10.5–22px and stroke widths 2.2–2.8 inside one module. | `incentive-status-tab.tsx` 10px badge icon; `billing-dashboard.tsx` 22px empty-state icon | 14px/2.4 chrome; 16px/2.6 in filled buttons; 13px in badges |
| MOD-15 | S2 | consistency | Triple box-shadow recipe (`inset 0 0 0 1px` + `inset 0 1px 0 rgba(255,255,255,0.7)` + `0 10px 28px -20px`) repeated verbatim in at least 6 files, simulating a border rather than using one. | `page.tsx` `KpiCard`; `incentive-targets.tsx` `SummaryCard`; `billing-dashboard.tsx` `MetricCard`; `incentive-status-report.tsx` `WindowCard`; `incentive-list.tsx` `RequestCard`; `salary/incentive-payout/page.tsx` `Kpi` | `border: 1px solid var(--color-hairline)` + one optional soft drop shadow |
| MOD-16 | S3 | consistency | Decorative `wg-sheen` / gradient sheen applied to data cards, not just CTAs. | `incentive-dashboard.tsx` `PodiumCard`; several buttons | Keep `.wg-rise` and `.wg-btn`; drop `wg-sheen` on data surfaces |
| MOD-17 | INFO | good | No horizontal tab strip anywhere — the duplicate navigation was already removed (2026-09-16) in favour of the rail. | `incentive-tabs.tsx` comment block + implementation | Keep. Do not reintroduce |
| MOD-18 | S2 | duplication | Row hover tint is a hardcoded `color-mix(in srgb,#E10600 3%,transparent)` repeated in 6 tables instead of `bg-surface-soft`. | `incentive-targets.tsx`, `incentive-entries.tsx`, `incentive-status-tab.tsx`, `incentive-status-report.tsx`, `billing-dashboard.tsx`, `incentive-dashboard.tsx` | `hover:bg-surface-soft` |

---

## 2. Navigation & information architecture

| ID | Sev | Type | Finding | Evidence | Recommendation |
| --- | --- | --- | --- | --- | --- |
| NAV-01 | INFO | good | Incentive is a first-class room with its own rail and workspace mapping; `/incentive` was kept as the landing route so every existing notification, email and export link still resolves. | `lib/workspaces.ts:28,95-99`; `lib/module-theme.ts:247-256` | Keep |
| NAV-02 | INFO | good | The rail is declared once and both the href and the `?tab=` come from one helper (`navHref`), so rail and page cannot disagree about the open area. | `components/layout/main-nav.tsx:157-170,443-452` | Keep |
| NAV-03 | S2 | IA | **Rail order does not match usage.** Filing/reviewing a request is the module's most frequent job but Requests is 4th; Billing (an Accounts surface) is 3rd. | `main-nav.tsx:445-450` | Dashboard · Requests · Targets · Entries · Status · Billing · Chart · Admin/Master |
| NAV-04 | S1 | IA | **The Incentive Chart has no URL.** It is an 80vw × 80vh modal launched from a header button; it cannot be linked, bookmarked or opened in a tab, and back does not close it. | `components/incentive/incentive-catalog-dialog.tsx:96-99`; trigger in `app/(app)/incentive/page.tsx` `actions` | Promote to `?tab=chart` as a rail entry; keep `?view=table` working via redirect |
| NAV-05 | S1 | IA | **The Incentive Master is unreachable from the module.** The rail has no entry; the only door is the profile menu → Admin Panel → Incentive → Incentive Master. | `main-nav.tsx:443-452` (no `/admin/incentive-master`); `app/(admin)/admin/incentive-master/page.tsx` | Add an "Admin / Master" rail entry gated on the existing `admin.incentive.master` node |
| NAV-06 | S2 | IA | **The payout screen is on no rail at all** — neither Accounts nor Incentive links to `/salary/incentive-payout`, despite it owning a permission node. | `grep "incentive-payout" components/layout/main-nav.tsx` → no match; `lib/permissions/catalog.ts:391` | Add to the Accounts rail; cross-link from Incentive → Status |
| NAV-07 | S2 | IA | **Two doors onto one dataset** (`incentive_catalog`): the in-page catalog dialog edits name/amount/description/notes/flags; the Master edits those plus type, product, duration, valid-until, active. | `incentive-catalog-dialog.tsx` `CatalogEditor`; `admin/incentive-master/workspace.tsx` `DetailsBody` | In-module Chart becomes read-only; editing lives in the Master only |
| NAV-08 | S3 | IA | Rail label "Status" collides with request status for employees (it means Booked/Accrued/Paid, and is admin-only). | `main-nav.tsx:450` | Optional rename to "Payment status" — owner's call (see OPEN-04) |
| NAV-09 | INFO | good | `?tab=` is the single source of truth for the open area; an area the viewer cannot see falls back to Dashboard and the URL is rewritten once with `replaceState`. | `incentive-tabs.tsx` `available` + the arrival `useEffect` | Keep |
| NAV-10 | S3 | IA | `navTitleFor` needs a hardcoded override for `/incentive` because six rail entries share one href. | `main-nav.tsx:659-662,694-696` | Acceptable; note it if areas ever become routes |
| NAV-11 | S2 | IA | Dashboard period and scope live in **client state only** — a refresh or a shared link loses them. | `analytics-dashboard.tsx` `useState` for `kind`, `month`, `view` | Promote to `?period=`, `?month=`, `?view=` |
| NAV-12 | S3 | IA | `?year=` triggers a full server navigation for a control that only reframes numbers already scoped client-side elsewhere. | `app/(app)/incentive/page.tsx` year pill `<Link>` | Fold year into the period control; keep accepting `?year=` and map it to that year's YTD |

---

## 3. Permissions & scope presentation

No new permission rules are proposed anywhere. These findings are about how existing rules are *presented*.

| ID | Sev | Type | Finding | Evidence | Recommendation |
| --- | --- | --- | --- | --- | --- |
| PERM-01 | INFO | good | Scope is resolved on the server from the signed-in identity, and company-wide queries are not even run for a scoped viewer. | `lib/incentive/analytics/scope.ts` `incentiveAnalyticsScopeFor` | Keep |
| PERM-02 | INFO | good | `applyAnalyticsView` is structurally incapable of widening scope — `team` returns the handed scope, `user` narrows to the viewer's own id. | `lib/incentive/analytics/scope.ts` | Keep |
| PERM-03 | INFO | good | The Team/User switch is hidden, not disabled, when the viewer has no team (`scope.all || employeeIds.size > 1`). | `applyAnalyticsView` `canSeeTeam` | Keep |
| PERM-04 | INFO | good | Eligibility editing checks **both** the effective and the real identity, so delegated access cannot inherit the capability. | `lib/incentive/eligibility-guard.ts` | Keep |
| PERM-05 | S1 | consistency | **Company KPI strip ignores the Team/User switch.** It is rendered from the year roll-up above a body that obeys the switch, so an admin viewing one person still sees company totals directly above that person's numbers. | `app/(app)/incentive/page.tsx` `CompanyKpis` (gated on `scope.all`) vs `analytics-dashboard.tsx` `view` state | Move the KPI row into the dashboard body and scope it to the active scope + period |
| PERM-06 | S2 | consistency | **Billing is company-wide inside a scoped module** — an ordinary employee sees every deal and every salesperson. Every other area respects `scope`. | `app/(app)/incentive/page.tsx` `BillingTab` (no scope argument); `lib/queries/billing` | Flagged only. Narrowing is a product/permission decision — see OPEN-01 |
| PERM-07 | S3 | consistency | Targets' admin-only action column is headed "Set", which reads as a data column. | `incentive-targets.tsx` header cell `Set` | Head it "Actions"; right-align; icon + label button |
| PERM-08 | S3 | IA | Requests mixes "mine" and "everyone's" for admins and the reviewer, distinguished only by whether an employee name renders. | `incentive-list.tsx` `showEmployee = isAdmin || canReview` | Add a display-only "Mine / All" filter over rows they may already see |
| PERM-09 | S2 | consistency | The Team/User choice does not carry to Targets, so a manager re-establishes scope per area. | Targets has no view control; `restrictTargetVsActual` already narrows server-side | One `?view=` honoured by Dashboard and Targets |
| PERM-10 | INFO | good | Status and Entries are gated server-side *and* excluded from `available` in the tab component, so a forwarded `?tab=entries` lands on Dashboard rather than a blank panel. | `app/(app)/incentive/page.tsx`; `incentive-tabs.tsx` | Keep |
| PERM-11 | S3 | a11y/consistency | CTC restriction is communicated inline per row ("Restricted" with a title attribute) but never explained at table level. | `analytics-dashboard.tsx` `ctcReason` | One line of table-level helper text |

---

## 4. Dashboard

| ID | Sev | Type | Finding | Evidence | Recommendation |
| --- | --- | --- | --- | --- | --- |
| DASH-01 | S1 | IA | **Two time controls on one screen**: year pills (server nav) in the header, period pills (client fetch) in the body. Nothing explains that the top cards and the cards below measure different windows. | `app/(app)/incentive/page.tsx` toolbar; `analytics-dashboard.tsx` period row | One period control; year folds into it |
| DASH-02 | S1 | IA | **Two KPI rows with overlapping labels.** Header: Total earned / Paid / Unpaid / Avg attainment (year). Body: Not Approved / Approved / Due / Not Due / Paid / Unpaid (period). "Paid" and "Unpaid" appear twice with different numbers. | `CompanyKpis` vs `data.statuses` | One KPI row, one window |
| DASH-03 | S2 | IA | **A second dashboard hides inside the first** — the legacy year overview (charts, podium, leaderboard, per-employee YTD, per-name YTD) sits inside a `<details>` element, a disclosure pattern used nowhere else in the app. | `incentive-tabs.tsx` `<details>` block wrapping `IncentiveDashboard` | Demote to a "Trends" section below the table; keep the content |
| DASH-04 | S2 | duplication | Scope is stated three times on one screen: command-bar hint, `data.scope.label` chip, and the performance strip's "All employees / Your team" line. | `page.tsx` `hint`; `analytics-dashboard.tsx` period row right side; `PerformanceStrip` team line | State it once, in the control row |
| DASH-05 | INFO | good | **Status cards are filters, not decoration** — clicking one replaces the detail region with the records behind that status, and clicking again returns to the grade report. | `analytics-dashboard.tsx` `active` / `activeCard` / `StatusTable` | Keep. This is the module's best interaction |
| DASH-06 | S2 | density | Status cards are ~86px tall (`px-3.5 py-3`, 19px numeral, two-line caption) × 6. They are a filter control and should be chip-height. | `analytics-dashboard.tsx` status grid | Stat-chip recipe (`rounded-xl`, `5px 10px`, 16px numeral) |
| DASH-07 | S2 | density | Header KPI cards are ~110px tall × 4 (`CardGrid min={240}`, icon tile, 27px numeral, caption, progress bar). | `page.tsx` `CompanyKpis` + `KpiCard` | Compact KPI row ≤ 84px |
| DASH-08 | S2 | density | The podium block (up to 3 cards, gradients, medals, trophies, `lg` avatars) duplicates the first three rows of the leaderboard list directly beneath it. | `incentive-dashboard.tsx:492-570` | Delete the podium |
| DASH-09 | INFO | good | The target warning is actionable in place: inline ₹ inputs for this month and next, saved via `setMyIncentiveTarget`, then the dashboard reloads the period. | `analytics-dashboard.tsx` `TargetWarningBar` | Keep, including its padding |
| DASH-10 | INFO | good | Period changes re-fetch from the server, which re-applies scope — the browser never holds data it was not allowed. | `fetchIncentiveAnalytics` + `load()` | Keep |
| DASH-11 | INFO | good | Failed period fetches snap the selector back to the period actually on screen, so the buttons never claim a window whose numbers are not shown. | `analytics-dashboard.tsx` `fail()` | Keep |
| DASH-12 | S3 | consistency | Period and Team/User buttons are hand-rolled with an inline red gradient rather than the documented segmented-toggle recipe. | `analytics-dashboard.tsx` both button groups | One `SegmentedControl` |
| DASH-13 | S3 | consistency | The "Specific Month" `<select>` is a bare native select at `h-8` beside `h-9`-ish pills. | `analytics-dashboard.tsx` month `<select>` | Use the app's `Select`, matched height |
| DASH-14 | S2 | duplication | Per-employee YTD and per-incentive-name YTD are hand-rolled tables with their own totals rows; the same data is summarised in the KPI row and the status cards. | `incentive-dashboard.tsx` Employee-wise YTD + Incentive-name YTD panels; `inc-employee-table.tsx` | Convert to `DataTable`; drop whichever roll-up is redundant after DASH-02 |
| DASH-15 | S3 | density | Chart panels are two-up at `≥lg` and each carries an icon tile plus a 21px heading plus a description. | `incentive-dashboard.tsx` charts row | 16px/800 heading, no icon tile |
| DASH-16 | S3 | consistency | Grade tone map and status tone map are two more hardcoded colour tables, separate from `IncentiveStatusPill`. | `analytics-dashboard.tsx` `STATUS_TONE`, `GRADE_TONE` | Read both from one token-backed source |
| DASH-17 | INFO | good | Grade Report and the status drill-down already use the shared `DataTable`, with search, a Grade filter, sortable headers and dense mode. | `analytics-dashboard.tsx` `GradeReport`, `StatusTable` | Keep; extend the pattern to the rest of the module |
| DASH-18 | S3 | density | The `Review` column in the status drill-down is the widest column (reviewer, date, truncated note at `max-w-[260px]`) and is read rarely. | `analytics-dashboard.tsx` `StatusTable` `review` column | Move into an expandable row detail |
| DASH-19 | S2 | flow | On a 1366×768 laptop a company-wide viewer sees the command bar, four large KPI cards and the top of the status row — the question "what is happening with incentives" is not answered above the fold. | measured against the block heights in DASH-06/07 | Reordered, compact dashboard per the plan §3 |
| DASH-20 | S3 | consistency | `aria-busy` + `opacity-60` dimming is used during refetch on some sections but not the performance strip. | `analytics-dashboard.tsx` `pending` usage | Apply one loading treatment to the whole data region |

---

## 5. Targets

| ID | Sev | Type | Finding | Evidence | Recommendation |
| --- | --- | --- | --- | --- | --- |
| TGT-01 | INFO | good | Real table, sortable columns, pinned totals row, row click → person drill-down, admin Set on the row. | `incentive-targets.tsx` | Keep the information design |
| TGT-02 | S2 | density | Attainment is encoded three times in one cell: an SVG ring with a % label, a colour, and a full-width bar; the column is `min-w-[200px]`. | `incentive-targets.tsx` attainment cell + `AttainRing` | Keep bar + %, drop the per-row ring |
| TGT-03 | S2 | duplication | `SortTh` and `Td` re-implement `DataTable`'s header and cell behaviour, including sort arrows and `aria-sort`. | `incentive-targets.tsx:509,543` | Migrate to `DataTable` |
| TGT-04 | S2 | duplication | `SummaryCard` is a fourth KPI card implementation whose totals also appear in the page header KPI strip for company-wide viewers. | `incentive-targets.tsx:450` vs `page.tsx:313` | Shared card; one roll-up |
| TGT-05 | S2 | density | The table is wrapped in `rounded-[22px] p-6` with a 9×9 icon tile and a 21px display heading, directly under a page title that already says Targets. | `incentive-targets.tsx` section header | Flat card, no icon tile, no section heading |
| TGT-06 | S2 | IA | No filters at all — "who has no target" and "who is behind" require reading every row. | `incentive-targets.tsx` (search only) | Add "Has target" and "Attainment" filter pills |
| TGT-07 | S2 | consistency | Search is a bespoke `h-10` labelled input inside `CollapsibleSearch`, different from `DataTable`'s field and from the Status tab's field. | `incentive-targets.tsx:193` | One search field |
| TGT-08 | S3 | consistency | The card subtitle repeats the year ("Year target compared to incentive earned · {year}") already shown in the page header. | `incentive-targets.tsx` header `<p>` | Remove the repetition |
| TGT-09 | S3 | consistency | Action column header reads "Set". | `incentive-targets.tsx` `Set` `<th>` | "Actions" |
| TGT-10 | S2 | flow | No Team/User control, so a manager cannot narrow Targets the way they narrowed the Dashboard. | no `view` prop in `IncentiveTargets` | Honour the shared `?view=` |
| TGT-11 | INFO | good | The set-target dialog is `max-w-md`, single-field, validates the amount client-side and re-validates server-side. | `SetTargetDialog` + `setIncentiveYearTarget` | Keep behaviour; restyle only |
| TGT-12 | S3 | consistency | Empty and no-match states are bare `<p>` elements at two different sizes. | `incentive-targets.tsx:205` and the no-match `<td>` | One `EmptyState`; `DataTable` supplies the no-match row |

---

## 6. Billing

| ID | Sev | Type | Finding | Evidence | Recommendation |
| --- | --- | --- | --- | --- | --- |
| BILL-01 | INFO | good | The live Google Sheet read is streamed through `<Suspense>` off the page's critical path, so first paint never waits on Google. | `app/(app)/incentive/page.tsx` `BillingTab` + `BillingLoading` | Keep exactly |
| BILL-02 | INFO | good | A Sheets/auth failure degrades to a readable error card instead of throwing to the error boundary. | `billing-dashboard.tsx` `data.error` branch | Keep |
| BILL-03 | S2 | duplication | The leaderboard (podium + ranked list with bars) and the per-salesperson table render the same rows twice, one directly under the other. | `billing-dashboard.tsx` "Billing Leaderboard" then "By Salesperson" | Fold rank + share bar into the table; delete the leaderboard panel |
| BILL-04 | S2 | density | Four stacked `Panel`s, each with an icon tile and a 21px display heading, put four competing section titles on one screen. | `billing-dashboard.tsx` Panels | One optional 16px heading per block |
| BILL-05 | S2 | IA | No search, no filters, no sort on either table, including the deal ledger. | `billing-dashboard.tsx` both tables | `DataTable` with salesperson/entity/outstanding filters |
| BILL-06 | S3 | density | "Monthly Billing" is 12 rows of bespoke bar markup between two tables. | `billing-dashboard.tsx` monthly block | One compact table or one small chart, placed last |
| BILL-07 | S2 | duplication | `Panel`, `Th`, `Td`, `MetricCard`, `PodiumCard`, `orderPodium` are near-copies of `incentive-dashboard.tsx`'s equivalents. | `billing-dashboard.tsx:21,74,139,142,387,401` | Shared primitives |
| BILL-08 | S2 | consistency | The area is unscoped inside a scoped module (see PERM-06). | `BillingTab` | Owner decision — OPEN-01 |
| BILL-09 | S3 | consistency | Loading state is a sentence in a `p-10` card; empty state is a different `p-10` card; error is a third `p-7` card. | `page.tsx` `BillingLoading`; `billing-dashboard.tsx:176`, error branch | One skeleton + one `EmptyState` + one error card |
| BILL-10 | S3 | consistency | Green is hardcoded (`#16a34a`, `#15803d`) rather than the `green` token family. | `billing-dashboard.tsx` `GREEN`, `GREEN_DEEP` | Tokens |

---

## 7. Requests

| ID | Sev | Type | Finding | Evidence | Recommendation |
| --- | --- | --- | --- | --- | --- |
| REQ-01 | INFO | good | Three genuinely different experiences from one component: reviewer queue ("Needs your review" first), admin read-only, employee own requests. | `incentive-list.tsx` `canReview` branch | Keep |
| REQ-02 | INFO | good | The rejection/revision callout renders **without** expanding the card: reason, decision time, and the Justify & Resubmit button. | `incentive-list.tsx` `resubmittable` block | Keep exactly, including placement |
| REQ-03 | INFO | good | Notification deep links open the right request expanded and scrolled into view, and only when it is in the viewer's own list. | `page.tsx` `focusRequestId`; `RequestCard` `useEffect` scroll | Keep |
| REQ-04 | S1 | IA | **No filter, no sort, no search** on the module's highest-traffic list. The only structure is queue vs rest. | `incentive-list.tsx` | Status / type / mine-all filters + search |
| REQ-05 | S2 | density | Card list at `rounded-[18px] p-5` with `space-y-3`: roughly 150px per request versus ~44px for a dense table row. A 40-request queue is a very long scroll. | `incentive-list.tsx` `RequestCard` | Expandable-row table on desktop; keep cards on mobile |
| REQ-06 | S2 | IA | The primary action ("New request") floats in a right-aligned bare `div` above the list instead of the page command bar. | `incentive-tabs.tsx` requests branch: `<div className="flex justify-end">` | Move to `PageCommandBar` `actions`, visible on every area |
| REQ-07 | S2 | IA | Card titles lead with the incentive **type**; the employee name is a small grey line beneath. For a reviewer, "who" is usually the primary key. | `RequestCard` header | Employee first in the table layout |
| REQ-08 | S3 | consistency | One toggle carries three labels ("Open request" / "Details" / "Close"). | `RequestCard` toggle button | One label plus a chevron |
| REQ-09 | S2 | duplication | Status appears as a pill and again as prose ("{Status} by {name} · {date}"). | `RequestCard` status pill + decided-by line | Pill + one metadata line |
| REQ-10 | S3 | duplication | `IncentiveFormDialog` (1,178 lines) is mounted once as "New request" and again per resubmittable card. | `incentive-tabs.tsx`; `incentive-list.tsx` resubmit block | Acceptable functionally; mount lazily once the list becomes a table |
| REQ-11 | S2 | density | Expanded detail is a two-column `<dl>` followed by history and only then the decision panel, so the reviewer's action is furthest from the click that opened the row. | `RequestCard` expanded block | Decision panel first (or sticky) in the expanded row for the reviewer |
| REQ-12 | INFO | good | The decision panel enforces note requirements client-side, then requires an explicit confirm step that names the resulting status. | `incentive-decision-panel.tsx` `requestSubmit` → `confirm` | Keep |
| REQ-13 | S3 | consistency | Decision buttons are a fourth bespoke toggle geometry with per-action tone maps. | `incentive-decision-panel.tsx` `TONE`, `ICON` | Shared segmented/choice control with token colours |
| REQ-14 | S3 | a11y | Expanded content lives inside a `<dl>` that also contains a `<section>` (history) and the decision panel — not valid definition-list content. | `RequestCard` expanded `<dl>` | Move history/decision out of the `<dl>` |
| REQ-15 | S3 | consistency | "Content review" is chipped on the card **and** announced by the decision panel. | `RequestCard` content chip; `incentive-decision-panel.tsx` header text | Keep one |
| REQ-16 | INFO | good | Links inside request details are detected and rendered as safe external anchors (`target="_blank" rel="noopener noreferrer"`). | `incentive-list.tsx` `isLink` | Keep |
| REQ-17 | S3 | IA | The employee has no "waiting on me" affordance — a resubmittable request is found only by scrolling. | `incentive-list.tsx` non-reviewer branch returns a flat `<ul>` | Pre-apply a "Needs your attention" filter when any exists |

---

## 8. Entries

| ID | Sev | Type | Finding | Evidence | Recommendation |
| --- | --- | --- | --- | --- | --- |
| ENT-01 | S1 | density/IA | **Unbounded table**: a full year of entries renders as one `<tbody>` with no pagination, no search, no sort and no filters. | `incentive-entries.tsx` table | `DataTable` + pagination + month/incentive/approved/paid filters |
| ENT-02 | S1 | bug-risk | **Delete fires immediately with no confirmation.** | `incentive-entries.tsx:36-47` `onDelete` → `deleteIncentiveEntry` | Radix confirm dialog naming the entry |
| ENT-03 | S2 | consistency | "Employee (Roster)" and "Employee Name" are adjacent fields with no stated relationship; picking a roster employee silently fills the free-text name. | `EntryDialog` `pickEmployee` | One hint line; group the two fields |
| ENT-04 | S2 | consistency | Approved and Paid each exist as a checkbox *and* an amount, in separate rows, with no visual link. | `EntryDialog` three-column amounts row + checkbox row | Pair each checkbox with its amount |
| ENT-05 | S2 | duplication | Local `Th`, `Td`, `Field`, `Input`, `Checkbox` implementations. | `incentive-entries.tsx:405,416` + form helpers | Shared table and form primitives |
| ENT-06 | S3 | density | `rounded-[22px]` card wrapper around a table that needs only a hairline; the row count occupies its own line above the table. | `incentive-entries.tsx` section + count `<p>` | Flat card; count in the toolbar |
| ENT-07 | S3 | consistency | "Add Entry" is another gradient white-text button; Import beside it is a neutral pill — inconsistent pairing. | `incentive-entries.tsx` toolbar | `.pastel-cta` + neutral secondary |
| ENT-08 | S3 | IA | The Note field exists on the model and in the dialog but is never shown in the table. | `EntryDialog` note field; table columns | Show in a row detail |
| ENT-09 | INFO | good | Row actions (edit, delete) are icon buttons at the end of the row with `aria-label`s and a per-row pending spinner. | `incentive-entries.tsx` actions cell | Keep the pattern; add the confirm |
| ENT-10 | S3 | a11y | The delete button's `style` prop contains a no-op ternary (`undefined : undefined`), a leftover that hides the intended pending colour. | `incentive-entries.tsx` delete button `style` | Remove; use the token |
| ENT-11 | S2 | IA | No bulk operation exists even though `DataTable` supports it — but no server action supports bulk approve/pay either. | `DataTable.bulkActions`; `app/(app)/incentive/admin-actions.ts` | Do **not** add in a UI-only pass — OPEN-02 |

---

## 9. Status

| ID | Sev | Type | Finding | Evidence | Recommendation |
| --- | --- | --- | --- | --- | --- |
| STA-01 | INFO | good | The Booked / Accrued / Paid banner prevents a real misreading — it states that PMS counts Paid only. | `incentive-status-report.tsx` banner | Keep the content |
| STA-02 | S2 | duplication | Two tables with near-identical columns on one screen (per-person YTD report and per-entry editor), each with **its own search box**. | `incentive-status-report.tsx` `PersonTable`; `incentive-status-tab.tsx` editor table | One search; merge or clearly separate the tables |
| STA-03 | S2 | IA | The area duplicates Entries' subject matter: amounts live in Entries, the status of those amounts lives here. | `incentive-status-tab.tsx` vs `incentive-entries.tsx` | Move "Set status" and "Split" onto Entries rows; keep Status as the report |
| STA-04 | S2 | duplication | Two further `Th`/`Td` implementations. | `incentive-status-report.tsx:270,289`; `incentive-status-tab.tsx:203,222` | `DataTable` |
| STA-05 | S2 | consistency | A fourth definition of "target" appears here (window card target), alongside the Targets area, the dashboard target warning and the grade report's Target column. | `incentive-status-report.tsx` `WindowCard` target line | State the definition once, or link to Targets |
| STA-06 | S3 | density | `space-y-7` between sections; two `rounded-[22px] p-6` sections; three `p-5` window cards with three labelled bars each. | `incentive-status-tab.tsx`, `incentive-status-report.tsx` | `space-y-4`; flat cards |
| STA-07 | S3 | duplication | The banner repeats what each bar's `STATUS_META.hint` already says under it. | `incentive-status-report.tsx` `STATUS_META` + banner | Inline legend or popover, not both |
| STA-08 | S3 | consistency | Amber/green are hardcoded (`#d97706`, `#16a34a`, `#15803d`) as column header colours. | `incentive-status-report.tsx`, `incentive-status-tab.tsx` `Th color` | Token families |
| STA-09 | INFO | good | The whole area is behind `INCENTIVE_STATUS_UI`, checked server-side, and its queries are not run when hidden. | `app/(app)/incentive/page.tsx` `showStatus` | Keep |
| STA-10 | S3 | IA | No link from here to `/salary/incentive-payout`, which is the next step in the same job. | no cross-link in `incentive-status-tab.tsx` | Add a permission-gated link |
| STA-11 | INFO | good | The team-split dialog has a real mobile fallback (a 2-column grid replacing the 5-column desktop grid). | `incentive-team-split.tsx:209,220` | Keep as the model for other tables |

---

## 10. Incentive Chart / catalog dialog

| ID | Sev | Type | Finding | Evidence | Recommendation |
| --- | --- | --- | --- | --- | --- |
| CHT-01 | S1 | IA | An 80vw × 80vh modal is effectively a page without a URL (see NAV-04). | `incentive-catalog-dialog.tsx:96-99` | Promote to a route |
| CHT-02 | S1 | a11y | **Row actions are hover-only** (`opacity-0 group-hover:opacity-100`) — unreachable on touch and invisible to keyboard users until focus lands blind. | `incentive-catalog-dialog.tsx:192` | Always visible, or revealed on focus too |
| CHT-03 | S1 | bug-risk | Delete uses the native blocking `confirm()`. | `incentive-catalog-dialog.tsx:73` | Radix confirm dialog |
| CHT-04 | S2 | IA | The inline editor opens **above** the table inside the scroll container, so on a long catalog the edited row scrolls out of view. | `incentive-catalog-dialog.tsx` body: `{editing && <CatalogEditor …>}` before the table | Editing belongs in the Master (NAV-07) |
| CHT-05 | S3 | consistency | The dialog title uses `font-serif italic`, 24px, weight 600 — a type treatment used nowhere else in the app. | `incentive-catalog-dialog.tsx:104` | Standard dialog title |
| CHT-06 | INFO | good | PDF/Excel exports are plain anchors to server routes that re-read the **full** catalog, not the rendered subset, and honour `Content-Disposition`. | `ExportLink` + `app/(app)/incentive/export.*/route.ts` | Keep exactly |
| CHT-07 | S2 | IA | No search, sort or eligibility filter on a table the whole company reads. | `incentive-catalog-dialog.tsx` table | `DataTable` |
| CHT-08 | S3 | consistency | Eligibility tags use `var(--color-red)`/`var(--color-blue)` string interpolation to build token names. | `Tag` component | Explicit token usage |
| CHT-09 | INFO | good | Read access for everyone; edit affordances gated on `isAdmin` and re-checked in `catalog-actions.ts`. | `incentive-catalog-dialog.tsx` props; `app/(app)/incentive/catalog-actions.ts` | Keep |

---

## 11. Incentive Master & workspace

| ID | Sev | Type | Finding | Evidence | Recommendation |
| --- | --- | --- | --- | --- | --- |
| MAS-01 | INFO | good | The best-built screen in the module: shared `DataTable`, shared `AdminSection`, server-resolved `canEdit` / `canManageChart`, eight deliberate columns, "On offer today" filter, bulk activate/deactivate. | `master-table.tsx`; `app/(admin)/admin/incentive-master/page.tsx` | Use as the module's template |
| MAS-02 | INFO | good | Status is modelled as two facts — the `active` switch someone threw and the `validUntil` date that passed on its own — instead of one collapsed flag. | `master-table.tsx` status column + doc comment | Keep |
| MAS-03 | INFO | good | The "Nobody eligible" stat surfaces live schemes with an empty audience — invisible in a plain list. | `page.tsx` `unreachable` | Keep |
| MAS-04 | S1 | consistency | **The workspace runs a different design system**: `aura` glass, `aura-blob` field, grain overlay, `chrome-bar`, `chrome-rail`, `glass`, `pill state ok|warn|idle`, `btn`, `btn-quiet`, `icon-btn`, pointer-tracked sheen. | `workspace.tsx:283-300,751,875,1235` etc. | Restyle onto app tokens; keep the structure |
| MAS-05 | S2 | density | `h-[94vh] w-[94vw] max-w-[1500px]` overlay for what is mostly a two-column field grid. | `workspace.tsx:283` | `max-w-[1200px]`, `h-[88vh]` |
| MAS-06 | INFO | good | Internal navigation degrades correctly: a rail on desktop, a `<select>` below `md`. | `workspace.tsx` `chrome-rail` + `md:hidden` select | Keep as the pattern for other complex editors |
| MAS-07 | INFO | good | Dirty-state tracking, an "Unsaved" pill, an Escape guard that defers to a nested confirmation, and a typed-name delete confirmation. | `workspace.tsx` `dirty`, `requestClose`, `DeleteConfirm` | Keep; promote the delete pattern module-wide |
| MAS-08 | S2 | IA | Reachable only from the Admin Panel (see NAV-05). | `main-nav.tsx` admin rail | Rail entry in the Incentive room |
| MAS-09 | S3 | IA | Filters cover Status only, though Type, Product and Duration are columns and `DataTable` supports declarative filters. | `master-table.tsx:105-142` | Add three filters |
| MAS-10 | INFO | good | Bulk actions are deliberately limited to activate/deactivate; delete needs a typed name and amounts are per-scheme. | `master-table.tsx` `bulkActions` + comment | Keep the restraint |
| MAS-11 | S3 | consistency | The "New Incentive" button is another red-gradient CTA. | `master-table.tsx` new-incentive button | `.pastel-cta` |
| MAS-12 | INFO | good | The page re-checks `requireAdmin()` and the permission node, then passes capabilities down as props so the table renders from a server decision. | `app/(admin)/admin/incentive-master/page.tsx` | Keep |

---

## 12. Incentive payout (Accounts)

| ID | Sev | Type | Finding | Evidence | Recommendation |
| --- | --- | --- | --- | --- | --- |
| PAY-01 | S1 | consistency | The page does not use `PageShell` or `PageCommandBar`; it hand-rolls `<main className="mx-auto max-w-[1200px] px-8 max-lg:px-6 max-md:px-4 pt-8 pb-16">`. | `app/(app)/salary/incentive-payout/page.tsx` | `PageShell width="wide"` + `PageCommandBar` |
| PAY-02 | S1 | consistency | It uses the two patterns `PageCommandBar` documents as removed: a red uppercase eyebrow pill ("SALARY · INCENTIVE PAYOUT") and a paragraph under a 42px hero title, inside a `rounded-[26px]` glass header. | same file, header block | Title + inline hint + month strip in `toolbar` |
| PAY-03 | S2 | bug-risk | Constants named `GREEN` / `GREEN_DEEP` hold **red** values (`#E10600` / `#A80400`) and are used for accents throughout the file. | `app/(app)/salary/incentive-payout/page.tsx:17-18` | Tokens; delete the misleading names |
| PAY-04 | S2 | IA | On no rail (see NAV-06). | `main-nav.tsx` | Accounts rail entry + cross-link |
| PAY-05 | S2 | duplication | A sixth KPI card implementation. | `app/(app)/salary/incentive-payout/page.tsx:150` | Shared card |
| PAY-06 | S2 | duplication | The panel re-implements `Th`/`Td` again. | `components/salary/incentive-payout-panel.tsx:261,287` | `DataTable` |
| PAY-07 | INFO | good | The KPI set matches the job (Booked / Accrued-payable / Paid / Remainder) and the copy is honest that it records rather than disburses. | same page | Keep the content |
| PAY-08 | INFO | good | Month selection is a small pill strip over the last six months with a sensible default (the last completed month). | `recentMonths`, `defaultMonth` | Keep; move into `toolbar` |

---

## 13. Forms & modals

| ID | Sev | Type | Finding | Evidence | Recommendation |
| --- | --- | --- | --- | --- | --- |
| FRM-01 | INFO | good | `IncentiveFormDialog` is the reference form: two panes at `md`, field grouping via `pane`/`half`, conditional fields per type, a problem summary whose entries focus the offending field, a sticky footer with a `*` legend, and `noValidate` with custom validation. | `incentive-form-dialog.tsx:325-660` | Keep the structure |
| FRM-02 | INFO | good | Resubmission shows the prior decision, then requires a justification, and states that the earlier submission is preserved. | `incentive-form-dialog.tsx` `ResubmitDecision` + justification field | Keep |
| FRM-03 | INFO | good | The type select is disabled on resubmit, and the server takes the stored type regardless. | `incentive-form-dialog.tsx` type `Select` `disabled={!!resubmit}` | Keep |
| FRM-04 | S2 | duplication | `FieldShell`, `FieldControl`, `NotesInput` and the problem-summary block are local to this file; four other dialogs re-implement `Field`/`Input`/`Checkbox`. | `incentive-form-dialog.tsx:1136`; `incentive-entries.tsx`; `incentive-catalog-dialog.tsx`; `incentive-status-editor.tsx` | Extract to shared form primitives |
| FRM-05 | S2 | consistency | Modal sizes span `max-w-md`, `max-w-lg`, `max-w-2xl`, `max-w-[980px]`, `80vw×80vh`, `94vw×94vh` — six sizes for ten dialogs. | modal inventory | Four sizes: 480 / 640 / 980 / full |
| FRM-06 | S2 | consistency | Modal radii span `rounded-2xl`, `rounded-section`, `rounded-[22px]`, `rounded-[24px]`, `rounded-[20px]`. | modal inventory | One radius |
| FRM-07 | S3 | consistency | Cancel buttons vary: bare text, `bg-surface-card` with no border, and a neutral pill. | `incentive-entries.tsx`, `incentive-targets.tsx`, `incentive-form-dialog.tsx` footers | One neutral secondary |
| FRM-08 | S3 | consistency | Two overlay treatments: `rgba(15,23,42,0.4)` + `blur(3px)` versus `bg-black/30` / `bg-black/40`. | `incentive-targets.tsx`, `incentive-entries.tsx`, `incentive-catalog-dialog.tsx`, `incentive-form-dialog.tsx` | One overlay |
| FRM-09 | S3 | a11y | Error text colour is applied via literal hex/`var(--color-altus-red-deep)` inconsistently, and some errors are `role="alert"` while others are plain paragraphs. | `incentive-form-dialog.tsx` vs `incentive-decision-panel.tsx` vs `incentive-targets.tsx` toasts | One error component with `role="alert"` |
| FRM-10 | INFO | good | Numeric inputs use `inputMode="numeric"` and strip non-digits before saving. | `TargetWarningBar.digits`, `EntryDialog.num` | Keep |
| FRM-11 | S3 | consistency | Validation feedback is split between inline errors (form dialog) and toasts (entries, targets, catalog). | `fireToast` usage in `incentive-entries.tsx`, `incentive-targets.tsx`, `incentive-catalog-dialog.tsx` | Inline for field errors; toast for outcomes |
| FRM-12 | INFO | good | The split editor enforces 2–5 people, includes the filer, requires 100% total, and supports equal-split plus 2-decimal manual entry. | `incentive-form-dialog.tsx` `SplitIncentive`; `lib/incentive/split.ts` | Keep untouched |

---

## 14. Tables & filters

| ID | Sev | Type | Finding | Evidence | Recommendation |
| --- | --- | --- | --- | --- | --- |
| TBL-01 | S1 | consistency | Nine tables, two implementations: `DataTable` (Grade Report, status drill-down, Master) versus seven hand-rolled tables. | MOD-03 evidence | Migrate all to `DataTable` |
| TBL-02 | S2 | consistency | Table header type varies: `11px` (targets, billing, status report, drill-down) versus `10.5px` (entries, status tab) versus `DataTable`'s own. The design system specifies `10.5px/700/uppercase/tracking-[0.1em]`. | header cells across the module | One header style |
| TBL-03 | S2 | consistency | Cell padding varies (`py-2.5 pr-3`, `px-3.5 py-2.5`, `px-1 py-2.5`), and header/body padding disagree in places — the documented cause of visually misaligned columns. | `incentive-entries.tsx` vs `incentive-status-tab.tsx` vs `incentive-targets.tsx` | Identical horizontal padding per boundary |
| TBL-04 | S2 | IA | Only three tables have any filter; five have none. | `DataTable` `filters` used in `analytics-dashboard.tsx` and `master-table.tsx` only | Filters per the plan §7 |
| TBL-05 | S2 | IA | No table freezes its identity column, so horizontal scrolling loses the person's name. | `overflow-x-auto` wrappers throughout | Freeze the identity column |
| TBL-06 | S1 | IA | No table paginates. Entries and the Status editor can both grow unbounded. | `incentive-entries.tsx`, `incentive-status-tab.tsx` | Paginate both |
| TBL-07 | S3 | consistency | Totals rows are hand-built with `border-t-2` in four tables. | `incentive-targets.tsx`, `billing-dashboard.tsx`, `incentive-dashboard.tsx` | One totals-row treatment |
| TBL-08 | S3 | consistency | Sort affordances differ: `DataTable` uses icons; `SortTh` uses `↑`/`↓` characters. | `data-table.tsx` vs `incentive-targets.tsx:509` | `DataTable`'s |
| TBL-09 | S3 | consistency | Search placeholders vary between the documented `Local search — <what>` convention and `DataTable`'s "Search employee or code" style. | `incentive-targets.tsx:193` vs `analytics-dashboard.tsx:640` | One convention, per the design system |
| TBL-10 | INFO | good | `DataTable` already provides search, filters, sort, dense mode, select-all, a bulk bar, toolbar actions and an empty state — nothing new needs building to standardise. | `components/admin/ui/data-table.tsx` | Adopt |

---

## 15. Visual system

| ID | Sev | Type | Finding | Evidence | Recommendation |
| --- | --- | --- | --- | --- | --- |
| VIS-01 | S1 | consistency | Accent hardcoded in 68 places (MOD-01) — breaks the per-user accent override. | `lib/appearance.ts` + module grep | `var(--color-altus-red*)` |
| VIS-02 | S2 | consistency | Non-accent colours are hardcoded too: `#16a34a`, `#15803d`, `#d97706`, `#B45309`, `#0F766E`, `#1D4ED8`, `#334155`, `#D4AF37`, `#92400E`, `#7F1D1D`. | `analytics-dashboard.tsx` `STATUS_TONE`/`GRADE_TONE`; `incentive-status-pill.tsx`; `incentive-status-report.tsx`; `billing-dashboard.tsx`; `incentive-dashboard.tsx` | `green` / `amber` / `blue` / `teal` / `slate` token families |
| VIS-03 | S2 | consistency | Three parallel status-colour maps: request statuses, dashboard status keys, and the Master's `pill state` classes. | `incentive-status-pill.tsx`; `analytics-dashboard.tsx` `STATUS_TONE`; `workspace.tsx` `pill state` | One source, one badge component |
| VIS-04 | S2 | consistency | Grade colours are a second hardcoded map, separate from the status map. | `analytics-dashboard.tsx` `GRADE_TONE` | Shared `GradeBadge` on tokens |
| VIS-05 | S1 | consistency | Button hierarchy is flat: the same red-gradient white-text button is used for "New request", "Add Entry", "Add Incentive", "Save Target", "Save target", "New Incentive", "Submit", "Resubmit" — so nothing reads as more important than anything else. | 17 gradient buttons (MOD-02) | `.pastel-cta` primary; neutral secondary; icon tertiary; solid red only for destructive confirms |
| VIS-06 | S2 | consistency | Seven radii (MOD-07). | radius census | Two card recipes |
| VIS-07 | S2 | consistency | Shadow recipe simulates borders with triple insets (MOD-15). | shadow census | Real hairline border + one soft drop |
| VIS-08 | S2 | consistency | 28 distinct type sizes across Tailwind classes and inline styles (MOD-09). | size census | The documented 9-role scale |
| VIS-09 | S2 | consistency | `fontWeight: 900` on a font capped at 800 (MOD-08). | 19 occurrences | 800 |
| VIS-10 | S3 | consistency | Section headings are 20–21px display where the design system specifies 16px/800. | `incentive-dashboard.tsx` `Panel`; `billing-dashboard.tsx` `Panel`; `incentive-targets.tsx`; `incentive-status-tab.tsx`; `incentive-status-report.tsx` | 16px/800 |
| VIS-11 | S3 | consistency | Icon size/stroke drift (MOD-14). | icon census | 14/2.4, 16/2.6, 13 in badges |
| VIS-12 | S3 | consistency | Spacing scale drift (MOD-10), including `px-4.5`/`py-4.5` half-steps. | spacing census | 4/8/12/16/24 |
| VIS-13 | INFO | good | Module identity is already carried by the magenta hub card and the Award mark, so no second in-module accent is needed. | `app/(app)/hub/page.tsx:134`; `components/hub/module-logos.tsx:43,251-256` | Keep; do not introduce an Incentive-specific primary |
| VIS-14 | S3 | consistency | `IncentiveStatusPill` is 12px/`px-2.5` where the documented badge is 11px/`px-2`. | `incentive-status-pill.tsx` | Align to the badge recipe |

---

## 16. Density & layout

| ID | Sev | Type | Finding | Evidence | Recommendation |
| --- | --- | --- | --- | --- | --- |
| DEN-01 | S2 | density | Nested rounded containers up to three deep on the Dashboard (page card → `<details>` card → panel card → table). | `incentive-tabs.tsx` + `incentive-dashboard.tsx` | Maximum two |
| DEN-02 | S2 | density | Repeated headers: the page command bar title plus a 20–21px section heading on Targets, Status, Billing. | those files' section headers | Page title only, unless a screen has several sections |
| DEN-03 | S2 | density | Oversized KPI/status cards cost roughly 200px of vertical space before any data is shown (DASH-06, DASH-07). | measured from padding + type sizes | Compact rows |
| DEN-04 | S2 | density | Card lists where tables belong: Requests at ~150px/row (REQ-05). | `incentive-list.tsx` | Table |
| DEN-05 | S3 | density | `p-6`/`p-7`/`p-10` panel padding across the module. | `incentive-dashboard.tsx`, `billing-dashboard.tsx`, `incentive-status-*.tsx` | `p-4` (`p-3` mobile) |
| DEN-06 | S3 | density | Information that could be a filter is rendered as prose or per-row decoration ("No target set", "amount not set", attainment rings). | `analytics-dashboard.tsx` `TargetVsActual`; `incentive-targets.tsx` `AttainRing` | Filters + compact cells |
| DEN-07 | INFO | good | The performance strip is already dense and well-structured — five metrics in one row with a thin team summary beneath. | `analytics-dashboard.tsx` `PerformanceStrip` | Keep; use as the density target |
| DEN-08 | S3 | density | Excessive vertical scrolling on Billing: four panels, a podium, two tables and twelve monthly bars on one screen. | `billing-dashboard.tsx` | Per the plan §11.6 |

---

## 17. Empty, loading & error states

| ID | Sev | Type | Finding | Evidence | Recommendation |
| --- | --- | --- | --- | --- | --- |
| STATE-01 | S2 | consistency | Eight different empty states (MOD-13), from a bare `<p>` to a `p-10` icon card. | MOD-13 evidence | One `EmptyState` |
| STATE-02 | S2 | bug-risk/consistency | **No `loading.tsx` for `/incentive`** even though the page is `force-dynamic` and performs many DB reads. | `app/(app)/incentive/` contains no `loading.tsx` | Add a skeleton route file |
| STATE-03 | S3 | consistency | Billing's loading state is a sentence in a card ("Loading billing from the live sheet…"). | `app/(app)/incentive/page.tsx` `BillingLoading` | Table skeleton |
| STATE-04 | INFO | good | Period refetch dims the data region and shows a spinner beside the period label rather than blanking the screen. | `analytics-dashboard.tsx` `pending` | Keep |
| STATE-05 | INFO | good | Every incentive read on the page is wrapped in `withRetry` on a fresh connection, with per-read labels. | `app/(app)/incentive/page.tsx` `r()` | Keep untouched |
| STATE-06 | S3 | consistency | Error presentation is split between toasts, inline `role="alert"` blocks and a bespoke billing error card. | `fireToast` usage; `incentive-form-dialog.tsx` `serverError`; `billing-dashboard.tsx` error branch | One error card + one toast policy |
| STATE-07 | S3 | copy | Empty-state copy varies between "what to do next" (good: "Add one or import a sheet") and a plain statement of emptiness ("No targets or earnings this year yet."). | `incentive-entries.tsx:84` vs `incentive-targets.tsx:205` | Always name the next action |

---

## 18. Accessibility & input

| ID | Sev | Type | Finding | Evidence | Recommendation |
| --- | --- | --- | --- | --- | --- |
| A11Y-01 | S1 | a11y | Hover-only row actions in the catalog dialog (CHT-02). | `incentive-catalog-dialog.tsx:192` | Always visible |
| A11Y-02 | S2 | a11y | Native blocking `confirm()` / `window.confirm` for destructive and unsaved-changes flows. | `incentive-catalog-dialog.tsx:73`; `workspace.tsx:184` | Radix dialogs |
| A11Y-03 | S2 | a11y | Invalid `<dl>` content in the expanded request row (REQ-14). | `incentive-list.tsx` expanded block | Restructure |
| A11Y-04 | S3 | a11y | Status/grade meaning is carried by colour plus a letter; the colour pairs (amber for both Pending and Booked; two reds for Not Approved and Reversed) are close in hue. | `incentive-status-pill.tsx`; `analytics-dashboard.tsx` tone maps | Keep the text labels, which already carry the meaning; verify contrast when moving to tokens |
| A11Y-05 | INFO | good | Interactive status cards are real `<button>`s with `aria-pressed`, and the period/scope groups use `role="group"` with `aria-label`. | `analytics-dashboard.tsx` | Keep |
| A11Y-06 | INFO | good | Sortable headers in the targets table expose `aria-sort`. | `incentive-targets.tsx` `SortTh` | Keep; `DataTable` does the same |
| A11Y-07 | S3 | a11y | Some icon-only buttons rely on `title` rather than `aria-label`. | export links in `incentive-catalog-dialog.tsx` | Add `aria-label` |
| A11Y-08 | S3 | a11y | Focus-visible rings are inconsistent: the documented ring is applied by shared components but not by the module's hand-rolled buttons. | module buttons vs `design-system/SKILL.md` §5 | Apply the documented ring |
| A11Y-09 | INFO | good | Search fields carry the documented `title` explaining that they filter only the current page. | `incentive-targets.tsx:193`; `incentive-status-tab.tsx:100`; `incentive-status-report.tsx:200` | Keep the convention |

---

## 19. Mobile & responsive

| ID | Sev | Type | Finding | Evidence | Recommendation |
| --- | --- | --- | --- | --- | --- |
| MOB-01 | INFO | good | The rail is desktop-only (`max-md:hidden`); mobile uses the app's mobile menu, so no duplicate navigation appears on phones. | `components/layout/sidebar-rail.tsx` | Keep |
| MOB-02 | S2 | density | Every table falls back to `overflow-x-auto` with no column collapsing, so on a phone the user scrolls horizontally through 5–8 columns. | `overflow-x-auto` wrappers throughout | Collapse secondary columns into a row detail below `md`; keep cards where a table cannot work |
| MOB-03 | INFO | good | The team-split dialog implements a real mobile grid instead of a horizontal scroll. | `incentive-team-split.tsx:209,220` | Use as the model |
| MOB-04 | INFO | good | The request form stacks its two panes and hides the right-pane placeholder on small screens. | `incentive-form-dialog.tsx` pane classes | Keep |
| MOB-05 | S3 | density | Responsive grid breakpoints are inconsistent: `max-sm:grid-cols-1` (×6), `max-md:grid-cols-1` (×4), `max-lg:grid-cols-1` (×2), `max-md:grid-cols-2`, `max-lg:grid-cols-2`. | grid census | One ladder: 1 / 2 / 3–4 / 6 |
| MOB-06 | S3 | density | The period control wraps to three lines on a phone (scope pills, period pills, month select, label). | `analytics-dashboard.tsx` control row | Horizontal scroll strip instead of wrapping |
| MOB-07 | S3 | a11y | Some row action buttons are `h-8 w-8` (32px), under the 40px touch-target guidance. | `incentive-entries.tsx` actions | 40px on touch |
| MOB-08 | INFO | good | Modals already cap at `max-h-[calc(100dvh-32px)]` / `-24px` and scroll their bodies. | dialogs throughout | Keep |

---

## 20. User flows

| ID | Sev | Type | Finding | Evidence | Recommendation |
| --- | --- | --- | --- | --- | --- |
| FLOW-01 | S2 | flow | **Employee — file a request:** Hub → Incentive → rail Requests → scroll to a right-aligned button → dialog. The primary action is above the fold only by luck. | `incentive-tabs.tsx` requests branch | Command-bar action on every area (REQ-06) |
| FLOW-02 | S2 | flow | **Employee — resubmit:** without the notification link, the employee must scan the list; there is no "waiting on me" filter. | `incentive-list.tsx` | Pre-applied filter (REQ-17) |
| FLOW-03 | INFO | good | **Employee — notification path** is a single click straight to the expanded request. | `focusRequestId` | Keep |
| FLOW-04 | S2 | flow | **Manager — scope is re-established per area**: the Dashboard's Team/User choice does not reach Targets. | PERM-09 | Shared `?view=` |
| FLOW-05 | S1 | flow | **Admin — reach the Master:** profile menu → Admin Panel → Incentive → Incentive Master → row → workspace → Eligibility. Five to six clicks and a room change for a routine task. | NAV-05 | Rail entry → table → row → workspace (three clicks) |
| FLOW-06 | S2 | flow | **Accounts — Billing → Payment** spans two rooms with no link, and the payout route is undiscoverable without the URL. | NAV-06 | Rail entry + cross-link |
| FLOW-07 | S2 | flow | **Everyone — changing year reloads the page**; changing period does not. Two mental models for the same question. | DASH-01 | One control |
| FLOW-08 | S2 | flow | **Admin — find one entry** in an unbounded, unsearchable table. | ENT-01 | Search + filters + pagination |
| FLOW-09 | S3 | flow | **Everyone — open the Incentive Chart**: a modal that cannot be linked or restored after a refresh. | NAV-04 | Route |
| FLOW-10 | INFO | good | The reviewer's queue-first ordering means the highest-value flow (decide waiting requests) needs no filtering today — which is why REQ-04 is a scale problem rather than a blocker. | `incentive-list.tsx` `needsReview` split | Keep the ordering when moving to a table |

---

## 21. Things that are good — do not "fix"

| ID | Finding |
| --- | --- |
| KEEP-01 | Status cards as click-to-drill filters, with the detail table swapping in place (DASH-05). |
| KEEP-02 | Server-resolved scope, and the structural guarantee that a browser-supplied `view` cannot widen it (PERM-01, PERM-02). |
| KEEP-03 | Hidden-not-disabled treatment for areas and controls a viewer is not entitled to (PERM-03, PERM-10). |
| KEEP-04 | The resubmit callout rendering without expanding the card (REQ-02). |
| KEEP-05 | The decision panel's required notes plus an explicit confirm naming the resulting status (REQ-12). |
| KEEP-06 | Notification deep links, and the rule that a link to someone else's request opens nothing (REQ-03). |
| KEEP-07 | Exports that re-read the full catalog server-side rather than the rendered subset (CHT-06). |
| KEEP-08 | Billing streamed off the critical path with a self-healing summary (BILL-01, BILL-02). |
| KEEP-09 | `withRetry` on every page read, with labels (STATE-05). |
| KEEP-10 | Incentive Master's two-fact status model, "Nobody eligible" stat, restrained bulk actions and typed-name delete (MAS-02, MAS-03, MAS-07, MAS-10). |
| KEEP-11 | The dual-identity eligibility guard (PERM-04). |
| KEEP-12 | The request form's field grouping, conditional fields, problem summary and split editor (FRM-01, FRM-12). |
| KEEP-13 | The team-split dialog's genuine mobile layout (STA-11, MOB-03). |
| KEEP-14 | The single-rail navigation with no duplicated horizontal tabs (MOD-17). |
| KEEP-15 | The performance strip's density (DEN-07). |

---

## 22. Open questions for the module owner

| ID | Question | Why it is not decided here |
| --- | --- | --- |
| OPEN-01 | Should Billing be scoped to the viewer like the rest of the module, or stay company-wide? | Changing it alters who sees company revenue data — a product and permission decision, not a UI one (PERM-06, BILL-08). |
| OPEN-02 | Should Entries support bulk approve / mark-paid? | No server action exists today; adding one is backend work outside a UI pass (ENT-11). |
| OPEN-03 | Should the Entries and Status areas merge into one area with two views? | Recommended in the plan, but it changes an admin's mental model and the rail; owner's call (STA-03). |
| OPEN-04 | Should the "Status" rail label be renamed (e.g. "Payment status") to avoid colliding with request status? | Naming decision with downstream copy implications (NAV-08). |
| OPEN-05 | Should `?year=` remain a supported URL parameter after the period control absorbs it? | Recommendation is yes (map to that year's YTD) to protect existing links; confirm before removal (NAV-12). |
| OPEN-06 | Does the Android app need matching UI work? | `incentive-changes.md` records that it was not updated for the 2026-09 changes; API shapes must not change in a UI pass. |

---

## 23. Must-not-touch register

Every item below must survive the restructuring unchanged.

**Security and permissions**

- `lib/auth/incentive-permissions.ts` — reviewer identity (`canReviewIncentives`, `INCENTIVE_REVIEWER_NAME`).
- `lib/incentive/analytics/scope.ts` — `incentiveAnalyticsScopeFor`, `applyAnalyticsView`, including the non-widening property.
- `lib/incentive/eligibility-guard.ts` — effective **and** real identity check, fail-closed.
- Server-side re-checks inside every action in `app/(app)/incentive/*.ts` and `app/(admin)/admin/incentive-master/actions.ts`.
- Permission nodes: `employees.incentive`, `admin.incentive`, `admin.incentive.master`, `accounts.payroll.incentive-payout`.

**Workflow and calculation**

- `lib/incentive/workflow.ts`, `workflow-server.ts` — `availableDecisions`, `needsReview`, `canResubmit`, `isContentReviewRequest`, `checkDecision`, note requirements.
- Submission numbering, history immutability, the resubmission model.
- `lib/incentive/analytics/grading.ts` — bands, `round2`, `pctOfCtc`, rank and movement.
- `lib/incentive/analytics/periods.ts` — period kinds, IST "now", calendar-year YTD.
- `lib/incentive/payout.ts`, `payout-math.ts`, `payout-sources.ts`, `payout-flag.ts`, `split.ts`, `status-flag.ts`, `prepare-request.ts`.
- `lib/incentive-amount.ts`, `lib/incentive-fields.ts`, `lib/queries/incentive*.ts`, `lib/ensure-incentive-schema.ts`.
- `incentive_catalog` as the single source of truth — no second incentive table.

**Behaviour**

- Deep links `?request=<id>`, `?view=table`, `?tab=<key>`, `?year=<yyyy>`.
- Notification, email and push content and links (`lib/incentive/notifications/*`).
- `/incentive/export.pdf` and `/incentive/export.xlsx`.
- `/api/mobile/incentive` request/response shapes.
- `/api/cron/incentive-digest`.
- The Billing `<Suspense>` stream and `withRetry` wrapping.
- `INCENTIVE_STATUS_UI` and the payout flag.
- Master audit/history writes and the typed-name delete confirmation.

---

## 24. Findings index by severity

**S1 — blocks a user goal or breaks a documented rule (14)**

`MOD-01` accent hardcoded · `MOD-12` three destructive standards · `NAV-04` Chart has no URL · `NAV-05` Master unreachable from the module · `PERM-05` company KPIs ignore the scope switch · `DASH-01` two time controls · `DASH-02` two contradictory KPI rows · `REQ-04` no filter/sort/search on Requests · `ENT-01` unbounded Entries table · `ENT-02` silent delete · `CHT-01` modal-as-page · `CHT-02` hover-only actions · `CHT-03` native `confirm()` · `MAS-04` foreign design system · `PAY-01`/`PAY-02` no `PageShell`/`PageCommandBar` · `TBL-01` two table implementations · `TBL-06` no pagination · `VIS-01` accent hardcoded · `VIS-05` flat button hierarchy · `A11Y-01` hover-only actions · `FLOW-05` six clicks to eligibility.

**S2 — real friction or systemic duplication (≈60)**

MOD-02, MOD-03, MOD-04, MOD-05, MOD-06, MOD-07, MOD-08, MOD-09, MOD-10, MOD-11, MOD-13, MOD-15, MOD-18; NAV-03, NAV-06, NAV-07, NAV-11; PERM-06, PERM-09; DASH-03, DASH-04, DASH-06, DASH-07, DASH-08, DASH-14, DASH-19; TGT-02, TGT-03, TGT-04, TGT-05, TGT-06, TGT-07, TGT-10; BILL-03, BILL-04, BILL-05, BILL-07, BILL-08; REQ-05, REQ-06, REQ-07, REQ-09, REQ-11; ENT-03, ENT-04, ENT-05, ENT-11; STA-02, STA-03, STA-04, STA-05; CHT-04, CHT-07; MAS-05, MAS-08; PAY-03, PAY-04, PAY-05, PAY-06; FRM-04, FRM-05, FRM-06; TBL-02, TBL-03, TBL-04, TBL-05; VIS-02, VIS-03, VIS-04, VIS-06, VIS-07, VIS-08, VIS-09; DEN-01, DEN-02, DEN-03, DEN-04; STATE-01, STATE-02; A11Y-02, A11Y-03; MOB-02; FLOW-01, FLOW-02, FLOW-04, FLOW-06, FLOW-07, FLOW-08.

**S3 — polish and consistency (≈45)**

MOD-14, MOD-16; NAV-08, NAV-10, NAV-12; PERM-07, PERM-08, PERM-11; DASH-12, DASH-13, DASH-15, DASH-16, DASH-18, DASH-20; TGT-08, TGT-09, TGT-12; BILL-06, BILL-09, BILL-10; REQ-08, REQ-10, REQ-13, REQ-14, REQ-15, REQ-17; ENT-06, ENT-07, ENT-08, ENT-10; STA-06, STA-07, STA-08, STA-10; CHT-05, CHT-08; MAS-09, MAS-11; FRM-07, FRM-08, FRM-09, FRM-11; TBL-07, TBL-08, TBL-09; VIS-10, VIS-11, VIS-12, VIS-14; DEN-05, DEN-06, DEN-08; STATE-03, STATE-06, STATE-07; A11Y-04, A11Y-07, A11Y-08; MOB-05, MOB-06, MOB-07; FLOW-09.

**INFO — keep as-is or observation (≈50)**

MOD-17; NAV-01, NAV-02, NAV-09; PERM-01, PERM-02, PERM-03, PERM-04, PERM-10; DASH-05, DASH-09, DASH-10, DASH-11, DASH-17; TGT-01, TGT-11; BILL-01, BILL-02; REQ-01, REQ-02, REQ-03, REQ-12, REQ-16; ENT-09; STA-01, STA-09, STA-11; CHT-06, CHT-09; MAS-01, MAS-02, MAS-03, MAS-06, MAS-07, MAS-10, MAS-12; PAY-07, PAY-08; FRM-01, FRM-02, FRM-03, FRM-10, FRM-12; TBL-10; VIS-13; DEN-07; STATE-04, STATE-05; A11Y-05, A11Y-06, A11Y-09; MOB-01, MOB-03, MOB-04, MOB-08; FLOW-03, FLOW-10; all KEEP-01…KEEP-15; all OPEN-01…OPEN-06.

**Totals:** 21 `S1` · ~88 `S2` · ~62 `S3` · ~57 `INFO`/`good`/`open` = **≈228 individual findings**, plus the 15 keep-as-is entries and 6 open questions.
