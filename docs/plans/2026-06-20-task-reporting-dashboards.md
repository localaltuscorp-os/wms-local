# Task Reporting Dashboards — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three collapsible analytics sections to the main dashboard — **Done (on-time & signed aging, Original vs Revised)**, **Not Approved (declined, person-wise, days-waiting aging)**, and **Manager Initiator (target vs actual, 3 categories)**.

**Architecture:** Pure, unit-tested transforms in `lib/transforms/` (mirroring the existing `punctuality.ts` pattern) consume narrow task rows; `lib/queries/dashboard.ts` feeds them from fail-open scans and adds the results to `DashboardData`; three new client components render collapsed-by-default sections on `app/(app)/page.tsx`, matching the existing `CollapsibleVelocity` / `PunctualityCard` / `AgingHeatmap` visual language.

**Tech Stack:** Next.js App Router (RSC), Drizzle ORM (postgres-js), TypeScript (strict), Vitest, Tailwind.

**Spec:** `docs/specs/2026-06-20-task-reporting-dashboards-design.md` (read it first).

## Global Constraints

- **Founder = Manan Vasa only**, identified by `FOUNDER_EMAIL = "manan@unleashed.in"` — NEVER `manager_id IS NULL`.
- **Work-week = 6 days, only Sunday off.** Working-day count excludes Sundays + `holidays` rows. Saturday counts.
- **Aging sign convention (Done):** `signedDays = effectiveDueDay − completedDay`; **+ = early (good), − = late (bad)**. 12 contiguous bands.
- **Not-Approved universe is STRICT:** only `approval_status = 'not_approved'` (or legacy `status = 'not_approved'`), non-archived. Never the awaiting-NULL tasks.
- **Not-approved aging = days since SENT BACK** (latest `task_events` not_approved transition; fallback `completed_at` → `created_at`).
- **Initiated by = `initiator_id`.** Managers derived live from `manager_id` (anyone with ≥1 direct report). No hardcoded list.
- **Per-person breakdowns are admin-only** (`me.isAdmin`), matching `PunctualityCard`.
- All money/compute transforms are **pure** (no DB), Vitest-covered. UTC calendar-day comparisons via day-string (`toISOString().slice(0,10)`), tolerating `Date | string` (the dashboard projects `dueAt` through raw SQL → driver returns a string). Reuse `utcDayKey` pattern from `punctuality.ts`.
- Each new dashboard query is **fail-open**: `.catch` → empty/hidden, never crash the page.
- Run tests with `pnpm vitest run <path>`; typecheck with `pnpm tsc --noEmit`; build with `pnpm build`.

---

### Task 1: Aging band classifiers (pure)

**Files:**
- Create: `lib/transforms/aging-bands.ts`
- Test: `tests/unit/aging-bands.test.ts`

**Interfaces:**
- Produces:
  - `interface AgingBand { id: string; label: string }`
  - `DONE_AGING_BANDS: AgingBand[]` (12 signed bands, early→late order)
  - `WAITING_AGING_BANDS: AgingBand[]` (7 positive bands)
  - `bucketSignedDays(signedDays: number): string` → a `DONE_AGING_BANDS` id
  - `bucketWaitingDays(days: number): string` → a `WAITING_AGING_BANDS` id

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/aging-bands.test.ts
import { describe, it, expect } from "vitest";
import {
  DONE_AGING_BANDS, WAITING_AGING_BANDS, bucketSignedDays, bucketWaitingDays,
} from "@/lib/transforms/aging-bands";

describe("bucketSignedDays (+ early, - late)", () => {
  it("has 12 contiguous bands", () => {
    expect(DONE_AGING_BANDS.map((b) => b.id)).toEqual([
      "e7", "e4_6", "e2_3", "e1", "d0", "l1", "l2_3", "l4_5", "l6_7", "l8_10", "l11_15", "l16",
    ]);
  });
  it.each([
    [10, "e7"], [7, "e7"], [6, "e4_6"], [4, "e4_6"], [3, "e2_3"], [2, "e2_3"],
    [1, "e1"], [0, "d0"],
    [-1, "l1"], [-2, "l2_3"], [-3, "l2_3"], [-4, "l4_5"], [-5, "l4_5"],
    [-6, "l6_7"], [-7, "l6_7"], [-8, "l8_10"], [-10, "l8_10"],
    [-11, "l11_15"], [-15, "l11_15"], [-16, "l16"], [-99, "l16"],
  ])("signedDays %i → %s", (n, id) => {
    expect(bucketSignedDays(n)).toBe(id);
  });
});

