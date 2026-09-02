package com.altuscorp.altus.data.prefs

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.emptyPreferences
import androidx.datastore.preferences.core.stringPreferencesKey
import com.altuscorp.altus.core.network.ApiJson
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.serialization.Serializable
import java.io.IOException
import javax.inject.Inject
import javax.inject.Singleton

/** Appearance setting on the You screen (S9): Light / Dark / System segmented. */
enum class ThemeMode { SYSTEM, LIGHT, DARK }

/**
 * The identity snapshot cached after a successful `/me` so the splash can route
 * a returning user to biometric unlock (S1) and the Today header can greet
 * before the network answers. Mirrors `MeDto`'s stable fields.
 */
@Serializable
data class CachedIdentity(
    val employeeId: String,
    val name: String,
    val email: String,
    val department: String? = null,
    val isAdmin: Boolean = false,
    val avatarUrl: String? = null,
)

/**
 * Typed DataStore accessors — the only reader/writer of the `altus_prefs`
 * preferences file. Holds exactly the small, non-relational state the spec
 * assigns to DataStore: theme mode, the biometric-unlock toggle, the cached
 * identity, and FCM-token bookkeeping (so a token rotated while signed out is
 * registered on the next login).
 *
 * Every flow swallows [IOException] into defaults — a corrupt prefs file must
 * never crash the app at launch.
 */
@Singleton
class AltusPreferences @Inject constructor(
    private val dataStore: DataStore<Preferences>,
) {

    // ── Theme ────────────────────────────────────────────────────────────────

    /** Selected appearance; defaults to following the system. */
    val themeMode: Flow<ThemeMode> = safeData()
        .map { prefs ->
            prefs[KEY_THEME_MODE]?.let { raw ->
                runCatching { ThemeMode.valueOf(raw) }.getOrNull()
            } ?: ThemeMode.SYSTEM
        }
        .distinctUntilChanged()

    suspend fun setThemeMode(mode: ThemeMode) {
        dataStore.edit { it[KEY_THEME_MODE] = mode.name }
    }

    // ── Biometric unlock ─────────────────────────────────────────────────────

    /** "Unlock with biometrics" toggle (S9); the S1 returning-user default path. */
    val biometricUnlockEnabled: Flow<Boolean> = safeData()
        .map { it[KEY_BIOMETRIC_UNLOCK] ?: false }
        .distinctUntilChanged()

    suspend fun setBiometricUnlockEnabled(enabled: Boolean) {
        dataStore.edit { it[KEY_BIOMETRIC_UNLOCK] = enabled }
    }

    // ── Cached identity ──────────────────────────────────────────────────────

    /** Last-known enrolled identity, or null before first login / after sign-out. */
    val cachedIdentity: Flow<CachedIdentity?> = safeData()
        .map { prefs ->
            prefs[KEY_CACHED_IDENTITY]?.let { raw ->
                runCatching { ApiJson.decodeFromString<CachedIdentity>(raw) }.getOrNull()
            }
        }
        .distinctUntilChanged()

    suspend fun setCachedIdentity(identity: CachedIdentity?) {
        dataStore.edit { prefs ->
            if (identity == null) {
                prefs.remove(KEY_CACHED_IDENTITY)
            } else {
                prefs[KEY_CACHED_IDENTITY] = ApiJson.encodeToString(CachedIdentity.serializer(), identity)
            }
        }
    }

    /** One-shot read for the splash routing decision. */
    suspend fun currentIdentity(): CachedIdentity? = cachedIdentity.first()

    // ── Push-token bookkeeping ───────────────────────────────────────────────

    /**
     * The newest FCM token delivered by `onNewToken`, registered or not.
     * AuthRepository re-registers it after every successful login.
     */
    val pendingPushToken: Flow<String?> = safeData()
        .map { it[KEY_PENDING_PUSH_TOKEN] }
        .distinctUntilChanged()

    suspend fun setPendingPushToken(token: String?) {
        dataStore.edit { prefs ->
            if (token == null) prefs.remove(KEY_PENDING_PUSH_TOKEN) else prefs[KEY_PENDING_PUSH_TOKEN] = token
        }
    }

    /** The token last successfully POSTed to /register-push (to DELETE on sign-out). */
    val registeredPushToken: Flow<String?> = safeData()
        .map { it[KEY_REGISTERED_PUSH_TOKEN] }
        .distinctUntilChanged()

    suspend fun setRegisteredPushToken(token: String?) {
        dataStore.edit { prefs ->
            if (token == null) prefs.remove(KEY_REGISTERED_PUSH_TOKEN) else prefs[KEY_REGISTERED_PUSH_TOKEN] = token
        }
    }

    // ── Sign-out ─────────────────────────────────────────────────────────────

    /**
     * Clears everything identity-bound. Theme survives (device preference,
     * not account data); the biometric toggle dies with the session it unlocked.
     */
    suspend fun clearOnSignOut() {
        dataStore.edit { prefs ->
            prefs.remove(KEY_CACHED_IDENTITY)
            prefs.remove(KEY_REGISTERED_PUSH_TOKEN)
            prefs.remove(KEY_BIOMETRIC_UNLOCK)
        }
    }

    private fun safeData(): Flow<Preferences> = dataStore.data.catch { error ->
        if (error is IOException) emit(emptyPreferences()) else throw error
    }

    private companion object {
        val KEY_THEME_MODE = stringPreferencesKey("theme_mode")
        val KEY_BIOMETRIC_UNLOCK = booleanPreferencesKey("biometric_unlock_enabled")
        val KEY_CACHED_IDENTITY = stringPreferencesKey("cached_identity")
        val KEY_PENDING_PUSH_TOKEN = stringPreferencesKey("pending_push_token")
        val KEY_REGISTERED_PUSH_TOKEN = stringPreferencesKey("registered_push_token")
    }
}
