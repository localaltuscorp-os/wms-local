package com.altuscorp.altus.data.remote.dto

import kotlinx.serialization.Serializable

/**
 * GET /api/mobile/salary — the signed-in user's own payslip history: net pay +
 * the full component breakdown + the sheet's own attendance figures, one entry
 * per imported month (newest first).
 *
 * Mirrors the live route exactly (app/api/mobile/salary/route.ts). Owner-scoped
 * server-side; the app only ever renders its own rows.
 */
@Serializable
data class SalaryDto(
    val ownerName: String = "",
    val currency: String = "INR",
    val months: List<SalaryMonthDto> = emptyList(),
)

/** One month's payslip — amounts are plain numbers (the server folds numeric→number). */
@Serializable
data class SalaryMonthDto(
    /** `YYYY-MM` — the stable identity + selection key. */
    val month: String = "",
    /** Server-formatted "June 2026". */
    val monthLabel: String = "",
    val designation: String? = null,
    val companyName: String? = null,
    // Attendance figures — the sheet's own, not the app's punch ledger.
    val present: Double = 0.0,
    val absent: Double = 0.0,
    val halfDay: Double = 0.0,
    val weeklyOff: Double = 0.0,
    val totalDaysWorked: Double = 0.0,
    val finalWorkingDays: Double = 0.0,
    // The pay ladder.
    val monthlyCtc: Double = 0.0,
    val payableAfterLeave: Double = 0.0,
    val pt: Double = 0.0,
    val payableAfterPt: Double = 0.0,
    val advance: Double = 0.0,
    val previousPending: Double = 0.0,
    val finalPayment: Double = 0.0,
    val remarks: String? = null,
    val mananRemarks: String? = null,
)
