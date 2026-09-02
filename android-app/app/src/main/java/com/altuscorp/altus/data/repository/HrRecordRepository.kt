package com.altuscorp.altus.data.repository

import com.altuscorp.altus.core.network.AltusApi
import com.altuscorp.altus.core.network.ApiResult
import com.altuscorp.altus.data.local.entity.CacheKeys
import com.altuscorp.altus.data.remote.dto.HrRecordDto
import com.altuscorp.altus.core.network.safeApiCall
import javax.inject.Inject
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.distinctUntilChanged

/**
 * The signed-in user's read-only HR "Attendance log" sheet mirror (Employees
 * workspace). Pure read + reconcile — no mutations, no outbox: the sheet is an
 * authoritative reference layer, not something the app edits.
 *
 * Cache-first per month: [record] paints the last-decoded month instantly
 * (null → skeletons) while [refresh] reconciles against the server. A null
 * month means "newest available", keyed under [LATEST] so it repaints even
 * before the first month index is known.
 */
interface HrRecordRepository {

    /** Live decoded record for one month bucket (`YYYY-MM-01`), or null = newest. */
    fun record(month: String?): Flow<HrRecordDto?>

    /** Fetch one month from the network, upsert its snapshot under both keys. */
    suspend fun refresh(month: String?): ApiResult<HrRecordDto>
}

class HrRecordRepositoryImpl @Inject constructor(
    private val api: AltusApi,
    private val cache: JsonCache,
) : HrRecordRepository {

    override fun record(month: String?): Flow<HrRecordDto?> =
        cache.observe(CacheKeys.hrRecord(month ?: LATEST), HrRecordDto.serializer())
            .distinctUntilChanged()

    override suspend fun refresh(month: String?): ApiResult<HrRecordDto> {
        // The API's `?month=` wants `YYYY-MM`; buckets are `YYYY-MM-01`.
        val monthParam = month?.take(7)
        val result = safeApiCall { api.hrRecord(month = monthParam) }
        if (result is ApiResult.Success) {
            val data = result.data
            // Write under the requested key (or LATEST), and also under the
            // resolved month so switching back to it repaints from cache.
            cache.write(CacheKeys.hrRecord(month ?: LATEST), HrRecordDto.serializer(), data)
            data.month?.let { resolved ->
                cache.write(CacheKeys.hrRecord(resolved), HrRecordDto.serializer(), data)
            }
        }
        return result
    }

    private companion object {
        /** Cache key for the "no month specified → newest" request. */
        const val LATEST = "latest"
    }
}
