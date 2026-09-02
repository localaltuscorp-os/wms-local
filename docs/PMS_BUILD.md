# PMS / Employee Intelligence — Layer 2 Build Plan

**Module:** Employee Intelligence (PMS) · **Layer:** 2 (Intelligence — DERIVED, rebuildable projections over `event_log`)
**Identity:** Employees module, GREEN (`#16a34a` / deep `#15803d`) · **Migration:** `0095`
**Status:** plan only — orchestrator integrates + ships. Build + `tsc` + report.

---

## 0. Constitution guardrails this plan obeys (read first)

| Law / Lesson | How this plan honours it |
|---|---|
| **L1 Layer 2 is derived** | PMS owns NO operational data. `employee_twin` + `employee_score_daily` are projections rebuilt from `event_log`. The operational rows (attendance_logs, weekly_goals, dcc_entries, …) stay the source of truth. |
| **L2 Emit in same txn** | Every new emit is added INSIDE the operational mutation's `db.transaction`, behind `OUTBOX_EMIT_OFF`. Bare `db.insert` sites are wrapped in a txn first. Modelled on `lib/tasks/set-status.ts`. |
| **L4 Idempotent + rebuildable** | Consumers use `onConflictDoUpdate` keyed on `(period, employee_id)`; `rebuild*()` truncates + replays. New consumers start at seq 0 and replay full history. |
| **L8 Zero external effects** | PMS fires NO commands. No emails, no calendar, no payouts. Promotion + recognition are **human-released** rows only. No `command_log` writes from PMS consumers. |
| **No policy in code** | Score / Promotion / Recognition engines are PURE functions reading ALL weights + thresholds from `pms_score_config`. One seeded, fully-editable row. No default weights baked into `if` logic. |
| **DB load path off-limits** | No pool/DATABASE_URL change. Reads go through `withRetry([6000,10000,14000])`. PMS surface point-reads the projection (no heavy `tasks`/`attendance_logs` scans on the dashboard load path). |
| **Green identity** | Register `/pms` in `lib/workspaces.ts` `employees` branch + add a nav pill — header auto-tints green. No red WMS pill look. |
| **Additive migration** | `0095` is `create table if not exists` only. Never ALTER/DROP. Apply script mirrors `apply-0094`. |

**Verify command:** `npx tsc --noEmit 2>&1 | grep "error TS"` (ignore pre-existing `tests/`, `calendarAttempts`, `ambReferralId` fixture errors).

---

## 1. DATA — migration `0095_pms_intelligence`

### 1.1 New event types (`lib/events/types.ts` — append after the task block)

Five new domains. Payloads are **flat + denormalised** (carry `employeeId` + every fact a projection needs — consumers NEVER read the operational row). All start at version 1.

```ts
// ── ATTENDANCE domain. aggregateType = "attendance". ──
export const ATTENDANCE_AGGREGATE = "attendance" as const;
export const AttendanceEventTypes = { Punched: "AttendancePunched" } as const;
export type AttendanceEventType = (typeof AttendanceEventTypes)[keyof typeof AttendanceEventTypes];
export interface AttendancePunchedV1 {
  employeeId: string;
  logDate: string;       // 'YYYY-MM-DD' employee-tz calendar day
  kind: "in" | "out";
  late: boolean | null;  // graded at emit vs schedule; null if not gradable (out punch / no schedule)
  verifyMethod: string | null;
  source: string;        // 'self' | 'admin'
}

// ── GOAL domain. aggregateType = "goal". ──
export const GOAL_AGGREGATE = "goal" as const;
export const GoalEventTypes = {
  ProgressLogged: "GoalProgressLogged",
  Reviewed: "GoalReviewed",
} as const;
export type GoalEventType = (typeof GoalEventTypes)[keyof typeof GoalEventTypes];
export interface GoalProgressLoggedV1 {
  employeeId: string;
  goalId: string;
  entryDate: string;     // 'YYYY-MM-DD'
  weekStart: string;     // 'YYYY-MM-DD'
  pctDone: number | null;     // doer self %
  weight: number;             // goal share of the week (sums to 100/employee/week)
  filledOnTime: boolean | null; // pct_updated_at <= week_end + 1d grace
}
export interface GoalReviewedV1 {
  employeeId: string;
  goalId: string;
  weekStart: string;
  acceptPct: number | null;   // manager-reviewed %
  weight: number;
  kpi: boolean;
}

// ── DCC domain. aggregateType = "dcc". ──
export const DCC_AGGREGATE = "dcc" as const;
export const DccEventTypes = {
  EntryFilled: "DccEntryFilled",
  Reviewed: "DccReviewed",
} as const;
export type DccEventType = (typeof DccEventTypes)[keyof typeof DccEventTypes];
export interface DccEntryFilledV1 {
  employeeId: string;     // owner_employee_id of the item
  itemId: string;
  entryDate: string;      // 'YYYY-MM-DD'
  status: "Done" | "Not done" | "NA" | "Pending";
  valueNumber: number | null;
  targetNumber: number | null;
}
export interface DccReviewedV1 {
  employeeId: string;     // owner being reviewed
  reviewDate: string;
  status: "approved" | "needs_rework";
}

// ── TRAINING domain. aggregateType = "training". ──
export const TRAINING_AGGREGATE = "training" as const;
export const TrainingEventTypes = {
  TestAttempted: "TrainingTestAttempted",
  MaterialWatched: "TrainingMaterialWatched",
} as const;
export type TrainingEventType = (typeof TrainingEventTypes)[keyof typeof TrainingEventTypes];
export interface TrainingTestAttemptedV1 {
  employeeId: string;
  testId: string;
  score: number;
  passed: boolean;
  takenAt: string;        // ISO
}
export interface TrainingMaterialWatchedV1 {
  employeeId: string;
  materialId: string;
}

// ── FEEDBACK domain. aggregateType = "feedback". ──
export const FEEDBACK_AGGREGATE = "feedback" as const;
export const FeedbackEventTypes = {
  Received: "FeedbackReceived",
  Resolved: "FeedbackResolved",
} as const;
export type FeedbackEventType = (typeof FeedbackEventTypes)[keyof typeof FeedbackEventTypes];
export interface FeedbackReceivedV1 {
  employeeId: string | null;  // rated_employee_id (may be null → free-text only)
  feedbackId: string;
  rating: number | null;
  type: string | null;
}
export interface FeedbackResolvedV1 {
  employeeId: string | null;
  feedbackId: string;
  tatHours: number | null;    // resolved_at - created_at, computed at emit
}
```

