package com.altuscorp.altus.feature.training

import androidx.compose.runtime.Immutable
import kotlinx.collections.immutable.ImmutableList
import kotlinx.collections.immutable.persistentListOf

/**
 * TRAINING CENTRE — the Training-workspace material library for the signed-in
 * user, plus their personalised induction path. One @Immutable UiState reduced
 * from the cache-first
 * [com.altuscorp.altus.data.repository.TrainingRepository] snapshot plus local
 * view state (the subject filter, the induction-only toggle, refresh / error
 * flags). Every field is render-ready so the composable stays a dumb render:
 * dates are pre-formatted, creators are pre-joined, the leading glyph is already
 * chosen and the induction progress meter is a resolved fraction.
 *
 * Faithful to the web `/training` page (the material library table + its
 * induction filter), narrowed to the one person the phone belongs to. Read-only:
 * material is authored / tests are taken on the web.
 */
@Immutable
data class TrainingUiState(
    /** Cold cache — paint the skeleton silhouette (Signature 8). */
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    /** Cold cache AND the fetch failed → full-screen retry state. */
    val loadFailed: Boolean = false,
    /** Content on screen but the reconcile failed → quiet stale banner. */
    val refreshFailed: Boolean = false,
    /** "Watch the material and take its tests." */
    val subtitle: String = "",
    /** The 2-up summary strip: watched-of-library · induction progress. */
    val kpis: ImmutableList<TrainingKpiUi> = persistentListOf(),
    /** The viewer's personalised induction path (empty = no department / none). */
    val induction: ImmutableList<TrainingInductionUi> = persistentListOf(),
    /** The subject filter chips (leading "All", then distinct subjects). */
    val subjects: ImmutableList<String> = persistentListOf(),
    /** Selected subject, or null for "All". */
    val subjectFilter: String? = null,
    /** Show only induction-flagged material (mirrors the web induction pill). */
    val inductionOnly: Boolean = false,
    /** The material library after the active facets are applied. */
    val materials: ImmutableList<TrainingMaterialUi> = persistentListOf(),
    /** Every material regardless of facets — the honest total for the counter. */
    val totalMaterials: Int = 0,
) {
    val hasContent: Boolean get() = kpis.isNotEmpty()
    val hasFilters: Boolean get() = subjectFilter != null || inductionOnly
    val hasInduction: Boolean get() = induction.isNotEmpty()
}

/** Which token an accent / meter draws from — resolved to a colour in the composable. */
enum class TrainingAccent { Training, Success, Neutral }

/** One summary stat card (mirrors the web KPI card grammar). */
@Immutable
data class TrainingKpiUi(
    val id: String,
    /** UPPERCASE eyebrow ("WATCHED"). */
    val label: String,
    /** Pre-formatted value ("12 / 40"). */
    val value: String,
    val caption: String,
    val accent: TrainingAccent,
    /** 0..1 fill for the thin meter, or null to hide it. */
    val progress: Float? = null,
)

/** The leading glyph for a material row — mirrors the web MaterialsTable icons. */
enum class TrainingGlyph { Video, Pdf, Xls, Doc }

/** One library material with the viewer's watched flag. */
@Immutable
data class TrainingMaterialUi(
    val id: String,
    /** Subject name, or "Unsorted" when null. */
    val title: String,
    /** Learning-objective line, or null. */
    val los: String?,
    /** "3 Jun 2026 · Manan +2 · v2" — added date, creators, version, render-ready. */
    val meta: String,
    /** The file name / "Video link" fallback. */
    val fileLabel: String,
    val glyph: TrainingGlyph,
    /** A watchable web link (video) — null on a stored file (opened on the web). */
    val videoUrl: String?,
    val partOfInduction: Boolean,
    val archived: Boolean,
    val watchedByMe: Boolean,
)

/** One item on the viewer's personalised induction path. */
@Immutable
data class TrainingInductionUi(
    val id: String,
    /** Subject name, or "Unsorted" when null. */
    val title: String,
    val los: String?,
    val glyph: TrainingGlyph,
    val videoUrl: String?,
    val watched: Boolean,
    /** null = no test-1; true/false = the viewer's pass state. */
    val test1Passed: Boolean?,
    val test2Passed: Boolean?,
    /** Watched AND every present test passed. */
    val complete: Boolean,
    /** "Watched · Test 1 ✓ · Test 2 —" — the step state, render-ready. */
    val statusLine: String,
)

/** User intents (one sealed hierarchy per screen contract). */
sealed interface TrainingIntent {
    data class SelectSubject(val subject: String?) : TrainingIntent
    data object ToggleInductionOnly : TrainingIntent
    data object Refresh : TrainingIntent
    data object Retry : TrainingIntent
}
