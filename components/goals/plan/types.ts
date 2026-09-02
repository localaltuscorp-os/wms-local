/**
 * Client-safe types shared by the Plan-Your-Day planner (Module 4).
 *
 * PURE — no server imports — so the `"use client"` board can import it freely.
 * The planner persists to `daily_checklist` (reusing its goalId/origin), so a
 * plan item's `id` is the `daily_checklist` row id (or the transient drag ghost).
 */

import type { TaskPriority } from "@/db/enums";

/** The right-hand drag-source families. `weekly` maps to a real `weekly_goals`
 *  row (stored on the checklist via `goal_id`); the cascade families
 *  (monthly/quarterly/yearly) and `task` are stored as standalone commitments. */
export type SourceKind = "weekly" | "monthly" | "quarterly" | "yearly" | "task" | "unfinished";

/** What a left-column commitment was pulled from (or typed ad-hoc). */
export type PlanKind = SourceKind | "adhoc";

/** A single ordered commitment on one planner day. */
export interface PlanItem {
  /** daily_checklist row id — or `GHOST_ID` while a source is dragged over. */
  id: string;
  title: string;
  subtitle: string | null;
  origin: "goal_related" | "standalone";
  kind: PlanKind;
  done: boolean;
  /**
   * Explicitly marked "Pending" at review time — the user looked at it and said
   * "not today". It stays on the day it was planned (that is the honest record)
   * AND surfaces in Unfinished so it can be re-planned. See `setPlanItemPending`.
   */
  pending?: boolean;
  /** Close-out progress 0-100 (kept for legacy/mobile reads — the planner UI no
   *  longer shows or asks for a percentage; done is a yes/no). */
  donePct?: number | null;
  /** Optional close-out note ("what happened"). */
  doneNote?: string | null;
  /** "4:30 PM – 5:30 PM" / "30 min" — the task's REAL scheduled block or planned
   *  effort. Null when the underlying record has neither. Never invented. */
  timeLabel?: string | null;
  /** WHERE in the day it sits — minutes from IST midnight. Null = "Anytime". */
  startMin?: number | null;
  /** How long it is booked for, in minutes. Null = no length recorded. */
  durationMin?: number | null;
  /** Eisenhower priority of the underlying WMS task (task-linked rows only). */
  priority?: TaskPriority | null;
  /** Whole IST days the underlying WMS task is late (task-linked rows only). */
  overdueDays?: number | null;
  /** EFFECTIVE due of the linked WMS task, IST "YYYY-MM-DD" — shown on hover. */
  dueYmd?: string | null;
  /** The WMS task behind this row, when there is one — only these can be
   *  recycled (the bin is built on tasks.abandoned_at). */
  taskId?: string | null;
  /** The SYSTEM moved this forward because the day ended unreviewed — not the
   *  person. Drives the CARRIED FORWARD chip; `fromYmd` says which day. */
  carriedForward?: boolean;
  /** The day it was carried forward FROM ("YYYY-MM-DD"). */
  fromYmd?: string | null;
  /** WHO IS RESPONSIBLE — the person whose plan this is (a task's doer is the
   *  plan owner by construction). Shown on the review card; not the creator. */
  assignee?: string | null;
  /** True only for the live drag placeholder. */
  ghost?: boolean;

  /* ── Added for the post-"Start My Day" review TABLE ───────────────────────
     All OPTIONAL, because two other paths build a PlanItem with only the core
     fields: the optimistic rows in plan/actions.ts, and the drag ghost. A table
     cell renders an em-dash when a value is absent, which is also the honest
     rendering for rows that genuinely have no such value — an ad-hoc
     commitment has no client, and a weekly goal has no priority. */

  /** Split back out of `subtitle`, which merges them lossily. */
  client?: string | null;
  subject?: string | null;
  /** The linked WMS task's number, when this row came from one. (`taskId`,
   *  `priority` and `dueYmd` are declared once, above — the table reads the
   *  same fields the cards do rather than keeping a second copy.) */
  taskNo?: number | null;
  description?: string | null;
  /** When the row was committed to a plan. */
  createdYmd?: string | null;
  /**
   * The same moment as `createdYmd` but to the millisecond — the key the
   * board's Oldest ↔ Newest control orders on (see lib/goals/plan-sort.ts).
   * Absent on an optimistic row that has not come back from the server yet,
   * which the ordering treats as "age unknown" and sorts last.
   */
  createdAtMs?: number | null;
  /** Whole IST days since `createdYmd`. */
  ageDays?: number | null;
  /** Rolled forward from an earlier, unfinished day (`moved_from_date`). This
   *  is what makes the "Unfinished" category knowable — `kind` reverts to
   *  weekly/task/adhoc once an item is carried over. */
  carriedOver?: boolean;
}

/**
 * The unified "Plan My Day" page renders one of these phases (Sir's transcript):
 *   plan     — morning: the 3-day kanban, drag work into a day.
 *   active   — day started: the SAME kanban, plus the close-out entry point.
 *   closeout — checkout/end-of-day: mark each commitment done / moved / pending.
 *   closed   — day wrapped: read-only summary of how it went.
 */
export type PlanPhase = "plan" | "active" | "closeout" | "closed";

