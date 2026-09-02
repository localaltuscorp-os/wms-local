package com.altuscorp.altus.data.supabase

import com.altuscorp.altus.core.di.IoDispatcher
import com.altuscorp.altus.core.di.RawHttpClient
import com.altuscorp.altus.core.network.AltusApi
import com.altuscorp.altus.core.network.ApiResult
import com.altuscorp.altus.core.network.safeApiCall
import com.altuscorp.altus.data.remote.dto.StorageSignRequestDto
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.storage.storage
import io.ktor.http.ContentType
import java.io.IOException
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import timber.log.Timber

/**
 * Media transfer per the hybrid [C] decision: authorization stays in backend
 * app-code (identical to web — no Storage RLS to author), bytes move directly
 * between device and Supabase Storage.
 *
 * Every operation is two steps:
 *  1. `POST /api/mobile/storage/sign` (Firebase Bearer) mints a short-lived
 *     signed upload token / download URL for `documents` / `avatars`.
 *  2. The bytes ride the signature — uploads via supabase-kt
 *     `uploadToSignedUrl`, downloads via a plain GET on the signed URL (the
 *     [RawHttpClient]: the signature IS the auth, so no Bearer is attached).
 *
 * Both steps map into the app's single [ApiResult] vocabulary so callers get
 * the same ReAuth/Enrollment/offline semantics as any REST call.
 */
@Singleton
class SupabaseStorage @Inject constructor(
    private val supabase: SupabaseClient,
    private val api: AltusApi,
    @RawHttpClient private val httpClient: OkHttpClient,
    @IoDispatcher private val ioDispatcher: CoroutineDispatcher,
) {

    /** Known buckets (both private; web reads them via signed URLs too). */
    object Buckets {
        const val AVATARS = "avatars"
        const val DOCUMENTS = "documents"
    }

    /**
     * Upload [bytes] to `bucket/path`. Returns the server-confirmed object
     * path (feed it back to the backend when attaching to a record).
     */
    suspend fun upload(
        bucket: String,
        path: String,
        bytes: ByteArray,
        contentType: String? = null,
        upsert: Boolean = true,
    ): ApiResult<String> {
        val signed = safeApiCall {
            api.signStorage(
                StorageSignRequestDto(
                    bucket = bucket,
                    path = path,
                    mode = MODE_UPLOAD,
                    contentType = contentType,
                ),
            )
        }
        return when (signed) {
            is ApiResult.Success -> {
                val token = signed.data.token
                val signedPath = signed.data.path.ifBlank { path }
                if (token.isNullOrBlank()) {
                    ApiResult.Failure(message = "Upload authorization was incomplete — try again.")
                } else {
                    transfer("Upload") {
                        val response = supabase.storage.from(bucket)
                            .uploadToSignedUrl(signedPath, token, bytes) {
                                this.upsert = upsert
                                contentType?.let { this.contentType = ContentType.parse(it) }
                            }
                        response.path
                    }
                }
            }
            is ApiResult.ReAuth -> signed
            is ApiResult.Enrollment -> signed
            is ApiResult.Gate -> signed
            is ApiResult.Failure -> signed
        }
    }

    /** Download the object at `bucket/path` as raw bytes (avatars, documents). */
    suspend fun download(bucket: String, path: String): ApiResult<ByteArray> {
        val signed = safeApiCall {
            api.signStorage(
                StorageSignRequestDto(bucket = bucket, path = path, mode = MODE_DOWNLOAD),
            )
        }
        return when (signed) {
            is ApiResult.Success -> {
                val url = signed.data.url
                if (url.isBlank()) {
                    ApiResult.Failure(message = "Download authorization was incomplete — try again.")
                } else {
                    transfer("Download") { fetchBytes(url) }
                }
            }
            is ApiResult.ReAuth -> signed
            is ApiResult.Enrollment -> signed
            is ApiResult.Gate -> signed
            is ApiResult.Failure -> signed
        }
    }

    /**
     * The signed *display* URL itself, for handing straight to Coil (avatar
     * rows) instead of buffering bytes here. Short-lived by design.
     */
    suspend fun signedDownloadUrl(bucket: String, path: String): ApiResult<String> {
        val signed = safeApiCall {
            api.signStorage(
                StorageSignRequestDto(bucket = bucket, path = path, mode = MODE_DOWNLOAD),
            )
        }
        return when (signed) {
            is ApiResult.Success ->
                if (signed.data.url.isBlank()) {
                    ApiResult.Failure(message = "Download authorization was incomplete — try again.")
                } else {
                    ApiResult.Success(signed.data.url)
                }
            is ApiResult.ReAuth -> signed
            is ApiResult.Enrollment -> signed
            is ApiResult.Gate -> signed
            is ApiResult.Failure -> signed
        }
    }

    private suspend fun fetchBytes(url: String): ByteArray = withContext(ioDispatcher) {
        val request = Request.Builder().url(url).get().build()
        httpClient.newCall(request).execute().use { response ->
            if (!response.isSuccessful) {
                throw IOException("Signed download failed with HTTP ${response.code}")
            }
            response.body?.bytes() ?: ByteArray(0)
        }
    }

    /** Wrap a byte transfer into the ApiResult vocabulary. */
    private suspend fun <T> transfer(label: String, block: suspend () -> T): ApiResult<T> = try {
        ApiResult.Success(withContext(ioDispatcher) { block() })
    } catch (e: CancellationException) {
        throw e
    } catch (e: IOException) {
        Timber.w(e, "%s transfer failed (network)", label)
        ApiResult.Failure(isNetwork = true, message = "You're offline — try again when connected.", cause = e)
    } catch (e: Throwable) {
        Timber.w(e, "%s transfer failed", label)
        ApiResult.Failure(message = "$label failed — try again.", cause = e)
    }

    private companion object {
        const val MODE_UPLOAD = "upload"
        const val MODE_DOWNLOAD = "download"
    }
}
