package com.altuscorp.altus.feature.outstanding

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.altuscorp.altus.core.network.ApiResult
import com.altuscorp.altus.data.remote.dto.OutstandingBucketDto
import com.altuscorp.altus.data.remote.dto.OutstandingCollectionEntryDto
import com.altuscorp.altus.data.remote.dto.OutstandingDto
import com.altuscorp.altus.data.remote.dto.OutstandingEntryDto
import com.altuscorp.altus.data.remote.dto.OutstandingMonthDto
import com.altuscorp.altus.data.remote.dto.OutstandingNamedAmountDto
import com.altuscorp.altus.data.remote.dto.OutstandingPdcRowDto
import com.altuscorp.altus.data.remote.dto.OutstandingRollupDto
import com.altuscorp.altus.data.repository.OutstandingRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import java.time.LocalDate
import java.time.YearMonth
import java.time.format.DateTimeFormatter
import java.util.Locale
import javax.inject.Inject
import kotlin.math.abs
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
 * The Outstanding brain (Sales workspace). Reads are cache-first —
 * [OutstandingRepository.outstanding] paints the last-decoded snapshot instantly
 * (null → skeletons) while [refresh] reconciles against the server. Read-only:
 * there are no mobile Outstanding commits, so this ViewModel only owns the
 * refresh / error flags. All formatting (compact `₹` totals, grouped amounts,
 * month labels, state tokens) happens here so the composable stays a dumb render.
 */
