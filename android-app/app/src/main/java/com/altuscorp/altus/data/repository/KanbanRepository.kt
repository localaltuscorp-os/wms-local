package com.altuscorp.altus.data.repository

import com.altuscorp.altus.core.network.AltusApi
import com.altuscorp.altus.core.network.ApiResult
import com.altuscorp.altus.core.network.map
import com.altuscorp.altus.core.network.safeApiCall
import com.altuscorp.altus.data.local.entity.CacheKeys
import com.altuscorp.altus.data.remote.dto.KanbanResponseDto
import com.altuscorp.altus.domain.model.KanbanBoard
import com.altuscorp.altus.domain.model.toDomain
import javax.inject.Inject
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map

/**
 * WMS Kanban board (owner-scoped status board): cache-first paint, network
 * reconcile — the same grammar as [DashboardRepository]. Read-only, so there is
 * no outbox and no optimistic mutation; the board simply mirrors the server's
 * grouped view of the signed-in user's tasks.
 */
interface KanbanRepository {

    /** Live decoded board (columns + statusDisplay + cards); null on cold cache. */
    fun board(): Flow<KanbanBoard?>

    /** Fetch from the network, upsert the snapshot, return the fresh board. */
    suspend fun refresh(): ApiResult<KanbanBoard>
}

class KanbanRepositoryImpl @Inject constructor(
    private val api: AltusApi,
    private val cache: JsonCache,
) : KanbanRepository {

    override fun board(): Flow<KanbanBoard?> =
        cache.observe(CacheKeys.TASK_KANBAN, KanbanResponseDto.serializer())
            .map { it?.toDomain() }
            .distinctUntilChanged()

    override suspend fun refresh(): ApiResult<KanbanBoard> {
        val result = safeApiCall { api.kanban() }
        if (result is ApiResult.Success) {
            cache.write(CacheKeys.TASK_KANBAN, KanbanResponseDto.serializer(), result.data)
        }
        return result.map { it.toDomain() }
    }
}
