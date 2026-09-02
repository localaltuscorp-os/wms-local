package com.altuscorp.altus.data.remote.dto

import kotlinx.serialization.Serializable

/**
 * GET /api/mobile/me — "who am I / am I enrolled". 200 means enrolled & active;
 * 403 bodies (`not-enrolled` / `deactivated`) are handled by [safeApiCall] as
 * [com.altuscorp.altus.core.network.ApiResult.Enrollment].
 *
 * Mirrors the live route exactly (app/api/mobile/me/route.ts).
 */
@Serializable
data class MeDto(
    val id: String = "",
    val name: String = "",
    val email: String = "",
    val isAdmin: Boolean = false,
    val avatarUrl: String? = null,
    val department: String? = null,
    val weeklyGoalsGate: WeeklyGoalsGateDto = WeeklyGoalsGateDto(),
)

/** Shared weekly-goals fill gate flag (surfaced by both /me and /dashboard). */
@Serializable
data class WeeklyGoalsGateDto(
    val required: Boolean = false,
    val unfilledCount: Int = 0,
)
