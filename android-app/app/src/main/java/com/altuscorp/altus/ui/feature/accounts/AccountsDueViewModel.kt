package com.altuscorp.altus.feature.accounts

import androidx.compose.runtime.Immutable
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.altuscorp.altus.core.network.ApiResult
import com.altuscorp.altus.data.remote.dto.AccountsDueDto
import com.altuscorp.altus.data.remote.dto.AccountsDueItemDto
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
 * Admin · Accounts → Due Dates Checklist (read-only): recurring bills & statutory
 * items with a Paid / Pending status, mirrored from the web section. Same
 * cache-first spine as [AccountsViewModel] — cache paints first, a reconcile runs
 * on entry and on pull-to-refresh; all formatting happens here.
 */

/** One pre-formatted due-item card-row. */
@Immutable
data class DueItemRow(
    val id: String,
    val code: String?,
    val title: String,
    /** "Frequency · Statement period", pre-joined; blank when both absent. */
    val meta: String,
    val dueDate: String?,
    val paidLine: String?,
    val notes: String?,
    val paid: Boolean,
)

@Immutable
data class AccountsDueUiState(
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    val loadFailed: Boolean = false,
    val refreshFailed: Boolean = false,
    val title: String = "Due Dates",
    val tagline: String = "",
    val total: Int = 0,
    val paid: Int = 0,
    val pending: Int = 0,
    val items: ImmutableList<DueItemRow> = persistentListOf(),
) {
    val hasContent: Boolean get() = items.isNotEmpty()
}

sealed interface AccountsDueIntent {
    data object Refresh : AccountsDueIntent
    data object Retry : AccountsDueIntent
}

@HiltViewModel
class AccountsDueViewModel @Inject constructor(
    private val repository: AccountsRepository,
) : ViewModel() {

    private val refreshing = MutableStateFlow(false)
    private val loadFailed = MutableStateFlow(false)
    private val refreshFailed = MutableStateFlow(false)

    val uiState: StateFlow<AccountsDueUiState> = combine(
        repository.dueDates(),
        refreshing,
        loadFailed,
        refreshFailed,
    ) { snapshot, isRefreshing, coldFailed, warmFailed ->
        if (snapshot == null) {
            AccountsDueUiState(
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
        initialValue = AccountsDueUiState(),
    )

    init {
        refresh()
    }

    fun onIntent(intent: AccountsDueIntent) {
        when (intent) {
            AccountsDueIntent.Refresh, AccountsDueIntent.Retry -> refresh()
        }
    }

    private fun refresh() {
        if (refreshing.value) return
        refreshing.value = true
        loadFailed.value = false
        refreshFailed.value = false
        viewModelScope.launch {
            when (repository.refreshDueDates()) {
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

private fun AccountsDueDto.toUiState(
    isRefreshing: Boolean,
    refreshFailed: Boolean,
): AccountsDueUiState = AccountsDueUiState(
    isLoading = false,
    isRefreshing = isRefreshing,
    loadFailed = false,
    refreshFailed = refreshFailed,
    title = title.ifBlank { "Due Dates" },
    tagline = tagline,
    total = counts.total,
    paid = counts.paid,
    pending = counts.pending,
    items = items.map { it.toRow() }.toImmutableList(),
)

private fun AccountsDueItemDto.toRow(): DueItemRow {
    val meta = listOfNotNull(
        frequency?.takeIf { it.isNotBlank() },
        statementPeriod?.takeIf { it.isNotBlank() },
    ).joinToString(" · ")
    val paidLine = if (status == "paid") {
        listOfNotNull(
            paidDate?.takeIf { it.isNotBlank() },
            paidAmt?.takeIf { it.isNotBlank() }?.let { "₹$it" },
        ).joinToString(" · ").ifBlank { "Paid" }
    } else {
        null
    }
    return DueItemRow(
        id = id,
        code = code?.takeIf { it.isNotBlank() },
        title = (compliance ?: area ?: code ?: "Due item").trim(),
        meta = meta,
        dueDate = dueDate?.takeIf { it.isNotBlank() },
        paidLine = paidLine,
        notes = notes?.takeIf { it.isNotBlank() },
        paid = status == "paid",
    )
}
