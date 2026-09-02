package com.altuscorp.altus.feature.review360

import androidx.compose.runtime.Immutable
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.altuscorp.altus.core.network.ApiResult
import com.altuscorp.altus.data.remote.dto.Review360Dto
import com.altuscorp.altus.data.remote.dto.Review360PersonDto
import com.altuscorp.altus.data.repository.Review360Repository
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.collections.immutable.ImmutableList
import kotlinx.collections.immutable.persistentListOf
import kotlinx.collections.immutable.toImmutableList
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * Employees · Monthly 360 (read-only) — the peer/subordinate review surface.
 *
 * One @Immutable UiState reduced from the direct-fetch
 * [com.altuscorp.altus.data.repository.Review360Repository]. Every field is
 * render-ready so the composable stays a dumb render: relation labels, the
 * mono rating line ("A4 · B5 · S4"), the progress fraction and the goal-status
 * kinds are all pre-computed here. This is an analytics/HR surface, so there is
 * no cache mirror — a cold load shows the skeleton, a warm reconcile keeps the
 * roster and folds any failure into a quiet stale banner.
 */

/** How a personal goal resolved — drives its pill colour. */
enum class GoalStatusKind { Active, Done, Dropped }

/** One reviewable person row, fully formatted. */
@Immutable
data class Review360PersonUi(
    val id: String,
    val name: String,
    val avatarUrl: String?,
    val department: String,
    /** "You manage them" / "They manage you" / "Colleague". */
    val relationLabel: String,
    val done: Boolean,
    /** Mono "A4 · B5 · S4" when reviewed; null when still pending. */
    val ratingLabel: String?,
    /** The reviewer's own note, if any. */
    val note: String?,
)

/** One relation bucket ("Your team", "Your manager", "Peers"). */
@Immutable
data class Review360GroupUi(
    val key: String,
    val header: String,
    val doneCount: Int,
    val people: ImmutableList<Review360PersonUi>,
)

/** One personal-goal row. */
@Immutable
data class Review360GoalUi(
    val key: String,
    val title: String,
    val detail: String?,
    val statusLabel: String,
    val statusKind: GoalStatusKind,
)

/** The screen's single source of truth (Part 6: one @Immutable UiState). */
@Immutable
data class Review360UiState(
    /** Cold cache — paint the skeleton silhouette (Signature 8). */
    val isLoading: Boolean = true,
    /** Cold-load failure copy; only surfaced while still empty. */
    val loadError: String? = null,
    val isRefreshing: Boolean = false,
    /** Content on screen but the reconcile failed → quiet stale banner. */
    val refreshFailed: Boolean = false,
    val periodLabel: String = "",
    val reviewedCount: Int = 0,
    val totalCount: Int = 0,
    /** 0f–1f review completion for the hero meter. */
    val progress: Float = 0f,
    val groups: ImmutableList<Review360GroupUi> = persistentListOf(),
    val personalGoals: ImmutableList<Review360GoalUi> = persistentListOf(),
) {
    val hasContent: Boolean get() = groups.isNotEmpty() || personalGoals.isNotEmpty()
}

/** Everything the screen can ask for (Part 6: one sealed intent). */
sealed interface Review360Intent {
    /** Pull-to-refresh reconcile. */
    data object Refresh : Review360Intent

    /** Retry after a cold-load failure. */
    data object Retry : Review360Intent
}

@HiltViewModel
class Review360ViewModel @Inject constructor(
    private val repository: Review360Repository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(Review360UiState())
    val uiState: StateFlow<Review360UiState> = _uiState.asStateFlow()

    init {
        load()
    }

    fun onIntent(intent: Review360Intent) {
        when (intent) {
            Review360Intent.Refresh,
            Review360Intent.Retry,
            -> load()
        }
    }

    private fun load() {
        if (_uiState.value.isRefreshing) return
        val hadContent = _uiState.value.hasContent
        _uiState.update {
            it.copy(isRefreshing = true, refreshFailed = false, loadError = null, isLoading = !hadContent)
        }
        viewModelScope.launch {
            when (val res = repository.load()) {
                is ApiResult.Success -> _uiState.value = res.data.toUiState()
                else -> _uiState.update {
                    if (it.hasContent) {
                        it.copy(isRefreshing = false, isLoading = false, refreshFailed = true)
                    } else {
                        it.copy(
                            isRefreshing = false,
                            isLoading = false,
                            loadError = (res as? ApiResult.Failure)?.message ?: "Couldn't load.",
                        )
                    }
                }
            }
        }
    }
}

// ─── Mapping ──────────────────────────────────────────────────────────────────

private fun Review360Dto.toUiState(): Review360UiState {
    val groups = RELATION_ORDER.mapNotNull { relation ->
        val bucket = people.filter { it.relation == relation.key }
        if (bucket.isEmpty()) return@mapNotNull null
        Review360GroupUi(
            key = relation.key,
            header = relation.header,
            doneCount = bucket.count { it.done },
            people = bucket.map { it.toRow() }.toImmutableList(),
        )
    }.toImmutableList()

    return Review360UiState(
        isLoading = false,
        isRefreshing = false,
        loadError = null,
        refreshFailed = false,
        periodLabel = periodLabel,
        reviewedCount = reviewedCount,
        totalCount = totalCount,
        progress = if (totalCount > 0) reviewedCount.toFloat() / totalCount else 0f,
        groups = groups,
        personalGoals = personalGoals.mapIndexed { i, g ->
            Review360GoalUi(
                key = "$i:${g.title}",
                title = g.title,
                detail = g.detail.ifBlank { null },
                statusLabel = g.status.replaceFirstChar { it.uppercase() },
                statusKind = when (g.status.lowercase()) {
                    "done" -> GoalStatusKind.Done
                    "dropped" -> GoalStatusKind.Dropped
                    else -> GoalStatusKind.Active
                },
            )
        }.toImmutableList(),
    )
}

private fun Review360PersonDto.toRow(): Review360PersonUi {
    val relationLabel = when (relation) {
        "manager" -> "You manage them"
        "subordinate" -> "They manage you"
        else -> "Colleague"
    }
    val ratingLabel = prior?.let { p ->
        val parts = buildList {
            p.attitude?.let { add("A$it") }
            p.behaviour?.let { add("B$it") }
            p.skill?.let { add("S$it") }
        }
        if (parts.isEmpty()) null else parts.joinToString(" · ")
    }
    return Review360PersonUi(
        id = id,
        name = name,
        avatarUrl = avatarUrl,
        department = department?.takeIf { it.isNotBlank() } ?: "—",
        relationLabel = relationLabel,
        done = done,
        ratingLabel = if (done) ratingLabel else null,
        note = prior?.explanation?.takeIf { it.isNotBlank() },
    )
}

/** Relation buckets in the same order as the web review picker. */
private data class RelationBucket(val key: String, val header: String)

private val RELATION_ORDER = listOf(
    RelationBucket("manager", "Your team"),
    RelationBucket("subordinate", "Your manager"),
    RelationBucket("peer", "Peers"),
)
