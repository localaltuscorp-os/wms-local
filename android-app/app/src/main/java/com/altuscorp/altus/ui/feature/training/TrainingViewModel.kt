package com.altuscorp.altus.feature.training

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.altuscorp.altus.core.network.ApiResult
import com.altuscorp.altus.data.remote.dto.TrainingDto
import com.altuscorp.altus.data.remote.dto.TrainingInductionDto
import com.altuscorp.altus.data.remote.dto.TrainingMaterialDto
import com.altuscorp.altus.data.repository.TrainingRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlin.math.roundToInt
import kotlinx.collections.immutable.ImmutableList
import kotlinx.collections.immutable.persistentListOf
import kotlinx.collections.immutable.toImmutableList
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * The Training Centre brain (Training workspace). Reads are cache-first —
 * [TrainingRepository.training] paints the last-decoded library instantly (null
 * → skeletons) while [refresh] reconciles against the server. Read-only: material
 * is authored / tests are taken on the web, so this ViewModel only owns the two
 * client-side facets (subject filter, induction-only toggle) and the refresh /
 * error flags. All shaping — the leading glyph, the "3 Jun · Manan +2 · v2" meta,
 * the induction step line, the summary meters — happens here so the composable
 * stays a dumb render.
 */
@HiltViewModel
class TrainingViewModel @Inject constructor(
    private val repository: TrainingRepository,
) : ViewModel() {

    private data class LocalState(
        val subjectFilter: String? = null,
        val inductionOnly: Boolean = false,
        val isRefreshing: Boolean = false,
        val loadFailed: Boolean = false,
        val refreshFailed: Boolean = false,
    )

    private val local = MutableStateFlow(LocalState())

    val uiState: StateFlow<TrainingUiState> =
        combine(repository.training(), local, ::reduce)
            .stateIn(
                scope = viewModelScope,
                started = SharingStarted.WhileSubscribed(5_000),
                initialValue = TrainingUiState(),
            )

    init {
        refresh()
    }

    fun onIntent(intent: TrainingIntent) {
        when (intent) {
            is TrainingIntent.SelectSubject -> local.update { it.copy(subjectFilter = intent.subject) }
            TrainingIntent.ToggleInductionOnly -> local.update { it.copy(inductionOnly = !it.inductionOnly) }
            TrainingIntent.Refresh -> refresh()
            TrainingIntent.Retry -> refresh()
        }
    }

    private fun refresh() {
        if (local.value.isRefreshing) return
        local.update { it.copy(isRefreshing = true, loadFailed = false, refreshFailed = false) }
        viewModelScope.launch {
            val failed = repository.refresh() !is ApiResult.Success
            local.update {
                it.copy(isRefreshing = false, loadFailed = failed, refreshFailed = failed)
            }
        }
    }

    // ─── Reducer ─────────────────────────────────────────────────────────────

    private fun reduce(dto: TrainingDto?, local: LocalState): TrainingUiState {
        if (dto == null) {
            return TrainingUiState(
                isLoading = !local.loadFailed,
                isRefreshing = local.isRefreshing,
                loadFailed = local.loadFailed,
            )
        }

        val s = dto.stats
        val watchRate = if (s.materials > 0) s.watched.toFloat() / s.materials else null
        val inductionRate = if (s.inductionTotal > 0) s.inductionDone.toFloat() / s.inductionTotal else null

        val kpis: ImmutableList<TrainingKpiUi> = if (s.inductionTotal > 0) {
            persistentListOf(
                watchedKpi(s.watched, s.materials, watchRate),
                TrainingKpiUi(
                    id = "induction",
                    label = "Induction",
                    value = "${s.inductionDone} / ${s.inductionTotal}",
                    caption = if (s.inductionDone >= s.inductionTotal) "your path is complete"
                    else "${(inductionRate!! * 100).roundToInt()}% of your path done",
                    accent = if (s.inductionDone >= s.inductionTotal) TrainingAccent.Success else TrainingAccent.Training,
                    progress = inductionRate,
                ),
            )
        } else {
            persistentListOf(watchedKpi(s.watched, s.materials, watchRate))
        }

        // Distinct subjects for the facet chips (library, order of first appearance).
        val subjectSet = LinkedHashSet<String>()
        dto.materials.forEach { m -> m.subject?.takeIf { it.isNotBlank() }?.let(subjectSet::add) }
        val subjects = subjectSet.toList().sorted()

        // Apply the active facets to the library.
        val filtered = dto.materials.filter { m ->
            if (local.inductionOnly && !m.partOfInduction) return@filter false
            val subj = m.subject ?: "Unsorted"
            if (local.subjectFilter != null && subj != local.subjectFilter) return@filter false
            true
        }

        return TrainingUiState(
            isLoading = false,
            isRefreshing = local.isRefreshing,
            loadFailed = false,
            refreshFailed = local.refreshFailed,
            subtitle = if (dto.canManage) {
                "Watch the material and take its tests. Manage material on the web."
            } else {
                "Watch the material and take its tests."
            },
            kpis = kpis,
            induction = dto.induction.map { it.toUi() }.toImmutableList(),
            subjects = subjects.toImmutableList(),
            subjectFilter = local.subjectFilter,
            inductionOnly = local.inductionOnly,
            materials = filtered.map { it.toUi() }.toImmutableList(),
            totalMaterials = dto.materials.size,
        )
    }

    private fun watchedKpi(watched: Int, total: Int, rate: Float?): TrainingKpiUi = TrainingKpiUi(
        id = "watched",
        label = "Watched",
        value = "$watched / $total",
        caption = when {
            total == 0 -> "no material yet"
            rate != null && rate >= 1f -> "you've watched everything"
            else -> "${(rate!! * 100).roundToInt()}% of the library"
        },
        accent = if (total > 0 && watched >= total) TrainingAccent.Success else TrainingAccent.Training,
        progress = rate,
    )

    private fun TrainingMaterialDto.toUi(): TrainingMaterialUi = TrainingMaterialUi(
        id = id,
        title = subject?.takeIf { it.isNotBlank() } ?: "Unsorted",
        los = los?.takeIf { it.isNotBlank() },
        meta = buildMeta(this),
        fileLabel = fileName?.takeIf { it.isNotBlank() } ?: (if (videoUrl != null) "Video link" else "—"),
        glyph = glyphFor(kind, videoUrl),
        videoUrl = videoUrl?.takeIf { it.isNotBlank() },
        partOfInduction = partOfInduction,
        archived = archived,
        watchedByMe = watchedByMe,
    )

    /** "3 Jun 2026 · Manan +2 · v2" — date, creators (capped), version, all optional. */
    private fun buildMeta(m: TrainingMaterialDto): String {
        val parts = mutableListOf<String>()
        m.addedOnLabel.takeIf { it.isNotBlank() }?.let(parts::add)
        creatorsLabel(m.createdByNames)?.let(parts::add)
        m.version?.takeIf { it.isNotBlank() }?.let { parts.add("v$it") }
        return parts.joinToString(" · ")
    }

    /** "Manan", "Manan, Priya" or "Manan, Priya +2" — mirrors the web `creators`. */
    private fun creatorsLabel(names: List<String>): String? {
        if (names.isEmpty()) return null
        if (names.size <= 2) return names.joinToString(", ")
        return "${names.take(2).joinToString(", ")} +${names.size - 2}"
    }

    private fun TrainingInductionDto.toUi(): TrainingInductionUi = TrainingInductionUi(
        id = id,
        title = subject?.takeIf { it.isNotBlank() } ?: "Unsorted",
        los = los?.takeIf { it.isNotBlank() },
        glyph = glyphFor(kind, videoUrl),
        videoUrl = videoUrl?.takeIf { it.isNotBlank() },
        watched = watched,
        test1Passed = test1Passed,
        test2Passed = test2Passed,
        complete = complete,
        statusLine = inductionStatusLine(watched, test1Passed, test2Passed),
    )

    /** "Watched · Test 1 ✓ · Test 2 —" — the induction step state, render-ready. */
    private fun inductionStatusLine(watched: Boolean, t1: Boolean?, t2: Boolean?): String {
        val parts = mutableListOf(if (watched) "Watched" else "Not watched")
        if (t1 != null) parts.add("Test 1 ${if (t1) "✓" else "—"}")
        if (t2 != null) parts.add("Test 2 ${if (t2) "✓" else "—"}")
        return parts.joinToString(" · ")
    }

    /** Map the server kind hint onto the row glyph (video wins, then pdf / xls). */
    private fun glyphFor(kind: String, videoUrl: String?): TrainingGlyph = when {
        videoUrl != null -> TrainingGlyph.Video
        kind == "video" -> TrainingGlyph.Video
        kind == "pdf" -> TrainingGlyph.Pdf
        kind == "xls" -> TrainingGlyph.Xls
        else -> TrainingGlyph.Doc
    }
}
