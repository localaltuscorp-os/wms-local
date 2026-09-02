package com.altuscorp.altus.data.remote.dto

import kotlinx.serialization.Serializable

/**
 * DCC mutation bodies. Both replay through the WorkManager outbox and both
 * return [OkDto].
 *
 * Mirrors the live routes exactly (app/api/mobile/dcc/entry/route.ts,
 * app/api/mobile/dcc/participants/route.ts).
 */

/**
 * POST /api/mobile/dcc/entry — fill (or clear) ONE KPI slot.
 * Empty status+value+note clears the slot. `subjectId` targets one
 * participant's row on a participant-list KPI.
 */
@Serializable
data class DccEntryRequestDto(
    val itemId: String,
    /** `YYYY-MM-DD`. */
    val date: String,
    /** One of the board's `statuses`, or null to clear. */
    val status: String? = null,
    /** Numeric-KPI value; string or number accepted server-side — send string. */
    val value: String? = null,
    val note: String? = null,
    val subjectId: String? = null,
)

/**
 * POST /api/mobile/dcc/participants — set (or clear with null) the SAME status
 * for every participant of a participant-list KPI ("All Done" / "All NA" /
 * "Clear" — the roster wave).
 */
@Serializable
data class DccParticipantsRequestDto(
    val itemId: String,
    /** `YYYY-MM-DD`. */
    val date: String,
    val status: String? = null,
)
