package com.altuscorp.altus.core.di

import android.content.Context
import androidx.room.Room
import com.altuscorp.altus.data.local.AltusDatabase
import com.altuscorp.altus.data.local.dao.CacheDao
import com.altuscorp.altus.data.local.dao.OutboxDao
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

/**
 * Room wiring. The database is a cache (see [AltusDatabase]) so destructive
 * fallback keeps launch bullet-proof across schema bumps in development;
 * shipped bumps that touch the outbox table must add a real Migration.
 */
@Module
@InstallIn(SingletonComponent::class)
object DatabaseModule {

    @Provides
    @Singleton
    fun provideAltusDatabase(
        @ApplicationContext context: Context,
    ): AltusDatabase = Room
        .databaseBuilder(context, AltusDatabase::class.java, AltusDatabase.NAME)
        .fallbackToDestructiveMigration()
        .build()

    @Provides
    fun provideOutboxDao(database: AltusDatabase): OutboxDao = database.outboxDao()

    @Provides
    fun provideCacheDao(database: AltusDatabase): CacheDao = database.cacheDao()
}
