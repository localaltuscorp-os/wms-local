package com.altuscorp.altus.data.repository

import com.altuscorp.altus.core.network.AltusApi
import com.altuscorp.altus.core.network.ApiResult
import com.altuscorp.altus.core.network.safeApiCall
import com.altuscorp.altus.data.remote.dto.TeamDashboardDto
import javax.inject.Inject

/** Admin team dashboards (overtime · reimbursements). Direct-fetch. */
interface TeamDashboardRepository {
    suspend fun load(type: String): ApiResult<TeamDashboardDto>
}

class TeamDashboardRepositoryImpl @Inject constructor(
    private val api: AltusApi,
) : TeamDashboardRepository {
    override suspend fun load(type: String): ApiResult<TeamDashboardDto> = safeApiCall { api.teamDashboard(type) }
}
