package com.altuscorp.altus.core.di

import com.altuscorp.altus.BuildConfig
import com.altuscorp.altus.core.network.TokenProvider
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.createSupabaseClient
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.realtime.Realtime
import io.github.jan.supabase.serializer.KotlinXSerializer
import io.github.jan.supabase.storage.Storage
import io.ktor.client.engine.okhttp.OkHttp
import javax.inject.Singleton
import kotlinx.serialization.json.Json
import okhttp3.OkHttpClient

/**
 * The Supabase client per the hybrid [C] backend decision:
 *
 * - AUTH: Third-Party Auth is live on this project, so the RAW Firebase ID
 *   token is a valid Supabase access token. The [TokenProvider] feeds the
 *   `accessToken` provider — NO custom JWT is ever minted, NO
 *   `/api/mobile/supabase-token` route exists (it would be dead code).
 * - REALTIME: live deltas on tables with confirmed RLS SELECT policies (see
 *   [com.altuscorp.altus.data.supabase.SupabaseRealtime] for the P0 coverage
 *   gate). Hourly Firebase token rotation is pushed to the open socket by
 *   [com.altuscorp.altus.data.supabase.RealtimeAuthBridge].
 * - STORAGE: bytes move only via backend-minted signed URLs
 *   ([com.altuscorp.altus.data.supabase.SupabaseStorage]).
 * - POSTGREST: installed for RLS-covered direct reads only; every write and
 *   every initial load stays on `/api/mobile`.
 *
 * The anon key is a public client identifier (same value the web bundle
 * ships); RLS + Firebase ID-token verification are the real gates. The
 * service-role key and DATABASE_URL never ship in the app. Supabase
 * Realtime/PostgREST/Storage are separate infra from the txn pooler `:6543` —
 * this client adds zero DB-pool pressure.
 *
 * Ktor rides the app's shared [RawHttpClient] OkHttp engine (one connection
 * pool, one HTTP/2 stack; supabase-kt attaches its own auth headers).
 */
@Module
@InstallIn(SingletonComponent::class)
object SupabaseModule {

    @Provides
    @Singleton
    fun provideSupabaseClient(
        tokenProvider: TokenProvider,
        json: Json,
        @RawHttpClient rawClient: OkHttpClient,
    ): SupabaseClient = createSupabaseClient(
        supabaseUrl = BuildConfig.SUPABASE_URL,
        supabaseKey = BuildConfig.SUPABASE_ANON_KEY,
    ) {
        defaultSerializer = KotlinXSerializer(json)
        httpEngine = OkHttp.create { preconfigured = rawClient }
        // Raw Firebase ID token = Supabase access token (Third-Party Auth).
        // Falls back to the anon key when signed out: requests then carry the
        // anon role and RLS returns nothing — silent-empty, never a crash.
        accessToken = { tokenProvider.idToken(forceRefresh = false) ?: BuildConfig.SUPABASE_ANON_KEY }
        install(Realtime)
        install(Postgrest)
        install(Storage)
    }
}