Extend the version registry — add a SEPARATE map per domain (do NOT widen the task `CURRENT_VERSION`):

```ts
export const ATTENDANCE_CURRENT_VERSION: Record<AttendanceEventType, number> = { [AttendanceEventTypes.Punched]: 1 };
export const GOAL_CURRENT_VERSION: Record<GoalEventType, number> = { [GoalEventTypes.ProgressLogged]: 1, [GoalEventTypes.Reviewed]: 1 };
export const DCC_CURRENT_VERSION: Record<DccEventType, number> = { [DccEventTypes.EntryFilled]: 1, [DccEventTypes.Reviewed]: 1 };
export const TRAINING_CURRENT_VERSION: Record<TrainingEventType, number> = { [TrainingEventTypes.TestAttempted]: 1, [TrainingEventTypes.MaterialWatched]: 1 };
export const FEEDBACK_CURRENT_VERSION: Record<FeedbackEventType, number> = { [FeedbackEventTypes.Received]: 1, [FeedbackEventTypes.Resolved]: 1 };
```

`upcasters.ts` needs no change (registry stays identity; all v1).

### 1.2 Event builders — five new files (mirror `lib/events/task-events.ts`)

Each file copies the `base(aggId, eventType, payload, meta)` helper + `Meta` interface and exports one thin builder per event:

- `lib/events/attendance-events.ts` → `attendancePunched(employeeId, p: AttendancePunchedV1, meta)` (aggregateType `ATTENDANCE_AGGREGATE`, aggregateId = employeeId).
- `lib/events/goal-events.ts` → `goalProgressLogged(...)`, `goalReviewed(...)` (aggregateId = goalId).
- `lib/events/dcc-events.ts` → `dccEntryFilled(...)`, `dccReviewed(...)` (aggregateId = itemId / employeeId).
- `lib/events/training-events.ts` → `trainingTestAttempted(...)`, `trainingMaterialWatched(...)` (aggregateId = testId / materialId).
- `lib/events/feedback-events.ts` → `feedbackReceived(...)`, `feedbackResolved(...)` (aggregateId = feedbackId).

### 1.3 Emit call sites (each INSIDE a `db.transaction`, then `nudgeRelay()` after commit)

