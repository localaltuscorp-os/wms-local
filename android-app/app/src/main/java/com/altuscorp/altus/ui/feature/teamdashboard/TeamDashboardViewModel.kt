package com.altuscorp.altus.feature.teamdashboard

import androidx.compose.runtime.Immutable
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.navigation.toRoute
import com.altuscorp.altus.core.network.ApiResult
import com.altuscorp.altus.data.remote.dto.TeamPersonDto
import com.altuscorp.altus.data.remote.dto.TeamStatDto
import com.altuscorp.altus.data.repository.TeamDashboardRepository
import com.altuscorp.altus.navigation.TeamDashboardRoute
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.collections.immutable.ImmutableList
import kotlinx.collections.immutable.persistentListOf
import kotlinx.collections.immutable.toImmutableList
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/** Admin team dashboard (overtime · reimbursements). Direct-fetch, type from route. */
@Immutable
data class TeamDashboardUiState(
    val isLoading: Boolean = true,
    val loadFailed: Boolean = false,
    val title: String = "",
    val periodLabel: String = "",
    val stats: ImmutableList<TeamStatDto> = persistentListOf(),
    val people: ImmutableList<TeamPersonDto> = persistentListOf(),
) {
    val hasContent: Boolean get() = title.isNotBlank()
}

sealed interface TeamDashboardIntent {
    data object Retry : TeamDashboardIntent
}

@HiltViewModel
class TeamDashboardViewModel @Inject constructor(
    private val repository: TeamDashboardRepository,
    savedStateHandle: SavedStateHandle,
) : ViewModel() {

    private val type: String = savedStateHandle.toRoute<TeamDashboardRoute>().type

    private val _uiState = MutableStateFlow(TeamDashboardUiState())
    val uiState: StateFlow<TeamDashboardUiState> = _uiState.asStateFlow()

    init {
        load()
    }

    fun onIntent(intent: TeamDashboardIntent) {
        when (intent) {
            TeamDashboardIntent.Retry -> load()
        }
    }

    private fun load() {
        _uiState.value = _uiState.value.copy(isLoading = !_uiState.value.hasContent, loadFailed = false)
        viewModelScope.launch {
            when (val res = repository.load(type)) {
                is ApiResult.Success -> _uiState.value = TeamDashboardUiState(
                    isLoading = false,
                    title = res.data.title,
                    periodLabel = res.data.periodLabel,
                    stats = res.data.stats.toImmutableList(),
                    people = res.data.people.toImmutableList(),
                )
                else -> _uiState.value = _uiState.value.copy(isLoading = false, loadFailed = !_uiState.value.hasContent)
            }
        }
    }
}
