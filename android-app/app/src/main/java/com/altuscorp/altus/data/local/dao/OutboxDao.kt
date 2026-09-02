package com.altuscorp.altus.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.Query
import com.altuscorp.altus.data.local.entity.MutationKind
import com.altuscorp.altus.data.local.entity.OutboxEntity
import kotlinx.coroutines.flow.Flow

/**
 * The pending-mutation queue. Rows replay strictly FIFO (`ORDER BY id`) so a
 * status change never overtakes the fill it depends on. The observable count
 * drives every "pending sync" affordance (offline bar, You-screen meta).
 */
@Dao
interface OutboxDao {

    /** Enqueue one mutation; returns the new row id. */
    @Insert
    suspend fun insert(entity: OutboxEntity): Long

    /** All pending mutations, oldest first — the worker's replay order. */
    @Query("SELECT * FROM outbox ORDER BY id ASC")
    suspend fun pending(): List<OutboxEntity>

    /** Live view of the queue (debug/settings surfaces). */
    @Query("SELECT * FROM outbox ORDER BY id ASC")
    fun observePending(): Flow<List<OutboxEntity>>

    /** Live count of everything still waiting to sync. */
    @Query("SELECT COUNT(*) FROM outbox")
    fun observePendingCount(): Flow<Int>

    /** Live pending count for one target (per-control "syncing…" states). */
    @Query("SELECT COUNT(*) FROM outbox WHERE targetId = :targetId")
    fun observePendingCountFor(targetId: String): Flow<Int>

    /** Pending rows of one kind (e.g. all queued DCC entries for merge rules). */
    @Query("SELECT * FROM outbox WHERE kind = :kind ORDER BY id ASC")
    suspend fun pendingOfKind(kind: MutationKind): List<OutboxEntity>

    /** Record a failed replay attempt without losing the row. */
    @Query("UPDATE outbox SET attemptCount = attemptCount + 1, lastError = :error WHERE id = :id")
    suspend fun markAttempt(id: Long, error: String?)

    /** Remove one row — after successful replay or permanent rejection. */
    @Query("DELETE FROM outbox WHERE id = :id")
    suspend fun delete(id: Long)

    /** Drop everything — sign-out only (a new session must not replay a stranger's day). */
    @Query("DELETE FROM outbox")
    suspend fun clearAll()
}
