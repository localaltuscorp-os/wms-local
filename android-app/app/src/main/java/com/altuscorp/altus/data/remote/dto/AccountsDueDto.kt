package com.altuscorp.altus.data.remote.dto

import kotlinx.serialization.Serializable

/**
 * GET /api/mobile/accounts/due-dates — the Accounts "Due Dates Checklist" as a
 * card list: recurring bills & statutory items with a derived Paid / Pending
 * status. Super-admin only.
 *
 * Mirrors the live route (app/api/mobile/accounts/due-dates/route.ts).
 */
@Serializable
data class AccountsDueDto(
    val title: String = "",
    val tagline: String = "",
    val counts: AccountsDueCountsDto = AccountsDueCountsDto(),
    val items: List<AccountsDueItemDto> = emptyList(),
)

@Serializable
data class AccountsDueCountsDto(
    val total: Int = 0,
    val paid: Int = 0,
    val pending: Int = 0,
)

@Serializable
data class AccountsDueItemDto(
    val id: String = "",
    val code: String? = null,
    val area: String? = null,
    val compliance: String? = null,
    val frequency: String? = null,
    val statementPeriod: String? = null,
    val dueDate: String? = null,
    val paidDate: String? = null,
    val paidAmt: String? = null,
    val notes: String? = null,
    /** "paid" | "pending". */
    val status: String = "pending",
)
