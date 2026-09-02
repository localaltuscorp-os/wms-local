package com.altuscorp.altus.data.remote.dto

import kotlinx.serialization.Serializable

/**
 * POST /api/mobile/register-push — upsert this device's FCM token to the
 * signed-in employee (re-login on a shared phone reassigns it).
 * DELETE /api/mobile/register-push — unregister on sign-out.
 *
 * Mirrors the live route exactly (app/api/mobile/register-push/route.ts).
 */
@Serializable
data class RegisterPushRequestDto(
    val token: String,
    /** "android" | "ios" — anything else coerces to android server-side. */
    val platform: String = "android",
)

/** DELETE body — just the token being retired. */
@Serializable
data class UnregisterPushRequestDto(
    val token: String,
)
