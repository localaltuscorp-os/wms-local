package com.altuscorp.altus.data.remote.dto

import kotlinx.serialization.Serializable

/**
 * GET /api/mobile/performance — the signed-in user's own PMS score: the 0–100
 * five-pillar performance summary that powers the web `/pms/[employeeId]`
 * detail page. Owner-scoped and read-only.
 *
 * `score` + `band` drive the hero ring; `pillars` the 5-pillar breakdown (each
 * with its sub-signal rates); `reviews` the monthly 360 cards; and the three
 * signal lists mirror the web's personal-goals + recognition/promotion rails.
 *
 * Mirrors the live route exactly (app/api/mobile/performance/route.ts).
 */
@Serializable
data class PerformanceDto(
    val generatedAt: String = "",
    val employee: PerformanceEmployeeDto = PerformanceEmployeeDto(),
    /** Overall 0–100 score. */
    val score: Int = 0,
    /** Band key: "strong" | "on_track" | "needs_focus". */
    val band: String = "needs_focus",
    val bandLabel: String = "",
    val promotion: PerformancePromotionDto = PerformancePromotionDto(),
    val pillars: List<PerformancePillarDto> = emptyList(),
    val reviews: List<PerformanceReviewDto> = emptyList(),
    val reviewCount: Int = 0,
    val personalGoals: List<PerformanceGoalDto> = emptyList(),
    val recognition: List<PerformanceRecognitionDto> = emptyList(),
    val promotionSignals: List<PerformancePromotionSignalDto> = emptyList(),
)

@Serializable
data class PerformanceEmployeeDto(
    val name: String = "",
    val department: String? = null,
    val avatarUrl: String? = null,
    /** Days since joining. */
    val tenureDays: Int = 0,
)

@Serializable
data class PerformancePromotionDto(
    val eligible: Boolean = false,
    val rationale: String = "",
)

/** One of the five pillars. [rate] is 0..1 or null when the pillar has no data. */
@Serializable
data class PerformancePillarDto(
    val key: String = "",
    val name: String = "",
    val hint: String? = null,
    /** Pillar weight in the blend (e.g. 50, 20, 10). */
    val weight: Double = 0.0,
    /** 0..1 achievement, or null (no data → excluded from the score). */
    val rate: Double? = null,
    val subSignals: List<PerformanceSubSignalDto> = emptyList(),
)

@Serializable
data class PerformanceSubSignalDto(
    val key: String = "",
    val label: String = "",
    /** 0..1, or null when this sub-signal has no data. */
    val rate: Double? = null,
)

/** One monthly 360 review entry (manager / subordinate / peer / self). */
@Serializable
data class PerformanceReviewDto(
    val id: String = "",
    val relation: String = "",
    val relationLabel: String = "",
    val reviewerName: String? = null,
    val period: String = "",
    /** "internal" | "external". */
    val scope: String = "internal",
    /** 1..5 ratings, or null when unrated. */
    val attitude: Int? = null,
    val behaviour: Int? = null,
    val skill: Int? = null,
    val changeTags: List<String> = emptyList(),
    val explanation: String? = null,
)

@Serializable
data class PerformanceGoalDto(
    val id: String = "",
    val period: String = "",
    val title: String = "",
    val detail: String? = null,
    /** "active" | "done" | "dropped". */
    val status: String = "active",
    val position: Int = 0,
)

@Serializable
data class PerformanceRecognitionDto(
    val id: String = "",
    val period: String = "",
    val kind: String = "",
    val reason: String? = null,
    /** "suggested" | "released" | "dismissed". */
    val status: String = "suggested",
    val scoreSnapshot: Int? = null,
    /** Pre-formatted en-IN date, or null. */
    val releasedAt: String? = null,
)

@Serializable
data class PerformancePromotionSignalDto(
    val id: String = "",
    /** "flagged" | "acknowledged" | "actioned" | "dismissed". */
    val status: String = "flagged",
    val rationale: String? = null,
    val scoreSnapshot: Int? = null,
    /** Pre-formatted en-IN dates, or null. */
    val eligibleSince: String? = null,
    val decidedAt: String? = null,
)