| Event | File · site | Wrap note |
|---|---|---|
| `AttendancePunched` | `lib/attendance/record-punch.ts` `insertPunchRow()` | **Currently a bare `db.insert` — wrap in `db.transaction(async (tx) => { tx.insert(...); await emit(tx, attendancePunched(...)); })`.** Grade `late` here via `lib/attendance/status.ts` schedule (in-punch only; null for out). Used by BOTH web `attendance/actions.ts:157` and mobile `api/mobile/attendance/punch/route.ts:139` — one wrap covers both. Admin backfill `actions.ts:327` is a separate insert → wrap + emit `source:'admin'`. |
| `GoalProgressLogged` | `app/(app)/daily-checklist/actions.ts:194` (single) + `:248` (bulk) | The achievement-% mutation (writes `weekly_goal_actuals` + bumps `weekly_goals.pct_done/pct_updated_at`). Wrap the insert+update in a txn; emit per goal with denormalised `weight`, `weekStart`, `filledOnTime`. Bulk → `emitMany`. |
| `GoalReviewed` | `app/(app)/weekly-goals/actions.ts` review/accept_pct write (~`:932`/`:1010`) | Emit when `accept_pct` is set, carrying `acceptPct`, `weight`, `kpi`. |
| `DccEntryFilled` | `app/(app)/dcc/actions.ts:67` (upsert) | Wrap upsert in txn; denormalise `targetNumber` from the item. (`:62` delete → no emit, or emit `status:'Pending'` reset — emit nothing, keep simple.) |
| `DccReviewed` | `app/(app)/dcc/actions.ts:180`/`:233` | Emit owner + status. |
| `TrainingTestAttempted` | `app/(app)/training/actions.ts:308` | Wrap insert; emit `score`, `passed`. |
| `TrainingMaterialWatched` | `app/(app)/training/actions.ts:156` | Emit on first watch insert. |
| `FeedbackReceived` | `app/(app)/training/feedback/actions.ts:32` | Emit `ratedEmployeeId` (coalesce FK over free-text → null if none), `rating`. |
| `FeedbackResolved` | feedback resolution write (same file) | Emit `tatHours` computed at emit. |

> Each site: import the builder + `emit`/`emitMany` from `@/lib/events/*` and `nudgeRelay` from `@/lib/relay/nudge`. Call `nudgeRelay()` AFTER the txn commits. All emits are no-ops under `OUTBOX_EMIT_OFF=true`. Treat emit failure as **non-fatal where the operational row commits separately** (mirror `create-task.ts` try/catch) — but for sites we wrap in one txn (punch, dcc), the emit shares the txn so failure rolls back the whole thing (acceptable, matches `set-status.ts`).

### 1.4 New projection + config + human tables (`db/schema.ts`, append a `// ── PMS / Employee Intelligence — mig 0095 ──` section)

All drizzle defs + `$inferSelect` exports. **No FK from projection tables back to operational rows** (Law: events outlive aggregates). `pms_*` human tables MAY FK to `employees` (they are operational, not projections).

