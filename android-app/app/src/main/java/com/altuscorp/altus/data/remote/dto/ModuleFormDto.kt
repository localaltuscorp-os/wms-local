package com.altuscorp.altus.data.remote.dto

import kotlinx.serialization.Serializable

/**
 * GET /api/mobile/module/{key} — a form-driven Sales module (reference or
 * breakthrough): the module chrome, its request-field schema (so the form is
 * rendered dynamically), product options, and the signed-in user's own
 * submissions. Mirrors app/api/mobile/module/[key]/route.ts.
 */
@Serializable
data class ModuleFormDto(
    val key: String = "",
    val title: String = "",
    val subtitle: String = "",
    val buttonLabel: String = "",
    val fields: List<ModuleFieldDto> = emptyList(),
    val productOptions: List<String> = emptyList(),
    val submissions: List<ModuleSubmissionDto> = emptyList(),
)

@Serializable
data class ModuleFieldDto(
    val key: String = "",
    val label: String = "",
    /** text · textarea · email · tel · url · number · product · select · buttons */
    val type: String = "text",
    val required: Boolean = false,
    val placeholder: String? = null,
    val options: List<String> = emptyList(),
)

@Serializable
data class ModuleSubmissionDto(
    val id: String = "",
    val title: String = "",
    val status: String = "",
    val statusLabel: String = "",
    val createdAt: String = "",
    val pairs: List<ModulePairDto> = emptyList(),
)

@Serializable
data class ModulePairDto(val label: String = "", val value: String = "")

/** POST body — the field values the user entered. */
@Serializable
data class ModuleSubmitBody(val fields: Map<String, String>)

/** POST result. */
@Serializable
data class ModuleSubmitResult(
    val ok: Boolean = false,
    val id: String? = null,
    val error: String? = null,
)
