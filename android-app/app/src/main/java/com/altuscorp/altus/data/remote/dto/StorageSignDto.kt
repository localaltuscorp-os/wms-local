package com.altuscorp.altus.data.remote.dto

import kotlinx.serialization.Serializable

/**
 * POST /api/mobile/storage/sign — the ONLY new backend glue for media
 * (architecture decision: hybrid [C]). The backend authenticates the Firebase
 * Bearer, applies the same app-code storage authz as web, and mints a
 * short-lived signed URL via `createSignedUploadUrl` / `createSignedUrl`.
 * The app then calls supabase-kt Storage `uploadToSignedUrl` / download.
 *
 * Not live server-side yet (P0 ask).
 */
@Serializable
data class StorageSignRequestDto(
    /** "avatars" | "documents". */
    val bucket: String,
    /** Object path within the bucket. */
    val path: String,
    /** "upload" | "download". */
    val mode: String,
    /** MIME type, upload mode only. */
    val contentType: String? = null,
)

@Serializable
data class StorageSignResponseDto(
    val ok: Boolean = false,
    /** The signed URL to upload to / download from. */
    val url: String = "",
    /** Upload token for supabase-kt `uploadToSignedUrl` (upload mode). */
    val token: String? = null,
    /** Echo of the object path (server may normalise it). */
    val path: String = "",
    /** Seconds until the signature expires. */
    val expiresInSeconds: Int = 0,
)
