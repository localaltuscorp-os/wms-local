package com.altuscorp.altus.data.remote.dto

import kotlinx.serialization.Serializable

/**
 * Inbox DTOs (canonical S10) for the NEW endpoints
 *   GET  /api/mobile/notifications[?before=ISO][&limit=n]
 *   POST /api/mobile/notifications/read
 *
 * Not live server-side yet (P1 ask). Shapes mirror
 * lib/queries/notifications.ts (`InboxNotificationRow`,
 * `ListInboxNotificationsResult`, `getUnreadCount`, `markRead`, `markAllRead`).
 */
@Serializable
data class NotificationsDto(
    val notifications: List<NotificationDto> = emptyList(),
    /** ISO instant of the oldest row in this page — pass back as `?before=`. */
    val nextCursor: String? = null,
    val hasMore: Boolean = false,
    /** For the bell badge (mono count, never a dot). */
    val unreadCount: Int = 0,
)

/** Mirrors web `InboxNotificationRow` (recipient-scoped fields only). */
@Serializable
data class NotificationDto(
    val id: String = "",
    val taskId: String? = null,
    /** Server notification kind (e.g. "task_assigned") — drives the row glyph. */
    val kind: String = "",
    val title: String = "",
    val body: String? = null,
    val actorName: String? = null,
    val taskTitle: String? = null,
    val taskSubject: String? = null,
    val taskStatus: String? = null,
    /** ISO instant when read; null = unread (evergreen dot). */
    val readAt: String? = null,
    val createdAt: String = "",
    /** `altus://` deep link for tap-through (every FCM payload carries one). */
    val link: String? = null,
)

/**
 * POST /api/mobile/notifications/read — mark one (`id`) or all (`all: true`)
 * notifications read. Idempotent, recipient-scoped server-side.
 */
@Serializable
data class MarkReadRequestDto(
    val id: String? = null,
    val all: Boolean = false,
)
