package com.altuscorp.altus.data.local.dao

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert
import com.altuscorp.altus.data.local.entity.CacheEntryEntity
import kotlinx.coroutines.flow.Flow

/**
 * Last-good response snapshots keyed by
 * [com.altuscorp.altus.data.local.entity.CacheKeys]. Repositories observe a
 * key to paint instantly, upsert on every successful fetch (and on every
 * optimistic local mutation), and clear the lot on sign-out.
 */
@Dao
interface CacheDao {

    /** Live snapshot for one key; emits null while the cache is cold. */
    @Query("SELECT * FROM cache_entries WHERE cacheKey = :key")
    fun observe(key: String): Flow<CacheEntryEntity?>

    /** One-shot read (splash routing, worker-side reconciliation). */
    @Query("SELECT * FROM cache_entries WHERE cacheKey = :key")
    suspend fun read(key: String): CacheEntryEntity?

    /** Write/replace a snapshot. */
    @Upsert
    suspend fun upsert(entry: CacheEntryEntity)

    /** Drop one snapshot (e.g. a task detail the user can no longer see). */
    @Query("DELETE FROM cache_entries WHERE cacheKey = :key")
    suspend fun delete(key: String)

    /** Drop snapshots by prefix (e.g. every `dcc:` day when rosters change). */
    @Query("DELETE FROM cache_entries WHERE cacheKey LIKE :prefix || '%'")
    suspend fun deleteByPrefix(prefix: String)

    /** Sign-out: no identity may inherit another's ledger. */
    @Query("DELETE FROM cache_entries")
    suspend fun clearAll()
}
