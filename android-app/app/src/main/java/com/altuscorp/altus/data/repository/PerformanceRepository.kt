package com.altuscorp.altus.data.repository

import com.altuscorp.altus.core.network.AltusApi
import com.altuscorp.altus.core.network.ApiResult
import com.altuscorp.altus.core.network.safeApiCall
import com.altuscorp.altus.data.local.entity.CacheKeys
import com.altuscorp.altus.data.remote.dto.PerformanceDto
import javax.inject.Inject
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.distinctUntilChanged

/**
 * The signed-in user's own PMS score (Employees workspace). Read-only analytics
 * surface: cache-first paint (skeletons only on a true cold cache) + a network
 * reconcile on entry / pull-to-refresh — the same offline-first grammar as the
 * attendance ledger, minus any commits (nothing on this screen writes).
 */
interface PerformanceRepository {

    /** Live decoded score snapshot; null on a true cold cache. */
    fun performance(): Flow<PerformanceDto?>

    /** Fetch from the network, upsert the snapshot, return the fresh score. */
    suspend fun refresh(): ApiResult<PerformanceDto>
}

class PerformanceRepositoryImpl @Inject constructor(
    private val api: AltusApi,
    private val cache: JsonCache,
) : PerformanceRepository {

    override fun performance(): Flow<PerformanceDto?> =
        cache.observe(CacheKeys.PERFORMANCE, PerformanceDto.serializer())
            .distinctUntilChanged()

    override suspend fun refresh(): ApiResult<PerformanceDto> {
        val result = safeApiCall { api.performance() }
        if (result is ApiResult.Success) {
            cache.write(CacheKeys.PERFORMANCE, PerformanceDto.serializer(), result.data)
        }
        return result
    }
}
