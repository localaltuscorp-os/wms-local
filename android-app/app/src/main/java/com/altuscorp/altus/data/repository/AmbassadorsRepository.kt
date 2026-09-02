package com.altuscorp.altus.data.repository

import com.altuscorp.altus.core.network.AltusApi
import com.altuscorp.altus.core.network.ApiResult
import com.altuscorp.altus.core.network.safeApiCall
import com.altuscorp.altus.data.local.entity.CacheKeys
import com.altuscorp.altus.data.remote.dto.AmbassadorsDto
import javax.inject.Inject
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.distinctUntilChanged

/**
 * The Sales "Partner Intelligence" surface (Ambassadors): cache-first paint,
 * network reconcile — the same offline-first grammar as [IncentiveRepository].
 * Read-only; ambassadors are created / edited on the web, so there is no
 * outbox. One shared snapshot key ([CacheKeys.AMBASSADORS]) paints the last-good
 * dashboard instantly while the fresh figures reconcile.
 */
interface AmbassadorsRepository {

    /** Live decoded snapshot; null on a true cold cache (skeletons). */
    fun ambassadors(): Flow<AmbassadorsDto?>

    /** Fetch from the network, upsert the snapshot, return the result. */
    suspend fun refresh(): ApiResult<AmbassadorsDto>
}

class AmbassadorsRepositoryImpl @Inject constructor(
    private val api: AltusApi,
    private val cache: JsonCache,
) : AmbassadorsRepository {

    override fun ambassadors(): Flow<AmbassadorsDto?> =
        cache.observe(CacheKeys.AMBASSADORS, AmbassadorsDto.serializer())
            .distinctUntilChanged()

    override suspend fun refresh(): ApiResult<AmbassadorsDto> {
        val result = safeApiCall { api.ambassadors() }
        if (result is ApiResult.Success) {
            cache.write(CacheKeys.AMBASSADORS, AmbassadorsDto.serializer(), result.data)
        }
        return result
    }
}
