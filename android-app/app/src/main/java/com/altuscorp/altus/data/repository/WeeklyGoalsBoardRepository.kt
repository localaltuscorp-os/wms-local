package com.altuscorp.altus.data.repository

import com.altuscorp.altus.core.network.AltusApi
import com.altuscorp.altus.core.network.ApiResult
import com.altuscorp.altus.core.network.safeApiCall
import com.altuscorp.altus.data.local.entity.CacheKeys
import com.altuscorp.altus.data.remote.dto.WeeklyGoalsBoardDto
import com.altuscorp.altus.data.remote.dto.WeeklyGoalsDashboardDto
import javax.inject.Inject
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.distinctUntilChanged

/**
 * Weekly-goals BOARD (read-only) over `GET /api/mobile/weekly-goals/board?week=`.
 * Cache-first per week: [board] paints the last-decoded snapshot instantly (null
 * on a cold cache → skeletons), [refresh] reconciles against the server. There
 * are no mutations — the board is a read mirror of the web page, so no outbox.
 *
 * A null [weekKey] is the CURRENT week; it caches under a stable "current"
 * sentinel so the first paint is always warm, while explicit weeks (the pager)
 * cache under their own Monday key.
 */
interface WeeklyGoalsBoardRepository {

    /** Live decoded board for one week (`yyyy-MM-dd` Monday, or null = current). */
    fun board(weekKey: String?): Flow<WeeklyGoalsBoardDto?>

    /** Fetch one week from the network, upsert its snapshot. */
    suspend fun refresh(weekKey: String?): ApiResult<WeeklyGoalsBoardDto>

    /** The team weekly-score overview (direct-fetch, admin analytics). */
    suspend fun dashboard(): ApiResult<WeeklyGoalsDashboardDto>
}

class WeeklyGoalsBoardRepositoryImpl @Inject constructor(
    private val api: AltusApi,
    private val cache: JsonCache,
) : WeeklyGoalsBoardRepository {

    private fun keyFor(weekKey: String?): String =
        CacheKeys.weeklyGoalsBoard(weekKey ?: CURRENT)

    override fun board(weekKey: String?): Flow<WeeklyGoalsBoardDto?> =
        cache.observe(keyFor(weekKey), WeeklyGoalsBoardDto.serializer())
            .distinctUntilChanged()

    override suspend fun refresh(weekKey: String?): ApiResult<WeeklyGoalsBoardDto> {
        val result = safeApiCall { api.weeklyGoalsBoard(week = weekKey) }
        if (result is ApiResult.Success) {
            cache.write(keyFor(weekKey), WeeklyGoalsBoardDto.serializer(), result.data)
        }
        return result
    }

    override suspend fun dashboard(): ApiResult<WeeklyGoalsDashboardDto> =
        safeApiCall { api.weeklyGoalsDashboard() }

    private companion object {
        const val CURRENT = "current"
    }
}
