# Executive Dashboard V2 + Manager Drill-down + Character Avatars — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. **For every UI task, the implementer MUST invoke the `premium-frontend` skill** — the bar is a jaw-dropping, 3D-website-grade dashboard, not functional charts.

**Goal:** Replace the four stacked delivery/quality sections with one premium "Strategic Operations Hub" (V2), add a per-manager workload drill-down modal, and make person-avatars render the chosen character app-wide — all **load-neutral** (zero new page-load queries, no load-path/DB changes).

**Architecture:** V2 consumes data the dashboard **already** loads (`data.doneOnTime`, `data.initiator`, `data.notApprovedAging`) plus an avatar map built from the already-fetched `allEmployees`. New pieces are **on-demand only**: a `getManagerDrilldown` server action (fires when a manager modal opens) and a `nudgeTask` action. Viz is custom SVG/CSS + `motion/react`; depth/parallax via GPU-only CSS 3D; any WebGL is lazy & optional.

**Tech Stack:** Next.js App Router (RSC + client islands), Drizzle, TypeScript strict, Vitest, Tailwind, `motion/react` (already a dep), Radix Dialog, custom SVG. `premium-frontend` skill for craft.

**Spec:** `docs/specs/2026-06-21-executive-dashboard-v2-design.md` — read it first.

## Global Constraints

- **LOAD PATH IS OFF-LIMITS.** Do NOT modify `lib/queries/dashboard.ts`'s query/loading code, the DB pool, `DATABASE_URL`, `withTimeout`, or add any retry/timeout/caching layer. The ONLY allowed change touching load is extending the **pure** `computeDoneOnTime` transform (in-memory, no query). Building the avatar `Map` in `page.tsx` from already-fetched `allEmployees` is allowed (no new query).
- **Load-neutral:** V2 adds ZERO new page-load queries. Drill-down loader + Nudge are on-demand server actions only.
- **Visual bar = MAXIMUM** ("3D-website" jaw-dropping). Every UI task invokes `premium-frontend`. Depth, glassmorphism, parallax-tilt, spring motion, count-ups — all **reduced-motion-gated** and GPU-only (transform/opacity). Any WebGL is `dynamic()`-imported and never blocks the dashboard.
- **Privacy:** a manager sees only their OWN card/drill-down; admin sees all (mirror the existing `isAdmin`/`meId` gate used by the shipped `NotApprovedSection`/`InitiatorSection`).
- **Decisions:** donut = status breakdown (on-time/late/aging/done); Delegation Efficiency = `toDirectReports/totalInitiated` (+Δ vs prior); drill-down = modal/slide-over; row actions all live (Review/Approve/Reassign/Follow-up/Nudge); avatar fallback = initials.
- Tests: `pnpm vitest run <path>`; typecheck `pnpm tsc --noEmit`; build `pnpm build`. Commit per task.

---

### Task 1: `EmployeeAvatar` renders the chosen character

**Files:**
- Modify: `components/ui/employee-avatar.tsx`
- Test: `tests/unit/employee-avatar.test.tsx`

**Interfaces:**
- Produces: `EmployeeAvatar` gains `avatarUrl?: string | null`. When a non-empty string → renders `<img src=avatarUrl>` (rounded, `object-cover`, same size map, `alt=""`); else → the existing initials chip. `name`, `size`, `background`, `className` unchanged.

- [ ] **Step 1: Write the failing test**
```tsx
// tests/unit/employee-avatar.test.tsx
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";

describe("EmployeeAvatar", () => {
  it("renders the character image when avatarUrl is set", () => {
    const { container } = render(<EmployeeAvatar name="Jeevan Bharambe" avatarUrl="/avatars/preset-03.svg" />);
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("src")).toBe("/avatars/preset-03.svg");
  });
  it("falls back to initials when avatarUrl is null/empty", () => {
    const { container, rerender } = render(<EmployeeAvatar name="Rohan Choudhary" avatarUrl={null} />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain("RC");
    rerender(<EmployeeAvatar name="Rohan Choudhary" avatarUrl="" />);
    expect(container.querySelector("img")).toBeNull();
  });
});
```