@HiltViewModel
class OutstandingViewModel @Inject constructor(
    private val repository: OutstandingRepository,
) : ViewModel() {

    private data class LocalState(
        val isRefreshing: Boolean = false,
        val loadFailed: Boolean = false,
        val refreshFailed: Boolean = false,
    )

    private val local = MutableStateFlow(LocalState())

    val uiState: StateFlow<OutstandingUiState> =
        combine(repository.outstanding(), local, ::reduce)
            .stateIn(
                scope = viewModelScope,
                started = SharingStarted.WhileSubscribed(5_000),
                initialValue = OutstandingUiState(),
            )

    init {
        refresh()
    }

    fun onIntent(intent: OutstandingIntent) {
        when (intent) {
            OutstandingIntent.Refresh -> refresh()
            OutstandingIntent.Retry -> refresh()
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

    private fun reduce(dto: OutstandingDto?, local: LocalState): OutstandingUiState {
        if (dto == null) {
            return OutstandingUiState(
                isLoading = !local.loadFailed,
                isRefreshing = local.isRefreshing,
                loadFailed = local.loadFailed,
            )
        }

        val t = dto.totals
        val totals: ImmutableList<OutstandingStatUi> = persistentListOf(
            OutstandingStatUi(
                id = "outstanding",
                label = "Total outstanding",
                value = inrCompact(t.totalOutstanding),
                caption = "open balance across all clients",
                accent = OutstandingAccent.Sales,
            ),
            OutstandingStatUi(
                id = "overdue",
                label = "Overdue",
                value = inrCompact(t.overdue),
                caption = if (t.overdue > 0.0) "past the due date" else "nothing overdue",
                accent = if (t.overdue > 0.0) OutstandingAccent.Danger else OutstandingAccent.Neutral,
            ),
            OutstandingStatUi(
                id = "not-due",
                label = "Not due",
                value = inrCompact(t.notDue),
                caption = "within terms",
                accent = OutstandingAccent.Success,
            ),
            OutstandingStatUi(
                id = "pdc",
                label = "PDC pending",
                value = t.pdcNotReceived.toString(),
                caption = if (t.pdcNotReceived > 0) "cheques not received" else "all received",
                accent = if (t.pdcNotReceived > 0) OutstandingAccent.Warn else OutstandingAccent.Neutral,
            ),
        )

        val maxBucket = dto.buckets.maxOfOrNull { it.amount }?.takeIf { it > 0.0 } ?: 1.0
        val buckets = dto.buckets
            .filter { it.count > 0 }
            .map { it.toUi(maxBucket) }
            .toImmutableList()

        val pdcUi = OutstandingPdcUi(
            rows = dto.pdc.rows.map { it.toUi() }.toImmutableList(),
            totalCaption = "${dto.pdc.totalEntries} pending · ${inrCompact(dto.pdc.totalAmount)}",
        )

        val collectionsUi = OutstandingCollectionsUi(
            totalCollected = inrCompact(dto.collections.totalCollected),
            topMode = dto.collections.topMode,
            topCollector = dto.collections.topCollector,
            byMode = dto.collections.byMode.map { it.toUi() }.toImmutableList(),
            topClients = dto.collections.topClients.take(6).map { it.toUi() }.toImmutableList(),
        )

        return OutstandingUiState(
            isLoading = false,
            isRefreshing = local.isRefreshing,
            loadFailed = false,
            refreshFailed = local.refreshFailed,
            subtitle = "Client balances, overdue buckets & collections.",
            totals = totals,
            buckets = buckets,
            monthOverdue = dto.monthOverdue.map { it.toUi() }.toImmutableList(),
            monthNotDue = dto.monthNotDue.map { it.toUi() }.toImmutableList(),
            byEmployee = dto.byEmployee.map { it.toUi() }.toImmutableList(),
            byEntity = dto.byEntity.map { it.toUi() }.toImmutableList(),
            pdc = pdcUi,
            collections = collectionsUi,
            entries = dto.entries.map { it.toUi() }.toImmutableList(),
            entriesTruncated = dto.entriesTruncated,
            entriesTotal = dto.entriesTotal,
            collectionEntries = dto.collectionEntries.map { it.toUi() }.toImmutableList(),
            collectionsTruncated = dto.collectionsTruncated,
            collectionEntriesTotal = dto.collectionEntriesTotal,
        )
    }

    private fun OutstandingBucketDto.toUi(maxAmount: Double): OutstandingBucketUi =
        OutstandingBucketUi(
            id = id,
            label = label,
            amount = inrCompact(amount),
            count = if (count == 1) "1 case" else "$count cases",
            fraction = (amount / maxAmount).coerceIn(0.0, 1.0).toFloat(),
        )

    private fun OutstandingMonthDto.toUi(): OutstandingMonthUi = OutstandingMonthUi(
        month = month,
        monthLabel = monthLabel(month),
        value = inrCompact(value),
        cases = if (cases == 1) "1 case" else "$cases cases",
    )

    private fun OutstandingRollupDto.toUi(): OutstandingRollupUi = OutstandingRollupUi(
        name = name,
        balance = inrCompact(balance),
        split = "${inrCompact(overdue)} overdue · ${inrCompact(notDue)} not due",
        hasOverdue = overdue > 0.0,
    )

    private fun OutstandingPdcRowDto.toUi(): OutstandingPdcRowUi = OutstandingPdcRowUi(
        name = name,
        amount = inrCompact(amount),
        entries = if (entries == 1) "1 entry" else "$entries entries",
    )

    private fun OutstandingNamedAmountDto.toUi(): OutstandingNamedAmountUi =
        OutstandingNamedAmountUi(name = name, amount = inrCompact(amount))

    private fun OutstandingEntryDto.toUi(): OutstandingEntryUi = OutstandingEntryUi(
        id = id,
        client = client,
        sub = listOfNotNull(
            particulars?.takeIf { it.isNotBlank() },
            responsible?.takeIf { it.isNotBlank() },
        ).joinToString(" · ").ifBlank { "—" },
        amount = inrGrouped(balance),
        dueLabel = "Due ${dayLabel(dueDate)}",
        stateToken = stateToken(state),
        stateLabel = stateLabel(state, daysOverdue),
    )

    private fun OutstandingCollectionEntryDto.toUi(): OutstandingCollectionUi = OutstandingCollectionUi(
        id = id,
        client = client,
        amount = inrGrouped(amount),
        sub = listOfNotNull(
            dayLabel(collectedAt).takeIf { it.isNotBlank() },
            paymentMode?.takeIf { it.isNotBlank() },
            responsible?.takeIf { it.isNotBlank() },
        ).joinToString(" · ").ifBlank { "—" },
    )

    private fun stateToken(state: String): String = when (state.lowercase()) {
        "overdue" -> "red"
        "due_soon" -> "amber"
        else -> "slate" // not_due / anything new
    }

    private fun stateLabel(state: String, daysOverdue: Int): String = when (state.lowercase()) {
        "overdue" -> if (daysOverdue > 0) "$daysOverdue d overdue" else "Overdue"
        "due_soon" -> "Due soon"
        "paid" -> "Paid"
        else -> "Not due"
    }

    /** "Jul 2026" from a `YYYY-MM` bucket, tolerant of a stray malformed key. */
    private fun monthLabel(month: String): String = try {
        YearMonth.parse(month).format(MONTH)
    } catch (_: Exception) {
        month
    }

    /** "12 Jun" from a `YYYY-MM-DD` date, tolerant of a stray malformed value. */
    private fun dayLabel(iso: String): String = try {
        LocalDate.parse(iso).format(DAY)
    } catch (_: Exception) {
        iso
    }

    /** Compact Indian money — "₹1.24 Cr" / "₹4.2 L" / "₹8,400" / "₹0". */
    private fun inrCompact(amount: Double): String {
        val v = abs(amount)
        return when {
            v >= 1_00_00_000 -> "₹%.2f Cr".format(amount / 1_00_00_000)
            v >= 1_00_000 -> "₹%.1f L".format(amount / 1_00_000)
            else -> inrGrouped(amount)
        }
    }

    /** Full Indian-grouped money with no decimals — "₹8,52,000". */
    private fun inrGrouped(amount: Double): String = "₹" + INR.format(kotlin.math.round(amount).toLong())

    private companion object {
        val INR: java.text.NumberFormat =
            java.text.NumberFormat.getInstance(Locale("en", "IN"))
        val MONTH: DateTimeFormatter = DateTimeFormatter.ofPattern("MMM yyyy", Locale.ENGLISH)
        val DAY: DateTimeFormatter = DateTimeFormatter.ofPattern("d MMM", Locale.ENGLISH)
    }
}
