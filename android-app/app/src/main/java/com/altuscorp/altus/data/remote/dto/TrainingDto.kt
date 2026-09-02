package com.altuscorp.altus.data.remote.dto

import kotlinx.serialization.Serializable

/**
 * GET /api/mobile/training — the Training Centre for the SIGNED-IN user
 * (Training workspace): the material library with the viewer's own watched flag,
 * plus their personalised induction path (department-tagged induction material
 * with watch + test completion).
 *
 * Owner-scoped — the watched flag and the induction path are the phone owner's.
 * Mirrors the live route exactly (app/api/mobile/training/route.ts). Read-only:
 * material is authored / tests are taken on the web.
 */
@Serializable
data class TrainingDto(
    val ownerName: String = "",
    /** Manager / admin — sees archived material too (parity with the web page). */
    val canManage: Boolean = false,
    val stats: TrainingStatsDto = TrainingStatsDto(),
    val induction: List<TrainingInductionDto> = emptyList(),
    val materials: List<TrainingMaterialDto> = emptyList(),
)

@Serializable
data class TrainingStatsDto(
    /** How many materials are in the library. */
    val materials: Int = 0,
    /** How many the viewer has watched. */
    val watched: Int = 0,
    /** How many induction items are on the viewer's path (0 = no department). */
    val inductionTotal: Int = 0,
    /** How many of those are complete (watched + tests passed). */
    val inductionDone: Int = 0,
)

/** One library material with the viewer's watched flag. */
@Serializable
data class TrainingMaterialDto(
    val id: String = "",
    /** `YYYY-MM-DD` the material was added. */
    val addedOn: String = "",
    /** Pre-formatted "3 Jun 2026". */
    val addedOnLabel: String = "",
    val subject: String? = null,
    /** Learning-objective string. */
    val los: String? = null,
    val fileName: String? = null,
    /** Leading-glyph hint: "video" | "pdf" | "xls" | "other". */
    val kind: String = "other",
    val videoUrl: String? = null,
    val version: String? = null,
    val partOfInduction: Boolean = false,
    val archived: Boolean = false,
    /** Resolved author names (may be empty). */
    val createdByNames: List<String> = emptyList(),
    val watchedByMe: Boolean = false,
)

/** One item on the viewer's personalised induction path. */
@Serializable
data class TrainingInductionDto(
    val id: String = "",
    val subject: String? = null,
    val los: String? = null,
    val fileName: String? = null,
    /** Leading-glyph hint: "video" | "pdf" | "xls" | "other". */
    val kind: String = "other",
    val videoUrl: String? = null,
    val watched: Boolean = false,
    /** null = the material has no test-1; true/false = the viewer's pass state. */
    val test1Passed: Boolean? = null,
    val test2Passed: Boolean? = null,
    /** Watched AND every present test passed. */
    val complete: Boolean = false,
)
