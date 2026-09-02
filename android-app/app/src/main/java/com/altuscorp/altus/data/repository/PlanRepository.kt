package com.altuscorp.altus.data.repository

import androidx.compose.runtime.Immutable
import com.altuscorp.altus.core.di.ApplicationScope
import com.altuscorp.altus.core.network.AltusApi
import com.altuscorp.altus.core.network.ApiResult
import com.altuscorp.altus.core.network.map
import com.altuscorp.altus.core.network.safeApiCall
import com.altuscorp.altus.data.local.entity.CacheKeys
import com.altuscorp.altus.data.remote.dto.AddPlanItemRequestDto
import com.altuscorp.altus.data.remote.dto.GoalActualRequestDto
import com.altuscorp.altus.data.remote.dto.PlanDto
import com.altuscorp.altus.data.remote.dto.PlanMutationResponseDto
import com.altuscorp.altus.domain.model.DayPlan
import com.altuscorp.altus.domain.model.toDomain
import javax.inject.Inject
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch

/**
 * The fresh commitment meter every plan mutation returns — the pinned mono
 * "2/5" and the pop-back-when-satisfied behaviour update from this without a
 * full re-fetch (the full board reconciles in the background).
 */
@Immutable
data class PlanMeter(
    val plannedCount: Int,
    val satisfied: Boolean,
    val needsGoalActuals: Boolean,
)

/**
 * Plan Your Day (S4) over the NEW `/api/mobile/plan` endpoints — the surface
 * that clears the clock-in `needsPlan` gate. Mutations are ONLINE-ONLY (the
 * gate that consumes this state is itself online); each one patches the cached
 * meter immediately from the server's ack, then reconciles the full board in
 * the background.
 */
interface PlanRepository {

    /** Live decoded plan; null on a cold cache (or while the endpoint is dark). */
    fun plan(): Flow<DayPlan?>

    /** Fetch today's plan, upsert the snapshot. */
    suspend fun refresh(): ApiResult<DayPlan>

    /** Add an ad-hoc personal commitment ("+ Add to today" on a typed title). */
    suspend fun addPersonalItem(title: String): ApiResult<PlanMeter>

    /** Pull one of today's assigned/open tasks into the plan. */
    suspend fun pullTask(taskId: String): ApiResult<PlanMeter>

    /** Pull a current-week goal into today. */
    suspend fun pullGoal(goalId: String): ApiResult<PlanMeter>

    /** Log today's actual on one goal (the 5%-detent slider sheet). */
    suspend fun logGoalActual(goalId: String, pctDone: Int, note: String? = null): ApiResult<PlanMeter>
}

class PlanRepositoryImpl @Inject constructor(
    private val api: AltusApi,
    private val cache: JsonCache,
    @ApplicationScope private val appScope: CoroutineScope,
) : PlanRepository {

    override fun plan(): Flow<DayPlan?> =
        cache.observe(CacheKeys.PLAN, PlanDto.serializer())
            .map { it?.toDomain() }
            .distinctUntilChanged()

    override suspend fun refresh(): ApiResult<DayPlan> {
        val result = safeApiCall { api.plan() }
        if (result is ApiResult.Success) {
            cache.write(CacheKeys.PLAN, PlanDto.serializer(), result.data)
        }
        return result.map { it.toDomain() }
    }

    override suspend fun addPersonalItem(title: String): ApiResult<PlanMeter> =
        mutate { api.addPlanItem(AddPlanItemRequestDto(title = title)) }

    override suspend fun pullTask(taskId: String): ApiResult<PlanMeter> =
        mutate { api.addPlanItem(AddPlanItemRequestDto(taskId = taskId)) }

    override suspend fun pullGoal(goalId: String): ApiResult<PlanMeter> =
        mutate { api.addPlanItem(AddPlanItemRequestDto(goalId = goalId)) }

    override suspend fun logGoalActual(goalId: String, pctDone: Int, note: String?): ApiResult<PlanMeter> =
        mutate {
            api.logGoalActual(
                GoalActualRequestDto(goalId = goalId, pctDone = pctDone.coerceIn(0, 100), note = note),
            )
        }

    /**
     * Shared mutation shape: POST → patch the cached meter from the ack (the
     * pinned "2/5" advances on the same frame) → full background reconcile.
     */
    private suspend fun mutate(
        call: suspend () -> PlanMutationResponseDto,
    ): ApiResult<PlanMeter> {
        val result = safeApiCall(call)
        if (result is ApiResult.Success) {
            val ack = result.data
            cache.mutate(CacheKeys.PLAN, PlanDto.serializer()) {
                it.copy(
                    plannedCount = ack.plannedCount,
                    satisfied = ack.satisfied,
                    needsGoalActuals = ack.needsGoalActuals,
                )
            }
            appScope.launch { refresh() }
        }
        return result.map {
            PlanMeter(
                plannedCount = it.plannedCount,
                satisfied = it.satisfied,
                needsGoalActuals = it.needsGoalActuals,
            )
        }
    }
}
