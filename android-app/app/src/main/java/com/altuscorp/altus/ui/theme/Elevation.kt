package com.altuscorp.altus.ui.theme

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * Elevation (§1.4). Light mode: hairline border first, shadow second — exactly
 * two named shadows exist in the whole app:
 *
 *  - `ambient` (y1 blur2, ink @ 6%) — cards.
 *  - `lifted`  (y8 blur20, ink @ 12%) — sheets, dialogs, the Day Strip.
 *
 * Pressed cards never shadow-jump — they scale (tap-settle).
 * Dark mode: shadows OFF; the L0–L3 lightness ladder IS elevation, so both
 * helpers become no-ops when [AltusTokens.isDark] is true.
 */
object AltusElevation {
    /** Card shadow depth (approximates y1 blur2 6%). */
    val ambient: Dp = 2.dp

    /** Sheet / dialog / Day Strip shadow depth (approximates y8 blur20 12%). */
    val lifted: Dp = 12.dp

    const val AMBIENT_ALPHA = 0.06f
    const val LIFTED_ALPHA = 0.12f
}

/** The `ambient` card shadow. No-op in dark mode. */
@Composable
fun Modifier.ambientShadow(shape: Shape): Modifier {
    val tokens = AltusTheme.tokens
    if (tokens.isDark) return this
    val tint = ShadowInk.copy(alpha = AltusElevation.AMBIENT_ALPHA)
    return shadow(
        elevation = AltusElevation.ambient,
        shape = shape,
        clip = false,
        ambientColor = tint,
        spotColor = tint,
    )
}

/** The `lifted` sheet/dialog/Day-Strip shadow. No-op in dark mode. */
@Composable
fun Modifier.liftedShadow(shape: Shape): Modifier {
    val tokens = AltusTheme.tokens
    if (tokens.isDark) return this
    val tint = ShadowInk.copy(alpha = AltusElevation.LIFTED_ALPHA)
    return shadow(
        elevation = AltusElevation.lifted,
        shape = shape,
        clip = false,
        ambientColor = tint,
        spotColor = tint,
    )
}
