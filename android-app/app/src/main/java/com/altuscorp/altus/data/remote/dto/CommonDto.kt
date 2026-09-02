package com.altuscorp.altus.data.remote.dto

import kotlinx.serialization.Serializable

/**
 * The universal mutation acknowledgement shape returned by every simple
 * `/api/mobile/...` write (`{ ok: true }`). All fields default so a missing or
 * extra key never throws (contract hardening: fields nullable/defaulted by
 * default, `ignoreUnknownKeys` in the shared Json).
 */
@Serializable
data class OkDto(
    val ok: Boolean = true,
)