/** A draggable card in a right-hand source window. */
export interface SourceItem {
  /** weekly_goals.id | goals.id | tasks.id, by kind. */
  id: string;
  kind: SourceKind;
  title: string;
  subtitle: string | null;
  /** Small trailing chip for GOAL cards, e.g. "45%". Never set on WMS tasks. */
  meta: string | null;
  /** Already on a planner day (dedupe-able sources only: weekly + task). */
  added: boolean;
  /** Effective due is past — surfaces unfinished/carried-over work (tasks only). */
  overdue?: boolean;
  /** Underlying task id (task + task-linked unfinished cards) — powers Abandon. */
  taskId?: string | null;

  /* ── WMS task detail (kind === "task"). Read straight off the `tasks` row —
        the card REFERENCES that task, it never copies or re-creates one.

        DELIBERATELY ABSENT (Sir): task_no, client/company, WMS status. None of
        them help you answer "what do I have to do / when / did I do it", and
        together they crowded the actual task text off the card. ── */
  /** Eisenhower priority — drives the priority line AND the priority filter. */
  priority?: TaskPriority | null;
  /** EFFECTIVE due (revised ?? due_at) as an IST "YYYY-MM-DD" — the overdue
   *  buckets work off this, so filtering agrees with what the card reads. */
  dueYmd?: string | null;
  /** Full description / target text — the untruncated body shown on hover. */
  description?: string | null;
  /** Whole IST days overdue relative to today (>0 = late). */
  overdueDays?: number | null;
  /** "4:30 PM – 5:30 PM" / "30 min" — real scheduled block or planned effort. */
  timeLabel?: string | null;

  /* ── carryover detail (kind === "unfinished") ── */
  /** What the ORIGINAL item was, so a carried-over row can show both its
   *  UNFINISHED state and the source it actually came from. */
  originKind?: Extract<PlanKind, "weekly" | "task" | "adhoc">;
  /** The plan date it was originally committed on ("YYYY-MM-DD"). */
  fromYmd?: string | null;
}

/** All source windows handed to the board. */
export interface PlanSources {
  weekly: SourceItem[];
  monthly: SourceItem[];
  quarterly: SourceItem[];
  yearly: SourceItem[];
  task: SourceItem[];
  /** Previously-unfinished commitments carried from earlier days. */
  unfinished: SourceItem[];
}

/** The transient placeholder id used during a cross-list drag. */
export const GHOST_ID = "__plan_ghost__";

/**
 * How many day columns the board opens on — ONE day (Sir).
 *
 * It is also what "—" in the view dropdown selects and the span the URL leaves
 * out. Defined here, in the file both the server assembler and the client board
 * already import, so those three can never drift apart.
 */
export const PLAN_DEFAULT_SPAN = 1;

/**
 * One tab in the day strip — every day inside the planning horizon, whether or
 * not it is one of the three columns currently on screen. Built server-side from
 * the IST calendar so the label can never disagree with the day it files work on.
 */
export interface PlanDayTab {
  offset: number;
  ymd: string;
  /** "Today" / "Tomorrow" / "Day After" / "Fri". */
  word: string;
  /** "18 AUG". */
  date: string;
}

/** One column of the daily kanban — a single planner day and what's on it. */
export interface PlanDayColumn {
  /** Days from today: 0 = today, 1 = tomorrow, … */
  offset: number;
  /** The plan date ("YYYY-MM-DD", IST). */
  ymd: string;
  /** "Today" / "Tomorrow" / "Day After" / "Fri" — the column's word. */
  word: string;
  /** "18 Aug" — the column's date, so there is never any counting. */
  date: string;
  /** The ordered commitments filed on this day. */
  items: PlanItem[];
}

/** The employee whose day is on screen, plus the org line above them. */
export interface PlanHierarchy {
  /** The person the plan belongs to — the assignee on every card. */
  owner?: string | null;
  /** Direct manager's name, when they have one. */
  manager: string | null;
  /** Manager's manager (the second layer Sir asked to stay visible). */
  managerManager: string | null;
}

/**
 * Everything the PlanBoard needs for one planning WINDOW — built server-side by
 * ONE shared assembler (`app/(app)/goals/plan/payload.ts`) so the `/goals/plan`
 * route and the canvas Day zoom stage can never drift. Client-safe: plain data.
 */
export interface PlanDayPayload {
  /** The 3 kanban columns, left to right. */
  days: PlanDayColumn[];
  /** EVERY planner day, for the day-tab strip above the kanban. Longer than
   *  `days`: the strip reaches the whole horizon, the kanban shows three of it. */
  tabs: PlanDayTab[];
  /** Offset of the LEFTMOST column — 0 when the window starts at today. */
  windowStart: number;
  /** How many day columns are on screen — 1, 3 or 7. */
  windowDays: number;
  /** How many tabs the day strip shows before ‹ / › page it (one week). */
  stripDays: number;
  /** The furthest BACK the window may start — negative, four weeks of history. */
  minWindowStart: number;
  /** The last window start the horizon allows (Next is disabled beyond it). */
  maxWindowStart: number;
  sources: PlanSources;
  /** How many items today needs before the day can be started (manager minimum).
   *  Enforced as a GATE only — the board no longer renders it as a progress meter. */
  minItems: number;
  isManager: boolean;
  /** Lifecycle of TODAY (the only day that can be started / closed out). */
  initialPhase: PlanPhase;
  /** Today's plan date ("YYYY-MM-DD", IST) — what every due mark compares to. */
  todayYmd: string;
  /** The org line above the person being planned for. */
  hierarchy: PlanHierarchy;
  /** The person's own working hours, as minutes from midnight — the span the
   *  Today timeline draws by default. Real data (employees.working_hours_*),
   *  never a hard-coded 9-to-5. */
  workday: { startMin: number; endMin: number };
}
