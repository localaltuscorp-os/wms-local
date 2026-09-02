package com.altuscorp.altus.data.local

import androidx.room.Database
import androidx.room.RoomDatabase
import androidx.room.TypeConverters
import com.altuscorp.altus.data.local.dao.CacheDao
import com.altuscorp.altus.data.local.dao.OutboxDao
import com.altuscorp.altus.data.local.entity.CacheEntryEntity
import com.altuscorp.altus.data.local.entity.OutboxEntity

/**
 * The on-device spine of offline-first: a read cache that lets every screen
 * paint before the network answers, and the mutation outbox that makes
 * optimistic-first honest (Part 6: Room-as-truth + WorkManager outbox).
 *
 * The database is a *cache*, never a system of record — the server is truth.
 * On a schema bump we fall back to destructive migration: snapshots refetch on
 * next load. The one cost is any not-yet-replayed outbox row, so schema bumps
 * that touch `outbox` must ship a real migration once the app is in the field.
 */
@Database(
    entities = [
        OutboxEntity::class,
        CacheEntryEntity::class,
    ],
    version = 1,
    exportSchema = true,
)
@TypeConverters(Converters::class)
abstract class AltusDatabase : RoomDatabase() {

    abstract fun outboxDao(): OutboxDao

    abstract fun cacheDao(): CacheDao

    companion object {
        /** On-disk file name. */
        const val NAME = "altus.db"
    }
}