describe("bucketWaitingDays (declined, days waiting)", () => {
  it("has 7 bands", () => {
    expect(WAITING_AGING_BANDS.map((b) => b.id)).toEqual([
      "w0", "w1", "w2_3", "w4_7", "w8_14", "w15_30", "w30",
    ]);
  });
  it.each([
    [0, "w0"], [1, "w1"], [2, "w2_3"], [3, "w2_3"], [4, "w4_7"], [7, "w4_7"],
    [8, "w8_14"], [14, "w8_14"], [15, "w15_30"], [30, "w15_30"], [31, "w30"], [120, "w30"],
  ])("waitingDays %i → %s", (n, id) => {
    expect(bucketWaitingDays(n)).toBe(id);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/aging-bands.test.ts`
Expected: FAIL — cannot find module `@/lib/transforms/aging-bands`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/transforms/aging-bands.ts
export interface AgingBand { id: string; label: string }

/** Signed early/late bands for DONE tasks. signedDays = dueDay - completedDay.
 *  Positive = finished early (good); negative = finished late (bad). */
export const DONE_AGING_BANDS: AgingBand[] = [
  { id: "e7",     label: "+7 or more early" },
  { id: "e4_6",   label: "+4 to +6 early" },
  { id: "e2_3",   label: "+2 to +3 early" },
  { id: "e1",     label: "+1 early" },
  { id: "d0",     label: "On the day" },
  { id: "l1",     label: "1 late" },
  { id: "l2_3",   label: "2–3 late" },
  { id: "l4_5",   label: "4–5 late" },
  { id: "l6_7",   label: "6–7 late" },
  { id: "l8_10",  label: "8–10 late" },
  { id: "l11_15", label: "11–15 late" },
  { id: "l16",    label: "16+ late" },
];

export function bucketSignedDays(s: number): string {
  if (s >= 7) return "e7";
  if (s >= 4) return "e4_6";
  if (s >= 2) return "e2_3";
  if (s === 1) return "e1";
  if (s === 0) return "d0";
  if (s === -1) return "l1";
  if (s >= -3) return "l2_3";
  if (s >= -5) return "l4_5";
  if (s >= -7) return "l6_7";
  if (s >= -10) return "l8_10";
  if (s >= -15) return "l11_15";
  return "l16";
}

/** Positive-only "days waiting for resolution" bands for declined tasks. */
export const WAITING_AGING_BANDS: AgingBand[] = [
  { id: "w0",     label: "Today" },
  { id: "w1",     label: "1 day" },
  { id: "w2_3",   label: "2–3 days" },
  { id: "w4_7",   label: "4–7 days" },
  { id: "w8_14",  label: "8–14 days" },
  { id: "w15_30", label: "15–30 days" },
  { id: "w30",    label: "30+ days" },
];

export function bucketWaitingDays(d: number): string {
  if (d <= 0) return "w0";
  if (d === 1) return "w1";
  if (d <= 3) return "w2_3";
  if (d <= 7) return "w4_7";
  if (d <= 14) return "w8_14";
  if (d <= 30) return "w15_30";
  return "w30";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/unit/aging-bands.test.ts`
Expected: PASS (both describes).

- [ ] **Step 5: Commit**

```bash
git add lib/transforms/aging-bands.ts tests/unit/aging-bands.test.ts
git commit -m "feat(dashboard): signed + waiting aging band classifiers"
```

---

### Task 2: Working-days helper (pure)

**Files:**
- Create: `lib/transforms/working-days.ts`
- Test: `tests/unit/working-days.test.ts`

**Interfaces:**
- Produces: `countWorkingDays(start: Date, end: Date, holidayDays: Set<string>, weeklyOff?: number[]): number`
  - Inclusive `[start, end]`, iterated by UTC day. `weeklyOff` = UTC weekday numbers (0=Sun); default `[0]`. `holidayDays` = set of `"YYYY-MM-DD"` strings.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/working-days.test.ts
import { describe, it, expect } from "vitest";
import { countWorkingDays } from "@/lib/transforms/working-days";

const d = (s: string) => new Date(`${s}T00:00:00Z`);

describe("countWorkingDays (Sunday off, 6-day week)", () => {
  it("Mon–Sat = 6 working days, Sunday excluded", () => {
    // 2026-06-15 is a Monday … 2026-06-21 is a Sunday
    expect(countWorkingDays(d("2026-06-15"), d("2026-06-21"), new Set())).toBe(6);
  });
  it("excludes holidays in range", () => {
    expect(
      countWorkingDays(d("2026-06-15"), d("2026-06-21"), new Set(["2026-06-17"])),
    ).toBe(5);
  });
  it("single Sunday = 0", () => {
    expect(countWorkingDays(d("2026-06-21"), d("2026-06-21"), new Set())).toBe(0);
  });
  it("single Saturday counts (6-day week)", () => {
    expect(countWorkingDays(d("2026-06-20"), d("2026-06-20"), new Set())).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/working-days.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/transforms/working-days.ts
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Count working days in [start, end] inclusive (UTC days). A day is working
 *  unless its UTC weekday is in `weeklyOff` (default Sunday only) or its
 *  "YYYY-MM-DD" key is in `holidayDays`. */
export function countWorkingDays(
  start: Date,
  end: Date,
  holidayDays: Set<string>,
  weeklyOff: number[] = [0],
): number {
  const off = new Set(weeklyOff);
  let count = 0;
  const s = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const e = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  for (let t = s; t <= e; t += MS_PER_DAY) {
    const day = new Date(t);
    if (off.has(day.getUTCDay())) continue;
    if (holidayDays.has(day.toISOString().slice(0, 10))) continue;
    count++;
  }
  return count;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/unit/working-days.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/transforms/working-days.ts tests/unit/working-days.test.ts
git commit -m "feat(dashboard): working-days counter (Sunday off + holidays)"
```

---

### Task 3: Founder identity

**Files:**
- Create: `lib/auth/founder.ts`
- Test: `tests/unit/founder.test.ts`

**Interfaces:**
- Produces: `FOUNDER_EMAIL: string`; `isFounderEmail(email: string | null | undefined): boolean`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/founder.test.ts
import { describe, it, expect } from "vitest";
import { isFounderEmail, FOUNDER_EMAIL } from "@/lib/auth/founder";

describe("isFounderEmail", () => {
  it("matches Manan (case/space-insensitive)", () => {
    expect(isFounderEmail(FOUNDER_EMAIL)).toBe(true);
    expect(isFounderEmail("  Manan@Unleashed.in ")).toBe(true);
  });
  it("rejects everyone else incl. other super-admins", () => {
    expect(isFounderEmail("hetesh@example.com")).toBe(false);
    expect(isFounderEmail(null)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/founder.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/auth/founder.ts
/** The single founder. The "Founder / Management" bucket on the Manager
 *  Initiator dashboard is keyed off THIS, never `manager_id IS NULL` (managers
 *  currently have no manager assigned and must not count as founders). */
export const FOUNDER_EMAIL = "manan@unleashed.in";

export function isFounderEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.trim().toLowerCase() === FOUNDER_EMAIL;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/unit/founder.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/auth/founder.ts tests/unit/founder.test.ts
git commit -m "feat(auth): founder identity (Manan) for initiator classification"
```

---

### Task 4: `computeDoneOnTime` — Original vs Revised + signed histogram

**Files:**
- Create: `lib/transforms/done-on-time.ts`
- Modify: `lib/types.ts` (add `DoneAgingBandCount`, `PunctualityBasis`, `DoneOnTime`)
- Test: `tests/unit/done-on-time.test.ts`

**Interfaces:**
- Consumes: `bucketSignedDays`, `DONE_AGING_BANDS` (Task 1).
- Produces:
  - `interface DoneOnTimeTask { status: string; archived: boolean; completedAt: Date|string|null; dueAt: Date|string|null; originalDueAt: Date|string|null; doerId: string }`
  - `computeDoneOnTime(tasks: DoneOnTimeTask[], nameById: Map<string,string>): DoneOnTime`
- Types added to `lib/types.ts`:
```ts
export interface DoneAgingBandCount { id: string; label: string; count: number }
export interface PunctualityBasis {
  basis: "original" | "revised";
  total: number; dated: number; onTime: number; late: number; undated: number;
  onTimeRate: number;
  byPerson: PunctualityPerson[];      // reuse existing PunctualityPerson
  histogram: DoneAgingBandCount[];     // 12 signed bands, always all present
}
export interface DoneOnTime { original: PunctualityBasis; revised: PunctualityBasis }
```

- [ ] **Step 1: Add the types to `lib/types.ts`**

Insert the three interfaces above immediately AFTER the existing `Punctuality` interface (around `lib/types.ts:168`). `PunctualityPerson` already exists — reuse it.

- [ ] **Step 2: Write the failing test**

```ts
// tests/unit/done-on-time.test.ts
import { describe, it, expect } from "vitest";
import { computeDoneOnTime, type DoneOnTimeTask } from "@/lib/transforms/done-on-time";

const names = new Map([["u1", "Alice"]]);
function task(p: Partial<DoneOnTimeTask>): DoneOnTimeTask {
  return { status: "done", archived: false, completedAt: null, dueAt: null, originalDueAt: null, doerId: "u1", ...p };
}

describe("computeDoneOnTime", () => {
  it("a task late vs ORIGINAL but on-time vs REVISED flips between bases", () => {
    // original due 2026-06-10, revised due 2026-06-20, completed 2026-06-15
    const t = task({ originalDueAt: "2026-06-10", dueAt: "2026-06-20", completedAt: "2026-06-15" });
    const r = computeDoneOnTime([t], names);
    expect(r.original.late).toBe(1);   // 15 > 10 → late
    expect(r.original.onTime).toBe(0);
    expect(r.revised.onTime).toBe(1);  // 15 <= 20 → on time
    expect(r.revised.late).toBe(0);
  });
  it("buckets signed days into the histogram (revised basis here)", () => {
    const t = task({ originalDueAt: "2026-06-20", dueAt: "2026-06-20", completedAt: "2026-06-24" }); // 4 late
    const r = computeDoneOnTime([t], names);
    const band = r.revised.histogram.find((b) => b.id === "l4_5");
    expect(band?.count).toBe(1);
    expect(r.revised.histogram).toHaveLength(12); // all bands always present
  });
  it("ignores non-done / archived; counts undated separately", () => {
    const r = computeDoneOnTime(
      [task({ status: "initiated" }), task({ archived: true }), task({ completedAt: null, dueAt: "2026-06-20" })],
      names,
    );
    expect(r.original.total).toBe(1);    // only the done, non-archived one
    expect(r.original.undated).toBe(1);
    expect(r.original.dated).toBe(0);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/done-on-time.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Write minimal implementation**

```ts
// lib/transforms/done-on-time.ts
import type { DoneOnTime, PunctualityBasis, PunctualityPerson } from "@/lib/types";
import { DONE_AGING_BANDS, bucketSignedDays } from "./aging-bands";

export interface DoneOnTimeTask {
  status: string;
  archived: boolean;
  completedAt: Date | string | null;
  dueAt: Date | string | null;          // effective (revised ?? original)
  originalDueAt: Date | string | null;  // raw due_at
  doerId: string;
}

function utcDayKey(d: Date | string): string {
  return typeof d === "string" ? d.slice(0, 10) : d.toISOString().slice(0, 10);
}
function dayNumber(d: Date | string): number {
  return Math.floor(new Date(`${utcDayKey(d)}T00:00:00Z`).getTime() / 86_400_000);
}

function basisFor(
  done: DoneOnTimeTask[],
  pick: (t: DoneOnTimeTask) => Date | string | null,
  basis: "original" | "revised",
  nameById: Map<string, string>,
): PunctualityBasis {
  let onTime = 0, late = 0, undated = 0;
  const per = new Map<string, { onTime: number; late: number }>();
  const hist = new Map(DONE_AGING_BANDS.map((b) => [b.id, 0]));

  for (const t of done) {
    const due = pick(t);
    if (!t.completedAt || !due) { undated++; continue; }
    const signed = dayNumber(due) - dayNumber(t.completedAt); // + early, - late
    const isOnTime = signed >= 0;
    if (isOnTime) onTime++; else late++;
    hist.set(bucketSignedDays(signed), (hist.get(bucketSignedDays(signed)) ?? 0) + 1);
    const p = per.get(t.doerId) ?? { onTime: 0, late: 0 };
    if (isOnTime) p.onTime++; else p.late++;
    per.set(t.doerId, p);
  }

  const dated = onTime + late;
  const byPerson: PunctualityPerson[] = [...per.entries()]
    .map(([employeeId, v]) => {
      const personDone = v.onTime + v.late;
      return {
        employeeId,
        employeeName: nameById.get(employeeId) ?? "Unknown",
        done: personDone, onTime: v.onTime, late: v.late,
        rate: personDone > 0 ? Math.round((v.onTime / personDone) * 100) : 0,
      };
    })
    .sort((a, b) => b.done - a.done || a.rate - b.rate);

  return {
    basis,
    total: done.length, dated, onTime, late, undated,
    onTimeRate: dated > 0 ? Math.round((onTime / dated) * 100) : 0,
    byPerson,
    histogram: DONE_AGING_BANDS.map((b) => ({ id: b.id, label: b.label, count: hist.get(b.id) ?? 0 })),
  };
}

export function computeDoneOnTime(
  tasks: DoneOnTimeTask[],
  nameById: Map<string, string>,
): DoneOnTime {
  const done = tasks.filter((t) => t.status === "done" && !t.archived);
  return {
    original: basisFor(done, (t) => t.originalDueAt, "original", nameById),
    revised: basisFor(done, (t) => t.dueAt, "revised", nameById),
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run tests/unit/done-on-time.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/transforms/done-on-time.ts lib/types.ts tests/unit/done-on-time.test.ts
git commit -m "feat(dashboard): computeDoneOnTime (original vs revised + signed histogram)"
```

---

### Task 5: `computeNotApprovedAging` (pure)

**Files:**
- Create: `lib/transforms/not-approved-aging.ts`
- Modify: `lib/types.ts` (add `NotApprovedTaskRow`-free output types: `NotApprovedBandCount`, `NotApprovedPerson`, `NotApprovedAging`)
- Test: `tests/unit/not-approved-aging.test.ts`

**Interfaces:**
- Consumes: `bucketWaitingDays`, `WAITING_AGING_BANDS` (Task 1).
- Produces:
  - `interface NotApprovedInput { id: string; title: string; doerId: string; sentBackAt: Date|string|null }`
  - `computeNotApprovedAging(rows: NotApprovedInput[], nameById: Map<string,string>, now: Date): NotApprovedAging`
- Types added to `lib/types.ts`:
```ts
export interface NotApprovedBandCount { id: string; label: string; count: number }
export interface NotApprovedTask { id: string; title: string; waitingDays: number }
export interface NotApprovedPerson {
  employeeId: string; employeeName: string; count: number; tasks: NotApprovedTask[];
}
export interface NotApprovedAging {
  total: number; byPerson: NotApprovedPerson[]; bands: NotApprovedBandCount[];
}
```

- [ ] **Step 1: Add the types to `lib/types.ts`** (after the `DoneOnTime` types from Task 4).

- [ ] **Step 2: Write the failing test**

```ts
// tests/unit/not-approved-aging.test.ts
import { describe, it, expect } from "vitest";
import { computeNotApprovedAging, type NotApprovedInput } from "@/lib/transforms/not-approved-aging";

const now = new Date("2026-06-20T12:00:00Z");
const names = new Map([["u1", "Alice"], ["u2", "Bob"]]);

describe("computeNotApprovedAging", () => {
  it("groups by doer, oldest-waiting first, buckets waiting days", () => {
    const rows: NotApprovedInput[] = [
      { id: "t1", title: "A", doerId: "u1", sentBackAt: "2026-06-11" }, // 9 days → w8_14
      { id: "t2", title: "B", doerId: "u1", sentBackAt: "2026-06-19" }, // 1 day  → w1
      { id: "t3", title: "C", doerId: "u2", sentBackAt: "2026-06-20" }, // 0 days → w0
    ];
    const r = computeNotApprovedAging(rows, names, now);
    expect(r.total).toBe(3);
    expect(r.byPerson[0]?.employeeName).toBe("Alice"); // 2 tasks, has the oldest
    expect(r.byPerson[0]?.count).toBe(2);
    expect(r.byPerson[0]?.tasks[0]?.waitingDays).toBe(9); // oldest first within person
    expect(r.bands.find((b) => b.id === "w8_14")?.count).toBe(1);
    expect(r.bands).toHaveLength(7);
  });
  it("a null sentBackAt is treated as 0 days waiting", () => {
    const r = computeNotApprovedAging([{ id: "t", title: "T", doerId: "u1", sentBackAt: null }], names, now);
    expect(r.byPerson[0]?.tasks[0]?.waitingDays).toBe(0);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/not-approved-aging.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Write minimal implementation**

```ts
// lib/transforms/not-approved-aging.ts
import type { NotApprovedAging, NotApprovedPerson } from "@/lib/types";
import { WAITING_AGING_BANDS, bucketWaitingDays } from "./aging-bands";

export interface NotApprovedInput {
  id: string;
  title: string;
  doerId: string;
  /** When it entered not_approved (event time, else completed_at, else created_at). */
  sentBackAt: Date | string | null;
}

const MS_PER_DAY = 86_400_000;
function dayNumber(d: Date | string): number {
  const key = typeof d === "string" ? d.slice(0, 10) : d.toISOString().slice(0, 10);
  return Math.floor(new Date(`${key}T00:00:00Z`).getTime() / MS_PER_DAY);
}

export function computeNotApprovedAging(
  rows: NotApprovedInput[],
  nameById: Map<string, string>,
  now: Date,
): NotApprovedAging {
  const nowDay = dayNumber(now);
  const bands = new Map(WAITING_AGING_BANDS.map((b) => [b.id, 0]));
  const per = new Map<string, NotApprovedPerson>();

  for (const r of rows) {
    const waitingDays = r.sentBackAt ? Math.max(0, nowDay - dayNumber(r.sentBackAt)) : 0;
    bands.set(bucketWaitingDays(waitingDays), (bands.get(bucketWaitingDays(waitingDays)) ?? 0) + 1);
    const p = per.get(r.doerId) ?? {
      employeeId: r.doerId, employeeName: nameById.get(r.doerId) ?? "Unknown", count: 0, tasks: [],
    };
    p.count++;
    p.tasks.push({ id: r.id, title: r.title, waitingDays });
    per.set(r.doerId, p);
  }

  const byPerson = [...per.values()]
    .map((p) => ({ ...p, tasks: p.tasks.sort((a, b) => b.waitingDays - a.waitingDays) }))
    // person with the single oldest task first; tie-break by count
    .sort((a, b) => (b.tasks[0]?.waitingDays ?? 0) - (a.tasks[0]?.waitingDays ?? 0) || b.count - a.count);

  return {
    total: rows.length,
    byPerson,
    bands: WAITING_AGING_BANDS.map((b) => ({ id: b.id, label: b.label, count: bands.get(b.id) ?? 0 })),
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run tests/unit/not-approved-aging.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/transforms/not-approved-aging.ts lib/types.ts tests/unit/not-approved-aging.test.ts
git commit -m "feat(dashboard): computeNotApprovedAging (declined, days-waiting)"
```

---

### Task 6: `computeInitiatorScorecard` (pure)

**Files:**
- Create: `lib/transforms/initiator-scorecard.ts`
- Modify: `lib/types.ts` (add `InitiatorReportRow`, `InitiatorScorecard`, `InitiatorBoard`)
- Test: `tests/unit/initiator-scorecard.test.ts`

**Interfaces:**
- Produces:
  - `interface InitiatorEmployee { id: string; name: string; managerId: string | null; email: string | null }`
  - `interface InitiatedTask { initiatorId: string; doerId: string }`
  - `computeInitiatorScorecard(tasks: InitiatedTask[], employees: InitiatorEmployee[], workingDays: number, isFounder: (email: string|null) => boolean): InitiatorScorecard[]`
- Types added to `lib/types.ts`:
```ts
export interface InitiatorReportRow { employeeId: string; employeeName: string; given: number; goal: number; hit: boolean }
export interface InitiatorScorecard {
  managerId: string; managerName: string; directReports: number;
  totalInitiated: number; toDirectReports: number; toCounterparts: number; toFounderMgmt: number;
  target: number; actual: number; attainmentPct: number;
  perReport: InitiatorReportRow[];
}
export interface InitiatorBoard { windowDays: number; workingDays: number; managers: InitiatorScorecard[] }
```

- [ ] **Step 1: Add the types to `lib/types.ts`** (after the NotApproved types).

- [ ] **Step 2: Write the failing test**

```ts
// tests/unit/initiator-scorecard.test.ts
import { describe, it, expect } from "vitest";
import { computeInitiatorScorecard, type InitiatorEmployee, type InitiatedTask } from "@/lib/transforms/initiator-scorecard";

// Org: Manan (founder, no mgr). Jeevan & Rohan are managers (report to nobody yet).
// Pratik & Purvi report to Jeevan. Hardik reports to Rohan.
const emps: InitiatorEmployee[] = [
  { id: "manan", name: "Manan Vasa", managerId: null, email: "manan@unleashed.in" },
  { id: "jeevan", name: "Jeevan", managerId: null, email: "jeevan@x.in" },
  { id: "rohan", name: "Rohan", managerId: null, email: "rohan@x.in" },
  { id: "pratik", name: "Pratik", managerId: "jeevan", email: "pratik@x.in" },
  { id: "purvi", name: "Purvi", managerId: "jeevan", email: "purvi@x.in" },
  { id: "hardik", name: "Hardik", managerId: "rohan", email: "hardik@x.in" },
];
const isFounder = (e: string | null) => e === "manan@unleashed.in";

describe("computeInitiatorScorecard", () => {
  it("classifies into reports / counterparts / founder; KPI uses reports only", () => {
    const tasks: InitiatedTask[] = [
      { initiatorId: "jeevan", doerId: "pratik" }, // direct report
      { initiatorId: "jeevan", doerId: "pratik" }, // direct report
      { initiatorId: "jeevan", doerId: "purvi" },  // direct report
      { initiatorId: "jeevan", doerId: "rohan" },  // counterpart (another mgr)
      { initiatorId: "jeevan", doerId: "hardik" }, // counterpart (other team)
      { initiatorId: "jeevan", doerId: "manan" },  // founder
    ];
    const cards = computeInitiatorScorecard(tasks, emps, 3, isFounder); // 3 working days
    const jeevan = cards.find((c) => c.managerId === "jeevan")!;
    expect(jeevan.directReports).toBe(2);
    expect(jeevan.totalInitiated).toBe(6);
    expect(jeevan.toDirectReports).toBe(3);
    expect(jeevan.toCounterparts).toBe(2);
    expect(jeevan.toFounderMgmt).toBe(1);
    expect(jeevan.target).toBe(2 * 3 * 3);      // reports × 3 × workingDays = 18
    expect(jeevan.actual).toBe(3);
    expect(jeevan.attainmentPct).toBe(Math.round((3 / 18) * 100));
    const pratik = jeevan.perReport.find((r) => r.employeeId === "pratik")!;
    expect(pratik.given).toBe(2);
    expect(pratik.goal).toBe(3 * 3); // 3 × workingDays = 9
    expect(pratik.hit).toBe(false);
  });
  it("only people with ≥1 direct report are managers; founder excluded even with reports? (Manan has none here)", () => {
    const cards = computeInitiatorScorecard([], emps, 3, isFounder);
    expect(cards.map((c) => c.managerId).sort()).toEqual(["jeevan", "rohan"]);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/initiator-scorecard.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Write minimal implementation**

```ts
// lib/transforms/initiator-scorecard.ts
import type { InitiatorScorecard, InitiatorReportRow } from "@/lib/types";

export interface InitiatorEmployee { id: string; name: string; managerId: string | null; email: string | null }
export interface InitiatedTask { initiatorId: string; doerId: string }

const PER_REPORT_PER_DAY = 3;

export function computeInitiatorScorecard(
  tasks: InitiatedTask[],
  employees: InitiatorEmployee[],
  workingDays: number,
  isFounder: (email: string | null) => boolean,
): InitiatorScorecard[] {
  const byId = new Map(employees.map((e) => [e.id, e]));
  // Direct reports per manager id.
  const reportsOf = new Map<string, InitiatorEmployee[]>();
  for (const e of employees) {
    if (e.managerId) {
      const list = reportsOf.get(e.managerId) ?? [];
      list.push(e);
      reportsOf.set(e.managerId, list);
    }
  }
  // Managers = anyone with ≥1 direct report.
  const managerIds = [...reportsOf.keys()];

  return managerIds
    .map((managerId): InitiatorScorecard => {
      const manager = byId.get(managerId);
      const reports = reportsOf.get(managerId) ?? [];
      const reportIds = new Set(reports.map((r) => r.id));
      const mine = tasks.filter((t) => t.initiatorId === managerId);

      let toDirectReports = 0, toCounterparts = 0, toFounderMgmt = 0;
      const givenByReport = new Map<string, number>();
      for (const t of mine) {
        if (reportIds.has(t.doerId)) {
          toDirectReports++;
          givenByReport.set(t.doerId, (givenByReport.get(t.doerId) ?? 0) + 1);
        } else if (isFounder(byId.get(t.doerId)?.email ?? null)) {
          toFounderMgmt++;
        } else {
          toCounterparts++;
        }
      }

      const goal = PER_REPORT_PER_DAY * workingDays;
      const target = reports.length * goal;
      const perReport: InitiatorReportRow[] = reports
        .map((r) => {
          const given = givenByReport.get(r.id) ?? 0;
          return { employeeId: r.id, employeeName: r.name, given, goal, hit: given >= goal };
        })
        .sort((a, b) => a.given - b.given || a.employeeName.localeCompare(b.employeeName));

      return {
        managerId,
        managerName: manager?.name ?? "Unknown",
        directReports: reports.length,
        totalInitiated: mine.length,
        toDirectReports, toCounterparts, toFounderMgmt,
        target, actual: toDirectReports,
        attainmentPct: target > 0 ? Math.round((toDirectReports / target) * 100) : 0,
        perReport,
      };
    })
    // Worst attainment first — surfaces managers not delegating.
    .sort((a, b) => a.attainmentPct - b.attainmentPct || b.directReports - a.directReports);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run tests/unit/initiator-scorecard.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/transforms/initiator-scorecard.ts lib/types.ts tests/unit/initiator-scorecard.test.ts
git commit -m "feat(dashboard): computeInitiatorScorecard (3-way classification + target vs actual)"
```

---

### Task 7: Export transforms + extend `DashboardData`

**Files:**
- Modify: `lib/transforms/index.ts` (re-export new modules)
- Modify: `lib/types.ts` (extend `DashboardData`)

**Interfaces:**
- Produces: `DashboardData.doneOnTime: DoneOnTime`, `DashboardData.notApprovedAging: NotApprovedAging`, `DashboardData.initiator: { d3: InitiatorBoard; d7: InitiatorBoard }`

- [ ] **Step 1: Re-export from `lib/transforms/index.ts`**

Add these lines alongside the existing exports:
```ts
export { computeDoneOnTime } from "./done-on-time";
export { computeNotApprovedAging } from "./not-approved-aging";
export { computeInitiatorScorecard } from "./initiator-scorecard";
export { countWorkingDays } from "./working-days";
export { DONE_AGING_BANDS, WAITING_AGING_BANDS, bucketSignedDays, bucketWaitingDays } from "./aging-bands";
```

- [ ] **Step 2: Extend `DashboardData` in `lib/types.ts`**

Add to the `DashboardData` interface (after `punctuality: Punctuality;`):
```ts
  doneOnTime: DoneOnTime;
  notApprovedAging: NotApprovedAging;
  initiator: { d3: InitiatorBoard; d7: InitiatorBoard };
```

- [ ] **Step 3: Typecheck (will fail until Task 8 supplies the fields)**

Run: `pnpm tsc --noEmit`
Expected: errors ONLY in `lib/queries/dashboard.ts` (return missing the 3 new fields). That is the Task-8 hand-off; no other file should error.

- [ ] **Step 4: Commit**

```bash
git add lib/transforms/index.ts lib/types.ts
git commit -m "feat(dashboard): export new transforms + extend DashboardData type"
```

---

### Task 8: Wire queries into `lib/queries/dashboard.ts`

**Files:**
- Modify: `lib/queries/dashboard.ts`

**Interfaces:**
- Consumes: all Task 4–6 transforms; `isFounderEmail` (Task 3); `countWorkingDays` (Task 2).
- Produces: the 3 new `DashboardData` fields.

- [ ] **Step 1: Add `originalDueAt` to the shared projection**

Modify `taskCols` (line ~52) so the raw original due survives the effective-due projection:
```ts
const taskCols = () => ({ ...TASK_COLS_BASE, dueAt: effectiveDueAtSql(), originalDueAt: tasks.dueAt });
```

- [ ] **Step 2: Add imports at the top of the file**

```ts
import { sql } from "drizzle-orm";
import { taskEvents, holidays } from "@/lib/db"; // ensure these are exported from lib/db; else import from "@/db/schema"
import { isFounderEmail } from "@/lib/auth/founder";
import {
  computeDoneOnTime, computeNotApprovedAging, computeInitiatorScorecard, countWorkingDays,
} from "@/lib/transforms";
import type { InitiatorBoard } from "@/lib/types";
```
> Verify `taskEvents` and `holidays` are re-exported by `lib/db`. If not, import them from `@/db/schema` directly.

- [ ] **Step 3: Inside `loadDashboardDataUncached`, after `now` is defined (~line 153), add the three extra fetches**

Run them inside a single `Promise.all` (each independently `.catch`-degrading). Add this block after the main `Promise.all` resolves:
```ts
  const MS = MS_PER_DAY;
  const sevenAgo = new Date(now.getTime() - 7 * MS);
  const threeAgo = new Date(now.getTime() - 3 * MS);

  const [notApprovedRows, sentBackEvents, initiatorTasksRaw, holidayRows] = await Promise.all([
    // Declined tasks (STRICT) — id, title, doer, completed_at, created_at.
    db.select({
        id: tasks.id, title: tasks.title, doerId: tasks.doerId,
        completedAt: tasks.completedAt, createdAt: tasks.createdAt,
      })
      .from(tasks)
      .where(and(
        sql`(${tasks.approvalStatus} = 'not_approved' OR ${tasks.status} = 'not_approved')`,
        sql`${tasks.archived} = false`,
      ))
      .catch(() => [] as { id: string; title: string; doerId: string; completedAt: Date | null; createdAt: Date }[]),

    // Latest "entered not_approved" event time per task.
    db.execute(sql`
      SELECT task_id, MAX(created_at) AS sent_back_at
        FROM task_events
       WHERE event_type IN ('status_changed','declined')
         AND (to_value->>'status' = 'not_approved' OR to_value->>'approvalStatus' = 'not_approved')
       GROUP BY task_id
    `).then((r) => r as unknown as { task_id: string; sent_back_at: string }[])
      .catch(() => [] as { task_id: string; sent_back_at: string }[]),

    // Initiator window: tasks created in the last 7 days (covers both toggles).
    db.select({ initiatorId: tasks.initiatorId, doerId: tasks.doerId, createdAt: tasks.createdAt })
      .from(tasks)
      .where(and(gte(tasks.createdAt, sevenAgo), sql`${tasks.archived} = false`))
      .catch(() => [] as { initiatorId: string; doerId: string; createdAt: Date }[]),

    // Holidays within the 7-day window for working-day math.
    db.select({ holidayDate: holidays.holidayDate }).from(holidays)
      .where(gte(holidays.holidayDate, sevenAgo.toISOString().slice(0, 10)))
      .catch(() => [] as { holidayDate: string }[]),
  ]);
```

- [ ] **Step 4: Compute the three datasets (still inside the function, before `return`)**

```ts
  // ① Done on-time + aging (Original vs Revised). periodTasks already carry
  //    originalDueAt (Step 1) + effective dueAt.
  const doneOnTime = computeDoneOnTime(periodTasks as unknown as Parameters<typeof computeDoneOnTime>[0], nameById);

  // ② Not Approved — anchor = event time → completed_at → created_at.
  const sentBackByTask = new Map(sentBackEvents.map((e) => [e.task_id, e.sent_back_at] as const));
  const notApprovedAging = computeNotApprovedAging(
    notApprovedRows.map((t) => ({
      id: t.id, title: t.title, doerId: t.doerId,
      sentBackAt: sentBackByTask.get(t.id) ?? t.completedAt ?? t.createdAt,
    })),
    nameById,
    now,
  );

  // ③ Manager Initiator — split the 7-day scan into 3-day and 7-day windows.
  const holidaySet = new Set(holidayRows.map((h) => h.holidayDate));
  const initEmployees = allEmployees.map((e) => ({ id: e.id, name: e.name, managerId: e.managerId, email: e.email }));
  const board = (since: Date, windowDays: number): InitiatorBoard => {
    const wd = countWorkingDays(since, now, holidaySet); // Sunday off (default)
    const windowTasks = initiatorTasksRaw.filter((t) => t.createdAt >= since)
      .map((t) => ({ initiatorId: t.initiatorId, doerId: t.doerId }));
    return { windowDays, workingDays: wd, managers: computeInitiatorScorecard(windowTasks, initEmployees, wd, isFounderEmail) };
  };
  const initiator = { d3: board(threeAgo, 3), d7: board(sevenAgo, 7) };
```

- [ ] **Step 5: Add the three fields to the returned object**

In the `return { … }` (around line 299), add:
```ts
    doneOnTime,
    notApprovedAging,
    initiator,
```

- [ ] **Step 6: Typecheck + run the full transform test set**

Run: `pnpm tsc --noEmit`
Expected: PASS (no errors).
Run: `pnpm vitest run tests/unit/aging-bands.test.ts tests/unit/working-days.test.ts tests/unit/founder.test.ts tests/unit/done-on-time.test.ts tests/unit/not-approved-aging.test.ts tests/unit/initiator-scorecard.test.ts`
Expected: PASS (all).

- [ ] **Step 7: Commit**

```bash
git add lib/queries/dashboard.ts
git commit -m "feat(dashboard): wire done-on-time / not-approved / initiator queries (fail-open)"
```

---

### Task 9: `DoneAgingSection` component + render

**Files:**
- Create: `components/dashboard/done-aging-section.tsx`
- Modify: `app/(app)/page.tsx` (render it)

**Interfaces:**
- Consumes: `DashboardData.doneOnTime` (`DoneOnTime`), `me.isAdmin`.

Build a **collapsed-by-default** client section, copying the open/close shell from `components/dashboard/collapsible-velocity.tsx` (button + Plus/Minus + `open &&` body). Inside the body:
- An `Original ⇄ Revised` segmented toggle (`React.useState<"original"|"revised">("revised")`), styled like the `SortControl` pill group in `aging-heatmap.tsx`.
- The active basis renders: big on-time % + split bar + on-time/late counts (lift the markup from `components/dashboard/punctuality-card.tsx`), then the **12-band histogram** — horizontal bars, one per `histogram[]` band, green for `e*`/`d0` ids, red for `l*` ids, count labels, using the green/red tokens already in `punctuality-card.tsx`.
- Admin-only per-person list (reuse the `byPerson` block from `punctuality-card.tsx`).

- [ ] **Step 1: Write the component** (full file; mirror `collapsible-velocity.tsx` shell + `punctuality-card.tsx` internals). Header: `📦 Done — On time & aging`, sub: "On-time delivery and how early/late, by original or revised due date."

- [ ] **Step 2: Render in `app/(app)/page.tsx`**

Import it and place it after `<PunctualityCard … />` (or after the aging heatmap). Pass `data={data.doneOnTime}` and `isAdmin={!!me?.isAdmin}`.

- [ ] **Step 3: Build + visually self-check**

Run: `pnpm build`
Expected: compiles; `/` route present. (Visual sign-off happens in the deploy verify step.)

- [ ] **Step 4: Commit**

```bash
git add components/dashboard/done-aging-section.tsx app/(app)/page.tsx
git commit -m "feat(dashboard): Done on-time + signed aging section (original/revised)"
```

---

### Task 10: `NotApprovedSection` component + render

**Files:**
- Create: `components/dashboard/not-approved-section.tsx`
- Modify: `app/(app)/page.tsx`

**Interfaces:**
- Consumes: `DashboardData.notApprovedAging` (`NotApprovedAging`), `me.isAdmin`.

Collapsed-by-default shell (same as Task 9). Body:
- A waiting-aging histogram (`bands[]`) — red-toned horizontal bars (these are all "overdue for sign-off"), count labels.
- **Person-wise** list (admin sees all; non-admin sees only their own row — filter `byPerson` to `me.id` when `!isAdmin`): name, count, and a Popover (reuse `aging-heatmap.tsx` `Segment` Popover pattern) listing the person's declined tasks (`tasks[]`, already oldest-first) with `waitingDays` chips, each linking to `/tasks/${t.id}`.
- Empty state: "No tasks have been sent back — nothing to action."

- [ ] **Step 1: Write the component** (full file). Header: `↩️ Not Approved`, sub: "Tasks sent back, waiting to be redone — oldest first."

- [ ] **Step 2: Render in `app/(app)/page.tsx`** after the Done section. Pass `data={data.notApprovedAging}`, `isAdmin`, and `meId={me?.id ?? null}`.

- [ ] **Step 3: Build**

Run: `pnpm build`
Expected: compiles.

- [ ] **Step 4: Commit**

```bash
git add components/dashboard/not-approved-section.tsx app/(app)/page.tsx
git commit -m "feat(dashboard): Not Approved section (person-wise + days-waiting)"
```

---

### Task 11: `InitiatorSection` component + render

**Files:**
- Create: `components/dashboard/initiator-section.tsx`
- Modify: `app/(app)/page.tsx`

**Interfaces:**
- Consumes: `DashboardData.initiator` (`{ d3, d7 }`), `me.isAdmin`, `me.id`.

Collapsed-by-default shell. Body:
- A `Last 3 days ⇄ Last 7 days` toggle (`React.useState<"d3"|"d7">("d7")`) → selects the `InitiatorBoard`.
- Caption: "Target = 3 tasks × {workingDays} working days × direct reports (Sun off)."
- One card/lane per manager (admin: all; manager: only their own — filter `managers` to `managerId === me.id` when `!isAdmin`). Each shows:
  - Manager name + `actual / target` with a progress bar (green ≥100%, amber ≥60%, red below — reuse `rateColor` logic from `punctuality-card.tsx`).
  - Three chips: **Direct Reports {toDirectReports}** (highlighted, "counts"), **Counterparts {toCounterparts}**, **Founder/Mgmt {toFounderMgmt}**, plus **Total {totalInitiated}**.
  - Expandable per-report rows (`perReport[]`): `name — given/goal` with ✅/❌.
- Empty state: "No managers with direct reports yet — assign reporting lines in Admin → Employees."

- [ ] **Step 1: Write the component** (full file). Header: `🧭 Manager Initiator`, sub: "Are managers pushing work down to their teams? Target vs actual."

- [ ] **Step 2: Render in `app/(app)/page.tsx`** after the Not Approved section. Pass `data={data.initiator}`, `isAdmin`, `meId`.

- [ ] **Step 3: Build**

Run: `pnpm build`
Expected: compiles.

- [ ] **Step 4: Commit**

```bash
git add components/dashboard/initiator-section.tsx app/(app)/page.tsx
git commit -m "feat(dashboard): Manager Initiator section (target vs actual, 3 categories)"
```

---

### Task 12: Full verification + ship

**Files:** none (verification + deploy).

- [ ] **Step 1: Full test suite**

Run: `pnpm vitest run`
Expected: all pass (existing 695 + the new ~30).

- [ ] **Step 2: Typecheck + build**

Run: `pnpm tsc --noEmit && pnpm build`
Expected: clean; `/` route renders.

- [ ] **Step 3: Authed visual self-check**

Follow the mint-session authed-browser technique (memory: deploy-2026-06-12) to load `/` and expand each of the three sections; confirm they render and the toggles work.

- [ ] **Step 4: Deploy**

```bash
bash scripts/ship.sh "feat(dashboard): done on-time/aging + not-approved + manager initiator dashboards" --dry-run
bash scripts/ship.sh "feat(dashboard): done on-time/aging + not-approved + manager initiator dashboards"
```
Confirm Vercel build goes green (poll per deploy memory).

---

## Self-Review

**Spec coverage:**
- Done on-time Original vs Revised → Task 4 + 9. ✓
- 12 signed aging bands → Task 1 + 4 (histogram) + 9 (render). ✓
- Not Approved strict (declined only), person-wise, days-waiting → Task 5 + 8 + 10. ✓
- Manager Initiator 3 categories, target vs actual, working days, founder=Manan, managers from hierarchy → Task 2 + 3 + 6 + 8 + 11. ✓
- Placement on main dashboard, collapsed/on-demand, admin-only per-person, fail-open → Tasks 9–11 + 8. ✓

**Placeholder scan:** none — every code step has full code; component tasks reference exact existing files to copy patterns from (collapsible-velocity, punctuality-card, aging-heatmap).

**Type consistency:** `DoneOnTimeTask`, `NotApprovedInput`, `InitiatedTask`/`InitiatorEmployee` input types are defined in their transform files and consumed only there; output types (`DoneOnTime`, `NotApprovedAging`, `InitiatorBoard`, `InitiatorScorecard`, `PunctualityBasis`) live in `lib/types.ts` and flow Task 7 → 8 → 9–11. `bucketSignedDays`/`bucketWaitingDays` ids match between Task 1 definitions and Task 4/5 consumers.

**Open risk flagged for execution:** Step 3/Task 8 assumes the `task_events.to_value` jsonb stores the new status under `status` or `approvalStatus`. The query checks both; if neither matches in prod, the anchor silently falls back to `completed_at`/`created_at` (still correct, just less precise). Confirm the event shape against a real declined task during Task 8 and tighten the `to_value->>` keys if needed.
