package com.altuscorp.altus.data.remote.dto

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * GET /api/mobile/attendance — punch state for the Punch screen + 14-day
 * history for Attendance History. Times are server-formatted local strings.
 *
 * Mirrors the live route exactly (app/api/mobile/attendance/route.ts).
 */
@Serializable
data class AttendanceDto(
    val today: AttendanceTodayDto = AttendanceTodayDto(),
    val history: List<AttendanceDayDto> = emptyList(),
    val geofence: GeofenceDto = GeofenceDto(),
    val devicesEnrolled: Int = 0,
    val biometricExempt: Boolean = false,
)

@Serializable
data class AttendanceTodayDto(
    /** `YYYY-MM-DD` in the employee's timezone. */
    val date: String = "",
    val checkedIn: String? = null,
    val checkedOut: String? = null,
)

/** One history row. `in`/`out` are Kotlin keywords, hence @SerialName. */
@Serializable
data class AttendanceDayDto(
    val date: String = "",
    @SerialName("in") val checkIn: String? = null,
    @SerialName("out") val checkOut: String? = null,
)

@Serializable
data class GeofenceDto(
    val enabled: Boolean = false,
    /** Radius in metres; null when the office pin is unset. */
    val radiusM: Int? = null,
)
