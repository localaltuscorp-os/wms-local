package com.altuscorp.altus.data.remote.dto

import kotlinx.serialization.Serializable

/**
 * GET /api/mobile/dashboard — the Today screen's payload: greeting, today's
 * punches (pre-formatted HH:mm strings in the employee's timezone, or null),
 * doer task pressure and the weekly-goals gate.
 *
 * Mirrors the live route exactly (app/api/mobile/dashboard/route.ts).
 */
@Serializable
data class DashboardDto(
    val greetingName: String = "",
    val isAdmin: Boolean = false,
    val attendance: DashboardAttendanceDto = DashboardAttendanceDto(),
    val tasks: DashboardTasksDto = DashboardTasksDto(),
    val adminStats: DashboardAdminStatsDto? = null,
    val topPerformers: List<TopPerformerDto>? = null,
    val weeklyGoalsGate: WeeklyGoalsGateDto = WeeklyGoalsGateDto(),
)

/** Org-wide KPI strip for admins (mirrors the web dashboard's 6 cards). */
@Serializable
data class DashboardAdminStatsDto(
    val total: Int = 0,
    val needInfo: Int = 0,
    val notApproved: Int = 0,
    val done: Int = 0,
    val pending: Int = 0,
    val notStarted: Int = 0,
)

/** One row of the admin leaderboard — completions in the last 30 days. */
@Serializable
data class TopPerformerDto(
    val name: String = "",
    val done: Int = 0,
)

/** Server-formatted local times ("09:14") or null when not punched. */
@Serializable
data class DashboardAttendanceDto(
    val checkedIn: String? = null,
    val checkedOut: String? = null,
)

@Serializable
data class DashboardTasksDto(
    val pending: Int = 0,
    val overdue: Int = 0,
)
