package com.altuscorp.altus.data.repository

import com.altuscorp.altus.core.network.AltusApi
import com.altuscorp.altus.core.network.ApiResult
import com.altuscorp.altus.core.network.safeApiCall
import com.altuscorp.altus.data.remote.dto.IndexHubDto
import javax.inject.Inject

/**
 * Marketing "Index Hub" — a read-only, direct-fetch link directory. Light payload
 * viewed online; no offline cache needed.
 */
interface IndexHubRepository {
    suspend fun load(): ApiResult<IndexHubDto>
}

class IndexHubRepositoryImpl @Inject constructor(
    private val api: AltusApi,
) : IndexHubRepository {
    override suspend fun load(): ApiResult<IndexHubDto> = safeApiCall { api.indexHub() }
}
