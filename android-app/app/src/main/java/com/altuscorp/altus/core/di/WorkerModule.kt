package com.altuscorp.altus.core.di

import android.content.Context
import androidx.work.WorkManager
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

/**
 * WorkManager wiring for the outbox replay pipeline.
 *
 * `AltusApplication` implements `Configuration.Provider` with the
 * [androidx.hilt.work.HiltWorkerFactory] (and the manifest removes the default
 * initializer), so `getInstance` here triggers on-demand initialisation with
 * Hilt-aware worker construction — `@HiltWorker OutboxWorker` gets its DAOs and
 * API constructor-injected.
 */
@Module
@InstallIn(SingletonComponent::class)
object WorkerModule {

    @Provides
    @Singleton
    fun provideWorkManager(
        @ApplicationContext context: Context,
    ): WorkManager = WorkManager.getInstance(context)
}