```ts
// employee_twin — current per-person derived profile (PROJECTION, rebuildable). PK = employee_id.
export const employeeTwin = pgTable("employee_twin", {
  employeeId:        uuid("employee_id").primaryKey(),       // NO FK (projection)
  orgId:             text("org_id"),
  // attendance
  presenceDays:      integer("presence_days").notNull().default(0),
  lateCount:         integer("late_count").notNull().default(0),
  punctualDays:      integer("punctual_days").notNull().default(0),
  // goals
  goalEffSumWeighted: numeric("goal_eff_sum_weighted", { precision: 14, scale: 2 }).notNull().default("0"), // Σ(eff%×weight)
  goalWeightSum:      numeric("goal_weight_sum", { precision: 14, scale: 2 }).notNull().default("0"),        // Σ(weight)
  goalsCompleted:     integer("goals_completed").notNull().default(0),
  goalsFilledOnTime:  integer("goals_filled_on_time").notNull().default(0),
  goalProgressEvents: integer("goal_progress_events").notNull().default(0),
  // dcc
  dccDueCount:        integer("dcc_due_count").notNull().default(0),
  dccDoneCount:       integer("dcc_done_count").notNull().default(0),
  // tasks (read from existing task_metrics_daily at score time — not duplicated here)
  // training
  testsPassed:        integer("tests_passed").notNull().default(0),
  testsAttempted:     integer("tests_attempted").notNull().default(0),
  materialsWatched:   integer("materials_watched").notNull().default(0),
  // feedback
  feedbackCount:      integer("feedback_count").notNull().default(0),
  feedbackRatingSum:  numeric("feedback_rating_sum", { precision: 14, scale: 2 }).notNull().default("0"),
  feedbackResolved:   integer("feedback_resolved").notNull().default(0),
  feedbackTatSum:     numeric("feedback_tat_sum", { precision: 14, scale: 2 }).notNull().default("0"),
  lastEventAt:        timestamp("last_event_at", { withTimezone: true }),
  updatedAt:          timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export type EmployeeTwin = typeof employeeTwin.$inferSelect;

// employee_score_daily — rebuildable score history. PK = (day, employee_id).
export const employeeScoreDaily = pgTable("employee_score_daily", {
  day:          date("day").notNull(),
  employeeId:   uuid("employee_id").notNull(),               // NO FK (projection)
  orgId:        text("org_id"),
  // raw daily counters the score engine reads (idempotent counters)
  presenceDays:      integer("presence_days").notNull().default(0),
  lateCount:         integer("late_count").notNull().default(0),
  goalEffSumWeighted: numeric("goal_eff_sum_weighted", { precision: 14, scale: 2 }).notNull().default("0"),
  goalWeightSum:      numeric("goal_weight_sum", { precision: 14, scale: 2 }).notNull().default("0"),
  goalsCompleted:     integer("goals_completed").notNull().default(0),
  dccDueCount:        integer("dcc_due_count").notNull().default(0),
  dccDoneCount:       integer("dcc_done_count").notNull().default(0),
  testsPassed:        integer("tests_passed").notNull().default(0),
  feedbackRatingSum:  numeric("feedback_rating_sum", { precision: 14, scale: 2 }).notNull().default("0"),
  feedbackCount:      integer("feedback_count").notNull().default(0),
  updatedAt:    timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [ index("employee_score_daily_emp_idx").on(t.employeeId), index("employee_score_daily_day_idx").on(t.day) ]);
// PK declared in SQL as (day, employee_id).
export type EmployeeScoreDaily = typeof employeeScoreDaily.$inferSelect;

// pms_score_config — THE ONLY source of policy. Admin-editable weights + thresholds. Singleton row id='default'.
export const pmsScoreConfig = pgTable("pms_score_config", {
  id:          text("id").primaryKey().default("default"),
  // component weights (sum need not be 100; engine normalises) — stored as DATA
  weights:     jsonb("weights").notNull(),     // { attendance, goals, dcc, tasks, training, feedback }
  thresholds:  jsonb("thresholds").notNull(),  // { promotionScore, recognitionScore, lateGraceDays, onTimeRateFloor, minTenureDays, ... }
  formula:     jsonb("formula").notNull(),      // sub-metric coefficients (e.g. punctualityCoeff, goalAchievementCoeff)
  updatedById: uuid("updated_by_id").references(() => employees.id, { onDelete: "set null" }),
  updatedAt:   timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export type PmsScoreConfig = typeof pmsScoreConfig.$inferSelect;

// pms_review — manager review of a person for a period (mirror dcc_reviews). UNIQUE(employee_id, period).
export const pmsReview = pgTable("pms_review", {
  id:          uuid("id").primaryKey().defaultRandom(),
  employeeId:  uuid("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  period:      text("period").notNull(),        // 'YYYY-MM' month grain
  reviewerId:  uuid("reviewer_id").references(() => employees.id, { onDelete: "set null" }),
  rating:      smallint("rating"),              // manager 1-5
  status:      text("status").notNull().default("draft"), // draft | acknowledged | needs_rework
  strengths:   text("strengths"),
  improvements: text("improvements"),
  note:        text("note"),
  createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:   timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [ uniqueIndex("pms_review_emp_period_uq").on(t.employeeId, t.period) ]);
export type PmsReview = typeof pmsReview.$inferSelect;

// pms_recognition — HUMAN-RELEASED recognition (engine SUGGESTS, manager releases). No auto.
export const pmsRecognition = pgTable("pms_recognition", {
  id:          uuid("id").primaryKey().defaultRandom(),
  employeeId:  uuid("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  period:      text("period").notNull(),
  kind:        text("kind").notNull(),          // 'star_of_month' | 'most_improved' | 'kudos' | ...
  reason:      text("reason"),
  scoreSnapshot: numeric("score_snapshot", { precision: 8, scale: 2 }),
  status:      text("status").notNull().default("suggested"), // suggested | released | dismissed
  releasedById: uuid("released_by_id").references(() => employees.id, { onDelete: "set null" }),
  releasedAt:  timestamp("released_at", { withTimezone: true }),
  createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [ index("pms_recognition_emp_idx").on(t.employeeId), index("pms_recognition_period_idx").on(t.period) ]);
export type PmsRecognition = typeof pmsRecognition.$inferSelect;

// pms_promotion_signal — HUMAN-RELEASED promotion signal (engine flags eligibility, leadership decides).
export const pmsPromotionSignal = pgTable("pms_promotion_signal", {
  id:          uuid("id").primaryKey().defaultRandom(),
  employeeId:  uuid("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  scoreSnapshot: numeric("score_snapshot", { precision: 8, scale: 2 }),
  eligibleSince: date("eligible_since"),
  rationale:   text("rationale"),
  status:      text("status").notNull().default("flagged"), // flagged | acknowledged | actioned | dismissed
  decidedById: uuid("decided_by_id").references(() => employees.id, { onDelete: "set null" }),
  decidedAt:   timestamp("decided_at", { withTimezone: true }),
  createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [ uniqueIndex("pms_promotion_emp_open_uq").on(t.employeeId, t.status) ]);
export type PmsPromotionSignal = typeof pmsPromotionSignal.$inferSelect;
```

### 1.5 `db/migrations/0095_pms_intelligence.sql` (additive, idempotent)

