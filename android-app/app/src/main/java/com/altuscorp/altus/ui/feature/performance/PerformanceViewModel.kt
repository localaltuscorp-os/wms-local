package com.altuscorp.altus.feature.performance

import androidx.compose.runtime.Immutable
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.altuscorp.altus.core.network.ApiResult
import com.altuscorp.altus.data.remote.dto.PerformanceDto
import com.altuscorp.altus.data.remote.dto.PerformancePillarDto
import com.altuscorp.altus.data.remote.dto.PerformancePromotionSignalDto
import com.altuscorp.altus.data.remote.dto.PerformanceRecognitionDto
import com.altuscorp.altus.data.remote.dto.PerformanceReviewDto
import com.altuscorp.altus.data.remote.dto.PerformanceGoalDto
import com.altuscorp.altus.data.repository.PerformanceRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlin.math.roundToInt
import kotlinx.collections.immutable.ImmutableList
import kotlinx.collections.immutable.toImmutableList
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

/**
 * The signed-in user's PMS score (Employees workspace) — the native rendition of
 * the web `/pms/[employeeId]` detail page, scoped to self. Read-only: the cache
 * paints instantly (skeletons only on a true cold cache), a network reconcile
 * runs on entry and on pull-to-refresh. All display formatting happens here so
 * the composables stay dumb renders of one [Immutable] state.
 */

/** Score band → drives the hero ring + band chip colour. Mirrors the web bands
 *  (green ≥80 / amber ≥60 / red). */
enum class ScoreBand {
    Strong,
    OnTrack,
    NeedsFocus,
    ;

    companion object {
        fun fromKey(key: String): ScoreBand = when (key) {
            "strong" -> Strong
            "on_track" -> OnTrack
            else -> NeedsFocus
        }
    }
}

/** One of the five pillars, pre-formatted. */
@Immutable
data class PillarRow(
    val key: String,
    val name: String,
    val hint: String?,
    /** e.g. "50" — the pillar's weight in the blend. */
    val weightLabel: String,
    /** 0..1 for the bar; null = no data (bar empty, "No data" label). */
    val rate: Float?,
    /** "82%" or null. */
    val ratePct: String?,
    val subSignals: ImmutableList<SubSignalRow>,
)

@Immutable
data class SubSignalRow(
    val key: String,
    val label: String,
    /** "74%" or "—" (no data). */
    val ratePct: String,
)

/** One monthly 360 review card. */
@Immutable
data class ReviewRow(
    val id: String,
    val relationLabel: String,
    val reviewerName: String,
    val period: String,
    val scope: String,
    val attitude: Int?,
    val behaviour: Int?,
    val skill: Int?,
    val changeTags: ImmutableList<String>,
    val explanation: String?,
)

/** One personal (non-work) goal. */
@Immutable
data class GoalRow(
    val id: String,
    val title: String,
    val detail: String?,
    /** "Q3 · active" style meta. */
    val meta: String,
    val badge: String,
    val done: Boolean,
    val dropped: Boolean,
)

/** One recognition or promotion signal, pre-formatted to a single meta line. */
@Immutable
data class SignalRow(
    val id: String,
    val title: String,
    val statusLabel: String,
    val body: String?,
    val meta: String?,
    val kind: SignalKind,
)

enum class SignalKind { Recognition, Promotion }

/** The whole loaded score, ready to render. */
@Immutable
data class PerformanceContent(
    val name: String,
    val department: String,
    val avatarUrl: String?,
    val tenureLabel: String,
    val score: Int,
    val band: ScoreBand,
    val bandLabel: String,
    val promotionEligible: Boolean,
    val promotionRationale: String,
    val pillars: ImmutableList<PillarRow>,
    val reviews: ImmutableList<ReviewRow>,
    val reviewCount: Int,
    val personalGoals: ImmutableList<GoalRow>,
    val signals: ImmutableList<SignalRow>,
)

/** The screen's single source of truth (one @Immutable UiState). */
@Immutable
data class PerformanceUiState(
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    val loadFailed: Boolean = false,
    val refreshFailed: Boolean = false,
    val content: PerformanceContent? = null,
) {
    val hasContent: Boolean get() = content != null
}

sealed interface PerformanceIntent {
    data object Refresh : PerformanceIntent
    data object Retry : PerformanceIntent
}

