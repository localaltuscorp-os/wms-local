package com.altuscorp.altus.data.repository

import com.altuscorp.altus.core.network.AltusApi
import com.altuscorp.altus.core.network.ApiResult
import com.altuscorp.altus.core.network.safeApiCall
import com.altuscorp.altus.data.remote.dto.ModuleFormDto
import com.altuscorp.altus.data.remote.dto.ModuleSubmitBody
import com.altuscorp.altus.data.remote.dto.ModuleSubmitResult
import javax.inject.Inject

/**
 * The form-driven Sales modules (Record a Reference · Participant Breakthrough).
 * Direct-fetch — these are light "log an entry + see my entries" surfaces viewed
 * online; no offline cache needed. The ViewModel owns loading/submit state.
 */
interface ModuleFormRepository {

    /** Load a module's schema + the user's own submissions. */
    suspend fun load(key: String): ApiResult<ModuleFormDto>

    /** Submit a new entry (validated server-side against the field schema). */
    suspend fun submit(key: String, fields: Map<String, String>): ApiResult<ModuleSubmitResult>
}

class ModuleFormRepositoryImpl @Inject constructor(
    private val api: AltusApi,
) : ModuleFormRepository {

    override suspend fun load(key: String): ApiResult<ModuleFormDto> =
        safeApiCall { api.moduleForm(key) }

    override suspend fun submit(key: String, fields: Map<String, String>): ApiResult<ModuleSubmitResult> =
        safeApiCall { api.submitModule(key, ModuleSubmitBody(fields)) }
}