- [ ] **Step 2: Run → FAIL** — `pnpm vitest run tests/unit/employee-avatar.test.tsx` (img assertion fails; current component ignores avatarUrl).

- [ ] **Step 3: Implement** — add the prop + image branch:
```tsx
export function EmployeeAvatar({
  name, size = "md", background, className = "", avatarUrl,
}: {
  name: string; size?: Size; background?: string; className?: string;
  avatarUrl?: string | null;
}) {
  const { px, fontSize } = SIZE_MAP[size];
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt=""
        aria-hidden
        className={`inline-block rounded-full object-cover shrink-0 ${className}`}
        style={{ width: px, height: px, boxShadow: "inset 0 1px 0 rgba(255,255,255,0.22)" }}
      />
    );
  }
  return ( /* …existing initials chip unchanged… */ );
}
```

- [ ] **Step 4: Run → PASS** — `pnpm vitest run tests/unit/employee-avatar.test.tsx`.
- [ ] **Step 5: Commit** — `git add components/ui/employee-avatar.tsx tests/unit/employee-avatar.test.tsx && git commit -m "feat(ui): EmployeeAvatar renders chosen character avatar (avatarUrl)"`

> Note: this is backward-compatible — every existing `<EmployeeAvatar name=…>` (no avatarUrl) keeps showing initials. Threading the URL in is Tasks 9 & 13.

---

### Task 2: Per-person late-aging spread on `computeDoneOnTime`

**Files:**
- Modify: `lib/transforms/done-on-time.ts`, `lib/types.ts`
- Test: `tests/unit/done-on-time.test.ts` (extend)

**Interfaces:**
- Consumes: `bucketSignedDays` (already imported).
- Produces: `PunctualityPerson` (lib/types.ts) gains `lateSpread: { d2_3: number; d4_7: number; d8_14: number; d15: number }` — counts of that person's LATE done tasks bucketed by days late (`-signed`): 2–3, 4–7, 8–14, 15+. (1-day-late and on-time excluded from the spread; the spread sums to ≤ `late`.)

- [ ] **Step 1: Add the field to `PunctualityPerson` in `lib/types.ts`:**
```ts
export interface PunctualityPerson {
  employeeId: string; employeeName: string;
  done: number; onTime: number; late: number; rate: number;
  /** Late done tasks bucketed by days late (sums ≤ late). */
  lateSpread: { d2_3: number; d4_7: number; d8_14: number; d15: number };
}
```

- [ ] **Step 2: Write the failing test** (append to `tests/unit/done-on-time.test.ts`):
```ts
it("per-person lateSpread buckets days-late (2-3/4-7/8-14/15+)", () => {
  const t = (completedAt: string, dueAt: string) =>
    task({ completedAt, dueAt, originalDueAt: dueAt });
  // late by 3 (d2_3), 5 (d4_7), 10 (d8_14), 20 (d15)
  const r = computeDoneOnTime(
    [t("2026-06-13","2026-06-10"), t("2026-06-15","2026-06-10"),
     t("2026-06-20","2026-06-10"), t("2026-06-30","2026-06-10")],
    names,
  );
  const p = r.revised.byPerson[0]!;
  expect(p.lateSpread).toEqual({ d2_3: 1, d4_7: 1, d8_14: 1, d15: 1 });
});
```
> `task`/`names` helpers already exist at the top of this test file from the original Task-4 build.

- [ ] **Step 3: Run → FAIL** — `pnpm vitest run tests/unit/done-on-time.test.ts`.

- [ ] **Step 4: Implement** in `done-on-time.ts` — in `basisFor`, maintain a per-doer spread alongside the existing per-doer onTime/late, incrementing by days-late `n = -signed` when `signed < 0`:
```ts
function lateBucket(daysLate: number): keyof PunctualityPerson["lateSpread"] | null {
  if (daysLate <= 1) return null;       // 1-day-late not shown in the spread
  if (daysLate <= 3) return "d2_3";
  if (daysLate <= 7) return "d4_7";
  if (daysLate <= 14) return "d8_14";
  return "d15";
}
```
Track `per.get(doerId)` as `{ onTime, late, spread: {d2_3,d4_7,d8_14,d15} }`; on a late task compute `lateBucket(-signed)` and `if (b) spread[b]++`. Emit `lateSpread` in the `byPerson` map. (Leave the histogram + everything else unchanged.)

