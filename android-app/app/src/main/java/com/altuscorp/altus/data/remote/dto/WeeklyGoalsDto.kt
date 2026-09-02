package com.altuscorp.altus.data.remote.dto

import kotlinx.serialization.Serializable

/**
 * Weekly-goals fill DTOs (canonical S8 / GoalsFill) for the NEW endpoints
 *   GET  /api/mobile/weekly-goals/fill
 *   POST /api/mobile/weekly-goals/fill
 *
 * Not live server-side yet (P0 ask). GET mirrors `listUnfilledWeekGoals`
 * (lib/weekly-goals/gate.ts) 1:1; POST clears the Mon/Thu gate that /me and
 * /dashboard surface via `weeklyGoalsGate`.
 */
@Serializable
data class WeeklyGoalsFillDto(
    /** `YYYY-MM-DD` Monday of the current week. */
    val weekStart: String = "",
    val goals: List<UnfilledWeekGoalDto> = emptyList(),
)

/** Mirrors web `UnfilledWeekGoal`. */
@Serializable
data class UnfilledWeekGoalDto(
    val id: String = "",
    val position: Int = 0,
    val client: String? = null,
    val subject: String? = null,
    val targetDone: String? = null,
    val priority: String? = null,
    /** `YYYY-MM-DD` or null. */
    val targetDate: String? = null,
    /** Last saved %Done (0–100), or null when never filled. */
    val pctDone: Int? = null,
    val explanation: String? = null,
)

/** POST body — one fill per unfilled goal. */
@Serializable
data class WeeklyGoalsFillRequestDto(
    val fills: List<GoalFillDto>,
)

@Serializable
data class GoalFillDto(
    val goalId: String,
    /** 0–100. */
    val pctDone: Int,
    val explanation: String? = null,
)
