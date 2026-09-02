package com.altuscorp.altus.data.repository

import com.altuscorp.altus.core.network.AltusApi
import com.altuscorp.altus.core.network.ApiResult
import com.altuscorp.altus.data.local.entity.CacheKeys
import com.altuscorp.altus.data.remote.dto.TeamPerformanceDto
import com.altuscorp.altus.core.network.safeApiCall
import javax.inject.Inject
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.distinctUntilChanged

/**
 * WMS · Team performance: a read-only, cache-first snapshot of the viewer's
 * A-to-Z scoped roster (self → downline → all) with each member's live
 * task/goal/attendance/DCC/training performance — the mobile rendition of
 * the web `/weekly-goals/team` page. Cache paints instantly on a warm
 * snapshot (skeletons only on a true cold cache); a network reconcile runs
 * on entry and on pull-to-refresh.
 *
 * Deliberately light (no outbox / optimistic writes): the board is a pure
 * read; the web's "View goals" / "Daily checklist" drill-ins are not ported
 * here. Mirrors [DashboardRepository]'s shape.
 */
interface TeamRepository {

    /** Live decoded roster+performance snapshot; null on a true cold cache. */
    fun performance(): Flow<TeamPerformanceDto?>

    /** Fetch from the network, upsert the snapshot, return the fresh state. */
    suspend fun refresh(): ApiResult<TeamPerformanceDto>
}

class TeamRepositoryImpl @Inject constructor(
    private val api: AltusApi,
    private val cache: JsonCache,
) : TeamRepository {

    override fun performance(): Flow<TeamPerformanceDto?> =
        cache.observe(CacheKeys.TEAM_PERFORMANCE, TeamPerformanceDto.serializer())
            .distinctUntilChanged()

    override suspend fun refresh(): ApiResult<TeamPerformanceDto> {
        val result = safeApiCall { api.teamPerformance() }
        if (result is ApiResult.Success) {
            cache.write(CacheKeys.TEAM_PERFORMANCE, TeamPerformanceDto.serializer(), result.data)
        }
        return result
    }
}
