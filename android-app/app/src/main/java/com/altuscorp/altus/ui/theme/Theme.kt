package com.altuscorp.altus.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider

/**
 * Root theme: selects the M3 scheme (§1.1), provides [LocalAltusTokens], and
 * maps the named type scale + shape scale onto MaterialTheme. Wire this once
 * at the Activity content root.
 *
 * @param darkTheme follow the system by default; the You screen can force a
 *   Light/Dark/System choice by passing an explicit value.
 * @param reducedMotion swaps the motion token set for the crossfade fallback.
 */
@Composable
fun AltusTheme(
    // Light-first, to match the web app (which has no dark mode). The You →
    // Appearance toggle can still pass an explicit value; System-follow is
    // available by passing isSystemInDarkTheme() from the caller.
    darkTheme: Boolean = false,
    reducedMotion: Boolean = false,
    content: @Composable () -> Unit,
) {
    val baseTokens = if (darkTheme) DarkTokens else LightTokens
    val tokens = if (reducedMotion) baseTokens.copy(motion = AltusMotion.Reduced) else baseTokens
    val colorScheme = if (darkTheme) AltusDarkColorScheme else AltusLightColorScheme

    CompositionLocalProvider(LocalAltusTokens provides tokens) {
        MaterialTheme(
            colorScheme = colorScheme,
            typography = AltusMaterialTypography,
            shapes = AltusShapes,
            content = content,
        )
    }
}
