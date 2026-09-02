package com.altuscorp.altus.core.di

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.core.handlers.ReplaceFileCorruptionHandler
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.emptyPreferences
import androidx.datastore.preferences.preferencesDataStoreFile
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob

/**
 * The single Preferences DataStore behind
 * [com.altuscorp.altus.data.prefs.AltusPreferences] (theme mode, biometric
 * toggle, cached identity, FCM-token bookkeeping).
 *
 * A corrupt file is replaced with empty preferences — the app must never crash
 * at launch over a settings file. The store gets its own SupervisorJob so a
 * cancelled caller never tears down DataStore's writer coroutine.
 */
@Module
@InstallIn(SingletonComponent::class)
object DataStoreModule {

    private const val STORE_FILE_NAME = "altus_prefs"

    @Provides
    @Singleton
    fun providePreferencesDataStore(
        @ApplicationContext context: Context,
        @IoDispatcher ioDispatcher: CoroutineDispatcher,
    ): DataStore<Preferences> = PreferenceDataStoreFactory.create(
        corruptionHandler = ReplaceFileCorruptionHandler { emptyPreferences() },
        scope = CoroutineScope(SupervisorJob() + ioDispatcher),
        produceFile = { context.preferencesDataStoreFile(STORE_FILE_NAME) },
    )
}
