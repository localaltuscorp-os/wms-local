package com.altuscorp.altus.data.repository

import com.altuscorp.altus.core.network.AltusApi
import com.altuscorp.altus.core.network.ApiResult
import com.altuscorp.altus.core.network.safeApiCall
import com.altuscorp.altus.data.local.entity.CacheKeys
import com.altuscorp.altus.data.remote.dto.AccountsDto
import com.altuscorp.altus.data.remote.dto.AccountsDueDto
import com.altuscorp.altus.data.remote.dto.AccountsSectionDetailDto
import javax.inject.Inject
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.distinctUntilChanged

/**
 * The Admin · Accounts front door: a cache-first read of the data-driven section
 * registry the web `/accounts` page renders (`ACCOUNTS_SECTIONS`), ordered, with
 * a built/live/total roll-up. Read-only — no outbox, no realtime; the cache
 * paints first (skeletons only on a true cold cache), a network reconcile runs
 * on entry and on pull-to-refresh.
 */
interface AccountsRepository {

    /** Live decoded registry; null on a true cold cache. */
    fun accounts(): Flow<AccountsDto?>

    /** Fetch from the network, upsert the snapshot, return the fresh registry. */
    suspend fun refresh(): ApiResult<AccountsDto>

    /** Live "Due Dates Checklist" section; null on a true cold cache. */
    fun dueDates(): Flow<AccountsDueDto?>

    /** Fetch the Due Dates section, upsert the snapshot, return it fresh. */
    suspend fun refreshDueDates(): ApiResult<AccountsDueDto>

    /** A normalized register section. [api] "accounts" → Accounts registers;
     *  "section" → the cross-module endpoint (training, etc.). Direct-fetch. */
    suspend fun section(slug: String, api: String = "accounts"): ApiResult<AccountsSectionDetailDto>
}

class AccountsRepositoryImpl @Inject constructor(
    private val api: AltusApi,
    private val cache: JsonCache,
) : AccountsRepository {

    override fun accounts(): Flow<AccountsDto?> =
        cache.observe(CacheKeys.ACCOUNTS, AccountsDto.serializer())
            .distinctUntilChanged()

    override suspend fun refresh(): ApiResult<AccountsDto> {
        val result = safeApiCall { api.accounts() }
        if (result is ApiResult.Success) {
            cache.write(CacheKeys.ACCOUNTS, AccountsDto.serializer(), result.data)
        }
        return result
    }

    override fun dueDates(): Flow<AccountsDueDto?> =
        cache.observe(CacheKeys.ACCOUNTS_DUE, AccountsDueDto.serializer())
            .distinctUntilChanged()

    override suspend fun refreshDueDates(): ApiResult<AccountsDueDto> {
        val result = safeApiCall { api.accountsDueDates() }
        if (result is ApiResult.Success) {
            cache.write(CacheKeys.ACCOUNTS_DUE, AccountsDueDto.serializer(), result.data)
        }
        return result
    }

    override suspend fun section(slug: String, api: String): ApiResult<AccountsSectionDetailDto> =
        safeApiCall { if (api == "section") this.api.moduleSection(slug) else this.api.accountsSection(slug) }
}
