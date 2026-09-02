package com.altuscorp.altus.ui.designsystem

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import com.altuscorp.altus.ui.theme.AltusTheme

/**
 * A calm, premium backdrop: the warm paper canvas washed with three soft, slowly
 * drifting radial "aurora" blooms in the brand tints (Altus red + a goals-orange
 * + an info-blue), each fading to transparent. Draw-only (fills its parent Box,
 * sits behind the content) and cheap — a handful of radial-gradient fills per
 * frame, no layers, no bitmaps — so it stays lag-less while scrolling.
 *
 * Reusable across the app (gate, hubs, dashboards). Place as the FIRST child of a
 * Box, then lay content on top. Set [animated] = false for a static wash.
 */
@Composable
fun AuroraBackground(
    modifier: Modifier = Modifier,
    animated: Boolean = true,
) {
    val tokens = AltusTheme.tokens
    val brand = MaterialTheme.colorScheme.primary
    val warm = tokens.accents.goals
    val cool = tokens.info.color

    val t = if (animated) {
        val transition = rememberInfiniteTransition(label = "aurora")
        val drift by transition.animateFloat(
            initialValue = 0f,
            targetValue = 1f,
            animationSpec = infiniteRepeatable(
                animation = tween(durationMillis = 16000, easing = LinearEasing),
                repeatMode = RepeatMode.Reverse,
            ),
            label = "aurora-drift",
        )
        drift
    } else {
        0.5f
    }

    Box(
        modifier = modifier
            .fillMaxSize()
            .drawBehind {
                drawRect(tokens.canvas)

                // Bloom 1 — brand red, top area, drifting right.
                val c1 = Offset(size.width * (0.18f + 0.14f * t), size.height * 0.10f)
                val r1 = size.maxDimension * 0.62f
                drawCircle(
                    brush = Brush.radialGradient(
                        colors = listOf(brand.copy(alpha = 0.14f), Color.Transparent),
                        center = c1,
                        radius = r1,
                    ),
                    radius = r1,
                    center = c1,
                )

                // Bloom 2 — warm goals-orange, lower-right, drifting up.
                val c2 = Offset(size.width * (0.88f - 0.10f * t), size.height * (0.82f - 0.08f * t))
                val r2 = size.maxDimension * 0.55f
                drawCircle(
                    brush = Brush.radialGradient(
                        colors = listOf(warm.copy(alpha = 0.10f), Color.Transparent),
                        center = c2,
                        radius = r2,
                    ),
                    radius = r2,
                    center = c2,
                )

                // Bloom 3 — cool info-blue, lower-left, faint.
                val c3 = Offset(size.width * (0.10f + 0.06f * t), size.height * 0.72f)
                val r3 = size.maxDimension * 0.48f
                drawCircle(
                    brush = Brush.radialGradient(
                        colors = listOf(cool.copy(alpha = 0.07f), Color.Transparent),
                        center = c3,
                        radius = r3,
                    ),
                    radius = r3,
                    center = c3,
                )
            },
    )
}
