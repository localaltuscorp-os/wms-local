package com.altuscorp.altus.data.repository

import com.altuscorp.altus.core.network.AltusApi
import com.altuscorp.altus.core.network.ApiResult
import com.altuscorp.altus.core.network.map
import com.altuscorp.altus.core.network.safeApiCall
import com.altuscorp.altus.data.local.entity.CacheKeys
import com.altuscorp.altus.data.remote.dto.DashboardDto
import com.altuscorp.altus.domain.model.DashboardSummary
import com.altuscorp.altus.domain.model.toDomain
import javax.inject.Inject
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map

/**
 * Today's payload (S2 strips): cache-first paint, network reconcile.
 * The dashboard cache is also patched optimistically by
 * [AttendanceRepository] (punch times) and [GoalsRepository] (gate cleared),
 * so this flow re-emits the instant those commits land locally.
 */
interface DashboardRepository {

    /** Live decoded snapshot; null on a true cold cache (skeletons). */
    fun dashboard(): Flow<DashboardSummary?>

    /** Fetch from the network, upsert the snapshot, return the fresh state. */
    suspend fun refresh(): ApiResult<DashboardSummary>
}

class DashboardRepositoryImpl @Inject constructor(
    private val api: AltusApi,
    private val cache: JsonCache,
) : DashboardRepository {

    override fun dashboard(): Flow<DashboardSummary?> =
        cache.observe(CacheKeys.DASHBOARD, DashboardDto.serializer())
            .map { it?.toDomain() }
            .distinctUntilChanged()

    override suspend fun refresh(): ApiResult<DashboardSummary> {
        val result = safeApiCall { api.dashboard() }
        if (result is ApiResult.Success) {
            cache.write(CacheKeys.DASHBOARD, DashboardDto.serializer(), result.data)
        }
        return result.map { it.toDomain() }
    }
}