- [ ] **Step 5: Run → PASS** (all done-on-time tests) — `pnpm vitest run tests/unit/done-on-time.test.ts`.
- [ ] **Step 6: tsc** — `pnpm tsc --noEmit` (expect: errors only where `PunctualityPerson` is constructed without `lateSpread` — i.e. `lib/transforms/punctuality.ts`. Fix `punctuality.ts` to emit a zero `lateSpread: {d2_3:0,d4_7:0,d8_14:0,d15:0}` per person so the shared type stays satisfied. No other file should error.)
- [ ] **Step 7: Commit** — `git commit -m "feat(dashboard): per-person late-aging spread on computeDoneOnTime"`

---

### Task 3: Manager drill-down — pure compute helpers

**Files:**
- Create: `lib/transforms/manager-drilldown.ts`
- Test: `tests/unit/manager-drilldown.test.ts`

**Interfaces:**
- Produces:
  - `type Delivery = "on_time" | "late" | "aging"` — `deliveryOf(task, now)`: `done` & on/before effective-due → `on_time`; `done` & after → `late`; not done & past due → `aging`; not done & not past due → `aging` only if older than 0 days else `on_time`? **Rule:** done→(on_time|late by due); open→(`aging` if past effective-due, else `on_time`).
  - `delegationDelta(curPct, priorPct)`: `{ pct: curPct, deltaPct: curPct - priorPct }`.
  - `avgAgingDays(openTaskCreatedAts: (Date|string)[], now)`: mean of `now - created` in whole days, 0 when empty.
  - `statusDonut(tasks, now)`: `{ onTime, late, aging, done }` counts over the manager's initiated tasks (done split into on_time/late; open → aging; **`done` field = total done** for the label).

- [ ] **Step 1: Write failing tests** — boundary cases for `deliveryOf` (done on due day = on_time; done 1 day after = late; open & 2 days overdue = aging; open & due tomorrow = on_time), `delegationDelta` (84 vs 80 → delta +4), `avgAgingDays` (creats 2,4 days ago → 3), `statusDonut` (mix → correct counts). (Full test bodies: mirror the Task-2 style with concrete dates.)
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** the four pure functions (UTC-day math via the same `dayNumber`/`utcDayKey` pattern as `done-on-time.ts`; copy those two helpers locally or import if exported).
- [ ] **Step 4: Run → PASS** — `pnpm vitest run tests/unit/manager-drilldown.test.ts`.
- [ ] **Step 5: Commit** — `git commit -m "feat(dashboard): manager drill-down pure helpers (delivery/delegation/avg-aging/donut)"`

---

### Task 4: `getManagerDrilldown` server action (on-demand loader)

**Files:**
- Create: `lib/queries/manager-drilldown.ts`, `app/(app)/dashboard/drilldown-actions.ts`
- (No unit test — integration; typecheck + build is the gate.)

**Interfaces:**
- Consumes: Task 3 helpers; `goalScopeFor`/`getDownlineIds` (`@/lib/weekly-goals/hierarchy`) for the privacy gate + direct-report set; `computeInitiatorScorecard` perReport shape.
- Produces: `getManagerDrilldown(managerId: string, windowDays: 3 | 7): Promise<ManagerDrilldown | { error: string }>` returning the §4.3 shape from the spec. Permission: `me.isAdmin || managerId === me.id`; else `{ error: "forbidden" }`.

