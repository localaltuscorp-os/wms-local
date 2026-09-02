package com.altuscorp.altus.data.remote.dto

import kotlinx.serialization.Serializable

/**
 * GET /api/mobile/outstanding — the Sales receivables dashboard, mirroring the
 * web `/outstanding` page's default (unfiltered) view: headline totals, the
 * overdue-by-days buckets, the month-wise overdue / not-due splits, the
 * responsible-person & billing-entity roll-ups, the PDC-not-received panel, the
 * collections overview, and the two ledgers (open installments + collections),
 * each trimmed server-side.
 *
 * The dashboard totals are always computed over the complete ledger; only the
 * two list payloads are capped (see [entriesTruncated] / [collectionsTruncated]).
 * Mirrors the live route exactly (app/api/mobile/outstanding/route.ts).
 */
@Serializable
data class OutstandingDto(
    val generatedAt: String = "",
    val today: String = "",
    val ownerName: String = "",
    val totals: OutstandingTotalsDto = OutstandingTotalsDto(),
    val buckets: List<OutstandingBucketDto> = emptyList(),
    val monthOverdue: List<OutstandingMonthDto> = emptyList(),
    val monthNotDue: List<OutstandingMonthDto> = emptyList(),
    val byEmployee: List<OutstandingRollupDto> = emptyList(),
    val byEntity: List<OutstandingRollupDto> = emptyList(),
    val pdc: OutstandingPdcDto = OutstandingPdcDto(),
    val collections: OutstandingCollectionsDto = OutstandingCollectionsDto(),
    val entries: List<OutstandingEntryDto> = emptyList(),
    val entriesTruncated: Boolean = false,
    val entriesTotal: Int = 0,
    val collectionEntries: List<OutstandingCollectionEntryDto> = emptyList(),
    val collectionsTruncated: Boolean = false,
    val collectionEntriesTotal: Int = 0,
)

@Serializable
data class OutstandingTotalsDto(
    /** Open balance across every non-paid installment (rupees). */
    val totalOutstanding: Double = 0.0,
    val overdue: Double = 0.0,
    val notDue: Double = 0.0,
    /** Count of open rows whose PDC has NOT been received. */
    val pdcNotReceived: Int = 0,
)

/** One overdue-by-days bucket ("0–3 Days Overdue" → count + balance). */
@Serializable
data class OutstandingBucketDto(
    val id: String = "",
    val label: String = "",
    val count: Int = 0,
    val amount: Double = 0.0,
)

/** One month row in a month-wise split ("2026-07" → cases + balance). */
@Serializable
data class OutstandingMonthDto(
    val month: String = "",
    val cases: Int = 0,
    val value: Double = 0.0,
)

/** One responsible-person or billing-entity roll-up row. */
@Serializable
data class OutstandingRollupDto(
    val name: String = "",
    val notDue: Double = 0.0,
    val overdue: Double = 0.0,
    val balance: Double = 0.0,
)

/** PDC-not-received panel: per-responsible rows + the grand totals. */
@Serializable
data class OutstandingPdcDto(
    val rows: List<OutstandingPdcRowDto> = emptyList(),
    val totalEntries: Int = 0,
    val totalAmount: Double = 0.0,
)

@Serializable
data class OutstandingPdcRowDto(
    val name: String = "",
    val entries: Int = 0,
    val amount: Double = 0.0,
)

/** Collections overview: total collected + the top mode/collector + splits. */
@Serializable
data class OutstandingCollectionsDto(
    val totalCollected: Double = 0.0,
    val topMode: String = "—",
    val topCollector: String = "—",
    val topClients: List<OutstandingNamedAmountDto> = emptyList(),
    val byMode: List<OutstandingNamedAmountDto> = emptyList(),
)

@Serializable
data class OutstandingNamedAmountDto(
    val name: String = "",
    val amount: Double = 0.0,
)

/** One open-installment ledger row. [state] is not_due | due_soon | overdue. */
@Serializable
data class OutstandingEntryDto(
    val id: String = "",
    val client: String = "",
    val particulars: String? = null,
    val responsible: String? = null,
    val entity: String? = null,
    val amount: Double = 0.0,
    val balance: Double = 0.0,
    val dueDate: String = "",
    val state: String = "",
    val daysOverdue: Int = 0,
    val pdcReceived: Boolean = true,
)

/** One collection (payment received) ledger row. */
@Serializable
data class OutstandingCollectionEntryDto(
    val id: String = "",
    val client: String = "",
    val amount: Double = 0.0,
    val paymentMode: String? = null,
    val responsible: String? = null,
    val comments: String? = null,
    val collectedAt: String = "",
)
