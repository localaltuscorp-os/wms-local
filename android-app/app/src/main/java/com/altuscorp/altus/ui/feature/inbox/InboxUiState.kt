package com.altuscorp.altus.feature.inbox

import androidx.compose.runtime.Immutable
import kotlinx.collections.immutable.ImmutableList
import kotlinx.collections.immutable.persistentListOf

/**
 * S10 Inbox — the pushed notification ledger (off Today / the Hub).
 *
 * The screen is a pure render of one [Immutable] [InboxUiState]; all decisions
 * — day grouping, kind → glyph/accent classification, unread styling, mono
 * timestamps, deep-link resolution — are made in the ViewModel so the
 * composables stay dumb. Colors and vectors are *not* resolved here (no theme
 * in a ViewModel); each row carries an [InboxCategory] the screen maps to an
 * `AltusTokens` accent + a Lucide glyph, keeping the "no hex in composables"
 * law intact.
 */

/**
 * The visual family a notification belongs to — drives the accent-tinted glyph
 * (§1.1 module accents used as tint only, never text/fill). Resolved from the
 * server's `kind` string with resilient substring matching so a new server kind
 * never crashes or renders blank; unknowns fall to [General].
 */
enum class InboxCategory {
    /** Task assigned / status changed / commented / reassigned / nudged. */
    Task,

    /** Daily compliance reminders. */
    Dcc,

    /** Weekly-goals assign / fill-reminder / incomplete. */
    Goals,

    /** Attendance / punch / device notices. */
    Attendance,

    /** Digests & overdue roll-ups (dash accent). */
    Digest,

    /** Anything unrecognised — a plain bell on the dash accent. */
    General,
    ;

    companion object {
        /** Maps a raw server `kind` to a category. Order matters: the more
         *  specific module words are tested before the generic "reminder". */
        fun fromKind(kind: String): InboxCategory {
            val k = kind.lowercase()
            return when {
                k.contains("dcc") -> Dcc
                k.contains("goal") -> Goals
                k.contains("attendance") || k.contains("punch") || k.contains("device") -> Attendance
                k.contains("task") || k.contains("assign") || k.contains("status") ||
                    k.contains("comment") || k.contains("reassign") || k.contains("nudge") ||
                    k.contains("initiat") -> Task
                k.contains("digest") || k.contains("overdue") || k.contains("reminder") -> Digest
                else -> General
            }
        }
    }
}

/**
 * One pre-formatted inbox row. 64dp anatomy (S10): accent-tinted [category]
 * glyph, [title] `body-strong` one-liner, an optional quiet [context] second
 * line, a mono [timeLabel] on the right, and the [isUnread] dot + surface fill.
 */
@Immutable
data class InboxRow(
    /** Stable LazyColumn key (notification id). */
    val id: String,
    val category: InboxCategory,
    /** The one-liner headline (`body-strong`). */
    val title: String,
    /** Quiet second line — actor · task context — or null. */
    val context: String?,
    /** Mono "18:42" for the row's day. */
    val timeLabel: String,
    val isUnread: Boolean,
    /** The `altus://` target for tap-through, or null when there's nowhere to go. */
    val deepLink: String?,
)

/** A day bucket with its `caption` header ("Today" / "Yesterday" / "Mon, 30 Jun"). */
@Immutable
data class InboxDayGroup(
    /** Stable sticky-header key (ISO `yyyy-MM-dd`). */
    val key: String,
    val header: String,
    val rows: ImmutableList<InboxRow>,
)

/** The screen's single source of truth (Part 6: one @Immutable UiState). */
@Immutable
data class InboxUiState(
    /** True only while the cache is cold and the first fetch is in flight. */
    val isLoading: Boolean = true,
    /** Pull-to-refresh spinner. */
    val isRefreshing: Boolean = false,
    /** Cold cache AND the fetch failed → full-screen retry. */
    val loadFailed: Boolean = false,
    /** Content on screen but the reconcile failed → quiet stale banner. */
    val refreshFailed: Boolean = false,
    /** Newest-first, grouped by local day. */
    val groups: ImmutableList<InboxDayGroup> = persistentListOf(),
    /** Server-authoritative unread badge; also gates "mark all read". */
    val unreadCount: Int = 0,
    /** An older page is being fetched (footer spinner). */
    val isLoadingMore: Boolean = false,
    /** The last [loadMore] failed → footer offers a retry. */
    val loadMoreFailed: Boolean = false,
    /** More older pages exist behind the cursor. */
    val hasMore: Boolean = false,
) {
    val hasContent: Boolean get() = groups.isNotEmpty()
    val canMarkAll: Boolean get() = unreadCount > 0
}

/** Everything the screen can ask for (Part 6: one sealed intent). */
sealed interface InboxIntent {
    /** Pull-to-refresh reconcile. */
    data object Refresh : InboxIntent

    /** Retry after a cold-cache load failure. */
    data object Retry : InboxIntent

    /** Fetch the next older page (end-of-list reach or footer tap). */
    data object LoadMore : InboxIntent

    /** Optimistic dot-clear when a row is opened. */
    data class MarkRead(val id: String) : InboxIntent

    /** Clear every unread dot in one shot. */
    data object MarkAllRead : InboxIntent
}
