package com.altuscorp.altus.data.remote.dto

import kotlinx.serialization.Serializable

/**
 * Plan Your Day DTOs (canonical S4) for the NEW endpoints
 *   GET  /api/mobile/plan
 *   POST /api/mobile/plan/item
 *   POST /api/mobile/plan/goal-actual
 *
 * These endpoints do not exist server-side yet (P0 ask). Shapes mirror the web
 * queries that will back them 1:1 (lib/queries/daily-checklist.ts:
 * DailyItem, PullableGoal, PlannerGoal, OverdueItem) plus the gate meter the
 * screen pins (MIN_DAILY_ITEMS = 5) and the goal-actuals requirement from
 * lib/weekly-goals/actuals.ts.
 */
@Serializable
data class PlanDto(
    /** `YYYY-MM-DD` (IST) plan day. */
    val date: String = "",
    /** MIN_DAILY_ITEMS — the commitment meter's denominator ("2/5"). */
    val minItems: Int = 5,
    /** Committed items counted toward the meter. */
    val plannedCount: Int = 0,
    /** True once plannedCount >= minItems AND goal actuals are logged. */
    val satisfied: Boolean = false,
    /** True while >=1 open current-week goal has no actuals row for today. */
    val needsGoalActuals: Boolean = false,
    /** Today's committed plan (assigned + personal). */
    val items: List<PlanItemDto> = emptyList(),
    /** Tasks due today that auto-populate the plan (read-only rows). */
    val assignedTasks: List<PlanItemDto> = emptyList(),
    /** Current-week goals that can be pulled into today with one tap. */
    val pullableGoals: List<PullableGoalDto> = emptyList(),
    /** Planner goals with today's actuals (the 5%-detent slider sheet). */
    val goals: List<PlannerGoalDto> = emptyList(),
    /** Rolled-over items from previous days. */
    val overdue: List<OverdueItemDto> = emptyList(),
)

/** Mirrors web `DailyItem`. */
@Serializable
data class PlanItemDto(
    val id: String = "",
    /** "assigned" | "personal". */
    val source: String = "personal",
    val title: String = "",
    val client: String? = null,
    val subject: String? = null,
    /** "goal_related" | "standalone". */
    val origin: String = "standalone",
    val goalId: String? = null,
    /** Linked task, when the item came from the task list. */
    val taskId: String? = null,
    val done: Boolean = false,
)

/** Mirrors web `PullableGoal`. */
@Serializable
data class PullableGoalDto(
    val id: String = "",
    val client: String? = null,
    val subject: String? = null,
    val targetDone: String? = null,
    val weight: Int = 0,
)

/** Mirrors web `PlannerGoal` — a goal plus today's logged actual. */
@Serializable
data class PlannerGoalDto(
    val id: String = "",
    val client: String? = null,
    val subject: String? = null,
    val targetDone: String? = null,
    val weight: Int = 0,
    /** Cumulative %Done on the goal (0–100). */
    val pctDone: Int = 0,
    /** True once today's actual has been logged for this goal. */
    val loggedToday: Boolean = false,
    /** Today's actual note, when logged. */
    val todayNote: String? = null,
)

/** Mirrors web `OverdueItem`. */
@Serializable
data class OverdueItemDto(
    val id: String = "",
    val title: String = "",
    val client: String? = null,
    val subject: String? = null,
    /** "goal_related" | "standalone". */
    val origin: String = "standalone",
    val goalId: String? = null,
)

/**
 * POST /api/mobile/plan/item — add one commitment to today. Exactly one of
 * `title` (ad-hoc personal item), `taskId` (pull an open task) or `goalId`
 * (pull a weekly goal) should be set.
 */
@Serializable
data class AddPlanItemRequestDto(
    val title: String? = null,
    val taskId: String? = null,
    val goalId: String? = null,
)

/** POST /api/mobile/plan/goal-actual — log today's progress on one goal. */
@Serializable
data class GoalActualRequestDto(
    val goalId: String,
    /** 0–100, 5%-detent slider on S4. */
    val pctDone: Int,
    val note: String? = null,
)

/**
 * Mutation ack that also returns the fresh meter so the pinned "2/5" and the
 * pop-back-when-satisfied behaviour never need a full re-fetch.
 */
@Serializable
data class PlanMutationResponseDto(
    val ok: Boolean = false,
    val plannedCount: Int = 0,
    val satisfied: Boolean = false,
    val needsGoalActuals: Boolean = false,
)
