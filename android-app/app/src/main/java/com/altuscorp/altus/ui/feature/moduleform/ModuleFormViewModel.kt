package com.altuscorp.altus.feature.moduleform

import androidx.compose.runtime.Immutable
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.navigation.toRoute
import com.altuscorp.altus.core.network.ApiResult
import com.altuscorp.altus.data.remote.dto.ModuleFieldDto
import com.altuscorp.altus.data.remote.dto.ModuleFormDto
import com.altuscorp.altus.data.remote.dto.ModuleSubmissionDto
import com.altuscorp.altus.data.repository.ModuleFormRepository
import com.altuscorp.altus.navigation.ModuleFormRoute
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
 * Sales · form-driven module (Record a Reference / Participant Breakthrough).
 * Loads the field schema + the user's own entries, holds the in-progress form
 * values, validates required fields client-side, and submits. Direct-fetch;
 * reloads after a successful submit so the new entry appears.
 */

@Immutable
data class ModuleFormUiState(
    val isLoading: Boolean = true,
    val loadFailed: Boolean = false,
    val title: String = "",
    val subtitle: String = "",
    val buttonLabel: String = "Submit",
    val fields: ImmutableList<ModuleFieldDto> = persistentListOf(),
    val productOptions: ImmutableList<String> = persistentListOf(),
    val values: Map<String, String> = emptyMap(),
    val submissions: ImmutableList<ModuleSubmissionDto> = persistentListOf(),
    val submitting: Boolean = false,
    /** Inline banner after a submit — success or error copy. */
    val banner: String? = null,
    val bannerIsError: Boolean = false,
) {
    val hasContent: Boolean get() = title.isNotBlank()
}

sealed interface ModuleFormIntent {
    data class FieldChanged(val key: String, val value: String) : ModuleFormIntent
    data object Submit : ModuleFormIntent
    data object Retry : ModuleFormIntent
    data object BannerShown : ModuleFormIntent
}

@HiltViewModel
class ModuleFormViewModel @Inject constructor(
    private val repository: ModuleFormRepository,
    savedStateHandle: SavedStateHandle,
) : ViewModel() {

    private val moduleKey: String = savedStateHandle.toRoute<ModuleFormRoute>().key

    private val _uiState = MutableStateFlow(ModuleFormUiState())
    val uiState: StateFlow<ModuleFormUiState> = _uiState.asStateFlow()

    init {
        load()
    }

    fun onIntent(intent: ModuleFormIntent) {
        when (intent) {
            is ModuleFormIntent.FieldChanged ->
                _uiState.update { it.copy(values = it.values + (intent.key to intent.value)) }
            ModuleFormIntent.Submit -> submit()
            ModuleFormIntent.Retry -> load()
            ModuleFormIntent.BannerShown -> _uiState.update { it.copy(banner = null) }
        }
    }

    private fun load() {
        _uiState.update { it.copy(isLoading = !it.hasContent, loadFailed = false) }
        viewModelScope.launch {
            when (val res = repository.load(moduleKey)) {
                is ApiResult.Success -> _uiState.update { res.data.merge(it) }
                else -> _uiState.update { it.copy(isLoading = false, loadFailed = !it.hasContent) }
            }
        }
    }

    private fun submit() {
        val s = _uiState.value
        if (s.submitting) return

        // Client-side required check (server re-validates) — first missing wins.
        val missing = s.fields.firstOrNull { it.required && (s.values[it.key] ?: "").isBlank() }
        if (missing != null) {
            _uiState.update { it.copy(banner = "${missing.label} is required.", bannerIsError = true) }
            return
        }

        _uiState.update { it.copy(submitting = true, banner = null) }
        viewModelScope.launch {
            when (val res = repository.submit(moduleKey, s.values.filterValues { it.isNotBlank() })) {
                is ApiResult.Success -> {
                    val err = res.data.error
                    if (res.data.ok) {
                        // Clear the form + reload so the new entry appears at the top.
                        _uiState.update {
                            it.copy(submitting = false, values = emptyMap(), banner = "Submitted.", bannerIsError = false)
                        }
                        reloadSubmissions()
                    } else {
                        _uiState.update { it.copy(submitting = false, banner = err ?: "Couldn't submit.", bannerIsError = true) }
                    }
                }
                else -> _uiState.update {
                    it.copy(submitting = false, banner = "Couldn't submit — check your entries and try again.", bannerIsError = true)
                }
            }
        }
    }

    private fun reloadSubmissions() {
        viewModelScope.launch {
            when (val res = repository.load(moduleKey)) {
                is ApiResult.Success -> _uiState.update { it.copy(submissions = res.data.submissions.toImmutableList()) }
                else -> Unit
            }
        }
    }
}

// ─── Mapping ──────────────────────────────────────────────────────────────────

/** Merge a freshly-loaded schema into state, preserving any in-progress values. */
private fun ModuleFormDto.merge(prev: ModuleFormUiState): ModuleFormUiState = prev.copy(
    isLoading = false,
    loadFailed = false,
    title = title,
    subtitle = subtitle,
    buttonLabel = buttonLabel.ifBlank { "Submit" },
    fields = fields.toImmutableList(),
    productOptions = productOptions.toImmutableList(),
    submissions = submissions.toImmutableList(),
)
