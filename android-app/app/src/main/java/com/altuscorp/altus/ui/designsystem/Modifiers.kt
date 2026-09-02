package com.altuscorp.altus.ui.designsystem

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.material3.ripple
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.semantics.Role
import com.altuscorp.altus.ui.theme.AltusTheme
import com.altuscorp.altus.ui.theme.GRAIN_ALPHA
import com.altuscorp.altus.ui.theme.rememberGrainBrush

/**
 * Shared design-system modifiers: tap-settle press physics, the hero-surface
 * grain overlay, and the lambda-based collapsing-header offset.
 */

/**
 * `tap-settle` (§1.5, Signature 10): scale 1 → 0.97 on press with
 * spring(0.7, 900), release settles back with spring(0.5, 400). Apply to any
 * pressable surface whose press state is tracked by [interactionSource].
 * Nothing is inert to touch.
 */
@Composable
fun Modifier.tapSettle(
    interactionSource: MutableInteractionSource,
    enabled: Boolean = true,
): Modifier {
    val motion = AltusTheme.motion
    val pressed by interactionSource.collectIsPressedAsState()
    val scale by animateFloatAsState(
        targetValue = if (pressed && enabled) 0.97f else 1f,
        animationSpec = if (pressed) motion.tapPress else motion.tapRelease,
        label = "tapSettle",
    )
    return graphicsLayer {
        scaleX = scale
        scaleY = scale
    }
}

/**
 * tap-settle + clickable in one: press physics with the card rule applied —
 * ripple suppressed by default (kept on rows via [withRipple] = true).
 */
@Composable
fun Modifier.tapSettleClickable(
    enabled: Boolean = true,
    withRipple: Boolean = false,
    role: Role? = Role.Button,
    onClickLabel: String? = null,
    onClick: () -> Unit,
): Modifier {
    val interactionSource = remember { MutableInteractionSource() }
    return tapSettle(interactionSource, enabled)
        .clickable(
            interactionSource = interactionSource,
            indication = if (withRipple) ripple() else null,
            enabled = enabled,
            role = role,
            onClickLabel = onClickLabel,
            onClick = onClick,
        )
}

/**
 * Grain (§1.1): 2%-opacity monochrome noise, hero surfaces only — deep cards,
 * the login canvas, the Punch screen. Never on list content. Apply AFTER the
 * clip + background so the tile stays inside the surface shape.
 */
@Composable
fun Modifier.grainOverlay(alpha: Float = GRAIN_ALPHA): Modifier {
    val brush = rememberGrainBrush()
    return drawWithCache {
        onDrawWithContent {
            drawContent()
            drawRect(brush = brush, alpha = alpha)
        }
    }
}

/**
 * Collapsing-header offset (Part 6: lambda-modifier offsets — the scroll value
 * is read inside the graphicsLayer block, so scrolling never recomposes the
 * header).
 *
 * @param scrollPxProvider current collapse offset in px (0 = fully expanded).
 * @param collapseRangePx  total collapsible distance in px.
 * @param parallax         header translates at this fraction of scroll (0.5×).
 * @param fadeBy           fully faded once this fraction of the range is
 *                         scrolled (spec: fades by 60%).
 */
fun Modifier.collapsingHeaderOffset(
    scrollPxProvider: () -> Float,
    collapseRangePx: Float,
    parallax: Float = 0.5f,
    fadeBy: Float = 0.6f,
): Modifier = graphicsLayer {
    val scroll = scrollPxProvider().coerceIn(0f, collapseRangePx)
    translationY = -scroll * parallax
    val fadeEnd = (collapseRangePx * fadeBy).coerceAtLeast(1f)
    alpha = (1f - scroll / fadeEnd).coerceIn(0f, 1f)
}
