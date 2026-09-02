package com.altuscorp.altus.data.remote.dto

import kotlinx.serialization.Serializable

/**
 * DTOs for GET /api/mobile/tasks/kanban — the owner-scoped status board (the
 * mobile rendition of the web `/tasks/kanban` page).
 *
 * `statusDisplay` and `columns` are SERVER-DRIVEN: the column order, and every
 * column's label + colour token, come from the server (mirrors the web board's
 * `columnOrder` + `statusDisplay`) — the client never hard-codes a status
 * label, a colour, or the column ordering. `color` is a token resolved by the
 * UI's StatusColorResolver against AltusTokens.
 *
 * Mirrors the live route exactly (app/api/mobile/tasks/kanban).
 */
@Serializable
data class KanbanResponseDto(
    /** The synthetic Archived-column sentinel (`__archived__`); archived cards
     *  route here regardless of their status. */
    val archiveColumnId: String = "__archived__",
    /** Ordered column ids: status values plus the [archiveColumnId] sentinel. */
    val columns: List<String> = emptyList(),
    /** status → {label, colour-token}. No entry for the archive sentinel. */
    val statusDisplay: Map<String, StatusDisplayDto> = emptyMap(),
    val tasks: List<KanbanTaskDto> = emptyList(),
)

/** One board card. `dueAt` is the EFFECTIVE due (revised ?? original), ISO-8601. */
@Serializable
data class KanbanTaskDto(
    val id: String = "",
    val taskNo: Int? = null,
    val title: String = "",
    val subject: String? = null,
    val client: String? = null,
    val status: String = "",
    val priority: String = "",
    /** Archived cards land in the Archived column, dropped from their status one. */
    val archived: Boolean = false,
    /** ISO instant — effective due date, used for the due phrase + overdue flag. */
    val dueAt: String = "",
    /** ISO instant — last-touched (drives completed-first + freshness ordering). */
    val updatedAt: String = "",
    val completedAt: String? = null,
)
