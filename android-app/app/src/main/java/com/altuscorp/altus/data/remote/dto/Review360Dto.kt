package com.altuscorp.altus.data.remote.dto

import kotlinx.serialization.Serializable

/**
 * GET /api/mobile/review-360 — the signed-in user's Monthly 360 read surface
 * (Employees workspace). Everyone the user may review this cycle, each flagged
 * [Review360PersonDto.done] with its prior ratings, the user's own Personal
 * Goals, and the "what needs to change" tag vocabulary.
 *
 * Read-only: the rating write stays on the web form. Mirrors the live route
 * exactly (app/api/mobile/review-360/route.ts).
 */
@Serializable
data class Review360Dto(
    /** The open cycle, `YYYY-MM`. */
    val period: String = "",
    /** Human label for the cycle, e.g. "July 2026". */
    val periodLabel: String = "",
    /** The fixed "what needs to change" vocabulary (display-only here). */
    val changeTags: List<String> = emptyList(),
    val reviewedCount: Int = 0,
    val totalCount: Int = 0,
    val people: List<Review360PersonDto> = emptyList(),
    val personalGoals: List<Review360GoalDto> = emptyList(),
)

/** One reviewable person with the relation the user holds toward them. */
@Serializable
data class Review360PersonDto(
    val id: String = "",
    val name: String = "",
    val avatarUrl: String? = null,
    val department: String? = null,
    /** "manager" (you manage them), "subordinate" (they manage you), "peer". */
    val relation: String = "peer",
    /** Whether the user has already reviewed this person this cycle. */
    val done: Boolean = false,
    /** The ratings already left, when [done]. */
    val prior: Review360PriorDto? = null,
)

/** A prior review's inline ratings (3–5 scale) + notes. */
@Serializable
data class Review360PriorDto(
    val attitude: Int? = null,
    val behaviour: Int? = null,
    val skill: Int? = null,
    val changeTags: List<String> = emptyList(),
    val explanation: String? = null,
    /** "internal" | "external". */
    val scope: String = "internal",
)

/** One of the user's up-to-3 Personal (non-work) goals for the cycle. */
@Serializable
data class Review360GoalDto(
    val title: String = "",
    val detail: String = "",
    /** "active" | "done" | "dropped". */
    val status: String = "active",
)
