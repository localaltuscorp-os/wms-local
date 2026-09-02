package com.altuscorp.altus.feature.wgdashboard

import androidx.compose.runtime.Immutable
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.altuscorp.altus.core.network.ApiResult
import com.altuscorp.altus.data.remote.dto.WgScoreRowDto
import com.altuscorp.altus.data.repository.WeeklyGoalsBoardRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.collections.immutable.ImmutableList
import kotlinx.collections.immutable.persistentListOf
import kotlinx.collections.immutable.toImmutableList
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/** WMS · Weekly Goals dashboard — team weekly-score overview. Direct-fetch. */
@Immutable
data class WgDashboardUiState(
    val isLoading: Boolean = true,
    val loadFailed: Boolean = false,
    val weekLabel: String = "",
    val teamScore: Int = 0,
    val peopleCount: Int = 0,
    val people: ImmutableList<WgScoreRowDto> = persistentListOf(),
) {
    val hasContent: Boolean get() = weekLabel.isNotBlank()
}

sealed interface WgDashboardIntent {
    data object Retry : WgDashboardIntent
}

@HiltViewModel
class WgDashboardViewModel @Inject constructor(
    private val repository: WeeklyGoalsBoardRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(WgDashboardUiState())
    val uiState: StateFlow<WgDashboardUiState> = _uiState.asStateFlow()

    init {
        load()
    }

    fun onIntent(intent: WgDashboardIntent) {
        when (intent) {
            WgDashboardIntent.Retry -> load()
        }
    }

    private fun load() {
        _uiState.value = _uiState.value.copy(isLoading = !_uiState.value.hasContent, loadFailed = false)
        viewModelScope.launch {
            when (val res = repository.dashboard()) {
                is ApiResult.Success -> _uiState.value = WgDashboardUiState(
                    isLoading = false,
                    weekLabel = res.data.weekLabel,
                    teamScore = res.data.teamScore,
                    peopleCount = res.data.peopleCount,
                    people = res.data.people.toImmutableList(),
                )
                else -> _uiState.value = _uiState.value.copy(isLoading = false, loadFailed = !_uiState.value.hasContent)
            }
        }
    }
}
