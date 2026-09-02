package com.altuscorp.altus.data.remote.dto

import kotlinx.serialization.Serializable

/**
 * POST /api/mobile/attendance/punch — the anti-proxy biometric punch.
 * The 409 gate bodies (`needsDcc` / `needsPlan` / `needsGoals`) are NOT decoded
 * here; they arrive via [com.altuscorp.altus.core.network.GateError] out of
 * [com.altuscorp.altus.core.network.safeApiCall].
 *
 * Mirrors the live route exactly (app/api/mobile/attendance/punch/route.ts).
 */
@Serializable
data class PunchRequestDto(
    /** "in" | "out". */
    val kind: String,
    val deviceId: String,
    val deviceLabel: String? = null,
    /** "android" (fixed for this app). */
    val platform: String = "android",
    val location: PunchLocationDto? = null,
    val note: String? = null,
)

@Serializable
data class PunchLocationDto(
    val lat: Double,
    val lng: Double,
    val accuracyM: Double,
)

/** Success body: `{ ok: true, date, newDevice }`. */
@Serializable
data class PunchResponseDto(
    val ok: Boolean = false,
    /** `YYYY-MM-DD` of the punched day. */
    val date: String? = null,
    /** True when this punch enrolled a new device (admins are alerted). */
    val newDevice: Boolean = false,
)
