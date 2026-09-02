package com.altuscorp.altus.feature.accounts

import androidx.compose.runtime.Immutable
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.altuscorp.altus.core.network.ApiResult
import com.altuscorp.altus.data.remote.dto.AccountsDto
import com.altuscorp.altus.data.remote.dto.AccountsSectionDto
import com.altuscorp.altus.data.repository.AccountsRepository
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
import kotlinx.coroutines.launch

/**
 * Admin · Accounts front door (read-only): the data-driven section registry the
 * web `/accounts` page renders, mirrored to a scannable list. Cache paints first
 * (skeletons only on a true cold cache); a network reconcile runs on entry and
 * on pull-to-refresh. All formatting happens here so the composables stay dumb.
 */

/** The three registry states, mapped to a pill label + how it earns colour. */
enum class SectionStatus { Built, Live, Coming }

/** One pre-formatted section card-row. */
@Immutable
data class AccountsSectionRow(
    /** Stable id — LazyColumn key. */
    val slug: String,
    /** Mono order badge, zero-padded ("02"). */
    val orderLabel: String,
    val title: String,
    val blurb: String,
    val status: SectionStatus,
    /** Pill label ("Built" · "Live" · "Coming"). */
    val statusLabel: String,
    /** Admin-restricted section (e.g. the CA-Handover vault) — shows a lock mark. */
    val sensitive: Boolean,
)

/** The screen's single source of truth (one @Immutable UiState). */
@Immutable
data class AccountsUiState(
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    val loadFailed: Boolean = false,
    val refreshFailed: Boolean = false,
    val title: String = "",
    val tagline: String = "",
    val builtCount: Int = 0,
    val liveCount: Int = 0,
    val totalCount: Int = 0,
    val sections: ImmutableList<AccountsSectionRow> = persistentListOf(),
) {
    val hasContent: Boolean get() = sections.isNotEmpty()
}

/** Everything the screen can ask for (one sealed intent). */
sealed interface AccountsIntent {
    data object Refresh : AccountsIntent
    data object Retry : AccountsIntent
}

@HiltViewModel
class AccountsViewModel @Inject constructor(
    private val repository: AccountsRepository,
) : ViewModel() {

    private val refreshing = MutableStateFlow(false)
    private val loadFailed = MutableStateFlow(false)
    private val refreshFailed = MutableStateFlow(false)

    val uiState: StateFlow<AccountsUiState> = combine(
        repository.accounts(),
        refreshing,
        loadFailed,
        refreshFailed,
    ) { snapshot, isRefreshing, coldFailed, warmFailed ->
        if (snapshot == null) {
            AccountsUiState(
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
        initialValue = AccountsUiState(),
    )

    init {
        refresh()
    }

    fun onIntent(intent: AccountsIntent) {
        when (intent) {
            AccountsIntent.Refresh, AccountsIntent.Retry -> refresh()
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

private fun AccountsDto.toUiState(
    isRefreshing: Boolean,
    refreshFailed: Boolean,
): AccountsUiState = AccountsUiState(
    isLoading = false,
    isRefreshing = isRefreshing,
    loadFailed = false,
    refreshFailed = refreshFailed,
    title = title,
    tagline = tagline,
    builtCount = builtCount,
    liveCount = liveCount,
    totalCount = totalCount,
    sections = sections.map { it.toRow() }.toImmutableList(),
)

private fun AccountsSectionDto.toRow(): AccountsSectionRow {
    val status = when (status) {
        "link" -> SectionStatus.Live
        "built" -> SectionStatus.Built
        else -> SectionStatus.Coming
    }
    return AccountsSectionRow(
        slug = slug,
        orderLabel = order.toString().padStart(2, '0'),
        title = title,
        blurb = blurb,
        status = status,
        statusLabel = when (status) {
            SectionStatus.Live -> "Live"
            SectionStatus.Built -> "Built"
            SectionStatus.Coming -> "Coming"
        },
        sensitive = sensitive,
    )
}
