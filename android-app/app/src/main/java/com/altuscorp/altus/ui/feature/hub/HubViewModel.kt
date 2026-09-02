package com.altuscorp.altus.feature.hub

import androidx.compose.runtime.Immutable
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.altuscorp.altus.data.repository.AuthRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

/**
 * The HUB — the app's front door (mirrors the web `/hub`). A launcher grid of
 * the seven workspace cards; the only thing this ViewModel supplies is the
 * signed-in identity so the header can greet the returning user by first name.
 *
 * Identity is read cache-first (the live decoded `/me` snapshot, falling back to
 * the cached identity) so a returning user is greeted before the network
 * answers; a best-effort `/me` reconcile runs on entry (Part 6: one immutable
 * UiState + one sealed intent per screen).
 */

/** The screen's single source of truth. */
@Immutable
data class HubUiState(
    /** First name for the "Welcome back, {name}" hero; blank until identity warms. */
    val greetingName: String = "",
    /** True only until the first identity snapshot (live or cached) resolves. */
    val loading: Boolean = true,
)

/** Everything the screen can ask for (Part 6: one sealed intent). */
sealed interface HubIntent {
    /** Re-fetch the signed-in identity. */
    data object Refresh : HubIntent
}

@HiltViewModel
class HubViewModel @Inject constructor(
    private val authRepository: AuthRepository,
) : ViewModel() {

    val uiState: StateFlow<HubUiState> = combine(
        authRepository.identity(),
        authRepository.cachedIdentity,
    ) { live, cached ->
        val fullName = (live?.name ?: cached?.name)?.trim().orEmpty()
        HubUiState(
            greetingName = fullName.substringBefore(' ').ifBlank { fullName },
            loading = fullName.isEmpty(),
        )
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5_000),
        initialValue = HubUiState(),
    )

    init {
        refresh()
    }

    fun onIntent(intent: HubIntent) {
        when (intent) {
            HubIntent.Refresh -> refresh()
        }
    }

    /** Fire-and-forget `/me` reconcile; the cache emission repaints the greeting. */
    private fun refresh() {
        viewModelScope.launch { authRepository.refreshMe() }
    }
}
