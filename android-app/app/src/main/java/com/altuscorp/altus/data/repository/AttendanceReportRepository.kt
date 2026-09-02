package com.altuscorp.altus.data.repository

import com.altuscorp.altus.core.network.AltusApi
import com.altuscorp.altus.core.network.ApiResult
import com.altuscorp.altus.core.network.safeApiCall
import com.altuscorp.altus.data.remote.dto.AttendanceDashboardDto
import javax.inject.Inject

/**
 * The admin "Att Report" — the org-wide monthly attendance summary. Direct-fetch
 * (no JsonCache): the report is admin-only, always viewed online, and paged by
 * month, so per-month caching buys nothing. The ViewModel owns loading/error and
 * the selected month; this repo is a thin, testable network seam.
 */
interface AttendanceReportRepository {

    /** Fetch the summary for [year]/[month] (server defaults to current month when null). */
    suspend fun monthDashboard(year: Int?, month: Int?): ApiResult<AttendanceDashboardDto>
}

class AttendanceReportRepositoryImpl @Inject constructor(
    private val api: AltusApi,
) : AttendanceReportRepository {

    override suspend fun monthDashboard(year: Int?, month: Int?): ApiResult<AttendanceDashboardDto> =
        safeApiCall { api.attendanceDashboard(year, month) }
}
