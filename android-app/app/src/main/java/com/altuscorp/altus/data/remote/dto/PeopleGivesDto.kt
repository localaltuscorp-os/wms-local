package com.altuscorp.altus.data.remote.dto

import kotlinx.serialization.Serializable

/**
 * GET /api/mobile/people-gives — the People Gives referral network (Sales
 * workspace): every logged introduction of who can introduce Altus to whom,
 * newest first. A shared read (the web `/people-gives` page shows the whole
 * network), flattened into render-ready display fields so the native screen
 * stays a dumb render. Mirrors the live route exactly.
 */
@Serializable
data class PeopleGivesDto(
    /** ISO-8601 instant the payload was built. */
    val generatedAt: String = "",
    /** Total introductions in the payload. */
    val count: Int = 0,
    val introductions: List<PeopleGivesIntroductionDto> = emptyList(),
)

/** One introduction row — an introducer, the prospect they can open a door to,
 *  and the sales meta around it. */
@Serializable
data class PeopleGivesIntroductionDto(
    val id: String = "",
    /** Raw `YYYY-MM-DD` the reference was received (for client-side sort/filter). */
    val receivedOn: String = "",
    /** Humanised received date ("4 Jul 2026"), or "—" when unknown. */
    val receivedOnLabel: String = "—",
    /** Managed lookup display name (may be null when the value was soft-deleted). */
    val referenceSource: String? = null,
    /** Introducer's full name ("Priya Shah"). */
    val introducerName: String = "",
    val introducerCell: String? = null,
    /** The prospect's company. */
    val prospectCompany: String = "",
    /** The prospect contact's full name. */
    val prospectName: String = "",
    val designation: String? = null,
    val businessCategory: String? = null,
    val natureOfBusiness: String = "",
    val notes: String? = null,
    /** Raw next-reminder date (`YYYY-MM-DD`) or null. */
    val nextReminderDate: String? = null,
    /** Humanised reminder date, or null when none is set. */
    val nextReminderLabel: String? = null,
    /** The assigned salesperson (managed lookup) or null. */
    val salesPerson: String? = null,
    /** The employee who logged the introduction, or null. */
    val createdBy: String? = null,
)
