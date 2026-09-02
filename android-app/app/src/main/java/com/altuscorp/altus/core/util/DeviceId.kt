package com.altuscorp.altus.core.util

import android.content.Context
import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import dagger.hilt.android.qualifiers.ApplicationContext
import timber.log.Timber
import java.security.KeyStore
import java.util.Locale
import java.util.UUID
import javax.crypto.KeyGenerator
import javax.crypto.Mac
import javax.crypto.SecretKey
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Stable, keystore-backed device identity for the anti-proxy punch.
 *
 * The id is the hex HMAC-SHA256 of a fixed label under a non-extractable key
 * generated inside the Android Keystore ([KEY_ALIAS]). The key material never
 * leaves secure hardware, so the id cannot be copied to another phone — it is
 * stable for the life of the install and dies with the app (uninstall /
 * "clear data" mints a new identity, which is exactly the server's device
 * re-enrollment event).
 *
 * If the keystore is unavailable (rare OEM breakage), a random UUID persisted
 * in app-private prefs keeps the id stable per install — weaker binding, same
 * contract.
 *
 * Sent with every `POST /api/mobile/attendance/punch` as
 * `{deviceId, deviceLabel, platform}`.
 */
@Singleton
class DeviceId @Inject constructor(
    @ApplicationContext private val context: Context,
) {

    /** Stable 32-hex-char device identifier. */
    val id: String by lazy { resolveId() }

    /** Human-readable device name shown in the punch Status Ledger ("Pixel 8"). */
    val label: String by lazy {
        val manufacturer = Build.MANUFACTURER.orEmpty()
            .replaceFirstChar { if (it.isLowerCase()) it.titlecase(Locale.ENGLISH) else it.toString() }
        val model = Build.MODEL.orEmpty()
        if (model.startsWith(manufacturer, ignoreCase = true) || manufacturer.isBlank()) {
            model.ifBlank { "Android device" }
        } else {
            "$manufacturer $model"
        }
    }

    /** Platform discriminator for the punch payload. */
    val platform: String = "android"

    private fun resolveId(): String =
        runCatching { keystoreBackedId() }
            .onFailure { Timber.w(it, "Keystore device id unavailable; falling back to persisted UUID") }
            .getOrElse { persistedFallbackId() }

    private fun keystoreBackedId(): String {
        val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
        val key: SecretKey = (keyStore.getKey(KEY_ALIAS, null) as? SecretKey)
            ?: generateKey()
        val mac = Mac.getInstance(HMAC_ALGORITHM).apply { init(key) }
        val digest = mac.doFinal(HMAC_LABEL.toByteArray(Charsets.UTF_8))
        return digest.take(ID_BYTES).joinToString("") { "%02x".format(it) }
    }

    private fun generateKey(): SecretKey {
        val generator = KeyGenerator.getInstance(
            KeyProperties.KEY_ALGORITHM_HMAC_SHA256,
            ANDROID_KEYSTORE,
        )
        generator.init(
            KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_SIGN)
                .build(),
        )
        return generator.generateKey()
    }

    private fun persistedFallbackId(): String {
        val prefs = context.getSharedPreferences(FALLBACK_PREFS, Context.MODE_PRIVATE)
        prefs.getString(FALLBACK_KEY, null)?.let { return it }
        val generated = UUID.randomUUID().toString().replace("-", "")
        prefs.edit().putString(FALLBACK_KEY, generated).apply()
        return generated
    }

    private companion object {
        const val ANDROID_KEYSTORE = "AndroidKeyStore"
        const val KEY_ALIAS = "altus_device_identity"
        const val HMAC_ALGORITHM = "HmacSHA256"
        const val HMAC_LABEL = "com.altuscorp.altus.device"
        const val ID_BYTES = 16
        const val FALLBACK_PREFS = "altus_device_id"
        const val FALLBACK_KEY = "fallback_id"
    }
}
