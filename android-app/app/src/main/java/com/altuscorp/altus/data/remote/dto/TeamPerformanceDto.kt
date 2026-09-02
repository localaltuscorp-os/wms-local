package com.altuscorp.altus.data.remote.dto

import kotlinx.serialization.Serializable

/**
 * GET /api/mobile/team/performance — the mobile rendition of the web
 * `/weekly-goals/team` "Team performance" page: the A-to-Z scoped roster
 * (self → downline → all, per the web's `teamScopeFor`) with each member's
 * live snapshot from the SAME task/goal/attendance/DCC/training records the
 * web card grid reads — nothing duplicated, nothing client-computed beyond
 * sort + the "live status" label (mirrors the web's `statusOf`).
 *
 * Every field defaults so a missing/extra key never throws (lenient Json +
 * `ignoreUnknownKeys`).
 */
@Serializable
data class TeamPerformanceDto(
    val members: List<TeamMemberPerfDto> = emptyList(),
)

@Serializable
data class TeamMemberPerfDto(
    val id: String = "",
    val name: String = "",
    val avatarUrl: String? = null,
    val department: String? = null,
    /** This week's goal count / done — weight-aware effective %. */
    val goalsCount: Int = 0,
    val goalsDone: Int = 0,
    /** Weight-aware effective %Done this week; null = no goals set. */
    val goalScorePct: Int? = null,
    /** Open assigned tasks due today or overdue. */
    val assignedToday: Int = 0,
    /** Open assigned tasks past effective due. */
    val overdueTasks: Int = 0,
    /** All open assigned tasks. */
    val pendingTasks: Int = 0,
    /** Open tasks flagged need_info. */
    val needHelp: Int = 0,
    /** Open tasks on_hold. */
    val blockedTasks: Int = 0,
    /** Tasks completed today. */
    val doneToday: Int = 0,
    /** Has any planned work today (assigned or personal). */
    val plannedToday: Boolean = false,
    /** DCC done/due this month, excluding NA; null = nothing due. */
    val dccCompliancePct: Int? = null,
    /** Training attended this month, hours (1dp). */
    val trainingHoursMonth: Double = 0.0,
    /** Server-formatted "HH:mm" (IST) of the last "in" punch today, or null. */
    val lastInLabel: String? = null,
    /** Server-formatted "HH:mm" (IST) of the last "out" punch today, or null. */
    val lastOutLabel: String? = null,
    /** True once in without an out today (mirrors the web's `statusOf`). */
    val working: Boolean = false,
)
