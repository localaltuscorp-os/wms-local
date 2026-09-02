package com.altuscorp.altus.data.remote.dto

import kotlinx.serialization.Serializable

/**
 * GET /api/mobile/index-hub — Marketing "Index Hub": campaign / reach / lead-gen
 * links grouped into sections. Mirrors app/api/mobile/index-hub/route.ts.
 */
@Serializable
data class IndexHubDto(
    val sections: List<IndexSectionDto> = emptyList(),
)

@Serializable
data class IndexSectionDto(
    val id: String = "",
    val title: String = "",
    val links: List<IndexLinkDto> = emptyList(),
)

@Serializable
data class IndexLinkDto(
    val id: String = "",
    val label: String = "",
    val url: String = "",
)
