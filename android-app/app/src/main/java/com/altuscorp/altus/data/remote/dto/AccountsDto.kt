package com.altuscorp.altus.data.remote.dto

import kotlinx.serialization.Serializable

/**
 * GET /api/mobile/accounts — the Accounts module front door: the same
 * data-driven section registry the web `/accounts` page reads
 * (`ACCOUNTS_SECTIONS`), ordered, with a built/total roll-up. Read-only.
 *
 * Mirrors the live route exactly (app/api/mobile/accounts/route.ts).
 */
@Serializable
data class AccountsDto(
    /** When the server assembled this snapshot, ISO-8601. */
    val generatedAt: String = "",
    val title: String = "",
    val tagline: String = "",
    /** Sections rendering their real screen on the web. */
    val builtCount: Int = 0,
    /** Built + link sections — everything already pressable/live. */
    val liveCount: Int = 0,
    val totalCount: Int = 0,
    val sections: List<AccountsSectionDto> = emptyList(),
)

/** One section card-row: order badge, title + blurb, status + a restricted flag. */
@Serializable
data class AccountsSectionDto(
    val slug: String = "",
    val order: Int = 0,
    val title: String = "",
    val blurb: String = "",
    /** "built" | "stub" | "link" — drives the status pill. */
    val status: String = "stub",
    /** In-app route for a `link` section (opened on the web), or null. */
    val href: String? = null,
    /** Admin-restricted section (e.g. the CA-Handover vault) — shows a lock pill. */
    val sensitive: Boolean = false,
)
