package com.altuscorp.altus.data.remote.dto

import kotlinx.serialization.Serializable

/**
 * Task DTOs for GET /api/mobile/tasks, GET /api/mobile/tasks/{id},
 * POST /api/mobile/tasks, POST /api/mobile/tasks/{id}/status and
 * POST /api/mobile/tasks/{id}/comment.
 *
 * `statusDisplay` and `allowedTransitions` are SERVER-DRIVEN: no status label,
 * colour or transition rule is ever hard-coded client-side. `color` is a token
 * string resolved by the UI's StatusColorResolver against AltusTokens.
 *
 * Mirrors the live routes exactly (app/api/mobile/tasks).
 */

/** One entry of the server's status → {label, color-token} map. */
@Serializable
data class StatusDisplayDto(
    val label: String = "",
    /** Server colour token (e.g. "emerald", "amber") — never a hex client-side. */
    val color: String = "",
)

/** GET /api/mobile/tasks response envelope. */
@Serializable
data class TaskListResponseDto(
    val statusDisplay: Map<String, StatusDisplayDto> = emptyMap(),
    val tasks: List<TaskSummaryDto> = emptyList(),
)

/** One list row. `dueAt` is the EFFECTIVE due (revised ?? original), ISO-8601. */
@Serializable
data class TaskSummaryDto(
    val id: String = "",
    val taskNo: Int? = null,
    val title: String = "",
    val subject: String? = null,
    val client: String? = null,
    val status: String = "",
    val priority: String = "",
    /** ISO instant — effective due date, used for sorting + overdue flags. */
    val dueAt: String = "",
    /** ISO instant — the optimistic-lock token for the status call. */
    val updatedAt: String = "",
    val completedAt: String? = null,
    /** Legal next statuses for THIS user from the permission matrix. */
    val allowedTransitions: List<String> = emptyList(),
)

/** GET /api/mobile/tasks/{id} response envelope. */
@Serializable
data class TaskDetailResponseDto(
    val task: TaskDetailDto = TaskDetailDto(),
    val statusDisplay: Map<String, StatusDisplayDto> = emptyMap(),
    val allowedTransitions: List<String> = emptyList(),
    val canComment: Boolean = false,
    val timeline: List<TimelineEventDto> = emptyList(),
)

@Serializable
data class TaskDetailDto(
    val id: String = "",
    val taskNo: Int? = null,
    val title: String = "",
    val subject: String? = null,
    val client: String? = null,
    val description: String? = null,
    val notes: String? = null,
    val status: String = "",
    val priority: String = "",
    val approvalStatus: String? = null,
    /** ORIGINAL due — immutable per the due-date rule. ISO instant. */
    val dueAt: String? = null,
    /** Revised target (shown as `info` "Revised → …" beneath the original). */
    val revisedTargetDate: String? = null,
    val createdAt: String? = null,
    val completedAt: String? = null,
    /** Optimistic-lock token for status changes. */
    val updatedAt: String? = null,
    val doerName: String? = null,
    val initiatorName: String? = null,
    val creatorName: String? = null,
)

/** One audit-timeline event (S7 thread). */
@Serializable
data class TimelineEventDto(
    val id: String = "",
    val actorName: String? = null,
    val eventType: String = "",
    val note: String? = null,
    val fromValue: String? = null,
    val toValue: String? = null,
    val createdAt: String = "",
)

/** POST /api/mobile/tasks body (S6 New Task). */
@Serializable
data class CreateTaskRequestDto(
    val title: String,
    val doerId: String,
    val initiatorId: String? = null,
    val priority: String,
    /** ISO instant. */
    val dueAt: String,
    val subject: String? = null,
    val description: String? = null,
)

@Serializable
data class CreateTaskResponseDto(
    val ok: Boolean = false,
    /** The created task's id. */
    val id: String? = null,
)

/** POST /api/mobile/tasks/{id}/status body. */
@Serializable
data class StatusChangeRequestDto(
    val status: String,
    /** The `updatedAt` the client last saw — 409 `stale` on mismatch. */
    val expectedUpdatedAt: String,
    val note: String? = null,
)

/** Returns the fresh lock token so the client can keep editing. */
@Serializable
data class StatusChangeResponseDto(
    val ok: Boolean = false,
    val updatedAt: String? = null,
)

/** POST /api/mobile/tasks/{id}/comment body. */
@Serializable
data class CommentRequestDto(
    val body: String,
)
