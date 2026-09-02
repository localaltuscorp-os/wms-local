package com.altuscorp.altus.core.di

import com.altuscorp.altus.BuildConfig
import com.altuscorp.altus.core.network.AltusApi
import com.altuscorp.altus.core.network.ApiJson
import com.altuscorp.altus.core.network.AuthInterceptor
import com.jakewharton.retrofit2.converter.kotlinx.serialization.asConverterFactory
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import java.util.concurrent.TimeUnit
import javax.inject.Qualifier
import javax.inject.Singleton
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit

/**
 * Bare OkHttp client — no Authorization header. Used for byte transfers to
 * pre-signed URLs (the signature IS the auth; the Firebase Bearer must not be
 * sprayed at storage hosts) and as the preconfigured engine under supabase-kt's
 * Ktor stack. Shares pools with the authed client.
 */
@Qualifier
@Retention(AnnotationRetention.BINARY)
annotation class RawHttpClient

/**
 * The `/api/mobile` client: Firebase Bearer on every call. Only Retrofit
 * should consume this.
 */
@Qualifier
@Retention(AnnotationRetention.BINARY)
annotation class AuthedHttpClient

/**
 * Retrofit over OkHttp for the whole `/api/mobile` surface. One [Json]
 * ([ApiJson] — `ignoreUnknownKeys` etc.) for the wire, error bodies, outbox
 * payloads and cache snapshots.
 */
@Module
@InstallIn(SingletonComponent::class)
object NetworkModule {

    private const val CONNECT_TIMEOUT_SECONDS = 15L
    private const val READ_TIMEOUT_SECONDS = 30L
    private const val WRITE_TIMEOUT_SECONDS = 30L
    private const val JSON_MEDIA_TYPE = "application/json"

    @Provides
    @Singleton
    fun provideJson(): Json = ApiJson

    @Provides
    @Singleton
    @RawHttpClient
    fun provideRawOkHttpClient(): OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(CONNECT_TIMEOUT_SECONDS, TimeUnit.SECONDS)
        .readTimeout(READ_TIMEOUT_SECONDS, TimeUnit.SECONDS)
        .writeTimeout(WRITE_TIMEOUT_SECONDS, TimeUnit.SECONDS)
        .apply {
            if (BuildConfig.DEBUG) {
                addInterceptor(
                    HttpLoggingInterceptor().apply {
                        level = HttpLoggingInterceptor.Level.BASIC
                    },
                )
            }
        }
        .build()

    @Provides
    @Singleton
    @AuthedHttpClient
    fun provideAuthedOkHttpClient(
        @RawHttpClient rawClient: OkHttpClient,
        authInterceptor: AuthInterceptor,
    ): OkHttpClient = rawClient.newBuilder()
        .apply {
            // The Bearer must be attached before the debug logger already on
            // the raw client runs; interceptors run in add-order, so prepend.
            interceptors().add(0, authInterceptor)
        }
        .apply {
            if (BuildConfig.DEBUG) {
                // Never leak tokens into debug logcat.
                interceptors()
                    .filterIsInstance<HttpLoggingInterceptor>()
                    .forEach { it.redactHeader("Authorization") }
            }
        }
        .build()

    @Provides
    @Singleton
    fun provideRetrofit(
        @AuthedHttpClient client: OkHttpClient,
        json: Json,
    ): Retrofit = Retrofit.Builder()
        .baseUrl(BuildConfig.API_BASE_URL.trimEnd('/') + "/")
        .client(client)
        .addConverterFactory(json.asConverterFactory(JSON_MEDIA_TYPE.toMediaType()))
        .build()

    @Provides
    @Singleton
    fun provideAltusApi(retrofit: Retrofit): AltusApi = retrofit.create(AltusApi::class.java)
}
