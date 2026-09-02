package com.altuscorp.altus.data.remote.dto

import kotlinx.serialization.Serializable

/**
 * GET /api/mobile/dcc[?date=YYYY-MM-DD] — the signed-in user's DCC board for a
 * day: the daily due-set grouped by (section, client instance), participant-list
 * KPIs with rosters, and the weekly / monthly / ad-hoc trays.
 *
 * `stats` feeds the pinned compliance ring (S5) and the Day Ring's DCC segment.
 * `statuses` is the server's status vocabulary ("Done", "Not done", "NA",
 * "Pending") — never hard-code it.
 *
 * Mirrors the live route exactly (app/api/mobile/dcc/route.ts).
 */
@Serializable
data class DccDto(
    /** The board's date, `YYYY-MM-DD`. */
    val date: String = "",
    /** Today in the employee's timezone, `YYYY-MM-DD`. */
    val today: String = "",
    val ownerName: String = "",
    /** Legal status values for entries. */
    val statuses: List<String> = emptyList(),
    val stats: DccStatsDto = DccStatsDto(),
    val sections: List<DccSectionDto> = emptyList(),
    val participants: List<DccParticipantDto> = emptyList(),
    val trays: DccTraysDto = DccTraysDto(),
)

@Serializable
data class DccStatsDto(
    val due: Int = 0,
    val filled: Int = 0,
    /** 0–100 (0 when due == 0 — no divide-by-zero client-side). */
    val pct: Int = 0,
)

/** One sticky section ("SECTION B · CLIENT: ACME"). */
@Serializable
data class DccSectionDto(
    /** Stable group key `section∷clientId` — use as LazyColumn key. */
    val key: String = "",
    val section: String = "",
    val clientName: String? = null,
    val items: List<DccItemDto> = emptyList(),
)

/** One KPI row (also the tray-row shape). Entry state is inlined for the date. */
@Serializable
data class DccItemDto(
    val id: String = "",
    val code: String? = null,
    val title: String = "",
    /** e.g. "daily", "Every Friday" — display-only. */
    val frequency: String? = null,
    /** This date's committed status, or null when unfilled. */
    val status: String? = null,
    /** Numeric-KPI value as a string (server-normalised), or null. */
    val value: String? = null,
    val note: String? = null,
)

/** A participant-list KPI with its roster (S5 roster card). */
@Serializable
data class DccParticipantDto(
    val id: String = "",
    val code: String? = null,
    val title: String = "",
    val frequency: String? = null,
    val total: Int = 0,
    val doneCount: Int = 0,
    val subjects: List<DccParticipantSubjectDto> = emptyList(),
)

@Serializable
data class DccParticipantSubjectDto(
    val id: String = "",
    val name: String = "",
    val kind: String? = null,
    /** Per-person status for the date, or null. */
    val status: String? = null,
)

@Serializable
data class DccTraysDto(
    val weekly: List<DccItemDto> = emptyList(),
    val monthly: List<DccItemDto> = emptyList(),
    val adhoc: List<DccItemDto> = emptyList(),
)
