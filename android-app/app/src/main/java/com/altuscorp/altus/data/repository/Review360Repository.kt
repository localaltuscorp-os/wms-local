package com.altuscorp.altus.data.repository

import com.altuscorp.altus.core.network.AltusApi
import com.altuscorp.altus.core.network.ApiResult
import com.altuscorp.altus.core.network.safeApiCall
import com.altuscorp.altus.data.remote.dto.Review360Dto
import javax.inject.Inject

/**
 * Employees · Monthly 360 (read-only). A lightweight direct-fetch repository:
 * the 360 roster is an analytics/HR surface, not a hot daily-loop board, so it
 * skips the outbox + cache-mirror machinery and simply resolves the network
 * read to an [ApiResult]. The ViewModel owns the transient load state.
 *
 * The actual rating write stays on the web form; this surface only reads.
 */
interface Review360Repository {

    /** Fetch the signed-in user's 360 roster + prior ratings + personal goals. */
    suspend fun load(): ApiResult<Review360Dto>
}

class Review360RepositoryImpl @Inject constructor(
    private val api: AltusApi,
) : Review360Repository {

    override suspend fun load(): ApiResult<Review360Dto> = safeApiCall { api.review360() }
}
