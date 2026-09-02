# Executive Dashboard V2 + Manager Drill-down + Character Avatars — Design Spec

> **Status:** APPROVED in conversation 2026-06-21. Redesigns the delivery/quality
> dashboards into the "Strategic Operations Hub" (V2, Image #7), adds the full
> per-manager workload drill-down (Image #8), and makes person-avatars render the
> chosen character (Image #9) app-wide. Source mockups are AI-generated visual
> DIRECTION — built with real data, not slavish column-for-column replication.

## 1. Goal & scope

Replace the four stacked sections shipped earlier (PunctualityCard,
DoneAgingSection, NotApprovedSection, InitiatorSection) with one cohesive V2
"control room", add a per-manager drill-down modal, and switch avatars from
initials to the chosen character. Reuses existing data (`doneOnTime`,
`initiator.d3/d7`, `notApprovedAging`) wherever possible; new data is additive
and fail-open.

## 2. Locked decisions (from the 2026-06-21 Q&A)

| # | Decision |
|---|---|
| Layout | **V2 — Strategic Operations Hub** (Image #7). |
| Drill-down | **Full Image #8**, as a **modal / slide-over** opened from a manager card. |
| Task-Source donut | **Swapped** to a real **status breakdown** (on-time / late / aging / done) of the manager's initiated tasks — no new `source` field. |
| Delegation Efficiency | `toDirectReports ÷ totalInitiated` (% of initiated work pushed DOWN), with ↑/↓ vs the prior period. |
| Row actions | **All live**: Review (open task), Approve, Reassign, Follow-up (→ status), **Nudge** (→ notify the doer). |
| Avatars | Render the person's chosen character (`employees.avatarUrl`) everywhere; initials only as fallback. |
| **Loading path** | **OFF-LIMITS (2026-06-21).** Do NOT modify dashboard data loading, the DB pool, timeouts, or caching — loading is currently perfect and was just restored to baseline. V2 must be **load-neutral**: no new page-load queries, no retry/timeout/cache layers, no `DATABASE_URL`/pool changes. |
| **Visual bar** | **MAXIMUM — "3D-website" jaw-dropping.** Premium, brand-level craft via GPU-accelerated CSS/SVG + motion; tasteful depth/parallax/glass; any WebGL is lazy & optional, never blocking the data load. |

## 3. Character avatars (Image #9)

- Assets already exist: 12 preset SVGs `public/avatars/preset-01.svg … preset-12.svg`; each employee's pick lives in `employees.avatar_url` (set via `AvatarGallery`). `EmployeeAvatar` currently renders **only initials** and ignores `avatarUrl`.
- **Extend `components/ui/employee-avatar.tsx`**: add an optional `avatarUrl?: string | null` prop. When present → render an `<img>` (rounded, `object-cover`, the same size map); else → the current initials chip. Keep the `aria`/size/tone API intact.
- **Thread `avatarUrl` through** so it actually shows:
  - New V2 + drill-down components (built with it from the start).
  - Existing high-visibility person chips: Aging Heatmap, Top Performers, Status table, task rows — pass each row's `avatarUrl` so characters appear app-wide ("replace them too").
- The dashboard already loads `allEmployees` (full rows incl. `avatarUrl`); build a `Map<employeeId, { name; avatarUrl }>` once and pass it where avatars render.
- **Fallback for un-picked employees:** initials (current look). *(Open item §9: optionally bulk-assign default characters so the board is all-characters — a data op, not built here.)*

## 4. Data layer

### 4.1 Reused (no change): `doneOnTime`, `initiator.d3/d7`, `notApprovedAging`.

### 4.2 Per-person late-aging spread (extend `computeDoneOnTime`)
`PunctualityPerson` gains a compact late-bucket breakdown (e.g. counts for
`2–3 / 4–7 / 8–14 / 15+` days late) to fill the V2 "Performance by Person"
table's day-columns. Pure, unit-tested; additive to the existing transform.

### 4.3 On-demand manager drill-down loader (NEW)
Server action `getManagerDrilldown(managerId, windowDays)` — fetched ONLY when
the modal opens (zero cost on normal dashboard loads), fail-open. Returns:
```
{
  manager: { id, name, avatarUrl },
  totalInitiated: number,
  initiatedSparkline: number[],          // daily counts, last 14 days
  delegationEfficiency: { pct: number; deltaPct: number },  // toDirectReports/total, ↑ vs prior
  avgTaskAgingDays: number,              // mean age of OPEN initiated tasks
  perReport: { employeeId, name, avatarUrl, given, goal, hit }[],  // Target vs Actual
  statusBreakdown: { onTime, late, aging, done }[],  // donut slices, real
  tasks: {                               // Initiated-Tasks table rows
    id, title, doerId, doerName, doerAvatarUrl,
    priority, status, dueAt, completedAt,
    delivery: 'on_time' | 'late' | 'aging'   // badge
  }[]
}
```
Permission: a manager may only open their OWN drill-down; admin → any. (Same
rule as the existing per-person gating.)

### 4.4 `nudgeTask(taskId)` server action (NEW)
Sends the task's doer an in-app notification ("⚡ {manager} nudged you on:
{task}") via the existing `lib/notifications/dispatch` path (+ web-push if the
doer is subscribed). Gated: only the task's **initiator, the doer's manager, or
admin** may nudge. Rate-limited like other task actions.

## 5. V2 Executive Dashboard (replaces the 4 stacked sections in `app/(app)/page.tsx`)

A cohesive block, admin/manager-gated per the existing rule. New components in
`components/dashboard/exec/`:
- **`OnTimeGauge`** — semicircle gauge, big % + On-time/Late counts, `Original ⇄ Revised` toggle. Source: `doneOnTime`.
- **`ManagerInitiatorCard`** (one per manager, horizontally scrollable row) — character avatar + name + "N direct reports", an **attainment ring** (`actual/target`), Direct/Counterpart/Founder/Total chips, a **"Show per-report breakdown ⌄"** inline expander (`perReport`). Click → opens the drill-down modal. `3-day ⇄ 7-day` window toggle on the row.
- **`NotApprovedSidebar`** — "Attention Required · N Declined", days-waiting bands, "By Person · Most Waiting First" (avatars). Source: `notApprovedAging`.
- **`PerformanceByPersonTable`** — per person: avatar + name, on-time rate (bar + late count), late-aging spread columns; busiest first. Source: `doneOnTime.byPerson` (extended §4.2).
- **`ExecDashboard`** container — arranges gauge + manager cards + sidebar (top grid) and the table (full width below); manages the window + Original/Revised toggles + which manager's modal is open.

## 6. Manager Drill-down modal (Image #8) — `components/dashboard/exec/manager-drilldown.tsx`

Large slide-over (Radix Dialog, portaled). Opens via `getManagerDrilldown`
(loading skeleton while fetching). Sections:
- **Header** — character avatar + manager name + window label.
- **3 stat cards** — Total Initiated (+ sparkline), Delegation Efficiency (pct + ↑/↓ delta), Avg Task Aging (days).
- **Direct-Report Workload** — grouped Target-vs-Actual bars (green actual / grey target) per report, with avatars.
- **Status Breakdown donut** — on-time / late / aging / done of the manager's initiated tasks.
- **Initiated-Tasks table** — Task · Assignee (avatar) · Priority · delivery badge (on-time·late·aging) · Actions: Review · Approve · Reassign · Follow-up · **Nudge**. Actions call existing server actions; Nudge calls §4.4. Optimistic + toast, like the inline task cells.

## 7. Engineering & visual craft

**Visual ambition = MAXIMUM ("3D-website" jaw-dropping).** Apply the
`premium-frontend` skill during the build. The bar is a top-studio, brand-level
dashboard — not "functional charts." Specifically:
- **Custom SVG/CSS viz** (attainment ring that draws-on, glowing semicircle
  gauge, donut, grouped Target-vs-Actual bars, animated sparkline) in
  `components/dashboard/exec/viz/` — no heavy chart dependency.
- **Depth & dimensionality** — layered glassmorphic cards, soft multi-shadow
  elevation, **parallax-tilt** on the manager cards (pointer-driven CSS 3D
  transform), aurora/gradient-mesh backdrops (reuse the app's existing glow
  language), gold "earned" accents, brand-red highlights.
- **Motion** — `motion/react` staggered entrances, spring physics on the rings/
  gauge/bars, count-up numbers, a dramatic depth-y drill-down slide-over. ALL
  animations **reduced-motion-gated** and GPU-only (transform/opacity).
- **Optional WebGL accent** — at most ONE tasteful 3D hero flourish (e.g. a
  subtle React-Three-Fiber backdrop), **dynamically imported / lazy** so it
  never enters the dashboard's critical load. Skip entirely if it risks the
  load budget — the CSS-3D depth already carries the "3D" feel.

**Load-neutrality (HARD):** the load path is off-limits (§2). V2 reuses the data
that already loads; it adds **zero** page-load queries. The drill-down loader +
Nudge are on-demand only. No retry/timeout/cache layers, no DB-pool/`DATABASE_URL`
changes.

**Correctness:** pure transforms unit-tested (the §4.2 extension + delegation-
delta / avg-aging helpers); modal loader + nudge are permission-gated, defensive
server actions. Fail-open: a section degrades gracefully; the modal shows an
error state — never crashes the dashboard. Privacy: manager sees own card +
drill-down, admin sees all (same gate as shipped). Mobile: cards stack, table →
cards, modal → full-screen sheet.

## 8. File map (new/changed)

- Change: `components/ui/employee-avatar.tsx` (+`avatarUrl`); avatar threading in `aging-heatmap.tsx`, `top-performers.tsx`, `status-table.tsx`, `task-table.tsx`.
- Change: `lib/transforms/done-on-time.ts` + `lib/types.ts` (per-person late spread); `app/(app)/page.tsx` (swap 4 sections → `<ExecDashboard>`); `lib/queries/dashboard.ts` (build the avatar map; the existing data stays).
- New: `lib/queries/manager-drilldown.ts` + the `getManagerDrilldown` action; `lib/tasks/nudge.ts` (+ `nudgeTask` action); `components/dashboard/exec/*` (ExecDashboard, OnTimeGauge, ManagerInitiatorCard, NotApprovedSidebar, PerformanceByPersonTable, ManagerDrilldown, viz/*).
- Tests: `tests/unit/done-on-time.test.ts` (extend), new transform tests for any drill-down pure math.

## 9. Open items (resolve at spec review)

1. **Avatar fallback** — un-picked employees show initials. Option to bulk-assign default characters so the board is all-characters (a one-time data op) — not built here unless you want it.
2. **"Performance by Person" table columns** — the mockup's two rate columns ("On-time rate" + "On twn rate") look like a typo/duplicate; building ONE on-time-rate column + the late-aging spread. Confirm that's fine.
3. **Nudge frequency** — should Nudge be limited (e.g. once per task per day) to avoid spam? Default: a soft rate-limit, no hard daily cap.