@HiltViewModel
class PerformanceViewModel @Inject constructor(
    private val repository: PerformanceRepository,
) : ViewModel() {

    private val refreshing = MutableStateFlow(false)
    private val loadFailed = MutableStateFlow(false)
    private val refreshFailed = MutableStateFlow(false)

    val uiState: StateFlow<PerformanceUiState> = combine(
        repository.performance(),
        refreshing,
        loadFailed,
        refreshFailed,
    ) { snapshot, isRefreshing, coldFailed, warmFailed ->
        if (snapshot == null) {
            PerformanceUiState(
                isLoading = !coldFailed,
                isRefreshing = isRefreshing,
                loadFailed = coldFailed,
            )
        } else {
            PerformanceUiState(
                isLoading = false,
                isRefreshing = isRefreshing,
                loadFailed = false,
                refreshFailed = warmFailed,
                content = snapshot.toContent(),
            )
        }
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5_000),
        initialValue = PerformanceUiState(),
    )

    init {
        refresh()
    }

    fun onIntent(intent: PerformanceIntent) {
        when (intent) {
            PerformanceIntent.Refresh,
            PerformanceIntent.Retry,
            -> refresh()
        }
    }

    private fun refresh() {
        if (refreshing.value) return
        refreshing.value = true
        loadFailed.value = false
        refreshFailed.value = false
        viewModelScope.launch {
            when (repository.refresh()) {
                is ApiResult.Success -> Unit
                else -> {
                    loadFailed.value = true
                    refreshFailed.value = true
                }
            }
            refreshing.value = false
        }
    }
}

// ─── Mapping ──────────────────────────────────────────────────────────────────

private fun pct(rate: Double?): String = if (rate == null) "—" else "${(rate * 100).roundToInt()}%"

private fun PerformanceDto.toContent(): PerformanceContent {
    val tenure = employee.tenureDays
    val tenureLabel = if (tenure > 0) "${tenure}d tenure" else "New joiner"
    return PerformanceContent(
        name = employee.name,
        department = employee.department?.takeIf { it.isNotBlank() } ?: "No department",
        avatarUrl = employee.avatarUrl,
        tenureLabel = tenureLabel,
        score = score,
        band = ScoreBand.fromKey(band),
        bandLabel = bandLabel,
        promotionEligible = promotion.eligible,
        promotionRationale = promotion.rationale,
        pillars = pillars.map { it.toRow() }.toImmutableList(),
        reviews = reviews.map { it.toRow() }.toImmutableList(),
        reviewCount = reviewCount,
        personalGoals = personalGoals.map { it.toRow() }.toImmutableList(),
        signals = buildSignals(),
    )
}

private fun PerformancePillarDto.toRow(): PillarRow = PillarRow(
    key = key,
    name = name,
    hint = hint,
    weightLabel = if (weight % 1.0 == 0.0) weight.toInt().toString() else weight.toString(),
    rate = rate?.toFloat(),
    ratePct = rate?.let { "${(it * 100).roundToInt()}%" },
    subSignals = subSignals.map { SubSignalRow(key = it.key, label = it.label, ratePct = pct(it.rate)) }
        .toImmutableList(),
)

private fun PerformanceReviewDto.toRow(): ReviewRow = ReviewRow(
    id = id,
    relationLabel = relationLabel,
    reviewerName = reviewerName?.takeIf { it.isNotBlank() } ?: "Reviewer",
    period = period,
    scope = scope,
    attitude = attitude,
    behaviour = behaviour,
    skill = skill,
    changeTags = changeTags.toImmutableList(),
    explanation = explanation?.takeIf { it.isNotBlank() },
)

private fun PerformanceGoalDto.toRow(): GoalRow {
    val done = status == "done"
    val dropped = status == "dropped"
    return GoalRow(
        id = id,
        title = title,
        detail = detail?.takeIf { it.isNotBlank() },
        meta = "$period · $status",
        badge = when {
            done -> "✓"
            dropped -> "–"
            else -> "${position + 1}"
        },
        done = done,
        dropped = dropped,
    )
}

/** Recognition first, then promotion signals — the web's Signals rail order. */
private fun PerformanceDto.buildSignals(): ImmutableList<SignalRow> {
    val rows = buildList {
        recognition.forEach { add(it.toRow()) }
        promotionSignals.forEach { add(it.toRow()) }
    }
    return rows.toImmutableList()
}

private fun PerformanceRecognitionDto.toRow(): SignalRow = SignalRow(
    id = id,
    title = kind,
    statusLabel = status,
    body = reason?.takeIf { it.isNotBlank() },
    meta = buildString {
        append(period)
        if (scoreSnapshot != null) append(" · score $scoreSnapshot")
        if (!releasedAt.isNullOrBlank()) append(" · released $releasedAt")
    },
    kind = SignalKind.Recognition,
)

private fun PerformancePromotionSignalDto.toRow(): SignalRow = SignalRow(
    id = id,
    title = "Promotion signal",
    statusLabel = status,
    body = rationale?.takeIf { it.isNotBlank() },
    meta = buildString {
        if (scoreSnapshot != null) append("score $scoreSnapshot")
        if (!eligibleSince.isNullOrBlank()) {
            if (isNotEmpty()) append(" · ")
            append("since $eligibleSince")
        }
        if (!decidedAt.isNullOrBlank()) {
            if (isNotEmpty()) append(" · ")
            append("decided $decidedAt")
        }
    }.takeIf { it.isNotBlank() },
    kind = SignalKind.Promotion,
)
