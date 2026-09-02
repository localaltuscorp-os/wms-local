package com.altuscorp.altus.data.remote.dto

import kotlinx.serialization.Serializable

/**
 * GET /api/mobile/task-form — pick-lists for the New Task form: the active
 * employee roster, subject/client rosters, priority options, and the signed-in
 * user (default initiator).
 *
 * Mirrors the live route exactly (app/api/mobile/task-form/route.ts).
 */
@Serializable
data class TaskFormDto(
    val me: EmployeeOptionDto = EmployeeOptionDto(),
    val employees: List<EmployeeOptionDto> = emptyList(),
    val subjects: List<String> = emptyList(),
    val clients: List<String> = emptyList(),
    val priorities: List<PriorityOptionDto> = emptyList(),
)

@Serializable
data class EmployeeOptionDto(
    val id: String = "",
    val name: String = "",
)

@Serializable
data class PriorityOptionDto(
    /** Enum value sent back on create (e.g. "high"). */
    val value: String = "",
    /** Human label for the picker. */
    val label: String = "",
)