Mirror `0094` style: intent header + "ALL ADDITIVE … Idempotent. Safe to re-run." `create table if not exists` for all seven (`employee_twin`, `employee_score_daily`, `pms_score_config`, `pms_review`, `pms_recognition`, `pms_promotion_signal`). `create index if not exists` for the indexes above. PKs inline (`primary key (day, employee_id)` for `employee_score_daily`). Wrap the config seed in a `do $$ ... end $$;` block:

```sql
insert into pms_score_config (id, weights, thresholds, formula)
values (
  'default',
  '{"attendance":20,"goals":30,"dcc":15,"tasks":20,"training":7,"feedback":8}'::jsonb,
  '{"promotionScore":85,"recognitionScore":90,"lateGraceDays":3,"onTimeRateFloor":0.8,"minTenureDays":180}'::jsonb,
  '{"punctualityCoeff":1.0,"goalAchievementCoeff":1.0,"dccComplianceCoeff":1.0,"taskOnTimeCoeff":1.0,"testPassCoeff":1.0,"feedbackCoeff":1.0}'::jsonb
)
on conflict (id) do nothing;
```

> Seed values are an editable STARTING POINT stored as data, not policy in code. The engine reads only from this row.

### 1.6 `scripts/apply-0095-pms-intelligence.ts`

Copy `apply-0094-event-spine.ts` verbatim: `postgres(url,{max:1,prepare:false})`, ensure `__schema_applied`, `sql.unsafe(readFileSync('db/migrations/0095_pms_intelligence.sql'))`, ledger insert `on conflict do nothing`, then verify presence of all seven tables via `information_schema.tables`. Header run cmd: `pnpm tsx --env-file=.env.local scripts/apply-0095-pms-intelligence.ts`. **Safe to apply (additive).**

---

## 2. INTELLIGENCE — projections, consumers, backfill, engines

### 2.1 Two projection consumers (mirror `task-metrics.ts` + `task-metrics-rule.ts`)

**(a) `lib/projections/employee-twin-rule.ts`** — PURE. Imports only event types. `employeeTwinDelta(event): TwinDelta | null`. Guards `aggregateType` against the five PMS aggregates (ignore `task` — tasks already have their own projection and the score engine reads `task_metrics_daily` directly). Switches `eventType` and returns a partial counter delta keyed by `employeeId`, e.g.:
- `AttendancePunched` (kind `in`) → `{ employeeId, presenceDays:+1, lateCount: late?+1:0, punctualDays: late?0:+1 }`
- `GoalProgressLogged` → `{ goalEffSumWeighted: (pctDone??0)*weight, goalWeightSum: weight, goalsCompleted: (pctDone>=100?+1:0), goalsFilledOnTime: filledOnTime?+1:0, goalProgressEvents:+1 }`
- `DccEntryFilled` → `{ dccDueCount:+1, dccDoneCount: status==='Done'?+1:0 }`
- `TrainingTestAttempted` → `{ testsAttempted:+1, testsPassed: passed?+1:0 }`
- `FeedbackReceived` → `{ feedbackCount:+1, feedbackRatingSum: rating??0 }` (skip if `employeeId` null)
- returns null for anything else.

**(b) `lib/projections/employee-twin.ts`** — `EMPLOYEE_TWIN_CONSUMER = "projection:employee_twin"`. Consumer obj `handle(event, tx)` → applies delta via idempotent upsert into `employee_twin` keyed on `employeeId`, using `sql\`${col} + ${delta}\`` increments + `lastEventAt = greatest(...)`. `getEmployeeTwin(ids)` read. `rebuildEmployeeTwin()` = `db.delete(employeeTwin)` + reset cursor + `runConsumer`.

**(c) `lib/projections/employee-score-daily-rule.ts` + `employee-score-daily.ts`** — `EMPLOYEE_SCORE_DAILY_CONSUMER = "projection:employee_score_daily"`. Same delta logic but keyed on `(dayOf(event.occurredAt), employeeId)` writing the daily raw counters. PK `(day, employee_id)`, upsert via `onConflictDoUpdate` target `[employeeScoreDaily.day, employeeScoreDaily.employeeId]`. This is the rebuildable HISTORY; the twin is the rolled-up CURRENT.

> Both are PURE projections (table upserts only) → safe to run by default, no command-channel gating. Both `import "server-only"` is NOT needed in projection files (they run inside the relay), but the read helpers go in `lib/queries/pms.ts` which IS server-only.

### 2.2 Register consumers (`lib/relay/consumers.ts` — one line each)

```ts
import { employeeTwinConsumer } from "@/lib/projections/employee-twin";
import { employeeScoreDailyConsumer } from "@/lib/projections/employee-score-daily";
// ... in CONSUMERS[]:
  employeeTwinConsumer,
  employeeScoreDailyConsumer,
```

They start at seq 0 and replay full history on next relay run (driven by `nudgeRelay()` + the daily `app/api/cron/relay/route.ts`).

