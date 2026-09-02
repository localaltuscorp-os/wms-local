package com.altuscorp.altus.data.remote.dto

import kotlinx.serialization.Serializable

/**
 * GET /api/mobile/projects — the signed-in user's Projects overview: the same
 * org-wide project tree the web `/projects` page reads, collapsed to a flat
 * per-project card carrying its structure counts and a real completion meter
 * (linked tasks done / total). Read-only.
 *
 * Mirrors the live route exactly (app/api/mobile/projects/route.ts).
 */
@Serializable
data class ProjectsDto(
    /** When the server assembled this snapshot, ISO-8601. */
    val generatedAt: String = "",
    val totals: ProjectsTotalsDto = ProjectsTotalsDto(),
    val projects: List<ProjectRowDto> = emptyList(),
)

/** Org-wide roll-ups for the overview stat strip. */
@Serializable
data class ProjectsTotalsDto(
    val projects: Int = 0,
    val milestones: Int = 0,
    val results: Int = 0,
    /** Total linked (non-archived) tasks across every project. */
    val tasks: Int = 0,
)

/** One project card: structure counts + a done/total completion meter. */
@Serializable
data class ProjectRowDto(
    val id: String = "",
    val name: String = "",
    val ownerName: String? = null,
    /** ISO-8601 target date, or null when unset. */
    val targetDate: String? = null,
    val milestones: Int = 0,
    val results: Int = 0,
    /** Actions + sub-actions in the subtree. */
    val actions: Int = 0,
    val linkedTasks: Int = 0,
    val doneTasks: Int = 0,
    /** 0–100 (0 when there are no linked tasks — no divide-by-zero client-side). */
    val pct: Int = 0,
)
