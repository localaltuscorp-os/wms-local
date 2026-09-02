package com.altuscorp.altus.feature.peoplegives

import androidx.compose.runtime.Immutable
import kotlinx.collections.immutable.ImmutableList
import kotlinx.collections.immutable.persistentListOf

/**
 * PEOPLE GIVES (Sales workspace) — the referral network: who can introduce Altus
 * to whom. One @Immutable UiState reduced from the cache-first
 * [com.altuscorp.altus.data.repository.PeopleGivesRepository] snapshot plus local
 * view state (search text, category filter, refresh / error flags). Every field
 * is render-ready so the composable stays a dumb render — dates arrive already
 * humanised from the route, and the filtered list is computed in the reducer.
 *
 * Faithful to the web `/people-gives` page (a searchable, filterable table of
 * introductions), re-laid as a mobile card ledger — one card per introduction.
 */
@Immutable
data class PeopleGivesUiState(
    /** Cold cache — paint the skeleton silhouette (Signature 8). */
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    /** Cold cache AND the fetch failed → full-screen retry state. */
    val loadFailed: Boolean = false,
    /** Content on screen but the reconcile failed → quiet stale banner. */
    val refreshFailed: Boolean = false,
    /** "Who can introduce us to whom — the referral network at a glance." */
    val subtitle: String = "",
    /** Live search text (introducer, company, prospect, notes). */
    val query: String = "",
    /** The selected business-category filter, or null for "all". */
    val selectedCategory: String? = null,
    /** Distinct business categories present in the network, for the filter chips. */
    val categories: ImmutableList<String> = persistentListOf(),
    /** Total introductions in the network (unfiltered). */
    val total: Int = 0,
    /** The filtered, render-ready introduction cards (newest first). */
    val introductions: ImmutableList<PeopleGivesIntroUi> = persistentListOf(),
) {
    val hasContent: Boolean get() = total > 0
    val isFiltered: Boolean get() = query.isNotBlank() || selectedCategory != null
}

/** One introduction card — an introducer, the prospect they can open a door to,
 *  and the sales meta around it. Every field is pre-formatted for render. */
@Immutable
data class PeopleGivesIntroUi(
    val id: String,
    /** Introducer's full name ("Priya Shah"). */
    val introducerName: String,
    val introducerCell: String?,
    /** Humanised received date ("4 Jul 2026"). */
    val receivedOnLabel: String,
    /** The prospect contact's full name. */
    val prospectName: String,
    /** The prospect's company. */
    val prospectCompany: String,
    val designation: String?,
    val natureOfBusiness: String,
    /** Managed lookup display names (null when unset / soft-deleted). */
    val referenceSource: String?,
    val businessCategory: String?,
    val salesPerson: String?,
    /** Humanised next-reminder date, or null when none is set. */
    val reminderLabel: String?,
    val createdBy: String?,
)

/** User intents (one sealed hierarchy per screen contract). */
sealed interface PeopleGivesIntent {
    data object Refresh : PeopleGivesIntent
    data object Retry : PeopleGivesIntent
    data class SearchChanged(val query: String) : PeopleGivesIntent
    /** Toggle a category filter; null clears it. */
    data class CategorySelected(val category: String?) : PeopleGivesIntent
}
