package com.altuscorp.altus.data.remote.dto

import kotlinx.serialization.Serializable

/**
 * GET /api/mobile/incentive[?year=YYYY] — the signed-in user's OWN incentive
 * analytics for one calendar year: YTD earned / paid / unpaid + target
 * attainment, the merged permanent-ledger + project-leg lines that make up the
 * total, and their filed incentive requests (newest first).
 *
 * Owner-scoped — never the team roll-up. Mirrors the live route exactly
 * (app/api/mobile/incentive/route.ts).
 */
@Serializable
data class IncentiveDto(
    /** The year this payload covers. */
    val year: Int = 0,
    /** Selectable years for the picker (current + trailing window), newest first. */
    val years: List<Int> = emptyList(),
    val ownerName: String = "",
    val totals: IncentiveTotalsDto = IncentiveTotalsDto(),
    val lines: List<IncentiveLineDto> = emptyList(),
    val requests: List<IncentiveRequestDto> = emptyList(),
)

@Serializable
data class IncentiveTotalsDto(
    /** Approved (earned) YTD across permanent + project. */
    val earned: Double = 0.0,
    val paid: Double = 0.0,
    val unpaid: Double = 0.0,
    /** Sum of the user's incentive targets for the year (0 when none set). */
    val target: Double = 0.0,
    /** earned / target × 100, or null when no target is set. */
    val attainmentPct: Double? = null,
)

/** One ledger line — a permanent-entry row or a project leg the user played. */
@Serializable
data class IncentiveLineDto(
    val id: String = "",
    /** Incentive name or project name. */
    val label: String = "",
    /** Pre-built meta ("Jun 2026 · Permanent" / "May 2026 · Supervisor"). */
    val sub: String = "",
    val approved: Double = 0.0,
    val paid: Double = 0.0,
    val unpaid: Double = 0.0,
    /** True when fully settled (approved > 0 and paid ≥ approved). */
    val isPaid: Boolean = false,
)

/** One filed incentive request with its decision status. */
@Serializable
data class IncentiveRequestDto(
    val id: String = "",
    /** Humanised type ("BSS Conversion", "Client Happiness"). */
    val title: String = "",
    /** Raw status token: "pending" | "approved" | "rejected". */
    val status: String = "",
    /** Display label for [status] ("Pending", "Approved", "Rejected"). */
    val statusLabel: String = "",
    /** ISO-8601 instant the request was filed. */
    val createdAt: String = "",
    val decisionNote: String? = null,
)
