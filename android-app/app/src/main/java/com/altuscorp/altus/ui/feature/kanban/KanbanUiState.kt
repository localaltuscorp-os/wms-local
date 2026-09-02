package com.altuscorp.altus.feature.kanban

import androidx.compose.runtime.Immutable
import com.altuscorp.altus.core.util.EffectiveDue
import com.altuscorp.altus.domain.model.StatusDisplay
import kotlinx.collections.immutable.ImmutableList
import kotlinx.collections.immutable.persistentListOf

/**
 * WMS Kanban (read-only status board) — MVI surface.
 *
 * One [Immutable] [KanbanUiState] (the reduced view), one sealed
 * [KanbanIntent] (refresh / retry — the board is read-only, no card moves). The
 * ViewModel pre-resolves every column + card off the composition thread so the
 * composables stay dumb: each [KanbanCard] already carries its server status
 * pill inputs, its human due phrase, and its overdue flag.
 */

/** A fully-resolved board card. */
@Immutable
data class KanbanCard(
    val id: String,
    /** "#1042" or "—". */
    val numberLabel: String,
    val title: String,
    /** "Client · Subject" — empty when neither is set. */
    val meta: String,
    val priority: String,
    /** Human due phrase ("Due today", "2d overdue"); empty when no due phase. */
    val duePhrase: String,
    val duePhase: EffectiveDue.DuePhase,
    val isOverdue: Boolean,
)

/** One board column: the server label + colour token, and its resolved cards. */
@Immutable
data class KanbanColumn(
    /** Column id (a status value or the Archived sentinel) — LazyRow key. */
    val id: String,
    /** Server label ("Not started", "Done", "Archived"). */
    val display: StatusDisplay,
    val cards: ImmutableList<KanbanCard>,
) {
    val count: Int get() = cards.size
}

@Immutable
data class KanbanUiState(
    /** Cold cache and the first fetch in flight → column skeletons. */
    val isLoading: Boolean = true,
    /** Pull-to-refresh spinner. */
    val isRefreshing: Boolean = false,
    /** Cold cache AND the fetch failed → full-screen retry. */
    val loadFailed: Boolean = false,
    /** Board on screen but the reconcile failed → quiet stale banner. */
    val refreshFailed: Boolean = false,
    /** Columns in the server-resolved order (all shown, even when empty). */
    val columns: ImmutableList<KanbanColumn> = persistentListOf(),
    /** Total cards across every column. */
    val totalCards: Int = 0,
) {
    val hasContent: Boolean get() = columns.isNotEmpty()
}

/** Everything the screen can ask for (one sealed intent). */
sealed interface KanbanIntent {
    /** Pull-to-refresh reconcile. */
    data object Refresh : KanbanIntent

    /** Retry after a cold-cache load failure. */
    data object Retry : KanbanIntent
}
