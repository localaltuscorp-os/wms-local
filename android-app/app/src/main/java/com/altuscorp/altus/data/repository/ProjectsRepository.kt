package com.altuscorp.altus.data.repository

import com.altuscorp.altus.core.network.AltusApi
import com.altuscorp.altus.core.network.ApiResult
import com.altuscorp.altus.core.network.safeApiCall
import com.altuscorp.altus.data.local.entity.CacheKeys
import com.altuscorp.altus.data.remote.dto.ProjectsDto
import javax.inject.Inject
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.distinctUntilChanged

/**
 * The WMS Projects overview: a cache-first read of the org's project tree,
 * collapsed to per-project cards with a completion meter. Read-only — no
 * outbox, no realtime; the cache paints first (skeletons only on a true cold
 * cache), a network reconcile runs on entry and on pull-to-refresh.
 */
interface ProjectsRepository {

    /** Live decoded overview; null on a true cold cache. */
    fun projects(): Flow<ProjectsDto?>

    /** Fetch from the network, upsert the snapshot, return the fresh overview. */
    suspend fun refresh(): ApiResult<ProjectsDto>
}

class ProjectsRepositoryImpl @Inject constructor(
    private val api: AltusApi,
    private val cache: JsonCache,
) : ProjectsRepository {

    override fun projects(): Flow<ProjectsDto?> =
        cache.observe(CacheKeys.PROJECTS, ProjectsDto.serializer())
            .distinctUntilChanged()

    override suspend fun refresh(): ApiResult<ProjectsDto> {
        val result = safeApiCall { api.projects() }
        if (result is ApiResult.Success) {
            cache.write(CacheKeys.PROJECTS, ProjectsDto.serializer(), result.data)
        }
        return result
    }
}