Implementer steps:
- [ ] Read `app/(app)/projects/actions.ts` (for the `"use server"` + `requireUser` + return-shape conventions) and `lib/queries/dashboard.ts` lines ~160-200 (initiator window scan) to mirror the query style.
- [ ] In `lib/queries/manager-drilldown.ts`: one fail-open scan of tasks where `initiator_id = managerId` AND `created_at >= now - windowDays` AND `archived = false`, selecting `id,title,doerId,priority,status,dueAt(effective),completedAt,createdAt`. Resolve doer names + avatarUrl from `employees`. Compute: `totalInitiated`, `perReport` (given vs `3×workingDays` goal — reuse `countWorkingDays`), `delegationEfficiency` (toDirectReports/total, with prior-window via a second cheap count), `avgTaskAgingDays` (Task 3, open initiated only), `statusBreakdown` (Task 3), `initiatedSparkline` (14-day daily counts), and `tasks[]` with `delivery` (Task 3). Direct-report set via `getDownlineIds(managerId)` (direct = `manager_id === managerId`; for "direct reports" use a direct query `WHERE manager_id = managerId`, not the full downline).
- [ ] In `drilldown-actions.ts`: `"use server"` wrapper `getManagerDrilldown` with the `requireUser` + permission gate, `.catch` → `{ error }`.
- [ ] **tsc + build clean.** Commit — `git commit -m "feat(dashboard): on-demand getManagerDrilldown loader (load-neutral)"`

---

### Task 5: `nudgeTask` server action + 'nudged' notification

**Files:**
- Create: `lib/tasks/nudge.ts`; Modify: `db/schema.ts` (add `"nudged"` to `NOTIFICATION_KINDS`), `lib/notifications/dispatch.ts` (handle the kind), `app/(app)/tasks/actions.ts` (export `nudgeTask`).

**Interfaces:**
- Produces: `nudgeTask(taskId: string): Promise<{ ok: true } | { ok: false; error: string }>`. Gate: only the task's **initiator, the doer's manager (`doer.managerId === me.id`), or admin** may nudge. Soft rate-limit (reuse the existing task-action rate-limiter). Dispatches an in-app notification (kind `"nudged"`) to the doer: "⚡ {me.name} nudged you on: {task.title}" (+ web-push if subscribed, via the existing dispatch path).

