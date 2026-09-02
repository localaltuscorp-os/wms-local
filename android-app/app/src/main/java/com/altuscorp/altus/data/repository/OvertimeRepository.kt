package com.altuscorp.altus.data.repository

import com.altuscorp.altus.core.network.AltusApi
import com.altuscorp.altus.core.network.ApiResult
import com.altuscorp.altus.core.network.safeApiCall
import com.altuscorp.altus.data.local.entity.CacheKeys
import com.altuscorp.altus.data.remote.dto.OvertimeDto
import javax.inject.Inject
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.distinctUntilChanged

/**
 * The signed-in user's own overtime ledger (Employees workspace).
 *
 * Read-only and cache-first, the same offline-first grammar as
 * [SalaryRepository]: the Room snapshot paints first (skeletons only on a true
 * cold cache), then a network reconcile runs on entry and on pull-to-refresh.
 * Overtime is filed / approved on the web, so there is no outbox and no Realtime
 * stream — a plain fetch-and-upsert is the whole surface.
 */
interface OvertimeRepository {

    /** Live decoded overtime ledger; null on a true cold cache (skeletons). */
    fun overtime(): Flow<OvertimeDto?>

    /** Fetch from the network, upsert the snapshot, return the result. */
    suspend fun refresh(): ApiResult<OvertimeDto>
}

class OvertimeRepositoryImpl @Inject constructor(
    private val api: AltusApi,
    private val cache: JsonCache,
) : OvertimeRepository {

    override fun overtime(): Flow<OvertimeDto?> =
        cache.observe(CacheKeys.OVERTIME, OvertimeDto.serializer())
            .distinctUntilChanged()

    override suspend fun refresh(): ApiResult<OvertimeDto> {
        val result = safeApiCall { api.overtime() }
        if (result is ApiResult.Success) {
            cache.write(CacheKeys.OVERTIME, OvertimeDto.serializer(), result.data)
        }
        return result
    }
}
