package com.altuscorp.altus.data.repository

import com.altuscorp.altus.core.network.ApiJson
import com.altuscorp.altus.data.local.dao.CacheDao
import com.altuscorp.altus.data.local.entity.CacheEntryEntity
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.serialization.KSerializer
import timber.log.Timber

/**
 * The repository layer's one typed door into the Room read cache: DTO in,
 * DTO out, [ApiJson] in the middle — the SAME lenient Json the wire uses, so
 * a cached body can never be more fragile than a live one (CacheEntities
 * contract).
 *
 * Decode is forgiving: a snapshot written by an older app version that no
 * longer parses simply reads as null (cold cache) instead of crashing the
 * first paint.
 */
@Singleton
class JsonCache @Inject constructor(
    private val cacheDao: CacheDao,
) {

    /** Live decoded snapshot; null while cold or undecodable. */
    fun <T : Any> observe(key: String, serializer: KSerializer<T>): Flow<T?> =
        cacheDao.observe(key).map { entry -> entry?.decode(serializer) }

    /** One-shot decoded read. */
    suspend fun <T : Any> read(key: String, serializer: KSerializer<T>): T? =
        cacheDao.read(key)?.decode(serializer)

    /** Write/replace a snapshot (network truth or an optimistic local patch). */
    suspend fun <T : Any> write(key: String, serializer: KSerializer<T>, value: T) {
        cacheDao.upsert(
            CacheEntryEntity(
                cacheKey = key,
                json = ApiJson.encodeToString(serializer, value),
                fetchedAtEpochMs = System.currentTimeMillis(),
            ),
        )
    }

    /**
     * Read-transform-write for optimistic patches. No-ops (returns false) on a
     * cold cache — there is nothing to patch, and the next fetch is truth.
     */
    suspend fun <T : Any> mutate(key: String, serializer: KSerializer<T>, transform: (T) -> T): Boolean {
        val current = read(key, serializer) ?: return false
        write(key, serializer, transform(current))
        return true
    }

    /** Drop one snapshot (e.g. a task detail the user can no longer see). */
    suspend fun delete(key: String) {
        cacheDao.delete(key)
    }

    private fun <T : Any> CacheEntryEntity.decode(serializer: KSerializer<T>): T? =
        runCatching { ApiJson.decodeFromString(serializer, json) }
            .onFailure { Timber.w(it, "Cache snapshot %s failed to decode — treating as cold", cacheKey) }
            .getOrNull()
}
