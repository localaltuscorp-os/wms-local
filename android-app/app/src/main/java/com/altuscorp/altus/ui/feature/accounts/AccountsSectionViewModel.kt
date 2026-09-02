package com.altuscorp.altus.feature.accounts

import androidx.compose.runtime.Immutable
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.navigation.toRoute
import com.altuscorp.altus.core.network.ApiResult
import com.altuscorp.altus.data.remote.dto.AccountsFieldDto
import com.altuscorp.altus.data.remote.dto.AccountsRowDto
import com.altuscorp.altus.data.repository.AccountsRepository
import com.altuscorp.altus.navigation.AccountsSectionRoute
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.collections.immutable.ImmutableList
import kotlinx.collections.immutable.persistentListOf
import kotlinx.collections.immutable.toImmutableList
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/** Admin · Accounts → a normalized register section. Direct-fetch, slug from route. */
@Immutable
data class AccountsSectionUiState(
    val isLoading: Boolean = true,
    val loadFailed: Boolean = false,
    val notOnMobile: Boolean = false,
    val eyebrow: String = "ADMIN · ACCOUNTS",
    val title: String = "Section",
    val subtitle: String = "",
    val stats: ImmutableList<AccountsFieldDto> = persistentListOf(),
    val rows: ImmutableList<AccountsRowDto> = persistentListOf(),
) {
    val hasContent: Boolean get() = title != "Section" || rows.isNotEmpty()
}

sealed interface AccountsSectionIntent {
    data object Retry : AccountsSectionIntent
}

@HiltViewModel
class AccountsSectionViewModel @Inject constructor(
    private val repository: AccountsRepository,
    savedStateHandle: SavedStateHandle,
) : ViewModel() {

    private val route = savedStateHandle.toRoute<AccountsSectionRoute>()
    private val slug: String = route.slug

    private val _uiState = MutableStateFlow(AccountsSectionUiState(eyebrow = route.eyebrow))
    val uiState: StateFlow<AccountsSectionUiState> = _uiState.asStateFlow()

    init {
        load()
    }

    fun onIntent(intent: AccountsSectionIntent) {
        when (intent) {
            AccountsSectionIntent.Retry -> load()
        }
    }

    private fun load() {
        _uiState.value = _uiState.value.copy(isLoading = !_uiState.value.hasContent, loadFailed = false, notOnMobile = false)
        viewModelScope.launch {
            when (val res = repository.section(slug, route.api)) {
                is ApiResult.Success -> _uiState.value = AccountsSectionUiState(
                    isLoading = false,
                    eyebrow = route.eyebrow,
                    title = res.data.title.ifBlank { "Section" },
                    subtitle = res.data.subtitle,
                    stats = res.data.stats.toImmutableList(),
                    rows = res.data.rows.toImmutableList(),
                )
                is ApiResult.Failure -> {
                    val notOnMobile = res.httpCode == 404
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        loadFailed = !notOnMobile && !_uiState.value.hasContent,
                        notOnMobile = notOnMobile,
                    )
                }
                else -> _uiState.value = _uiState.value.copy(isLoading = false, loadFailed = !_uiState.value.hasContent)
            }
        }
    }
}
