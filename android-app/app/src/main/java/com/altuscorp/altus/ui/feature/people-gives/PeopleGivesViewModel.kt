package com.altuscorp.altus.feature.peoplegives

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.altuscorp.altus.core.network.ApiResult
import com.altuscorp.altus.data.remote.dto.PeopleGivesDto
import com.altuscorp.altus.data.remote.dto.PeopleGivesIntroductionDto
import com.altuscorp.altus.data.repository.PeopleGivesRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
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
 * The People Gives brain (Sales workspace). Reads are cache-first —
 * [PeopleGivesRepository.peopleGives] paints the last-decoded network instantly
 * (null → skeletons) while [refresh] reconciles against the server. Read-only:
 * introductions are logged on the web, so this ViewModel owns only the search /
 * category-filter view state and the refresh / error flags. The whole
 * search-and-filter (mirroring the web `IntroductionsTable`) runs in the reducer
 * so the composable stays a dumb render.
 */
@HiltViewModel
class PeopleGivesViewModel @Inject constructor(
    private val repository: PeopleGivesRepository,
) : ViewModel() {

    private data class LocalState(
        val isRefreshing: Boolean = false,
        val loadFailed: Boolean = false,
        val refreshFailed: Boolean = false,
        val query: String = "",
        val category: String? = null,
    )

    private val local = MutableStateFlow(LocalState())

    val uiState: StateFlow<PeopleGivesUiState> =
        combine(repository.peopleGives(), local, ::reduce)
            .stateIn(
                scope = viewModelScope,
                started = SharingStarted.WhileSubscribed(5_000),
                initialValue = PeopleGivesUiState(),
            )

    init {
        refresh()
    }

    fun onIntent(intent: PeopleGivesIntent) {
        when (intent) {
            PeopleGivesIntent.Refresh -> refresh()
            PeopleGivesIntent.Retry -> refresh()
            is PeopleGivesIntent.SearchChanged -> local.update { it.copy(query = intent.query) }
            is PeopleGivesIntent.CategorySelected -> local.update { it.copy(category = intent.category) }
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

    private fun reduce(dto: PeopleGivesDto?, local: LocalState): PeopleGivesUiState {
        if (dto == null) {
            return PeopleGivesUiState(
                isLoading = !local.loadFailed,
                isRefreshing = local.isRefreshing,
                loadFailed = local.loadFailed,
                query = local.query,
                selectedCategory = local.category,
            )
        }

        val all = dto.introductions.map { it.toUi() }

        // Distinct categories (case-insensitive, sorted) for the filter chips.
        val categories: ImmutableList<String> = all
            .mapNotNull { it.businessCategory?.takeIf { c -> c.isNotBlank() } }
            .distinct()
            .sortedBy { it.lowercase() }
            .toImmutableList()

        // A category the data no longer offers is treated as "all".
        val activeCategory = local.category?.takeIf { it in categories }

        val needle = local.query.trim().lowercase()
        val filtered = all.filter { intro ->
            if (activeCategory != null && intro.businessCategory != activeCategory) return@filter false
            if (needle.isEmpty()) return@filter true
            intro.haystack.contains(needle)
        }

        return PeopleGivesUiState(
            isLoading = false,
            isRefreshing = local.isRefreshing,
            loadFailed = false,
            refreshFailed = local.refreshFailed,
            subtitle = "Who can introduce us to whom — the referral network at a glance.",
            query = local.query,
            selectedCategory = activeCategory,
            categories = categories,
            total = all.size,
            introductions = filtered.map { it.ui }.toImmutableList(),
        )
    }

    /** A decoded intro plus a precomputed lowercase search haystack (mirrors the
     *  web table's search fields), so filtering never re-walks the fields. */
    private class Searchable(val ui: PeopleGivesIntroUi, val haystack: String) {
        val businessCategory: String? get() = ui.businessCategory
    }

    private fun PeopleGivesIntroductionDto.toUi(): Searchable {
        val ui = PeopleGivesIntroUi(
            id = id,
            introducerName = introducerName.ifBlank { "—" },
            introducerCell = introducerCell?.takeIf { it.isNotBlank() },
            receivedOnLabel = receivedOnLabel.ifBlank { "—" },
            prospectName = prospectName.ifBlank { "—" },
            prospectCompany = prospectCompany.ifBlank { "—" },
            designation = designation?.takeIf { it.isNotBlank() },
            natureOfBusiness = natureOfBusiness,
            referenceSource = referenceSource?.takeIf { it.isNotBlank() },
            businessCategory = businessCategory?.takeIf { it.isNotBlank() },
            salesPerson = salesPerson?.takeIf { it.isNotBlank() },
            reminderLabel = nextReminderLabel?.takeIf { it.isNotBlank() },
            createdBy = createdBy?.takeIf { it.isNotBlank() },
        )
        val haystack = listOfNotNull(
            introducerName,
            introducerCell,
            prospectCompany,
            prospectName,
            natureOfBusiness,
            notes,
            designation,
            referenceSource,
            salesPerson,
        ).joinToString(" ").lowercase()
        return Searchable(ui, haystack)
    }
}
