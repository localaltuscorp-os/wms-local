package com.altuscorp.altus.data.repository

import com.altuscorp.altus.core.network.AltusApi
import com.altuscorp.altus.core.network.ApiResult
import com.altuscorp.altus.core.network.safeApiCall
import com.altuscorp.altus.data.local.entity.CacheKeys
import com.altuscorp.altus.data.remote.dto.TrainingDto
import javax.inject.Inject
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.distinctUntilChanged

/**
 * The Training Centre for the signed-in user (Training workspace): the material
 * library (with the viewer's own watched flag) plus their personalised
 * induction path.
 *
 * Read-only and cache-first, the same offline-first grammar as
 * [OvertimeRepository]: the Room snapshot paints first (skeletons only on a true
 * cold cache), then a network reconcile runs on entry and on pull-to-refresh.
 * Material is authored / tests are taken on the web, so there is no outbox and
 * no Realtime stream — a plain fetch-and-upsert is the whole surface.
 */
interface TrainingRepository {

    /** Live decoded Training Centre; null on a true cold cache (skeletons). */
    fun training(): Flow<TrainingDto?>

    /** Fetch from the network, upsert the snapshot, return the result. */
    suspend fun refresh(): ApiResult<TrainingDto>
}

class TrainingRepositoryImpl @Inject constructor(
    private val api: AltusApi,
    private val cache: JsonCache,
) : TrainingRepository {

    override fun training(): Flow<TrainingDto?> =
        cache.observe(CacheKeys.TRAINING, TrainingDto.serializer())
            .distinctUntilChanged()

    override suspend fun refresh(): ApiResult<TrainingDto> {
        val result = safeApiCall { api.training() }
        if (result is ApiResult.Success) {
            cache.write(CacheKeys.TRAINING, TrainingDto.serializer(), result.data)
        }
        return result
    }
}
