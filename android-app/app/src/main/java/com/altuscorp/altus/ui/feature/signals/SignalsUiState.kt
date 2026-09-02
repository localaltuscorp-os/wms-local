package com.altuscorp.altus.feature.signals

import androidx.compose.runtime.Immutable
import com.altuscorp.altus.domain.model.StatusDisplay
import kotlinx.collections.immutable.ImmutableList
import kotlinx.collections.immutable.persistentListOf

/**
 * SIGNALS — the signed-in user's OWN performance signals feed (Employees ·
 * PMS). One @Immutable UiState reduced from the cache-first
 * [com.altuscorp.altus.data.repository.SignalsRepository] snapshot plus local
 * refresh / error flags. Read-only: nothing here is a decision surface (the
 * score engine only *suggests* recognition and *flags* promotions; a human
 * releases every consequence on the web console), so this ViewModel owns no
 * commits. Every field is render-ready — periods and dates are pre-formatted,
 * status pills already carry their colour token — so the composable stays a
 * dumb render.
 *
 * Faithful to the web `/pms/signals` page (glass hero + a KPI strip, then the
 * Recognition and Promotion-signals columns), narrowed to the one person the
 * phone belongs to.
 */
@Immutable
data class SignalsUiState(
    /** Cold cache — paint the skeleton silhouette (Signature 8). */
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    /** Cold cache AND the fetch failed → full-screen retry state. */
    val loadFailed: Boolean = false,
    /** Content on screen but the reconcile failed → quiet stale banner. */
    val refreshFailed: Boolean = false,
    val ownerName: String = "",
    /** "The recognition and promotion signals the score engine has raised about you." */
    val subtitle: String = "",
    /** The 2-up KPI strip: recognitions · promotion signals. */
    val kpis: ImmutableList<SignalsKpiUi> = persistentListOf(),
    val recognitions: ImmutableList<RecognitionUi> = persistentListOf(),
    val promotions: ImmutableList<PromotionUi> = persistentListOf(),
) {
    /** True once a snapshot has been reduced (the KPI strip is always built then). */
    val hasContent: Boolean get() = kpis.isNotEmpty()
}

/** Which token an accent / meter draws from — resolved to a colour in the composable. */
enum class SignalsAccent { Employees, Success, Warn, Neutral }

/** One KPI stat card (mirrors the web `KpiCard`). */
@Immutable
data class SignalsKpiUi(
    /** Stable key. */
    val id: String,
    /** UPPERCASE eyebrow ("RECOGNITIONS"). */
    val label: String,
    /** Pre-formatted mono value ("3"). */
    val value: String,
    val caption: String,
    val accent: SignalsAccent,
)

/** One recognition suggested/released for the viewer. */
@Immutable
data class RecognitionUi(
    val id: String,
    /** The recognition kind ("Spot award", "Star performer"). */
    val kind: String,
    /** "Jul 2026" (+ " · Score 87" folded in when a snapshot exists). */
    val meta: String,
    val reason: String?,
    val status: StatusDisplay,
    /** "Released by Ana · 1 Jul 2026" for a decided row, else null. */
    val footnote: String?,
)

/** One promotion signal flagged against the viewer. */
@Immutable
data class PromotionUi(
    val id: String,
    /** The score snapshot as a bare mono number ("87"), or null. */
    val scoreLabel: String?,
    /** "Eligible since 1 Jul 2026", or null. */
    val eligibleLabel: String?,
    val rationale: String?,
    val status: StatusDisplay,
    /** "Actioned by Ana · 1 Jul 2026" for a decided row, else null. */
    val footnote: String?,
)

/** User intents (one sealed hierarchy per screen contract). */
sealed interface SignalsIntent {
    data object Refresh : SignalsIntent
    data object Retry : SignalsIntent
}
