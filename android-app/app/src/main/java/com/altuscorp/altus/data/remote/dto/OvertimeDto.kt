package com.altuscorp.altus.data.remote.dto

import kotlinx.serialization.Serializable

/**
 * GET /api/mobile/overtime — the signed-in user's OWN overtime ledger (Employees
 * workspace): their logged entries (newest work-date first) plus the KPI roll-up
 * the web `/overtime` page folds over the same rows (total / approved / pending
 * hours + this-month hours + pending count).
 *
 * Owner-scoped — never the team roll-up. Mirrors the live route exactly
 * (app/api/mobile/overtime/route.ts). Read-only: overtime is filed / approved on
 * the web, so there are no mobile commits.
 */
@Serializable
data class OvertimeDto(
    val ownerName: String = "",
    val totals: OvertimeTotalsDto = OvertimeTotalsDto(),
    val entries: List<OvertimeEntryDto> = emptyList(),
)

@Serializable
data class OvertimeTotalsDto(
    /** All logged overtime hours across every status. */
    val totalHours: Double = 0.0,
    /** Hours whose entry is approved. */
    val approvedHours: Double = 0.0,
    /** Hours still awaiting a decision. */
    val pendingHours: Double = 0.0,
    /** Hours logged in the current calendar month. */
    val monthHours: Double = 0.0,
    /** Count of entries still pending review. */
    val pendingCount: Int = 0,
    /** approvedHours / totalHours, or null when nothing is logged. */
    val approvedRate: Double? = null,
    /** How many entries make up [totalHours]. */
    val entryCount: Int = 0,
    /** "Jun 2026" — the current-month label for the KPI caption. */
    val monthLabel: String = "",
)

/** One overtime entry the user logged. */
@Serializable
data class OvertimeEntryDto(
    val id: String = "",
    /** `YYYY-MM-DD` — the day the extra hours were worked. */
    val workDate: String = "",
    val hours: Double = 0.0,
    /** Why the extra hours were put in (nullable). */
    val reason: String? = null,
    /** Raw status token: "pending" | "approved" | "rejected". */
    val status: String = "",
    /** Display label for [status] ("Pending", "Approved", "Rejected"). */
    val statusLabel: String = "",
    /** Who approved / rejected it, or null while pending. */
    val approvedByName: String? = null,
    /** ISO-8601 instant of the decision, or null while pending. */
    val approvedAt: String? = null,
    /** Reviewer's note left on the decision (nullable). */
    val note: String? = null,
    /** ISO-8601 instant the entry was filed. */
    val createdAt: String = "",
)
