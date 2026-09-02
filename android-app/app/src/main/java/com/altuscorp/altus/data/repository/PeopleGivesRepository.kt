package com.altuscorp.altus.data.repository

import com.altuscorp.altus.core.network.AltusApi
import com.altuscorp.altus.core.network.ApiResult
import com.altuscorp.altus.core.network.safeApiCall
import com.altuscorp.altus.data.local.entity.CacheKeys
import com.altuscorp.altus.data.remote.dto.PeopleGivesDto
import javax.inject.Inject
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.distinctUntilChanged

/**
 * The People Gives referral network (Sales workspace): who can introduce Altus
 * to whom. Read-only and cache-first — the same offline-first grammar as
 * [OvertimeRepository]: the Room snapshot paints first (skeletons only on a true
 * cold cache), then a network reconcile runs on entry and on pull-to-refresh.
 * Introductions are logged on the web, so there is no outbox — a plain
 * fetch-and-upsert is the whole surface.
 */
interface PeopleGivesRepository {

    /** Live decoded referral network; null on a true cold cache (skeletons). */
    fun peopleGives(): Flow<PeopleGivesDto?>

    /** Fetch from the network, upsert the snapshot, return the result. */
    suspend fun refresh(): ApiResult<PeopleGivesDto>
}

class PeopleGivesRepositoryImpl @Inject constructor(
    private val api: AltusApi,
    private val cache: JsonCache,
) : PeopleGivesRepository {

    override fun peopleGives(): Flow<PeopleGivesDto?> =
        cache.observe(CacheKeys.PEOPLE_GIVES, PeopleGivesDto.serializer())
            .distinctUntilChanged()

    override suspend fun refresh(): ApiResult<PeopleGivesDto> {
        val result = safeApiCall { api.peopleGives() }
        if (result is ApiResult.Success) {
            cache.write(CacheKeys.PEOPLE_GIVES, PeopleGivesDto.serializer(), result.data)
        }
        return result
    }
}