### 2.3 Backfill / rebuild scripts (mirror `scripts/rebuild-task-metrics.ts`)

- `scripts/rebuild-employee-twin.ts` → `rebuildEmployeeTwin()`.
- `scripts/rebuild-employee-score.ts` → `rebuildEmployeeScoreDaily()`.

> Backfill caveat: the projections only see events that exist in `event_log`. Historical attendance/goal/dcc rows predating the new emits will NOT be in the log. If a full historical twin is required, add a one-off `scripts/seed-pms-events.ts` that reads the operational tables and `emit()`s synthetic v1 events with the original `occurredAt` (in a txn, with `OUTBOX_EMIT_OFF` unset) — OPTIONAL, run once, documented as a manual op. Default plan: projection goes forward-only; the live SQL `globalRankings()` remains the historical fallback until the log fills.

### 2.4 PURE configurable engines — `lib/pms/engines/` (NO hardcoded policy)

All three are pure functions: `(twin, config, context) => result`. They read EVERY weight/threshold/coefficient from the `PmsScoreConfig` argument. **No literal weight or threshold appears in these files.**

**`lib/pms/engines/score.ts`**
```ts
export interface ScoreInputs {
  twin: EmployeeTwin;
  taskMetrics: { doneCount: number; onTimeRate: number };  // from task_metrics_daily window
  tenureDays: number;
}
export function computeScore(inp: ScoreInputs, cfg: PmsScoreConfig): {
  total: number; components: Record<string, number>;
} {
  const w = cfg.weights as Weights;             // { attendance, goals, dcc, tasks, training, feedback }
  const f = cfg.formula as Formula;             // coefficients, all from config
  // each sub-score normalised 0..1 then × coeff, weighted, summed, scaled 0..100
  const attendance = ratio(inp.twin.punctualDays, inp.twin.presenceDays) * f.punctualityCoeff;
  const goals      = inp.twin.goalWeightSum > 0
    ? (Number(inp.twin.goalEffSumWeighted) / Number(inp.twin.goalWeightSum) / 100) * f.goalAchievementCoeff
    : 0;
  const dcc        = ratio(inp.twin.dccDoneCount, inp.twin.dccDueCount) * f.dccComplianceCoeff;
  const tasks      = inp.taskMetrics.onTimeRate * f.taskOnTimeCoeff;
  const training   = ratio(inp.twin.testsPassed, inp.twin.testsAttempted) * f.testPassCoeff;
  const feedback   = inp.twin.feedbackCount > 0
    ? (Number(inp.twin.feedbackRatingSum) / inp.twin.feedbackCount / 5) * f.feedbackCoeff : 0;
  const components = { attendance, goals, dcc, tasks, training, feedback };
  const wsum = w.attendance+w.goals+w.dcc+w.tasks+w.training+w.feedback;
  const total = wsum === 0 ? 0 : Math.round(
    100 * (attendance*w.attendance + goals*w.goals + dcc*w.dcc + tasks*w.tasks + training*w.training + feedback*w.feedback) / wsum
  );
  return { total, components };
}
```

**`lib/pms/engines/promotion.ts`** — `evaluatePromotion(score, tenureDays, cfg)`: returns `{ eligible, rationale }` where `eligible = score >= cfg.thresholds.promotionScore && tenureDays >= cfg.thresholds.minTenureDays`. **Pure.** It only FLAGS — never writes, never auto-promotes. A separate human action persists a `pms_promotion_signal` row.

**`lib/pms/engines/recognition.ts`** — `suggestRecognition(rankedScores[], cfg)`: returns `{ employeeId, kind, reason }[]` for those crossing `cfg.thresholds.recognitionScore` / top-N. **Pure, suggestion only.** Humans release via `pms_recognition`.

> A monthly relay-independent recompute (NOT a cron external effect — pure read+upsert) can populate `pms_recognition`/`pms_promotion_signal` as `status:'suggested'/'flagged'`. This is OPTIONAL automation that produces SUGGESTIONS only; the rows never become `released`/`actioned` without a human action. Keep it behind a manual script or admin button, not an autonomous cron, to stay clearly within "human-released".

### 2.5 Read layer — `lib/queries/pms.ts` (`import "server-only"`)

All reads wrapped in `withRetry(() => ..., { attempts:3, timeoutMs:[6000,10000,14000], label:"pms-..." })`. Functions:
- `getScoreConfig()` → the singleton config row (cache-friendly).
- `getTwins(ids: string[])` → `employee_twin` rows (point-read, `inArray`, early-return `[]` on empty).
- `getScoreTrend(employeeId, {start,end})` → `employee_score_daily` window for the trend chart.
- `getRecognitions(ids)`, `getPromotionSignals(ids)`, `getReview(employeeId, period)`.
- `scoreFor(employeeId)` → loads twin + config + a small `getTaskMetrics()` window + tenure, runs `computeScore`. **Point-reads the projection — no `tasks`/`attendance_logs` scan on the dashboard load path.**

