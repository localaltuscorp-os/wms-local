package com.altuscorp.altus.data.repository

import com.altuscorp.altus.core.network.AltusApi
import com.altuscorp.altus.core.network.ApiResult
import com.altuscorp.altus.core.network.map
import com.altuscorp.altus.core.network.safeApiCall
import com.altuscorp.altus.data.local.entity.CacheKeys
import com.altuscorp.altus.data.remote.dto.MarkReadRequestDto
import com.altuscorp.altus.data.remote.dto.NotificationsDto
import com.altuscorp.altus.domain.model.NotificationPage
import com.altuscorp.altus.domain.model.toDomain
import java.time.Instant
import javax.inject.Inject
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map

/**
 * The S10 inbox over the NEW `/api/mobile/notifications` endpoints. The FIRST
 * page is the cached snapshot (the inbox paints instantly, the bell badge is
 * always answerable offline); older pages stream through [loadMore] without
 * touching the snapshot. Mark-read is optimistic-in-cache with an inline POST
 * — read-receipts are not an outbox [MutationKind], so a failure simply
 * re-fetches instead of dead-lettering.
 */
interface NotificationRepository {

    /** Live decoded first page; null on a true cold cache. */
    fun inbox(): Flow<NotificationPage?>

    /** The bell badge (mono count, never a dot). 0 while cold. */
    fun unreadCount(): Flow<Int>

    /** Fetch the newest page, replace the snapshot. */
    suspend fun refresh(limit: Int = PAGE_SIZE): ApiResult<NotificationPage>

    /** Fetch one older page (`?before=` cursor). Not cached — feed the UI list. */
    suspend fun loadMore(before: String, limit: Int = PAGE_SIZE): ApiResult<NotificationPage>

    /** Mark one notification read — optimistic dot-clear, inline POST. */
    suspend fun markRead(id: String): ApiResult<Unit>

    /** Mark everything read — optimistic badge-clear, inline POST. */
    suspend fun markAllRead(): ApiResult<Unit>

    companion object {
        const val PAGE_SIZE = 30
    }
}

class NotificationRepositoryImpl @Inject constructor(
    private val api: AltusApi,
    private val cache: JsonCache,
) : NotificationRepository {

    override fun inbox(): Flow<NotificationPage?> =
        cache.observe(CacheKeys.NOTIFICATIONS, NotificationsDto.serializer())
            .map { it?.toDomain() }
            .distinctUntilChanged()

    override fun unreadCount(): Flow<Int> =
        cache.observe(CacheKeys.NOTIFICATIONS, NotificationsDto.serializer())
            .map { it?.unreadCount ?: 0 }
            .distinctUntilChanged()

    override suspend fun refresh(limit: Int): ApiResult<NotificationPage> {
        val result = safeApiCall { api.notifications(limit = limit) }
        if (result is ApiResult.Success) {
            cache.write(CacheKeys.NOTIFICATIONS, NotificationsDto.serializer(), result.data)
        }
        return result.map { it.toDomain() }
    }

    override suspend fun loadMore(before: String, limit: Int): ApiResult<NotificationPage> =
        safeApiCall { api.notifications(before = before, limit = limit) }
            .map { it.toDomain() }

    override suspend fun markRead(id: String): ApiResult<Unit> {
        val now = Instant.now().toString()
        cache.mutate(CacheKeys.NOTIFICATIONS, NotificationsDto.serializer()) { page ->
            val wasUnread = page.notifications.any { it.id == id && it.readAt == null }
            page.copy(
                notifications = page.notifications.map {
                    if (it.id == id && it.readAt == null) it.copy(readAt = now) else it
                },
                unreadCount = if (wasUnread) (page.unreadCount - 1).coerceAtLeast(0) else page.unreadCount,
            )
        }
        val result = safeApiCall { api.markNotificationsRead(MarkReadRequestDto(id = id)) }
        if (result !is ApiResult.Success) refresh()
        return result.map { }
    }

    override suspend fun markAllRead(): ApiResult<Unit> {
        val now = Instant.now().toString()
        cache.mutate(CacheKeys.NOTIFICATIONS, NotificationsDto.serializer()) { page ->
            page.copy(
                notifications = page.notifications.map {
                    if (it.readAt == null) it.copy(readAt = now) else it
                },
                unreadCount = 0,
            )
        }
        val result = safeApiCall { api.markNotificationsRead(MarkReadRequestDto(all = true)) }
        if (result !is ApiResult.Success) refresh()
        return result.map { }
    }
}
