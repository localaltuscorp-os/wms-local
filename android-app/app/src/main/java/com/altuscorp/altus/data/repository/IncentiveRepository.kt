package com.altuscorp.altus.data.repository

import com.altuscorp.altus.core.network.AltusApi
import com.altuscorp.altus.core.network.ApiResult
import com.altuscorp.altus.core.network.safeApiCall
import com.altuscorp.altus.data.local.entity.CacheKeys
import com.altuscorp.altus.data.remote.dto.IncentiveDto
import javax.inject.Inject
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.distinctUntilChanged

/**
 * The signed-in user's own incentive analytics (Employees workspace), one
 * calendar year at a time: cache-first paint, network reconcile — the same
 * offline-first grammar as [DashboardRepository]. Read-only; there are no
 * mobile incentive commits (requests are filed on the web), so no outbox.
 *
 * The board is keyed per year ([CacheKeys.incentive]) so switching the year
 * pill paints that year's last-good snapshot instantly while the fresh year
 * reconciles.
 */
interface IncentiveRepository {

    /** Live decoded snapshot for [year]; null on a true cold cache (skeletons). */
    fun incentive(year: Int): Flow<IncentiveDto?>

    /** Fetch [year] from the network, upsert its snapshot, return the result. */
    suspend fun refresh(year: Int): ApiResult<IncentiveDto>
}

class IncentiveRepositoryImpl @Inject constructor(
    private val api: AltusApi,
    private val cache: JsonCache,
) : IncentiveRepository {

    override fun incentive(year: Int): Flow<IncentiveDto?> =
        cache.observe(CacheKeys.incentive(year), IncentiveDto.serializer())
            .distinctUntilChanged()

    override suspend fun refresh(year: Int): ApiResult<IncentiveDto> {
        val result = safeApiCall { api.incentive(year = year) }
        if (result is ApiResult.Success) {
            cache.write(CacheKeys.incentive(year), IncentiveDto.serializer(), result.data)
        }
        return result
    }
}
