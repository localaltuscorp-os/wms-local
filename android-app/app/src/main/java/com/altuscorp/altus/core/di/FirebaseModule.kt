package com.altuscorp.altus.core.di

import android.content.Context
import com.altuscorp.altus.BuildConfig
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.messaging.FirebaseMessaging
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

/**
 * Firebase wiring for project `altuscorp-e7140`.
 *
 * Normal path: `app/google-services.json` is present, the google-services
 * plugin generates the default-app config, and [FirebaseApp.getApps] already
 * contains the initialised default app.
 *
 * Fallback path (scaffold builds before the config file is dropped in): the
 * default app is initialised at runtime from BuildConfig. Email/password auth
 * only needs the web API key; FCM additionally needs the real
 * `mobilesdk_app_id`, which arrives with google-services.json (or the
 * `altus.firebaseAppId` Gradle property) — until then push registration is a
 * no-op server-side, never a crash.
 */
@Module
@InstallIn(SingletonComponent::class)
object FirebaseModule {

    @Provides
    @Singleton
    fun provideFirebaseApp(
        @ApplicationContext context: Context,
    ): FirebaseApp = FirebaseApp.getApps(context).firstOrNull()
        ?: FirebaseApp.initializeApp(
            context,
            FirebaseOptions.Builder()
                .setApiKey(BuildConfig.FIREBASE_API_KEY)
                .setApplicationId(BuildConfig.FIREBASE_APP_ID)
                .setProjectId(BuildConfig.FIREBASE_PROJECT_ID)
                .build(),
        )

    @Provides
    @Singleton
    fun provideFirebaseAuth(app: FirebaseApp): FirebaseAuth = FirebaseAuth.getInstance(app)

    @Provides
    @Singleton
    fun provideFirebaseMessaging(
        // Depend on FirebaseApp so init ordering is guaranteed before the
        // default-app lookup inside getInstance().
        @Suppress("UNUSED_PARAMETER") app: FirebaseApp,
    ): FirebaseMessaging = FirebaseMessaging.getInstance()
}
