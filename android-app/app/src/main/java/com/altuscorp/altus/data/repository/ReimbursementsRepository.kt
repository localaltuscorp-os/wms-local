package com.altuscorp.altus.data.repository

import com.altuscorp.altus.core.network.AltusApi
import com.altuscorp.altus.core.network.ApiResult
import com.altuscorp.altus.core.network.safeApiCall
import com.altuscorp.altus.data.local.entity.CacheKeys
import com.altuscorp.altus.data.remote.dto.ReimbursementsDto
import javax.inject.Inject
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.distinctUntilChanged

/**
 * The signed-in user's own reimbursement claims (Employees workspace), one shelf
 * at a time ("active" | "archived"): cache-first paint, network reconcile — the
 * same offline-first grammar as [IncentiveRepository]. Read-only; claims are
 * filed on the web, so there is no outbox.
 *
 * Keyed per shelf ([CacheKeys.reimbursements]) so toggling Active ↔ Archived
 * paints that shelf's last-good snapshot instantly while the fresh one
 * reconciles.
 */
interface ReimbursementsRepository {

    /** Live decoded snapshot for [view]; null on a true cold cache (skeletons). */
    fun reimbursements(view: String): Flow<ReimbursementsDto?>

    /** Fetch [view] from the network, upsert its snapshot, return the result. */
    suspend fun refresh(view: String): ApiResult<ReimbursementsDto>
}

class ReimbursementsRepositoryImpl @Inject constructor(
    private val api: AltusApi,
    private val cache: JsonCache,
) : ReimbursementsRepository {

    override fun reimbursements(view: String): Flow<ReimbursementsDto?> =
        cache.observe(CacheKeys.reimbursements(view), ReimbursementsDto.serializer())
            .distinctUntilChanged()

    override suspend fun refresh(view: String): ApiResult<ReimbursementsDto> {
        val result = safeApiCall { api.reimbursements(view = view) }
        if (result is ApiResult.Success) {
            cache.write(CacheKeys.reimbursements(view), ReimbursementsDto.serializer(), result.data)
        }
        return result
    }
}
