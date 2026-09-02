package com.altuscorp.altus.core.network

import java.io.IOException
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json
import retrofit2.HttpException

/**
 * The ONE Json configuration for the whole app (Retrofit converter, error-body
 * parsing, outbox payloads, nav args). `ignoreUnknownKeys` means a new server
 * field never crashes an installed client; `coerceInputValues` turns an
 * unexpected null-for-non-null into the DTO default instead of an exception.
 */
val ApiJson: Json = Json {
    ignoreUnknownKeys = true
    explicitNulls = false
    coerceInputValues = true
    encodeDefaults = false
}

/** Why a 403 blocked the session (from lib/auth/mobile.ts error codes). */
enum class EnrollmentBlock {
    /** Firebase user exists but no employee row — "signed in, not enrolled". */
    NotEnrolled,

    /** Employee row exists but `isActive = false`. */
    Deactivated,
}

/**
 * Every `/api/mobile/...` call resolves to exactly one of these. Repos and
 * ViewModels `when` over it — no raw exceptions cross the network boundary.
 */
sealed interface ApiResult<out T> {

    /** 2xx with a decoded body. */
    data class Success<T>(val data: T) : ApiResult<T>

    /** 401 after the interceptor's one forced-refresh retry — session is dead
     *  (revoked refresh token / admin password reset). Route to Login. */
    data object ReAuth : ApiResult<Nothing>

    /** 403 `not-enrolled` / `deactivated` — the S1 enrollment gate screens. */
    data class Enrollment(val reason: EnrollmentBlock) : ApiResult<Nothing>

    /** 409 WMS gate (needsPlan / needsDcc / needsGoals) — render a GateCard. */
    data class Gate(val gate: GateError) : ApiResult<Nothing>

    /**
     * Everything else: transport failure, non-gate HTTP error (including the
     * optimistic-lock 409 `stale` and permission 403 `forbidden` on tasks),
     * or a malformed body.
     */
    data class Failure(
        /** HTTP status, or null for transport/parse failures. */
        val httpCode: Int? = null,
        /** Server error code when present ("stale", "forbidden", "not-found"…). */
        val errorCode: String? = null,
        /** Human-facing message (server copy when available). */
        val message: String? = null,
        /** True for connectivity failures — drives the offline affordance. */
        val isNetwork: Boolean = false,
        val cause: Throwable? = null,
    ) : ApiResult<Nothing> {
        /** The optimistic-lock conflict (task changed elsewhere — shake + refetch). */
        val isStaleConflict: Boolean get() = httpCode == 409 && errorCode == "stale"

        /** Server-side rate limit — back off, don't retry-storm. */
        val isRateLimited: Boolean get() = httpCode == 429
    }
}

/** Map through a success, pass every non-success straight through. */
inline fun <T, R> ApiResult<T>.map(transform: (T) -> R): ApiResult<R> = when (this) {
    is ApiResult.Success -> ApiResult.Success(transform(data))
    is ApiResult.ReAuth -> this
    is ApiResult.Enrollment -> this
    is ApiResult.Gate -> this
    is ApiResult.Failure -> this
}

/** The success payload, or null for any non-success. */
fun <T> ApiResult<T>.getOrNull(): T? = (this as? ApiResult.Success)?.data

/**
 * Runs one Retrofit suspend call and maps the entire HTTP contract:
 *   2xx → [ApiResult.Success]
 *   401 → [ApiResult.ReAuth]
 *   403 not-enrolled / deactivated → [ApiResult.Enrollment]
 *   409 gate body → [ApiResult.Gate]
 *   anything else (400/403-forbidden/404/409-stale/429/5xx, IO, parse)
 *       → [ApiResult.Failure]
 *
 * Cancellation is always rethrown — never swallowed into a Failure.
 */
suspend fun <T> safeApiCall(block: suspend () -> T): ApiResult<T> = try {
    ApiResult.Success(block())
} catch (e: CancellationException) {
    throw e
} catch (e: HttpException) {
    e.toApiResult()
} catch (e: SerializationException) {
    ApiResult.Failure(message = "Unexpected server response.", cause = e)
} catch (e: IOException) {
    ApiResult.Failure(isNetwork = true, message = "You're offline — changes will sync.", cause = e)
} catch (e: Throwable) {
    ApiResult.Failure(message = e.message, cause = e)
}

private fun HttpException.toApiResult(): ApiResult<Nothing> {
    val raw = runCatching { response()?.errorBody()?.string() }.getOrNull()
    val body = MobileErrorBody.parse(raw)
    return when (code()) {
        401 -> ApiResult.ReAuth
        403 -> when (body?.error) {
            "not-enrolled" -> ApiResult.Enrollment(EnrollmentBlock.NotEnrolled)
            "deactivated" -> ApiResult.Enrollment(EnrollmentBlock.Deactivated)
            else -> failure(body)
        }
        409 -> GateError.from(body)?.let { ApiResult.Gate(it) } ?: failure(body)
        else -> failure(body)
    }
}

private fun HttpException.failure(body: MobileErrorBody?): ApiResult.Failure = ApiResult.Failure(
    httpCode = code(),
    errorCode = body?.error,
    message = body?.message ?: body?.error ?: message(),
    cause = this,
)
