package com.altuscorp.altus.feature.indexhub

import androidx.compose.runtime.Immutable
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.altuscorp.altus.core.network.ApiResult
import com.altuscorp.altus.data.remote.dto.IndexSectionDto
import com.altuscorp.altus.data.repository.IndexHubRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.collections.immutable.ImmutableList
import kotlinx.collections.immutable.persistentListOf
import kotlinx.collections.immutable.toImmutableList
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/** Marketing · Index Hub — a read-only link directory. Direct-fetch. */
@Immutable
data class IndexHubUiState(
    val isLoading: Boolean = true,
    val loadFailed: Boolean = false,
    val sections: ImmutableList<IndexSectionDto> = persistentListOf(),
) {
    val hasContent: Boolean get() = sections.isNotEmpty()
}

sealed interface IndexHubIntent {
    data object Retry : IndexHubIntent
}

@HiltViewModel
class IndexHubViewModel @Inject constructor(
    private val repository: IndexHubRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(IndexHubUiState())
    val uiState: StateFlow<IndexHubUiState> = _uiState.asStateFlow()

    init {
        load()
    }

    fun onIntent(intent: IndexHubIntent) {
        when (intent) {
            IndexHubIntent.Retry -> load()
        }
    }

    private fun load() {
        _uiState.value = _uiState.value.copy(isLoading = !_uiState.value.hasContent, loadFailed = false)
        viewModelScope.launch {
            when (val res = repository.load()) {
                is ApiResult.Success -> _uiState.value = IndexHubUiState(
                    isLoading = false,
                    loadFailed = false,
                    sections = res.data.sections.toImmutableList(),
                )
                else -> _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    loadFailed = !_uiState.value.hasContent,
                )
            }
        }
    }
}
