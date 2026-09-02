package com.altuscorp.altus.data.remote.dto

import kotlinx.serialization.Serializable

/**
 * GET /api/mobile/hr-record[?month=YYYY-MM] — the signed-in employee's own
 * read-only HR "Attendance log" sheet mirror: one month's identity + KPI
 * summary + verbatim day codes, the month index for the switcher, and the
 * paid-leave entitlement block.
 *
 * Mirrors the live route exactly (app/api/mobile/hr-record/route.ts), which is
 * itself the owner-scoped counterpart of the admin web page at
 * /attendance/hr-record. Numbers arrive pre-parsed; date strings are `YYYY-MM-DD`.
 */
@Serializable
data class HrRecordDto(
    val employeeName: String = "",
    val fy: String? = null,
    val designation: String? = null,
    val companyName: String? = null,
    val remark: String? = null,
    /** Selected month bucket `YYYY-MM-01`, or null when no sheet month exists. */
    val month: String? = null,
    /** "June 2026" for the selected month. */
    val monthLabel: String? = null,
    /** Every month the sheet has for this employee, newest first. */
    val months: List<HrMonthDto> = emptyList(),
    val summary: HrSummaryDto? = null,
    /** Day cells 1..31 in sheet order; `date` is null past the month's length. */
    val days: List<HrDayDto> = emptyList(),
    val paidLeave: HrPaidLeaveDto? = null,
    /** Server-side degrade flag — a DB hiccup returns this true with empty data. */
    val loadError: Boolean = false,
)

@Serializable
data class HrMonthDto(
    /** `YYYY-MM-01` bucket — the ?month= arg. */
    val value: String = "",
    /** "June 2026". */
    val label: String = "",
)

@Serializable
data class HrSummaryDto(
    val present: Double = 0.0,
    val absent: Double = 0.0,
    val halfDay: Double = 0.0,
    val weeklyOff: Double = 0.0,
    val holiday: Double = 0.0,
    val pohFull: Double = 0.0,
    val pohHalf: Double = 0.0,
    val daysInMonth: Double = 0.0,
    val totalDaysWorked: Double = 0.0,
)

@Serializable
data class HrDayDto(
    val day: Int = 0,
    /** Raw sheet code: P | A | W/O | H | H-P | H-H/D | H/D | - */
    val statusCode: String = "-",
    /** `YYYY-MM-DD`; null when the day column exceeds the month's length. */
    val date: String? = null,
)

@Serializable
data class HrPaidLeaveDto(
    val doj: String? = null,
    /** "Wed, 4 Jun 2026" — pre-formatted DOJ. */
    val dojLabel: String? = null,
    val totalLeaves: Double = 0.0,
    val cycles: List<HrLeaveCycleDto> = emptyList(),
)

@Serializable
data class HrLeaveCycleDto(
    val id: String = "",
    /** Cycle label verbatim, e.g. "Mar 2019 – Aug 2019". */
    val period: String = "",
    val status: String? = null,
    val leaves: Double? = null,
    val remarks: String? = null,
)
