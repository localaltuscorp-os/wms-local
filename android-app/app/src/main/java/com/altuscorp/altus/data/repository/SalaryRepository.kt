package com.altuscorp.altus.data.repository

import com.altuscorp.altus.core.network.AltusApi
import com.altuscorp.altus.core.network.ApiResult
import com.altuscorp.altus.core.network.map
import com.altuscorp.altus.core.network.safeApiCall
import com.altuscorp.altus.data.local.entity.CacheKeys
import com.altuscorp.altus.data.remote.dto.SalaryDto
import com.altuscorp.altus.domain.model.SalaryState
import com.altuscorp.altus.domain.model.toDomain
import javax.inject.Inject
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map

/**
 * The signed-in user's own payslip history (Employees workspace, S-Salary).
 *
 * Read-only and cache-first, the same shape as [AttendanceRepository]'s read
 * half: the Room snapshot paints first (skeletons only on a true cold cache), a
 * network reconcile runs on entry and on pull-to-refresh. Salary rows are
 * imported monthly and never mutated from the app, so there is no outbox and no
 * Realtime stream — a plain fetch-and-upsert is the whole surface.
 */
interface SalaryRepository {

    /** Live decoded payslip history; null on a true cold cache. */
    fun salary(): Flow<SalaryState?>

    /** Fetch from the network, upsert the snapshot, return the fresh state. */
    suspend fun refresh(): ApiResult<SalaryState>
}

class SalaryRepositoryImpl @Inject constructor(
    private val api: AltusApi,
    private val cache: JsonCache,
) : SalaryRepository {

    override fun salary(): Flow<SalaryState?> =
        cache.observe(CacheKeys.SALARY, SalaryDto.serializer())
            .map { it?.toDomain() }
            .distinctUntilChanged()

    override suspend fun refresh(): ApiResult<SalaryState> {
        val result = safeApiCall { api.salary() }
        if (result is ApiResult.Success) {
            cache.write(CacheKeys.SALARY, SalaryDto.serializer(), result.data)
        }
        return result.map { it.toDomain() }
    }
}
