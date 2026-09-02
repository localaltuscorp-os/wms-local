package com.altuscorp.altus.data.remote.dto

import kotlinx.serialization.Serializable

/**
 * GET /api/mobile/accounts/section/[slug] — a normalized detail for an Accounts
 * register section (Vasa · Shares · IT folders · SIP · Bank). Super-admin only.
 * Mirrors app/api/mobile/accounts/section/[slug]/route.ts.
 */
@Serializable
data class AccountsSectionDetailDto(
    val title: String = "",
    val subtitle: String = "",
    val stats: List<AccountsFieldDto> = emptyList(),
    val rows: List<AccountsRowDto> = emptyList(),
)

@Serializable
data class AccountsFieldDto(val label: String = "", val value: String = "")

@Serializable
data class AccountsRowDto(
    val title: String = "",
    val subtitle: String? = null,
    val link: String? = null,
    val fields: List<AccountsFieldDto> = emptyList(),
)
