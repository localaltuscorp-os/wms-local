package com.altuscorp.altus.data.repository

import com.altuscorp.altus.core.network.AltusApi
import com.altuscorp.altus.core.network.ApiResult
import com.altuscorp.altus.core.network.safeApiCall
import com.altuscorp.altus.data.local.entity.CacheKeys
import com.altuscorp.altus.data.remote.dto.OutstandingDto
import javax.inject.Inject
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.distinctUntilChanged

/**
 * The Sales receivables dashboard (Outstanding), cache-first: the last-decoded
 * snapshot paints instantly (null → skeletons) while [refresh] reconciles
 * against the server. Read-only — there are no mobile Outstanding commits
 * (contracts / collections are created on the web), so no outbox.
 *
 * The same offline-first grammar as [ProjectsRepository] / [IncentiveRepository]:
 * a single [CacheKeys.OUTSTANDING] snapshot backs the one screen.
 */
interface OutstandingRepository {

    /** Live decoded snapshot; null on a true cold cache (skeletons). */
    fun outstanding(): Flow<OutstandingDto?>

    /** Fetch from the network, upsert the snapshot, return the result. */
    suspend fun refresh(): ApiResult<OutstandingDto>
}

class OutstandingRepositoryImpl @Inject constructor(
    private val api: AltusApi,
    private val cache: JsonCache,
) : OutstandingRepository {

    override fun outstanding(): Flow<OutstandingDto?> =
        cache.observe(CacheKeys.OUTSTANDING, OutstandingDto.serializer())
            .distinctUntilChanged()

    override suspend fun refresh(): ApiResult<OutstandingDto> {
        val result = safeApiCall { api.outstanding() }
        if (result is ApiResult.Success) {
            cache.write(CacheKeys.OUTSTANDING, OutstandingDto.serializer(), result.data)
        }
        return result
    }
}
