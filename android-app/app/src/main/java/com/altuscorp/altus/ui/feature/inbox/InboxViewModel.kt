package com.altuscorp.altus.feature.inbox

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.altuscorp.altus.core.network.ApiResult
import com.altuscorp.altus.core.util.DateFormat
import com.altuscorp.altus.data.repository.NotificationRepository
import com.altuscorp.altus.domain.model.Notification
import com.altuscorp.altus.domain.model.NotificationPage
import com.altuscorp.altus.navigation.DeepLinks
import dagger.hilt.android.lifecycle.HiltViewModel
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import javax.inject.Inject
import kotlinx.collections.immutable.toImmutableList
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * S10 Inbox ViewModel.
 *
 * The cached first page ([NotificationRepository.inbox]) paints instantly and
 * carries the server-authoritative unread count; older pages are streamed
 * uncached through [NotificationRepository.loadMore] and merged in the
 * [Runtime] holder. Mark-read is optimistic (the repo clears the cached dot;
 * we also patch any loaded older page locally so the row settles on the same
 * frame). Everything is formatted here — grouping by local day, mono times,
 * kind classification, deep-link resolution — so the screen stays a dumb render.
 */
@HiltViewModel
class InboxViewModel @Inject constructor(
    private val repository: NotificationRepository,
) : ViewModel() {

    /** Latest cached first page (also the source of the base cursor/hasMore). */
    private val firstPage = MutableStateFlow<NotificationPage?>(null)

    /** Pagination + transient status not owned by the cache. */
    private data class Runtime(
        val isRefreshing: Boolean = false,
        val loadFailed: Boolean = false,
        val refreshFailed: Boolean = false,
        val isLoadingMore: Boolean = false,
        val loadMoreFailed: Boolean = false,
        /** Older, uncached notifications already pulled behind the cursor. */
        val older: List<Notification> = emptyList(),
        /** Cursor for the next `?before=` fetch; null once a page said "no more". */
        val cursor: String? = null,
        /** Set once at least one older page has been fetched; else defer to the
         *  first page's hasMore. */
        val hasMoreOverride: Boolean? = null,
    )

    private val runtime = MutableStateFlow(Runtime())

    val uiState: StateFlow<InboxUiState> = combine(firstPage, runtime) { page, rt ->
        if (page == null) {
            // Cold cache: skeleton until the first fetch resolves, retry on fail.
            InboxUiState(
                isLoading = !rt.loadFailed,
                isRefreshing = rt.isRefreshing,
                loadFailed = rt.loadFailed,
            )
        } else {
            buildState(page, rt)
        }
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5_000),
        initialValue = InboxUiState(),
    )

    init {
        // Mirror the cache into firstPage so loadMore can read its cursor.
        viewModelScope.launch {
            repository.inbox().collect { firstPage.value = it }
        }
        refresh()
    }

    fun onIntent(intent: InboxIntent) {
        when (intent) {
            InboxIntent.Refresh, InboxIntent.Retry -> refresh()
            InboxIntent.LoadMore -> loadMore()
            InboxIntent.MarkAllRead -> markAllRead()
            is InboxIntent.MarkRead -> markRead(intent.id)
        }
    }

    private fun refresh() {
        if (runtime.value.isRefreshing) return
        runtime.update {
            it.copy(isRefreshing = true, loadFailed = false, refreshFailed = false)
        }
        viewModelScope.launch {
            when (repository.refresh()) {
                is ApiResult.Success ->
                    // A fresh newest page invalidates any older-page cursor.
                    runtime.update {
                        it.copy(
                            isRefreshing = false,
                            older = emptyList(),
                            cursor = null,
                            hasMoreOverride = null,
                            loadMoreFailed = false,
                        )
                    }
                else -> runtime.update {
                    it.copy(isRefreshing = false, loadFailed = true, refreshFailed = true)
                }
            }
        }
    }

    private fun loadMore() {
        val rt = runtime.value
        if (rt.isLoadingMore) return
        val cursor = rt.cursor ?: firstPage.value?.nextCursor ?: return
        val hasMore = rt.hasMoreOverride ?: firstPage.value?.hasMore ?: false
        if (!hasMore) return

        runtime.update { it.copy(isLoadingMore = true, loadMoreFailed = false) }
        viewModelScope.launch {
            when (val result = repository.loadMore(before = cursor)) {
                is ApiResult.Success -> runtime.update {
                    it.copy(
                        isLoadingMore = false,
                        older = it.older + result.data.items,
                        cursor = result.data.nextCursor,
                        hasMoreOverride = result.data.hasMore,
                    )
                }
                else -> runtime.update {
                    it.copy(isLoadingMore = false, loadMoreFailed = true)
                }
            }
        }
    }

    private fun markRead(id: String) {
        // Optimistically clear the dot on any *older* (uncached) row too; the
        // repo handles the cached first page + the inline POST.
        val now = Instant.now()
        runtime.update { rt ->
            if (rt.older.none { it.id == id && it.isUnread }) rt
            else rt.copy(
                older = rt.older.map { if (it.id == id && it.isUnread) it.copy(readAt = now) else it },
            )
        }
        viewModelScope.launch { repository.markRead(id) }
    }

    private fun markAllRead() {
        if (uiState.value.unreadCount == 0) return
        val now = Instant.now()
        runtime.update { rt ->
            rt.copy(older = rt.older.map { if (it.isUnread) it.copy(readAt = now) else it })
        }
        viewModelScope.launch { repository.markAllRead() }
    }

    // ─── Mapping ────────────────────────────────────────────────────────────

    private fun buildState(page: NotificationPage, rt: Runtime): InboxUiState {
        val zone = ZoneId.systemDefault()
        val today = LocalDate.now(zone)
        val now = Instant.now()

        // First page wins on id collisions so an optimistic-read row stays read.
        val merged = (page.items + rt.older).distinctBy { it.id }

        // Group by local day, preserving newest-first encounter order.
        val groups = merged
            .groupBy { it.createdAt.atZone(zone).toLocalDate() }
            .entries
            .sortedByDescending { it.key }
            .map { (date, notifications) ->
                InboxDayGroup(
                    key = DateFormat.dayKey(date),
                    header = DateFormat.dayHeader(date, today),
                    rows = notifications
                        .map { it.toRow(zone = zone) }
                        .toImmutableList(),
                )
            }
            .toImmutableList()

        val hasMore = rt.hasMoreOverride ?: page.hasMore
        return InboxUiState(
            isLoading = false,
            isRefreshing = rt.isRefreshing,
            loadFailed = false,
            refreshFailed = rt.refreshFailed,
            groups = groups,
            unreadCount = page.unreadCount,
            isLoadingMore = rt.isLoadingMore,
            loadMoreFailed = rt.loadMoreFailed,
            hasMore = hasMore,
        )
    }

    private fun Notification.toRow(zone: ZoneId): InboxRow = InboxRow(
        id = id,
        category = InboxCategory.fromKind(kind),
        title = title,
        context = contextLine(),
        timeLabel = DateFormat.time(createdAt, zone),
        isUnread = isUnread,
        deepLink = resolveDeepLink(),
    )

    /** Quiet second line: prefer the explicit body, else synthesise actor · task. */
    private fun Notification.contextLine(): String? {
        body?.takeIf { it.isNotBlank() }?.let { return it }
        val task = taskTitle?.takeIf { it.isNotBlank() }
        val actor = actorName?.takeIf { it.isNotBlank() }
        return when {
            actor != null && task != null -> "$actor · $task"
            task != null -> task
            actor != null -> actor
            else -> null
        }
    }

    /** The row's tap target: the server's link, else a task deep-link, else none. */
    private fun Notification.resolveDeepLink(): String? {
        link?.takeIf { it.isNotBlank() }?.let { return it }
        return taskId?.takeIf { it.isNotBlank() }?.let { "${DeepLinks.TASK_BASE}/$it" }
    }
}