---

## 3. UI — Employees-module PMS surface (GREEN identity)

### 3.1 Route + nav registration (turns the surface green automatically)

- **New route:** `app/(app)/pms/page.tsx` (per-person + team), `app/(app)/pms/config/page.tsx` (admin score-config editor).
- **`lib/workspaces.ts`** → add `p.startsWith("/pms")` to the `employees` branch of `workspaceForPath()`. (Without this the page falls through to WMS and renders RED.)
- **`components/layout/main-nav.tsx`** → add to `WORKSPACE_NAV.employees.top`: `{ href:"/pms", label:"Performance", Icon: TrendingUp }` and `{ href:"/pms/config", label:"Score Config", Icon: SlidersHorizontal, adminOnly:true }`.
- Header auto-tints green via `header.tsx` → `workspaceForPath(x-pathname)` → `--vp-cyan*` = `#16a34a`. No manual theming.

### 3.2 Auth + scope (mirror DCC exactly — `lib/dcc/access.ts`)

New `lib/pms/access.ts` `loadPmsScope(me)` = a verbatim copy of `loadDccScope` (transitive downline DFS over `employees.manager_id`, super-admin → all). Helpers `canViewFor`, `canReviewFor` (EXCLUDES self), `canManageFor`. Net rule: employees see only themselves; managers see + review their full transitive downline (never themselves); super-admins see/review everyone. Mirror DCC's super-admin-only org reach.

Every PMS **page** and **server action** self-guards (`requireUser()` + scope check; `requireAdmin()`/`requireSuperAdmin()` for config) — the `(app)` layout gate does NOT cover server actions.

### 3.3 Server actions — `app/(app)/pms/actions.ts` (`"use server"`, mirror `dcc/actions.ts`)

`ActionResult`/`fail`, `requireUser`, `rateLimitOrError(me.id,"write")`, zod `safeParse`, scope guard, try/catch, `revalidatePath("/pms")`. Actions — ALL human-released, ZERO external effects:
- `saveReview(employeeId, period, {rating, strengths, improvements, note, status})` — guarded by `canReviewFor` (NOT self); upsert `pms_review` on `(employee_id, period)`.
- `releaseRecognition(id)` / `dismissRecognition(id)` — flips `pms_recognition.status` to `released`/`dismissed`, sets `releasedById`/`releasedAt`. Manager/admin only.
- `createRecognition(employeeId, period, kind, reason)` — manager manually grants (status `released` directly).
- `decidePromotionSignal(id, decision)` — flips `pms_promotion_signal.status` to `acknowledged`/`actioned`/`dismissed` + `decidedById`. **Never auto-promotes; just records the human decision.**
- `saveScoreConfig(weights, thresholds, formula)` — `requireSuperAdmin()`; updates the singleton `pms_score_config` row + `updatedById`. THE only way policy changes.

### 3.4 Page shells + components (green tokens, lazy recharts)

**`app/(app)/pms/page.tsx`** — `export const dynamic="force-dynamic"`. Standard shell: `<DashboardHeader/>` → `<main className="mx-auto max-w-[1400px] px-12 max-md:px-4 pt-8 pb-16">` → eyebrow/`text-display-lg` title "Performance" → `<DashboardFooter/>`. Loads scope; resolves `ownerId` from `?emp` only if `scope.visibleIds.has(requested)` else `me.id`; `Promise.all` the reads; shows team switcher only when `scope.isManager`.

Components (`components/pms/`), all GREEN via brand tokens (`var(--color-green-deep)` `#15803d`, accent `#16a34a`, `--color-green-bg` `#ecfdf5`), `color-mix(in srgb, #16a34a 12%, transparent)` icon chips, `rounded-section bg-surface-card` cards with hairline border + soft shadow, display-font hero numbers (`tabular-nums`, `useCountUp`):
- `score-hero.tsx` — big 0–100 score number + component breakdown bars (model `punctuality-card.tsx`; green fill on tint track).
- `score-trend-chart.tsx` + `score-trend-chart-impl.tsx` — **lazy recharts** (`dynamic(() => import('./score-trend-chart-impl'), {ssr:false, loading:<sized placeholder/>})`), line chart over `employee_score_daily`, green line `var(--color-green)`, axes `var(--font-sans)`/`var(--color-ink-subtle)`, grid `var(--color-hairline)` dashed.
- `component-breakdown.tsx` — per-pillar (attendance/goals/dcc/tasks/training/feedback) segmented bars, green→cool ramp from `aging-heatmap.tsx` (reuse the green end `#15803d`/`#86efac`).
- `recognition-panel.tsx` — recognition cards with a "Release"/"Dismiss" button (manager only); suggested vs released states. Human-released CTA only.
- `promotion-signal-panel.tsx` — eligibility flag + rationale + "Acknowledge"/"Action"/"Dismiss" (manager/admin). Clearly labelled "signal — leadership decides".
- `manager-review-form.tsx` — RHF form (rating 1–5, strengths, improvements, note, status), autofocus + keyboard-first, calls `saveReview`. Shown only when `canReviewFor(scope, ownerId)`.
- `team-board.tsx` — manager view: ranked downline scores (reuse the `globalRankings()` composite shape as a sanity cross-check), each row linking to `?emp=<id>`.

