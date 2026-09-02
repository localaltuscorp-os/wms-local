package com.altuscorp.altus.data.repository

import androidx.compose.runtime.Immutable
import com.altuscorp.altus.core.di.ApplicationScope
import com.altuscorp.altus.core.network.AltusApi
import com.altuscorp.altus.core.network.ApiResult
import com.altuscorp.altus.core.network.map
import com.altuscorp.altus.core.network.safeApiCall
import com.altuscorp.altus.data.local.entity.CacheKeys
import com.altuscorp.altus.data.remote.dto.DashboardDto
import com.altuscorp.altus.data.remote.dto.GoalFillDto
import com.altuscorp.altus.data.remote.dto.MeDto
import com.altuscorp.altus.data.remote.dto.WeeklyGoalsFillDto
import com.altuscorp.altus.data.remote.dto.WeeklyGoalsFillRequestDto
import com.altuscorp.altus.data.remote.dto.WeeklyGoalsGateDto
import com.altuscorp.altus.domain.model.WeeklyGoalsFill
import com.altuscorp.altus.domain.model.toDomain
import javax.inject.Inject
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch

/** One goal's fill draft from the S8 GoalsFill screen. */
@Immutable
data class GoalFillDraft(
    val goalId: String,
    /** 0–100. */
    val pctDone: Int,
    val explanation: String? = null,
)

/**
 * Weekly-goals fill (S8) over the NEW `/api/mobile/weekly-goals/fill`
 * endpoints — the surface that clears the Mon/Thu `needsGoals` gate.
 * A successful submit clears the gate EVERYWHERE it is mirrored locally
 * (fill sheet, dashboard, /me) on the same frame, then reconciles from the
 * network in the background.
 */
interface GoalsRepository {

    /** Live decoded unfilled-goals sheet; null on a cold cache. */
    fun fillSheet(): Flow<WeeklyGoalsFill?>

    /** Fetch the unfilled goals for the current week. */
    suspend fun refresh(): ApiResult<WeeklyGoalsFill>

    /**
     * Submit every fill. ONLINE-ONLY — a queued gate-clear that lands minutes
     * later would let the ring lie about a gate the server still enforces.
     */
    suspend fun submit(fills: List<GoalFillDraft>): ApiResult<Unit>
}

class GoalsRepositoryImpl @Inject constructor(
    private val api: AltusApi,
    private val cache: JsonCache,
    @ApplicationScope private val appScope: CoroutineScope,
) : GoalsRepository {

    override fun fillSheet(): Flow<WeeklyGoalsFill?> =
        cache.observe(CacheKeys.WEEKLY_GOALS_FILL, WeeklyGoalsFillDto.serializer())
            .map { it?.toDomain() }
            .distinctUntilChanged()

    override suspend fun refresh(): ApiResult<WeeklyGoalsFill> {
        val result = safeApiCall { api.weeklyGoalsFill() }
        if (result is ApiResult.Success) {
            cache.write(CacheKeys.WEEKLY_GOALS_FILL, WeeklyGoalsFillDto.serializer(), result.data)
        }
        return result.map { it.toDomain() }
    }

    override suspend fun submit(fills: List<GoalFillDraft>): ApiResult<Unit> {
        val result = safeApiCall {
            api.submitWeeklyGoalsFill(
                WeeklyGoalsFillRequestDto(
                    fills = fills.map {
                        GoalFillDto(
                            goalId = it.goalId,
                            pctDone = it.pctDone.coerceIn(0, 100),
                            explanation = it.explanation,
                        )
                    },
                ),
            )
        }
        if (result is ApiResult.Success) {
            val clearedGate = WeeklyGoalsGateDto(required = false, unfilledCount = 0)
            // The gate is cleared: empty the sheet + clear every local mirror.
            cache.mutate(CacheKeys.WEEKLY_GOALS_FILL, WeeklyGoalsFillDto.serializer()) {
                it.copy(goals = emptyList())
            }
            cache.mutate(CacheKeys.DASHBOARD, DashboardDto.serializer()) {
                it.copy(weeklyGoalsGate = clearedGate)
            }
            cache.mutate(CacheKeys.ME, MeDto.serializer()) {
                it.copy(weeklyGoalsGate = clearedGate)
            }
            // Background reconcile so the banners disappear with server truth.
            appScope.launch {
                refresh()
                val dashboard = safeApiCall { api.dashboard() }
                if (dashboard is ApiResult.Success) {
                    cache.write(CacheKeys.DASHBOARD, DashboardDto.serializer(), dashboard.data)
                }
            }
        }
        return result.map { }
    }
}
