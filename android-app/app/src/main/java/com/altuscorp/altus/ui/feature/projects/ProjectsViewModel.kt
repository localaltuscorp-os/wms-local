package com.altuscorp.altus.feature.projects

import androidx.compose.runtime.Immutable
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.altuscorp.altus.core.network.ApiResult
import com.altuscorp.altus.data.remote.dto.ProjectRowDto
import com.altuscorp.altus.data.remote.dto.ProjectsDto
import dagger.hilt.android.lifecycle.HiltViewModel
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import javax.inject.Inject
import kotlinx.collections.immutable.ImmutableList
import kotlinx.collections.immutable.persistentListOf
import kotlinx.collections.immutable.toImmutableList
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

/**
 * WMS Projects overview (read-only): the org's project tree collapsed to
 * per-project cards with a completion meter. Cache paints first (skeletons
 * only on a true cold cache); a network reconcile runs on entry and on
 * pull-to-refresh. All formatting is done here so the composables stay dumb.
 */

/** One pre-formatted project card. */
@Immutable
data class ProjectRow(
    /** Stable id — LazyColumn key. */
    val id: String,
    val name: String,
    /** "Owner · Priya" or "No owner assigned". */
    val ownerLabel: String,
    val hasOwner: Boolean,
    /** "Due 12 Jun 2026" or null. */
    val targetLabel: String?,
    /** "3 milestones · 8 results · 12 actions". */
    val breakdownLabel: String,
    /** Mono "5/12 done". */
    val tasksLabel: String,
    /** 0–100 completion. */
    val pct: Int,
    /** True once every linked task is done — the one place green is earned. */
    val complete: Boolean,
    val hasTasks: Boolean,
)

/** The screen's single source of truth (one @Immutable UiState). */
@Immutable
data class ProjectsUiState(
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    val loadFailed: Boolean = false,
    val refreshFailed: Boolean = false,
    val projects: ImmutableList<ProjectRow> = persistentListOf(),
    val totalProjects: Int = 0,
    val totalMilestones: Int = 0,
    val totalResults: Int = 0,
    val totalTasks: Int = 0,
) {
    val hasContent: Boolean get() = projects.isNotEmpty()
}

/** Everything the screen can ask for (one sealed intent). */
sealed interface ProjectsIntent {
    data object Refresh : ProjectsIntent
    data object Retry : ProjectsIntent
}

@HiltViewModel
class ProjectsViewModel @Inject constructor(
    private val repository: com.altuscorp.altus.data.repository.ProjectsRepository,
) : ViewModel() {

    private val refreshing = MutableStateFlow(false)
    private val loadFailed = MutableStateFlow(false)
    private val refreshFailed = MutableStateFlow(false)

    val uiState: StateFlow<ProjectsUiState> = combine(
        repository.projects(),
        refreshing,
        loadFailed,
        refreshFailed,
    ) { snapshot, isRefreshing, coldFailed, warmFailed ->
        if (snapshot == null) {
            ProjectsUiState(
                isLoading = !coldFailed,
                isRefreshing = isRefreshing,
                loadFailed = coldFailed,
            )
        } else {
            snapshot.toUiState(isRefreshing = isRefreshing, refreshFailed = warmFailed)
        }
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5_000),
        initialValue = ProjectsUiState(),
    )

    init {
        refresh()
    }

    fun onIntent(intent: ProjectsIntent) {
        when (intent) {
            ProjectsIntent.Refresh, ProjectsIntent.Retry -> refresh()
        }
    }

    private fun refresh() {
        if (refreshing.value) return
        refreshing.value = true
        loadFailed.value = false
        refreshFailed.value = false
        viewModelScope.launch {
            when (repository.refresh()) {
                is ApiResult.Success -> Unit // cache emission repaints
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

private val TARGET_FMT: DateTimeFormatter =
    DateTimeFormatter.ofPattern("d MMM yyyy", Locale.ENGLISH).withZone(ZoneId.systemDefault())

private fun ProjectsDto.toUiState(
    isRefreshing: Boolean,
    refreshFailed: Boolean,
): ProjectsUiState = ProjectsUiState(
    isLoading = false,
    isRefreshing = isRefreshing,
    loadFailed = false,
    refreshFailed = refreshFailed,
    projects = projects.map { it.toRow() }.toImmutableList(),
    totalProjects = totals.projects,
    totalMilestones = totals.milestones,
    totalResults = totals.results,
    totalTasks = totals.tasks,
)

private fun ProjectRowDto.toRow(): ProjectRow {
    val hasOwner = !ownerName.isNullOrBlank()
    return ProjectRow(
        id = id,
        name = name,
        ownerLabel = if (hasOwner) "Owner · $ownerName" else "No owner assigned",
        hasOwner = hasOwner,
        targetLabel = targetDate?.let { runCatching { "Due ${TARGET_FMT.format(Instant.parse(it))}" }.getOrNull() },
        breakdownLabel = listOf(
            pluralize(milestones, "milestone"),
            pluralize(results, "result"),
            pluralize(actions, "action"),
        ).joinToString(" · "),
        tasksLabel = "$doneTasks/$linkedTasks done",
        pct = pct.coerceIn(0, 100),
        complete = linkedTasks > 0 && doneTasks >= linkedTasks,
        hasTasks = linkedTasks > 0,
    )
}

private fun pluralize(n: Int, one: String): String = "$n ${if (n == 1) one else one + "s"}"