Implementer steps:
- [ ] Read `lib/notifications/dispatch.ts` + an existing kind (e.g. `task_assigned`) to mirror the dispatch call + payload; read the rate-limit usage in `app/(app)/tasks/actions.ts`.
- [ ] Add `"nudged"` to `NOTIFICATION_KINDS` (schema.ts) and wire its title/body/href in dispatch (mirror `task_assigned`).
- [ ] Implement `nudgeTask` (permission gate + rate-limit + dispatch). Export from `tasks/actions.ts`.
- [ ] **tsc + build clean** + run `pnpm vitest run tests/unit/notifications-dispatch.test.ts` (ensure the new kind doesn't break it; extend if it enumerates kinds). Commit — `git commit -m "feat(tasks): nudgeTask action + 'nudged' notification kind"`

---

### Task 6: Viz primitives (SVG/CSS, premium)

**Files:**
- Create: `components/dashboard/exec/viz/{attainment-ring,gauge,status-donut,target-actual-bars,sparkline}.tsx`

**INVOKE `premium-frontend`.** Pure presentational, `"use client"`, prop-driven, no data fetching. Each: GPU-only draw-on animation (stroke-dashoffset / path length), reduced-motion fallback (render final state), brand greens/red + gold accents.
- `AttainmentRing({ value, max, size })` — circular progress ring, % in center, green≥100/amber≥60/red color by ratio.
- `Gauge({ pct, onTime, late })` — 180° semicircle gauge, big % + on-time/late counts, glow on the arc.
- `StatusDonut({ slices })` — donut for `{onTime, late, aging, done}`, center total, legend.
- `TargetActualBars({ rows })` — grouped bars per report (`actual` green, `target` grey), value labels.
- `Sparkline({ points })` — smooth area sparkline (14 pts), subtle gradient fill.

- [ ] Build each; **`pnpm build` compiles** (no unit tests for pure viz — visual). Commit — `git commit -m "feat(dashboard): premium SVG viz primitives (ring/gauge/donut/bars/sparkline)"`

---

### Task 7: `OnTimeGauge` (V2 top-left)

**Files:** Create `components/dashboard/exec/on-time-gauge.tsx`. **INVOKE `premium-frontend`.**
**Consumes:** `data.doneOnTime: DoneOnTime`; `Gauge` (Task 6).
Card with `Original ⇄ Revised` segmented toggle (`useState`, default "revised"), the `Gauge` for the active basis (`onTimeRate`, `onTime`, `late`), glassmorphic surface + soft elevation.
- [ ] Build; `pnpm build` compiles. Commit — `git commit -m "feat(dashboard): OnTimeGauge (original/revised) — V2"`

---

### Task 8: `ManagerInitiatorCard` + per-report expander

**Files:** Create `components/dashboard/exec/manager-initiator-card.tsx`. **INVOKE `premium-frontend`.**
**Consumes:** one `InitiatorScorecard` + an avatar-resolver `(id)=>string|null|undefined`; `AttainmentRing` (Task 6); `EmployeeAvatar` (Task 1).
Glassmorphic card with **pointer parallax-tilt** (GPU CSS 3D, reduced-motion off): character avatar + name + "N direct reports", `AttainmentRing(actual,target)`, Direct/Counterpart/Founder/Total chips (Direct highlighted), a `Show per-report breakdown ⌄` inline expander (maps `perReport[]` → name + given/goal + ✅/❌). `onOpenDrilldown(managerId)` callback on card click.
- [ ] Build; `pnpm build`. Commit — `git commit -m "feat(dashboard): ManagerInitiatorCard w/ parallax + per-report expander"`

---

### Task 9: `NotApprovedSidebar` + `PerformanceByPersonTable`

**Files:** Create `components/dashboard/exec/not-approved-sidebar.tsx`, `components/dashboard/exec/performance-by-person-table.tsx`. **INVOKE `premium-frontend`.**
**Consumes:** `data.notApprovedAging` + avatar-resolver (sidebar); `data.doneOnTime.{original|revised}.byPerson` (table, uses `lateSpread` from Task 2) + avatar-resolver; `isAdmin`, `meId` for privacy filtering (mirror the shipped sections' rule).
- Sidebar: "Attention Required · N Declined", red-toned days-waiting bands, "By Person · Most Waiting First" (avatars + counts). Non-admin → only own row.
- Table: per person avatar+name, on-time rate (bar + late count), late-spread columns (2–3/4–7/8–14/15+), busiest first. Non-admin → only own row.
- [ ] Build; `pnpm build`. Commit — `git commit -m "feat(dashboard): NotApprovedSidebar + PerformanceByPersonTable — V2"`

---

### Task 10: `ManagerDrilldown` modal (Image #8)

**Files:** Create `components/dashboard/exec/manager-drilldown.tsx`. **INVOKE `premium-frontend`.**
**Consumes:** `getManagerDrilldown` (Task 4), `nudgeTask` (Task 5), existing task actions (approve/reassign/setTaskStatus), Task-6 viz, `EmployeeAvatar`.
Radix Dialog slide-over (dramatic depth). On open → call `getManagerDrilldown(managerId, window)` (skeleton while loading; error state on `{error}`). Sections: header (avatar+name+window), 3 stat cards (Total Initiated + `Sparkline`, Delegation Efficiency pct+Δ, Avg Task Aging), `TargetActualBars`, `StatusDonut`, and the Initiated-Tasks table with row actions **Review** (Link → `/tasks/[id]`), **Approve**, **Reassign**, **Follow-up** (`setTaskStatus(...,"follow_up")`), **Nudge** (`nudgeTask`) — optimistic + `fireToast`, mirroring `inline-status-cell.tsx`. Mobile → full-screen sheet.
- [ ] Build; `pnpm build`. Commit — `git commit -m "feat(dashboard): ManagerDrilldown modal (Image #8) w/ live actions incl. Nudge"`

---

### Task 11: `ExecDashboard` container

**Files:** Create `components/dashboard/exec/exec-dashboard.tsx`. **INVOKE `premium-frontend`.**
**Consumes:** all Task 7–10 components; props `{ doneOnTime, initiator, notApprovedAging, avatarById: Record<string,string|null>, isAdmin, meId }`.
Client island that owns: the `3-day ⇄ 7-day` window state (selects `initiator.d3|d7`), which manager's drilldown modal is open, and arranges the layout — top grid: `OnTimeGauge` + a horizontally-scrollable row of `ManagerInitiatorCard` (privacy-filtered) + `NotApprovedSidebar`; below: `PerformanceByPersonTable`. Aurora/gradient-mesh backdrop; staggered `motion` entrances (reduced-motion-gated). `avatarById[id]` is the avatar resolver passed to children.
- [ ] Build; `pnpm build`. Commit — `git commit -m "feat(dashboard): ExecDashboard V2 container (layout + window + modal state)"`

---

### Task 12: Wire `ExecDashboard` into the page (replace the 4 sections)

**Files:** Modify `app/(app)/page.tsx`.
- [ ] Build `const avatarById = Object.fromEntries(allEmployees.map(e => [e.id, e.avatarUrl ?? null]))` (from the ALREADY-loaded `allEmployees` — **no new query**).
- [ ] Replace the four `<PunctualityCard/> <DoneAgingSection/> <NotApprovedSection/> <InitiatorSection/>` elements with a single `<ExecDashboard doneOnTime={data.doneOnTime} initiator={data.initiator} notApprovedAging={data.notApprovedAging} avatarById={avatarById} isAdmin={Boolean(me?.isAdmin)} meId={me?.id ?? null} />`. Remove the now-unused imports. **Do NOT touch the data-loading `try/Promise.all` block.**
- [ ] `pnpm tsc --noEmit` clean; `pnpm build` compiles; `/` route present. Commit — `git commit -m "feat(dashboard): mount ExecDashboard V2, retire the 4 stacked sections"`

---

### Task 13: Thread character avatars into existing person chips ("replace them too")

**Files:** Modify `components/dashboard/aging-heatmap.tsx`, `components/dashboard/top-performers.tsx`, `components/dashboard/status-table.tsx`, `components/tasks/task-table.tsx`; `app/(app)/page.tsx` + `app/(app)/tasks/page.tsx` (pass `avatarById`).
- [ ] Pass the `avatarById` map (built from already-loaded employees — no new query) into each component; at each `<EmployeeAvatar name=…>` add `avatarUrl={avatarById[row.employeeId /* or doerId */] ?? null}`. (Tasks page builds its own map from its `allEmployees`.)
- [ ] `pnpm tsc --noEmit` clean; `pnpm build`. Commit — `git commit -m "feat(ui): show character avatars on aging/top-performers/status/task chips"`

---

### Task 14: Full verification + ship

- [ ] `pnpm vitest run` — all pass.
- [ ] `pnpm tsc --noEmit && pnpm build` — clean.
- [ ] Authed visual self-check (mint-session technique) — load `/`, confirm the V2 hub renders, toggles work, a manager card opens the drill-down, avatars show characters; **confirm the page still loads fast (load path untouched).**
- [ ] Ship via the documented manual prod-push (delta since `last-ship`, push via `gh` token) — do NOT use `scripts/ship.sh` (it aborts on already-committed work). Poll Vercel green.

---

## Self-Review

**Spec coverage:** Avatars §3 → T1/T13. Per-person spread §4.2 → T2. Drill-down loader §4.3 → T3/T4. Nudge §4.4 → T5. V2 components §5 → T6–T9, T11. Drill-down modal §6 → T10. Page integration → T12. Load-neutrality (§2/§7) → enforced in every task's constraints + T12 note. Visual bar §7 → `premium-frontend` mandated on every UI task. ✓

**Placeholder scan:** pure/logic tasks (T1–T3) carry full code; integration/visual tasks (T4–T11) carry exact interfaces + the data shape + reference files to mirror + the craft mandate (correct altitude for a premium build — the plan fixes the contract, the implementer+premium-frontend fix the pixels). No "TBD".

**Type consistency:** `PunctualityPerson.lateSpread` (T2) consumed by T9 table. `ManagerDrilldown` shape (spec §4.3) produced by T4, consumed by T10. `avatarById: Record<string,string|null>` produced in T12/T13, consumed by T8/T9/T11/T13. `deliveryOf`/`statusDonut` (T3) consumed by T4/T10. `nudgeTask` (T5) consumed by T10.

**Load-path guard:** the only load-touching change is the pure `computeDoneOnTime` extension (T2) + an in-memory map (T12) — both query-free. Every task restates "do not touch the data-loading block / DB pool / timeouts / caching".
