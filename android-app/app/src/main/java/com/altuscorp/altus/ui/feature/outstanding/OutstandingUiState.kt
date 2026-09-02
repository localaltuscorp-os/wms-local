package com.altuscorp.altus.feature.outstanding

import androidx.compose.runtime.Immutable
import kotlinx.collections.immutable.ImmutableList
import kotlinx.collections.immutable.persistentListOf

/**
 * OUTSTANDING — the Sales receivables dashboard for the native app, reduced from
 * the cache-first [com.altuscorp.altus.data.repository.OutstandingRepository]
 * snapshot plus local view state (refresh / error flags). Every field is
 * render-ready so the composable stays a dumb render: money is pre-formatted `₹`
 * copy, meters carry a resolved 0..1 fraction, and each row's state already maps
 * to a colour token.
 *
 * Faithful to the web `/outstanding` page's default view: headline totals, the
 * overdue-by-days buckets, month-wise overdue / not-due, the responsible &
 * entity roll-ups, the PDC panel, the collections overview, and the two ledgers.
 */
@Immutable
data class OutstandingUiState(
    /** Cold cache — paint the skeleton silhouette (Signature 8). */
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    /** Cold cache AND the fetch failed → full-screen retry state. */
    val loadFailed: Boolean = false,
    /** Content on screen but the reconcile failed → quiet stale banner. */
    val refreshFailed: Boolean = false,
    val subtitle: String = "",
    /** The 4-up KPI strip: total outstanding · overdue · not due · PDC pending. */
    val totals: ImmutableList<OutstandingStatUi> = persistentListOf(),
    val buckets: ImmutableList<OutstandingBucketUi> = persistentListOf(),
    val monthOverdue: ImmutableList<OutstandingMonthUi> = persistentListOf(),
    val monthNotDue: ImmutableList<OutstandingMonthUi> = persistentListOf(),
    val byEmployee: ImmutableList<OutstandingRollupUi> = persistentListOf(),
    val byEntity: ImmutableList<OutstandingRollupUi> = persistentListOf(),
    val pdc: OutstandingPdcUi = OutstandingPdcUi(),
    val collections: OutstandingCollectionsUi = OutstandingCollectionsUi(),
    val entries: ImmutableList<OutstandingEntryUi> = persistentListOf(),
    val entriesTruncated: Boolean = false,
    val entriesTotal: Int = 0,
    val collectionEntries: ImmutableList<OutstandingCollectionUi> = persistentListOf(),
    val collectionsTruncated: Boolean = false,
    val collectionEntriesTotal: Int = 0,
) {
    val hasContent: Boolean get() = totals.isNotEmpty()
}

/** Which token an accent / meter draws from — resolved to a colour in the composable. */
enum class OutstandingAccent { Sales, Success, Danger, Warn, Neutral }

/** One headline KPI card. */
@Immutable
data class OutstandingStatUi(
    val id: String,
    val label: String,
    val value: String,
    val caption: String,
    val accent: OutstandingAccent,
)

/** One overdue-by-days bucket row (with a meter fraction relative to the max). */
@Immutable
data class OutstandingBucketUi(
    val id: String,
    val label: String,
    val amount: String,
    val count: String,
    /** 0..1 fill of this bucket's balance against the largest bucket. */
    val fraction: Float,
)

/** One month row in a month-wise split. */
@Immutable
data class OutstandingMonthUi(
    val month: String,
    val monthLabel: String,
    val value: String,
    val cases: String,
)

/** One responsible-person / entity roll-up row. */
@Immutable
data class OutstandingRollupUi(
    val name: String,
    val balance: String,
    /** "₹4.2L overdue · ₹1.1L not due" — the split, render-ready. */
    val split: String,
    /** True when this row carries any overdue balance (drives the accent). */
    val hasOverdue: Boolean,
)

/** The PDC-not-received panel. */
@Immutable
data class OutstandingPdcUi(
    val rows: ImmutableList<OutstandingPdcRowUi> = persistentListOf(),
    val totalCaption: String = "",
)

@Immutable
data class OutstandingPdcRowUi(
    val name: String,
    val amount: String,
    val entries: String,
)

/** The collections overview. */
@Immutable
data class OutstandingCollectionsUi(
    val totalCollected: String = "₹0",
    val topMode: String = "—",
    val topCollector: String = "—",
    val byMode: ImmutableList<OutstandingNamedAmountUi> = persistentListOf(),
    val topClients: ImmutableList<OutstandingNamedAmountUi> = persistentListOf(),
)

@Immutable
data class OutstandingNamedAmountUi(
    val name: String,
    val amount: String,
)

/** One open-installment ledger row. */
@Immutable
data class OutstandingEntryUi(
    val id: String,
    val client: String,
    val sub: String,
    val amount: String,
    val dueLabel: String,
    /** Colour token for the state pill ("red" | "amber" | "slate"). */
    val stateToken: String,
    val stateLabel: String,
)

/** One collection (payment received) ledger row. */
@Immutable
data class OutstandingCollectionUi(
    val id: String,
    val client: String,
    val amount: String,
    val sub: String,
)

/** User intents (one sealed hierarchy per screen contract). */
sealed interface OutstandingIntent {
    data object Refresh : OutstandingIntent
    data object Retry : OutstandingIntent
}
