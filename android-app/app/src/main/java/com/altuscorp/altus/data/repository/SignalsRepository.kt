package com.altuscorp.altus.data.repository

import com.altuscorp.altus.core.network.AltusApi
import com.altuscorp.altus.core.network.ApiResult
import com.altuscorp.altus.core.network.safeApiCall
import com.altuscorp.altus.data.local.entity.CacheKeys
import com.altuscorp.altus.data.remote.dto.SignalsDto
import javax.inject.Inject
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.distinctUntilChanged

/**
 * The signed-in user's OWN performance signals feed (Employees · PMS):
 * recognition suggested/released for them + promotion signals flagged against
 * them. Read-only — cache-first paint, network reconcile (S2 offline-first),
 * with no outbox since nothing here is a mutation surface. The DTO is exposed
 * straight through (the ViewModel formats periods/dates/status pills) — no
 * domain model, as the feed is a thin projection of one endpoint.
 */
interface SignalsRepository {

    /** Live decoded snapshot; null on a true cold cache (skeletons). */
    fun signals(): Flow<SignalsDto?>

    /** Fetch from the network, upsert the snapshot, return the fresh feed. */
    suspend fun refresh(): ApiResult<SignalsDto>
}

class SignalsRepositoryImpl @Inject constructor(
    private val api: AltusApi,
    private val cache: JsonCache,
) : SignalsRepository {

    override fun signals(): Flow<SignalsDto?> =
        cache.observe(CacheKeys.SIGNALS, SignalsDto.serializer())
            .distinctUntilChanged()

    override suspend fun refresh(): ApiResult<SignalsDto> {
        val result = safeApiCall { api.signals() }
        if (result is ApiResult.Success) {
            cache.write(CacheKeys.SIGNALS, SignalsDto.serializer(), result.data)
        }
        return result
    }
}
