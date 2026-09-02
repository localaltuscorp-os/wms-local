package com.altuscorp.altus.feature.dcc

import androidx.compose.animation.Crossfade
import androidx.compose.animation.core.Animatable
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.altuscorp.altus.ui.designsystem.Stamp
import com.altuscorp.altus.ui.theme.AltusTheme
import com.altuscorp.altus.ui.theme.AltusType
import com.altuscorp.altus.ui.theme.centered

/**
 * THE RING THAT HEARS EVERYTHING (Signature 3) — the DCC board's own pinned
 * compliance ring. A single-arc progress gauge (distinct from the five-segment
 * Day Ring it feeds) that sweeps forward on every commit anywhere below with the
 * `ring-sweep` token and NEVER animates backwards on a revert (a lower value
 * snaps). At 100% the stroke crossfades to `success` and the check stamps in —
 * the DCC 100% moment (the caller lands the `EFFECT_HEAVY_CLICK`; the full zest
 * Day Seal is reserved for the Day Ring when all five gates close).
 *
 * All colors resolve through the theme — no hex here.
 *
 * @param fraction 0..1 filled/due.
 * @param complete all due slots filled — strokes success + shows the stamp.
 */
@Composable
fun DccComplianceRing(
    fraction: Float,
    complete: Boolean,
    modifier: Modifier = Modifier,
    diameter: Dp = AltusTheme.dimens.dccRingPinned,
    strokeWidth: Dp = 6.dp,
    showPercent: Boolean = true,
    percentStyle: TextStyle = AltusType.monoData,
) {
    val tokens = AltusTheme.tokens
    val motion = AltusTheme.motion
    val scheme = MaterialTheme.colorScheme

    val trackColor = tokens.hairline
    val sweepColor = scheme.primary
    val successColor = tokens.success.color

    // Forward = ring-sweep; backward (revert / corrected data) = snap.
    val sweep = remember { Animatable(0f) }
    LaunchedEffect(fraction) {
        val target = fraction.coerceIn(0f, 1f)
        if (target >= sweep.value) sweep.animateTo(target, motion.ringSweep) else sweep.snapTo(target)
    }

    Box(modifier = modifier.size(diameter), contentAlignment = Alignment.Center) {
        Canvas(Modifier.fillMaxSize()) {
            val stroke = strokeWidth.toPx()
            val inset = stroke / 2f
            val arcSize = Size(size.width - stroke, size.height - stroke)
            val topLeft = Offset(inset, inset)
            val style = Stroke(width = stroke, cap = StrokeCap.Round)
            val fill = if (complete) successColor else sweepColor

            drawArc(
                color = trackColor,
                startAngle = START_ANGLE,
                sweepAngle = 360f,
                useCenter = false,
                topLeft = topLeft,
                size = arcSize,
                style = style,
            )
            val frac = sweep.value
            if (frac > MIN_VISIBLE) {
                drawArc(
                    color = fill,
                    startAngle = START_ANGLE,
                    sweepAngle = 360f * frac,
                    useCenter = false,
                    topLeft = topLeft,
                    size = arcSize,
                    style = style,
                )
            }
        }

        if (showPercent) {
            Crossfade(targetState = complete, animationSpec = motion.tabFadeIn, label = "DccRingCenter") { done ->
                if (done) {
                    Stamp(visible = true, size = diameter * STAMP_FRACTION, contentDescription = "Day complete")
                } else {
                    Text(
                        text = "${(fraction * 100).toInt().coerceIn(0, 100)}%",
                        style = percentStyle.centered(),
                        color = scheme.onSurface,
                        maxLines = 1,
                    )
                }
            }
        }
    }
}

private const val START_ANGLE = -90f
private const val MIN_VISIBLE = 0.001f
private const val STAMP_FRACTION = 0.5f
