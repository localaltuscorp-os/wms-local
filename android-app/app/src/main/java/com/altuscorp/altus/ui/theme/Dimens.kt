package com.altuscorp.altus.ui.theme

import androidx.compose.runtime.Immutable
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * Spacing, layout and radii scales on a strict 4dp base grid.
 *
 * These are static (device-independent) tokens, exposed as an [Immutable]
 * holder both directly ([AltusDimens]) and through the theme for symmetry with
 * the color tokens.
 */
@Immutable
object AltusDimens {

    // Spacing scale — 4dp base grid.
    val space1: Dp = 4.dp
    val space2: Dp = 8.dp
    val space3: Dp = 12.dp
    val space4: Dp = 16.dp
    val space5: Dp = 20.dp
    val space6: Dp = 24.dp
    val space8: Dp = 32.dp
    val space12: Dp = 48.dp

    // Layout rhythm.
    val screenGutter: Dp = 20.dp
    val cardPadding: Dp = 16.dp
    val cardGap: Dp = 12.dp
    val sectionGap: Dp = 28.dp

    // Touch targets.
    val touchMin: Dp = 48.dp
    val actionPrimary: Dp = 56.dp
    val punchControl: Dp = 72.dp

    // Radii.
    val radiusChip: Dp = 8.dp
    val radiusInput: Dp = 12.dp
    val radiusCard: Dp = 16.dp
    val radiusSheet: Dp = 20.dp
    val radiusHero: Dp = 24.dp

    // Borders / strokes.
    val hairline: Dp = 1.dp
    val moduleKeyline: Dp = 3.dp

    // Signature objects.
    val dayRingHero: Dp = 96.dp
    val dayRingStrip: Dp = 28.dp
    val dccRing: Dp = 64.dp
    val dccRingPinned: Dp = 48.dp
    val dayStripHeight: Dp = 52.dp
    val tabBarHeight: Dp = 64.dp
}
