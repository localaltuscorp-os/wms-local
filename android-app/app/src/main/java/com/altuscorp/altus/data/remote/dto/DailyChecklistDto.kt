package com.altuscorp.altus.data.remote.dto

import kotlinx.serialization.Serializable

/**
 * Daily Checklist DTOs for `/api/mobile/daily-checklist` — web parity with
 * `app/(app)/daily-checklist/page.tsx` (DailyChecklistView, mode="page") /
 * `components/daily-checklist/day-ledger.tsx`. Shapes mirror the web queries
 * (lib/queries/daily-checklist.ts: DailyItem, OverdueItem, PullableGoal).
 *
 * Both GET and every POST mutation return this SAME full-board shape — the
 * simplest, most robust contract for the native client: replace state, never
 * hand-patch a list.
 */
@Serializable
data class DailyChecklistDto(
    val ok: Boolean = true,
    /** "4 July 2026" (IST), server-formatted — no client hydration drift. */
    val date: String = "",
    /** "Saturday" (IST weekday), server-formatted. */
    val weekday: String = "",
    /** MIN_DAILY_ITEMS — the "day is planned" threshold. */
    val minItems: Int = 5,
    /** Today's committed items — manager-assigned tasks FOLLOWED BY personal items. */
    val items: List<DailyChecklistItemDto> = emptyList(),
    /** Unfinished items rolled over from earlier days ("carry forward" strip). */
    val overdue: List<OverdueChecklistItemDto> = emptyList(),
    /** Current-week goals not yet pulled into today — the "pull from goals" rail. */
    val pullable: List<PullableGoalDto> = emptyList(),
)

/** Mirrors web `DailyItem`. */
@Serializable
data class DailyChecklistItemDto(
    val id: String = "",
    /** "assigned" (live task, id === task id) | "personal" (own checklist row). */
    val source: String = "personal",
    val title: String = "",
    val client: String? = null,
    val subject: String? = null,
    /** "goal_related" | "standalone". */
    val origin: String = "standalone",
    val goalId: String? = null,
    val taskId: String? = null,
    val taskNo: Int? = null,
    /** ISO instant, assigned items only. */
    val dueAt: String? = null,
    /** TaskStatus string ("not_started" | "in_progress" | "done" | …). */
    val status: String = "not_started",
    val done: Boolean = false,
    val doneNote: String? = null,
    /** Original plan_date, set once a personal item is carried forward. */
    val movedFromDate: String? = null,
    val position: Int = 0,
)

/** Mirrors web `OverdueItem`. */
@Serializable
data class OverdueChecklistItemDto(
    val id: String = "",
    val title: String = "",
    val client: String? = null,
    val subject: String? = null,
    /** "goal_related" | "standalone". */
    val origin: String = "standalone",
    val goalId: String? = null,
    /** `YYYY-MM-DD` — the day this item was originally planned for. */
    val planDate: String = "",
)

/**
 * POST /api/mobile/daily-checklist — one action-discriminated body for every
 * mutation. Exactly the fields that action needs are read server-side; the
 * rest are ignored.
 */
@Serializable
data class DailyChecklistActionRequestDto(
    /** "add" | "close" | "remove" | "carryForward" | "taskDone". */
    val action: String,
    /** add: ad-hoc personal item title. */
    val title: String? = null,
    /** add: pull a weekly goal. */
    val goalId: String? = null,
    /** add / taskDone: the task id. */
    val taskId: String? = null,
    /** close / remove: the daily_checklist row id. */
    val itemId: String? = null,
    /** close / taskDone: mark done or reopen. */
    val done: Boolean? = null,
    /** close: optional close-out note. */
    val note: String? = null,
)
