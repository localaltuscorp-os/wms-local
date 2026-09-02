package com.altuscorp.altus

import android.os.Bundle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.getValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.fragment.app.FragmentActivity
import androidx.lifecycle.lifecycleScope
import com.altuscorp.altus.navigation.AltusNavHost
import com.altuscorp.altus.ui.theme.AltusTheme
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * The app's single activity.
 *
 * S1 contract: the system splash (deep bed + Altus mark, styled by
 * `Theme.Altus.Starting`) is held on screen for [SPLASH_HOLD_MS] — the floor
 * that lets the login layer resolve the cached `/me` identity so returning
 * users land on biometric unlock instead of a flash of the login form.
 *
 * Edge-to-edge is enabled before content; the Day Strip, bottom bar and every
 * IME-facing composer take their own insets.
 *
 * Deep links: the activity is `singleTask`; deliveries to a live task are
 * forwarded to the NavController via `addOnNewIntentListener` inside
 * [AltusNavHost].
 *
 * Extends [FragmentActivity] (a ComponentActivity subclass — Compose is
 * unaffected) because `androidx.biometric.BiometricPrompt` requires one for
 * the S1 biometric unlock and the S3 punch confirmation gate.
 */
@AndroidEntryPoint
class MainActivity : FragmentActivity() {

    @javax.inject.Inject
    lateinit var preferences: com.altuscorp.altus.data.prefs.AltusPreferences

    private var keepSplashOnScreen = true

    override fun onCreate(savedInstanceState: Bundle?) {
        val splash = installSplashScreen()
        super.onCreate(savedInstanceState)

        splash.setKeepOnScreenCondition { keepSplashOnScreen }
        lifecycleScope.launch {
            delay(SPLASH_HOLD_MS)
            keepSplashOnScreen = false
        }

        enableEdgeToEdge()
        setContent {
            // The You → Appearance toggle (Light / Dark / System) drives the
            // theme live: SYSTEM follows the phone, LIGHT/DARK force it.
            val mode by preferences.themeMode.collectAsStateWithLifecycle(
                initialValue = com.altuscorp.altus.data.prefs.ThemeMode.SYSTEM,
            )
            val dark = when (mode) {
                com.altuscorp.altus.data.prefs.ThemeMode.LIGHT -> false
                com.altuscorp.altus.data.prefs.ThemeMode.DARK -> true
                com.altuscorp.altus.data.prefs.ThemeMode.SYSTEM -> androidx.compose.foundation.isSystemInDarkTheme()
            }
            AltusTheme(darkTheme = dark) {
                AltusNavHost()
            }
        }
    }

    private companion object {
        const val SPLASH_HOLD_MS = 800L
    }
}
