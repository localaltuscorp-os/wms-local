package com.altuscorp.altus.data.remote.dto

import kotlinx.serialization.Serializable

/**
 * GET /api/mobile/weekly-goals/dashboard — the team weekly-score overview.
 * Mirrors app/api/mobile/weekly-goals/dashboard/route.ts.
 */
@Serializable
data class WeeklyGoalsDashboardDto(
    val weekLabel: String = "",
    val teamScore: Int = 0,
    val peopleCount: Int = 0,
    val people: List<WgScoreRowDto> = emptyList(),
)

@Serializable
data class WgScoreRowDto(
    val employeeId: String = "",
    val name: String = "",
    val score: Int = 0,
    val goals: Int = 0,
)
