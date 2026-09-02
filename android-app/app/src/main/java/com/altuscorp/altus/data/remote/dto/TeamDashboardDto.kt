package com.altuscorp.altus.data.remote.dto

import kotlinx.serialization.Serializable

/**
 * GET /api/mobile/team-dashboard/[type] — a normalized admin team dashboard
 * (overtime · reimbursements): title + stats strip + ranked people list.
 * Mirrors app/api/mobile/team-dashboard/[type]/route.ts.
 */
@Serializable
data class TeamDashboardDto(
    val title: String = "",
    val periodLabel: String = "",
    val stats: List<TeamStatDto> = emptyList(),
    val people: List<TeamPersonDto> = emptyList(),
)

@Serializable
data class TeamStatDto(val label: String = "", val value: String = "")

@Serializable
data class TeamPersonDto(val name: String = "", val primary: String = "", val secondary: String = "")
