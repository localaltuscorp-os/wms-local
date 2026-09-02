package com.altuscorp.altus.ui.theme

import androidx.compose.runtime.Composable
import androidx.compose.runtime.ProvidableCompositionLocal
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.staticCompositionLocalOf

/**
 * The no-hex-in-composables contract: every color, motion spec and dimension a
 * screen needs comes through here (or through MaterialTheme).
 */
val LocalAltusTokens: ProvidableCompositionLocal<AltusTokens> =
    staticCompositionLocalOf { LightTokens }

/** Accessor object — screens read AltusTheme.tokens / .motion / .dimens. */
object AltusTheme {
    val tokens: AltusTokens
        @Composable @ReadOnlyComposable get() = LocalAltusTokens.current

    val motion: AltusMotion
        @Composable @ReadOnlyComposable get() = LocalAltusTokens.current.motion

    val dimens: AltusDimens get() = AltusDimens
}
