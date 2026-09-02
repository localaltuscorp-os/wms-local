package com.altuscorp.altus.data.remote.dto

import kotlinx.serialization.Serializable

/**
 * GET /api/mobile/signals — the signed-in user's OWN performance signals feed:
 * the recognition suggested/released for them and the promotion signals flagged
 * against them (the owner-scoped slice of the web admin `/pms/signals` console).
 *
 * `summary` folds the two lists into the hero counts; the lists carry raw
 * `period` (`YYYY-MM`) and ISO timestamps that the ViewModel formats — the DTO
 * never pre-formats. Mirrors the live route exactly (app/api/mobile/signals/route.ts).
 */
@Serializable
data class SignalsDto(
    val ownerName: String = "",
    val summary: SignalsSummaryDto = SignalsSummaryDto(),
    val recognitions: List<RecognitionDto> = emptyList(),
    val promotions: List<PromotionSignalDto> = emptyList(),
)

@Serializable
data class SignalsSummaryDto(
    val recognitionsReceived: Int = 0,
    val recognitionsReleased: Int = 0,
    val promotionSignals: Int = 0,
    val promotionFlagged: Int = 0,
)

/** One recognition suggested/released for the viewer. */
@Serializable
data class RecognitionDto(
    val id: String = "",
    /** e.g. "Spot award", "Star performer" — display-only. */
    val kind: String = "",
    /** The cycle this recognises, `YYYY-MM`. */
    val period: String = "",
    val reason: String? = null,
    /** Score-engine snapshot at suggestion time, or null. */
    val scoreSnapshot: Double? = null,
    /** "suggested" | "released" | "dismissed". */
    val status: String = "",
    val releasedByName: String? = null,
    /** ISO-8601, or null while still suggested. */
    val releasedAt: String? = null,
    val createdAt: String = "",
)

/** One promotion signal flagged against the viewer. */
@Serializable
data class PromotionSignalDto(
    val id: String = "",
    /** Score-engine snapshot at flag time, or null. */
    val scoreSnapshot: Double? = null,
    /** ISO-8601 date the tenure/score threshold was crossed, or null. */
    val eligibleSince: String? = null,
    val rationale: String? = null,
    /** "flagged" | "acknowledged" | "actioned" | "dismissed". */
    val status: String = "",
    val decidedByName: String? = null,
    /** ISO-8601, or null while still flagged. */
    val decidedAt: String? = null,
    val createdAt: String = "",
)
