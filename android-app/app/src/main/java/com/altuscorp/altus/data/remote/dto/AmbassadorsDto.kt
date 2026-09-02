package com.altuscorp.altus.data.remote.dto

import kotlinx.serialization.Serializable

/**
 * GET /api/mobile/ambassadors — the Sales "Partner Intelligence" surface: the
 * executive roll-up (KPI metrics + referral-pipeline funnel) plus the full
 * partner registry with each ambassador's referral / conversion / revenue /
 * commission rollups, score-ranked.
 *
 * Mirrors the live route exactly (app/api/mobile/ambassadors/route.ts), which
 * reuses the web page's own `dashboardMetrics` + `listAmbassadors` queries.
 * Read-only — there are no mobile ambassador commits.
 */
@Serializable
data class AmbassadorsDto(
    val ownerName: String = "",
    val metrics: AmbMetricsDto = AmbMetricsDto(),
    val funnel: List<AmbFunnelStageDto> = emptyList(),
    val ambassadors: List<AmbassadorRowDto> = emptyList(),
)

/** The five executive KPIs the web dashboard's tile strip shows. */
@Serializable
data class AmbMetricsDto(
    val activeAmbassadors: Int = 0,
    val totalReferrals: Int = 0,
    val convertedReferrals: Int = 0,
    /** 0..1 ratio. */
    val conversionRate: Double = 0.0,
    /** Revenue driven by won referrals (rupees). */
    val revenue: Double = 0.0,
    /** Commission owed but not yet paid (rupees). */
    val commissionPending: Double = 0.0,
    val commissionPaid: Double = 0.0,
)

/** One stage bar of the referral pipeline funnel. */
@Serializable
data class AmbFunnelStageDto(
    /** Raw stage token ("received", "won", "lost", …). */
    val stage: String = "",
    /** Display label ("Received", "Won", "Lost", …). */
    val label: String = "",
    val count: Int = 0,
)

/** One partner registry row with its per-ambassador rollups. */
@Serializable
data class AmbassadorRowDto(
    val id: String = "",
    val name: String = "",
    val company: String? = null,
    val photoUrl: String? = null,
    /** Tier token ("platinum" | "gold" | "silver" | "bronze" | null). */
    val tier: String? = null,
    /** Lifecycle status ("active" | "paused" | …). */
    val status: String = "",
    val partnerScore: Double? = null,
    val referrals: Int = 0,
    val converted: Int = 0,
    val revenue: Double = 0.0,
    val commissionPending: Double = 0.0,
    val commissionPaid: Double = 0.0,
)
