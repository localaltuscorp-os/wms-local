package com.altuscorp.altus.data.remote.dto

import kotlinx.serialization.Serializable

/**
 * Weekly-goals BOARD DTOs for the read endpoint
 *   GET /api/mobile/weekly-goals/board[?week=YYYY-MM-DD]
 *
 * The signed-in user's own per-week goal cards — a read-only mirror of the web
 * `/weekly-goals` page: each goal's client/subject, target, weight, status and
 * effective %Done (manager-accepted `acceptPct` when reviewed, else `pctDone`),
 * with the per-week weighted score and the 100-point weight budget.
 *
 * `statusDisplay` is SERVER-DRIVEN ({ label, color-token }) — the client never
 * hard-codes a status label or colour; [StatusDisplayDto] is reused from the
 * task DTOs. Mirrors the route exactly (app/api/mobile/weekly-goals/board).
 */
@Serializable
data class WeeklyGoalsBoardDto(
    /** `YYYY-MM-DD` Monday of the viewed week. */
    val weekStart: String = "",
    /** "Jun 30 – Jul 6, 2026" — display label for the week. */
    val weekLabel: String = "",
    val isCurrentWeek: Boolean = true,
    /** `YYYY-MM-DD` Mondays for the pager. */
    val prevWeek: String = "",
    val nextWeek: String = "",
    val thisWeek: String = "",
    val ownerName: String = "",
    /** Weight-aware weekly score, 0–100. */
    val weeklyScore: Int = 0,
    /** Live weight total over this week's planning-home active goals. */
    val weightTotal: Int = 0,
    /** The per-person weight budget every week must land on (100). */
    val weightBudget: Int = 100,
    val statusDisplay: Map<String, StatusDisplayDto> = emptyMap(),
    val goals: List<WeeklyGoalDto> = emptyList(),
)

/** One goal card (owner-scoped, active/non-archived). */
@Serializable
data class WeeklyGoalDto(
    val id: String = "",
    val position: Int = 0,
    /** targetDone, else "client · subject", else "Untitled goal". */
    val title: String = "",
    val client: String? = null,
    val subject: String? = null,
    val targetDone: String? = null,
    val priority: String = "",
    /** Server status key — resolve label/colour via [WeeklyGoalsBoardDto.statusDisplay]. */
    val status: String = "",
    /** This goal's share of the weekly weighted-completion score. */
    val weight: Int = 0,
    /** Per-goal target date `YYYY-MM-DD`, or null. */
    val targetDate: String? = null,
    /** The doer's own reported %Done (0–100). */
    val pctDone: Int = 0,
    /** Manager-accepted %Done (0–100), or null when not yet reviewed. */
    val acceptPct: Int? = null,
    /** effective % = acceptPct ?? pctDone (the number the card renders). */
    val effectivePct: Int = 0,
    /** True once a manager has set [acceptPct]. */
    val reviewed: Boolean = false,
    /** effective % ≥ 100. */
    val complete: Boolean = false,
    val notes: String? = null,
    val incentive: Boolean = false,
    /** Pre-formatted incentive chip ("Routine incentive · ₹5,000"), or null. */
    val incentiveLabel: String? = null,
    /** Carried over from a prior week. */
    val carried: Boolean = false,
)
