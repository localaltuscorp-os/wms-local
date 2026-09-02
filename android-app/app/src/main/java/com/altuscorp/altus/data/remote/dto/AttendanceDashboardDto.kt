package com.altuscorp.altus.data.remote.dto

import kotlinx.serialization.Serializable

/**
 * GET /api/mobile/attendance/dashboard?year=&month= — the admin "Att Report":
 * an org-wide monthly attendance summary, one row per employee plus a roll-up.
 * Admin only.
 *
 * Mirrors the live route (app/api/mobile/attendance/dashboard/route.ts).
 */
@Serializable
data class AttendanceDashboardDto(
    val year: Int = 0,
    val month: Int = 0,
    val monthLabel: String = "",
    val peopleCount: Int = 0,
    val totals: AttendanceTotalsDto = AttendanceTotalsDto(),
    val people: List<AttendancePersonDto> = emptyList(),
)

@Serializable
data class AttendanceTotalsDto(
    val present: Int = 0,
    val absent: Int = 0,
    val halfDay: Int = 0,
    val paidLeave: Int = 0,
    val unpaidLeave: Int = 0,
    val late: Int = 0,
)

@Serializable
data class AttendancePersonDto(
    val employeeId: String = "",
    val name: String = "",
    val payableDays: Double = 0.0,
    val present: Int = 0,
    val absent: Int = 0,
    val halfDay: Int = 0,
    val weeklyOff: Int = 0,
    val holiday: Int = 0,
    val paidLeave: Int = 0,
    val unpaidLeave: Int = 0,
    val compOff: Int = 0,
    val late: Int = 0,
)