**`app/(app)/pms/config/page.tsx`** — `requireSuperAdmin()` (or `requireAdmin()` per leadership call — default super-admin, matches "leadership sets every weight"). `components/pms/score-config-editor.tsx`: RHF form rendering EVERY key in `weights`, `thresholds`, `formula` as a numeric input with live preview of a sample score; on save calls `saveScoreConfig`. This is the ONLY place policy is set. Numbers stored as data → re-reading the config row immediately changes all engine output (engines read config at call time). No deploy needed to change policy.

---

## 4. Build order (sequenced)

1. **Schema + migration** — append PMS section to `db/schema.ts`; write `0095_pms_intelligence.sql`; write `scripts/apply-0095-pms-intelligence.ts`; apply it (additive, safe).
2. **Event contracts** — append five domains to `lib/events/types.ts`; add the five `*-events.ts` builder files; (`upcasters.ts` unchanged).
3. **Emit sites** — wrap each operational mutation in a txn (where bare insert) and add `emit`/`emitMany` + post-commit `nudgeRelay()` per §1.3.
4. **Projections** — `employee-twin-rule.ts`/`employee-twin.ts`, `employee-score-daily-rule.ts`/`employee-score-daily.ts`; register both in `lib/relay/consumers.ts`; add the two rebuild scripts.
5. **Engines** — `lib/pms/engines/{score,promotion,recognition}.ts` (pure, config-driven) + `lib/pms/access.ts` + `lib/queries/pms.ts`.
6. **UI** — register `/pms` in `lib/workspaces.ts` + nav pills; `app/(app)/pms/{page,config/page}.tsx` + `app/(app)/pms/actions.ts` + `components/pms/*`.
7. **Verify** — `npx tsc --noEmit 2>&1 | grep "error TS"`; optionally run the rebuild scripts against a dev DB; confirm `/pms` renders GREEN (header badge present).

---

## 5. Gotchas pinned for the builder

- **Emit only inside the txn.** `record-punch.ts insertPunchRow()` and the dcc/goal/training upserts are currently bare `db.insert` — WRAP first, then `emit(tx, …)`. Never emit in `after()`.
- **Consumers write via `tx` only**, never base `db`. Handlers idempotent (upsert + `sql` increments). New consumers replay ALL history from seq 0 — guard `aggregateType` first, ignore foreign aggregates (incl. `task`).
- **No FK on projection tables** (`employee_twin`, `employee_score_daily`). FKs on `pms_*` human tables to `employees` are fine.
- **`numeric` reads back as STRING** at runtime — wrap in `Number(...)` in the engines (the D16-class trap). Day keys via `.toISOString().slice(0,10)`, never `Date` math; IST (`Asia/Kolkata`) for any period bucketing.
- **Goal % is weight-aware** — `effective% = COALESCE(accept_pct, pct_done)`; weekly score = `round(Σ(eff×weight)/Σ(weight))`. The twin stores `goalEffSumWeighted`/`goalWeightSum` so the engine never re-derives wrong. `GoalReviewed` (accept_pct) must override the doer's `pct_done` contribution — emit it and let the projection adjust.
- **DCC due-ness** depends on the `weekdays` bitmask — only emit `DccEntryFilled` for items actually filled (entry exists); the projection counts due/done from emitted entries, not all items.
- **No policy in engine code** — every weight/threshold/coefficient comes from `pms_score_config`. Changing the seeded row changes behaviour with no deploy. Reviewers will reject any literal weight in `lib/pms/engines/*`.
- **Promotion + recognition are human-released** — engines SUGGEST/FLAG only; rows stay `suggested`/`flagged` until a human action sets `released`/`actioned`. No autonomous cron releases them. ZERO external effects (no email/calendar/payout) from PMS.
- **Register `/pms` in `workspaces.ts`** or the surface renders RED (WMS fallback). There is no `/employees` route.
- **Recharts via the `-impl.tsx` lazy split** only. Page point-reads the projection — keep heavy operational scans off the load path. Never touch the DB pool / DATABASE_URL.
- **Kill-switches:** `OUTBOX_EMIT_OFF=true` (no emits), `RELAY_OFF=true` (no projection updates). Don't test the flow with either set. Cron is daily-only; `nudgeRelay()` after each new emit gives near-real-time freshness.
