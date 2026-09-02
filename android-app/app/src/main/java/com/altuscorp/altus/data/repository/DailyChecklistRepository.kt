package com.altuscorp.altus.data.repository

import com.altuscorp.altus.core.network.AltusApi
import com.altuscorp.altus.core.network.ApiResult
import com.altuscorp.altus.core.network.safeApiCall
import com.altuscorp.altus.data.local.entity.CacheKeys
import com.altuscorp.altus.data.remote.dto.DailyChecklistActionRequestDto
import com.altuscorp.altus.data.remote.dto.DailyChecklistDto
import javax.inject.Inject
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.distinctUntilChanged

/**
 * The WMS Daily Checklist (web parity with `app/(app)/daily-checklist/page.tsx`):
 * a cache-first read of today's committed items (assigned + personal), overdue
 * carry-overs, and pullable weekly goals. Every mutation (add / close / remove /
 * carry-forward / assigned-task-done) hits the SAME action-discriminated
 * endpoint and gets back the fresh FULL board, which is written straight to the
 * cache — the simplest, most robust contract (no hand-patched lists to drift
 * from the server).
 */
interface DailyChecklistRepository {

    /** Live decoded board; null on a true cold cache. */
    fun board(): Flow<DailyChecklistDto?>

    /** Fetch from the network, upsert the snapshot, return the fresh board. */
    suspend fun refresh(): ApiResult<DailyChecklistDto>

    /** Add an ad-hoc personal commitment. */
    suspend fun addPersonalItem(title: String): ApiResult<DailyChecklistDto>

    /** Pull a current-week weekly goal into today (goal-related item). */
    suspend fun pullGoal(goalId: String): ApiResult<DailyChecklistDto>

    /** Pull one of the employee's open tasks into today. */
    suspend fun pullTask(taskId: String): ApiResult<DailyChecklistDto>

    /** Close a PERSONAL item out — done/not-done + optional note. */
    suspend fun closeItem(itemId: String, done: Boolean, note: String? = null): ApiResult<DailyChecklistDto>

    /** Remove a personal item from today's checklist. */
    suspend fun removeItem(itemId: String): ApiResult<DailyChecklistDto>

    /** Check off (or reopen) a manager-ASSIGNED task — writes to the task itself. */
    suspend fun setTaskDone(taskId: String, done: Boolean): ApiResult<DailyChecklistDto>

    /** Carry every unfinished item from earlier days onto today. */
    suspend fun carryForward(): ApiResult<DailyChecklistDto>
}

class DailyChecklistRepositoryImpl @Inject constructor(
    private val api: AltusApi,
    private val cache: JsonCache,
) : DailyChecklistRepository {

    override fun board(): Flow<DailyChecklistDto?> =
        cache.observe(CacheKeys.DAILY_CHECKLIST, DailyChecklistDto.serializer())
            .distinctUntilChanged()

    override suspend fun refresh(): ApiResult<DailyChecklistDto> {
        val result = safeApiCall { api.dailyChecklist() }
        if (result is ApiResult.Success) {
            cache.write(CacheKeys.DAILY_CHECKLIST, DailyChecklistDto.serializer(), result.data)
        }
        return result
    }

    override suspend fun addPersonalItem(title: String): ApiResult<DailyChecklistDto> =
        mutate(DailyChecklistActionRequestDto(action = "add", title = title))

    override suspend fun pullGoal(goalId: String): ApiResult<DailyChecklistDto> =
        mutate(DailyChecklistActionRequestDto(action = "add", goalId = goalId))

    override suspend fun pullTask(taskId: String): ApiResult<DailyChecklistDto> =
        mutate(DailyChecklistActionRequestDto(action = "add", taskId = taskId))

    override suspend fun closeItem(itemId: String, done: Boolean, note: String?): ApiResult<DailyChecklistDto> =
        mutate(DailyChecklistActionRequestDto(action = "close", itemId = itemId, done = done, note = note))

    override suspend fun removeItem(itemId: String): ApiResult<DailyChecklistDto> =
        mutate(DailyChecklistActionRequestDto(action = "remove", itemId = itemId))

    override suspend fun setTaskDone(taskId: String, done: Boolean): ApiResult<DailyChecklistDto> =
        mutate(DailyChecklistActionRequestDto(action = "taskDone", taskId = taskId, done = done))

    override suspend fun carryForward(): ApiResult<DailyChecklistDto> =
        mutate(DailyChecklistActionRequestDto(action = "carryForward"))

    /** Shared mutation shape: POST → the ack IS the fresh full board → cache it. */
    private suspend fun mutate(body: DailyChecklistActionRequestDto): ApiResult<DailyChecklistDto> {
        val result = safeApiCall { api.dailyChecklistAction(body) }
        if (result is ApiResult.Success) {
            cache.write(CacheKeys.DAILY_CHECKLIST, DailyChecklistDto.serializer(), result.data)
        }
        return result
    }
}
