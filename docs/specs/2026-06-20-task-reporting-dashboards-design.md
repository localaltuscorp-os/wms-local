# Task Reporting Dashboards — Design Spec

> **Status:** APPROVED 2026-06-20 (all open items in §10 resolved by the user).
> Three new analytics sections on the main dashboard: **Done (on-time & aging)**,
> **Not Approved**, and **Manager Initiator (target vs actual)**. Derived from the
> founder's spec + design Q&A.

## 1. Goal

Give management three accountability views, all on the existing home dashboard,
all respecting the current filter bar (date range / employee / etc.):

1. **Done — On-time & Aging:** of tasks that got *done*, how many landed on time
   vs late, measured **two ways** — against the **Original** due date and against
   the **Revised** due date — plus a signed early/late aging histogram.
2. **Not Approved:** tasks the approver explicitly **sent back** (declined),
   person-wise, aged by how long they've sat unresolved.
3. **Manager Initiator:** is each manager pushing work **down** to their team? A
   target-vs-actual scorecard built on a "3 tasks per direct report per working
   day" goal, with every initiated task classified into three buckets.

## 2. Placement & shared behavior

- **Location:** three new sections appended to the home dashboard
  (`app/(app)/page.tsx`), after the existing Aging Heatmap.
- **Collapsed by default** — each section is an expand-on-demand block ("shown
  when called"). Reuse/match the existing `CollapsibleVelocity` pattern.
- **Filter-aware:** honor `parseFilters(searchParams)` (date range, employee,
  dept, etc.), same as the rest of the dashboard.
- **Per-person breakdowns are admin-only** (privacy), matching `PunctualityCard`.
- **Fail-open:** each section's data is loaded as its own query inside
  `loadDashboardData`, each `.catch`-degrading to an empty/hidden state so one
  slow/failed query never takes down the dashboard (existing resilience pattern).
- **Visual language:** mirror `AgingHeatmap` / `PunctualityCard` (warm card, red
  accent, split bars, Popover drill-downs).

## 3. Dashboard ① — Done: On-time & Aging

**Toggle:** `Original ⇄ Revised` due date.

**Universe:** live `status = 'done'`, `archived = false` tasks in the filter
range (same as today's D16 card). Tasks with no `completed_at` are surfaced as
`undated` and excluded from the rate (existing behavior).

**On-time definition (per existing `computePunctuality`, by UTC calendar day):**
- **Original tab:** `completedDay <= dueDay` where `dueDay = due_at`.
- **Revised tab:** `completedDay <= effectiveDueDay` where
  `effectiveDueDay = COALESCE(revised_target_date, due_at)`.

> Implementation: parameterize `computePunctuality(tasks, nameById, basis)` where
> `basis ∈ {'original','revised'}` picks which due timestamp each task compares
> against. The dashboard scan must carry **both** `due_at` (raw) and
> `revised_target_date` so the transform can switch without a re-query.

**Aging histogram (the 12 signed bands, locked):** bucket =
`effectiveDueDay − completedDay` (positive = early/good, negative = late/bad).
The histogram follows the active tab's basis (Original or Revised).

| Sign | Bands |
|---|---|
| Early (good) | `+7 or more`, `+4 to +6`, `+2 to +3`, `+1`, `0 (on the day)` |
| Late (bad) | `−1`, `−2 to −3`, `−4 to −5`, `−6 to −7`, `−8 to −10`, `−11 to −15`, `−16 or more` |

**Shows:** team on-time % + split bar + on-time/late counts (everyone);
the 12-band histogram; admin-only per-person breakdown (busiest first).

## 4. Dashboard ② — Not Approved (strict, on-demand)

**Universe (narrow, per founder):** **only** tasks with
`approval_status = 'not_approved'` (explicitly declined / sent back), `archived
= false`. **Never** the "done but awaiting sign-off / approval_status NULL"
tasks, and never any other status. This view is scoped strictly to declined work
and does not leak into other dashboards.

**Person-wise:** grouped by the **doer** (whose work was sent back).

**Aging = "days waiting":** how long the declined task has sat unresolved.
- **Anchor:** the `created_at` of the latest `task_events` row that moved the
  task into `not_approved` (a `status_changed`/approval event). **Fallback** to
  `completed_at`, then `updated_at`, if no such event row exists (legacy/imported).
- **Buckets (positive-only, days):** `0`, `1`, `2–3`, `4–7`, `8–14`, `15–30`,
  `30+`. Oldest-waiting first.

**Shows:** per-person counts + the waiting-aging histogram + a drill-down list
(Popover) of the declined tasks, oldest first.

## 5. Dashboard ③ — Manager Initiator: Target vs Actual

**Toggle:** `Last 3 days ⇄ Last 7 days` (calendar window; the *target* uses
**working days** within it — see §6).

**Managers:** every employee who is *somebody's* `manager_id` (≥1 direct report).
**No hardcoded list** — derived live from the hierarchy.

**Classification — every task the manager initiated** (`initiator_id = manager`,
`created_at` within the window, `archived = false`) is sorted into exactly one of
three exhaustive buckets by its **doer**:

1. **Direct Reports** — `doer.manager_id === manager.id`. *(counts toward KPI)*
2. **Founder / Management** — doer is the **Founder**, **Manan Vasa only**,
   identified by a stable `FOUNDER_EMAIL` constant (`manan@unleashed.in`, co-located
   with `lib/auth/super-admin.ts`). **NOT** `manager_id IS NULL` — the managers
   currently have no manager set and must **never** be counted as founders. Reserved
   for the founder (and any future layer explicitly above the managers — none today).
3. **Counterparts** — everyone else: same-level / peer managers (the "management
   team") **and** any cross-team person. Catch-all so the three always sum to
   **Total Initiated**.

**Scorecard per manager:**
- **Total Tasks Initiated** (all three buckets).
- **To Direct Reports** *(KPI input)*, **To Counterparts**, **To Founders/Mgmt**.
- **Target** = `(# direct reports) × 3 × (working days in window)`.
- **Actual** = the **Direct Reports** count only.
- **Attainment** = `Actual / Target` with ✅/❌.
- **Per-report rows:** each direct report shows `hit / goal`
  (`goal = 3 × working days`) with ✅/❌, exposing exactly who a manager is and
  isn't delegating to.

**Audience:** admin sees all managers; a manager sees their own scorecard +
team (per the admin-only rule for cross-person data).

## 6. Working-days computation

`countWorkingDays(start, end, holidaySet, weeklyOffDays)` — pure helper in
`lib/transforms/working-days.ts`:
- Iterate calendar days in `[start, end]`.
- Exclude days whose weekday ∈ `weeklyOffDays`.
- Exclude days present in `holidaySet` (from the `holidays` table).
- `weeklyOffDays = [Sunday]` — **confirmed: Altus is a 6-day week, only Sunday
  off.** (Saturday counts as a working day toward the target.)

## 7. Data / queries

- Extend the dashboard task scan (`lib/queries/dashboard.ts`) to carry, per task:
  `due_at` (raw), `revised_target_date`, `completed_at`, `status`, `archived`,
  `doer_id`, `initiator_id`, `approval_status`, `created_at`.
- New small queries (each fail-open):
  - Not-Approved set + their latest `not_approved` event timestamp (join/subquery
    on `task_events`).
  - Initiator window scan: tasks with `created_at` in the 7-day window (covers
    both toggles), `initiator_id`, `doer_id`.
  - Hierarchy: `employees(id, manager_id, name)` to resolve reports/managers.
  - Holidays in range for working-day math.

## 8. Pure transforms (each unit-tested)

All in `lib/transforms/`, pure (no DB), Vitest-covered — matching the existing
`punctuality.ts` pattern:

- `computePunctuality(tasks, nameById, basis)` — **extend** existing for
  original/revised + emit the 12-band signed histogram.
- `computeNotApprovedAging(tasks, nameById)` — person-wise + waiting-aging bands.
- `computeInitiatorScorecard(tasks, employees, window, holidays, weeklyOff)` —
  per-manager classification + target/actual/per-report.
- `countWorkingDays(...)` — working-day helper.
- `bucketSignedDays(n)` / `bucketWaitingDays(n)` — band classifiers (shared,
  tested at boundaries).

## 9. Testing

- Boundary tests for both bucket classifiers (e.g. `0`, `+1`, `−1`, `−15`/`−16`).
- `computePunctuality` original-vs-revised: a task late vs original but on-time
  vs revised must flip between tabs.
- Not-approved: only `approval_status='not_approved'` included; event-anchor vs
  fallback ordering.
- Initiator: 3-way classification exhaustiveness (sum = total); target uses
  working days not calendar days; per-report goals.
- `countWorkingDays`: weekend + holiday exclusion.

## 10. Resolved decisions (confirmed 2026-06-20)

1. **Founder = Manan Vasa ONLY**, identified by `FOUNDER_EMAIL = manan@unleashed.in`
   — never derived from `manager_id IS NULL`. Managers are **not** founders even
   though they currently have no manager assigned.
2. **Counterparts = catch-all** (not-a-direct-report, not-the-founder) — same-level
   peer managers + cross-team people — so the three categories are exhaustive.
3. **Work-week = 6 days, only Sunday off.** `weeklyOffDays = [Sunday]`; Saturday is
   a working day in the target math.
4. **Not-approved aging counts from when the task was SENT BACK** — the latest
   `task_events` transition into `not_approved`; fallback `completed_at` →
   `updated_at` only when no such event row exists.
5. **"Initiated by" = `initiator_id`** (confirmed — the manager who gave the task).
6. **Managers = derived live from `manager_id`** (anyone with ≥1 direct report). No
   hardcoded manager list.
