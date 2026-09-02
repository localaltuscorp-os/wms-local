package com.altuscorp.altus.ui.designsystem

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
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.altuscorp.altus.ui.haptics.currentHaptics
import com.altuscorp.altus.ui.theme.AltusDimens
import com.altuscorp.altus.ui.theme.AltusMotion
import com.altuscorp.altus.ui.theme.AltusTheme
import com.altuscorp.altus.ui.theme.AltusType
import com.altuscorp.altus.ui.theme.centered
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin
import kotlinx.coroutines.launch

/**
 * THE DAY RING (Part 2, Signature 1) — the app's hero object. One Canvas
 * composable rendering [DayRingState] at every size: the 96dp Today hero
 * ([AltusDimens.dayRingHero]) and the 28dp Day Strip mini
 * ([AltusDimens.dayRingStrip]) draw the SAME state object, so the ring can
 * never disagree with itself.
 *
 * Segment grammar: pending = hairline track · in-progress = primary partial
 * sweep · done = solid primary · blocked-gate = warn. At all-five-done the
 * whole ring strokes success, and — once per day, ever — the **Day Seal**
 * fires: stroke crossfades to zest (250ms), the check stamps in, ≤14 zest
 * particles burst from the ring, the flash decays over 650ms, and
 * `EFFECT_HEAVY_CLICK` lands. Reduced motion drops the particles.
 *
 * Sweeps use the `ring-sweep` token and NEVER animate backwards on refresh:
 * a lower value (optimistic revert, corrected data) snaps instead of
 * unwinding.
 *
 * @param playSeal   drive true when [DayRingState.sealPending]; the caller
 *                   persists "shown today" in [onSealFinished].
 * @param onDeepSurface true when the ring sits on the `deep` hero bed —
 *                   track/sweep/percent colors re-resolve for contrast.
 * @param showPercent centered mono % (hero size only; pass false at 28dp).
 */
@Composable
fun DayRing(
    state: DayRingState,
    modifier: Modifier = Modifier,
    diameter: Dp = AltusDimens.dayRingHero,
    strokeWidth: Dp = 8.dp,
    onDeepSurface: Boolean = false,
    showPercent: Boolean = true,
    percentStyle: TextStyle = AltusType.numeralStat,
    playSeal: Boolean = false,
    onSealFinished: () -> Unit = {},
) {
    val tokens = AltusTheme.tokens
    val motion = AltusTheme.motion
    val scheme = MaterialTheme.colorScheme
    val haptics = currentHaptics()

    // Palette — resolved once per composition, all theme-derived.
    val sweepColor = if (onDeepSurface && !tokens.isDark) scheme.inversePrimary else scheme.primary
    val trackColor = if (onDeepSurface) tokens.onDeepSecondary.copy(alpha = 0.28f) else tokens.hairline
    val warnColor = tokens.warn.color
    val successColor = tokens.success.color
    val zestColor = tokens.zest
    val percentColor = if (onDeepSurface) tokens.onDeep else scheme.onSurface

    // Per-segment sweep animation: forward = ring-sweep, backward = snap.
    val sweeps = remember { List(SEGMENT_COUNT) { Animatable(0f) } }
    LaunchedEffect(state) {
        state.segments.forEachIndexed { i, segment ->
            launch {
                val target = segment.sweepFraction
                if (target >= sweeps[i].value) {
                    sweeps[i].animateTo(target, motion.ringSweep)
                } else {
                    sweeps[i].snapTo(target)
                }
            }
        }
    }

    // Day Seal choreography.
    val sealMix = remember { Animatable(0f) }
    val particles = remember { Animatable(0f) }
    val reducedMotion = motion == AltusMotion.Reduced
    LaunchedEffect(playSeal) {
        if (playSeal) {
            haptics.daySeal()
            sealMix.animateTo(1f, motion.sealCrossfade)
            if (!reducedMotion) launch { particles.animateTo(1f, motion.sealDecay) }
            sealMix.animateTo(0f, motion.sealDecay)
            particles.snapTo(0f)
            onSealFinished()
        }
    }

    Box(
        modifier = modifier.size(diameter),
        contentAlignment = Alignment.Center,
    ) {
        Canvas(Modifier.fillMaxSize()) {
            val stroke = strokeWidth.toPx()
            val inset = stroke / 2f
            val arcSize = Size(size.width - stroke, size.height - stroke)
            val topLeft = Offset(inset, inset)
            val style = Stroke(width = stroke, cap = StrokeCap.Round)

            val complete = state.isComplete
            val fillColor =
                if (complete) lerp(successColor, zestColor, sealMix.value) else sweepColor

            state.segments.forEachIndexed { i, segment ->
                val start = START_ANGLE + i * SEGMENT_SWEEP + GAP_DEGREES / 2f
                val maxSweep = SEGMENT_SWEEP - GAP_DEGREES
                val track =
                    if (segment.state == DaySegmentState.Blocked) warnColor else trackColor
                drawArc(
                    color = track,
                    startAngle = start,
                    sweepAngle = maxSweep,
                    useCenter = false,
                    topLeft = topLeft,
                    size = arcSize,
                    style = style,
                )
                val fraction = sweeps[i].value
                if (fraction > MIN_VISIBLE_FRACTION) {
                    drawArc(
                        color = fillColor,
                        startAngle = start,
                        sweepAngle = maxSweep * fraction.coerceIn(0f, 1f),
                        useCenter = false,
                        topLeft = topLeft,
                        size = arcSize,
                        style = style,
                    )
                }
            }

            // Seal particles: ≤14, radiating from the ring, fading as they fly.
            val p = particles.value
            if (p > 0f && p < 1f) {
                val baseRadius = size.minDimension / 2f
                repeat(PARTICLE_COUNT) { i ->
                    val angleRad = (i * 360f / PARTICLE_COUNT + PARTICLE_PHASE) * (PI / 180.0)
                    val distance = baseRadius * (1f + PARTICLE_TRAVEL * p)
                    val particleCenter = center + Offset(
                        cos(angleRad).toFloat() * distance,
                        sin(angleRad).toFloat() * distance,
                    )
                    drawCircle(
                        color = zestColor,
                        radius = (1f - p) * stroke * 0.4f,
                        center = particleCenter,
                        alpha = 1f - p,
                    )
                }
            }
        }

        // Center readout: mono % until the day seals, then the check stamps in.
        if (showPercent) {
            Crossfade(
                targetState = state.isComplete,
                animationSpec = motion.tabFadeIn,
                label = "DayRingCenter",
            ) { complete ->
                if (complete) {
                    Stamp(
                        visible = true,
                        size = diameter * STAMP_FRACTION,
                        contentDescription = "Day complete",
                    )
                } else {
                    Text(
                        text = "${state.percent}%",
                        style = percentStyle.centered(),
                        color = percentColor,
                        maxLines = 1,
                    )
                }
            }
        }
    }
}

/**
 * The punch success stamp (S3): the same stamp grammar as the ring's punch
 * segment completing — the punch control `commit-morph`s into this.
 */
@Composable
fun PunchStamp(
    visible: Boolean,
    modifier: Modifier = Modifier,
    size: Dp = AltusDimens.punchControl,
) {
    Stamp(
        visible = visible,
        modifier = modifier,
        size = size,
        contentDescription = "Punched",
    )
}

private const val SEGMENT_COUNT = 5
private const val SEGMENT_SWEEP = 360f / SEGMENT_COUNT
private const val GAP_DEGREES = 8f
private const val START_ANGLE = -90f
private const val MIN_VISIBLE_FRACTION = 0.01f
private const val PARTICLE_COUNT = 14
private const val PARTICLE_PHASE = 12f
private const val PARTICLE_TRAVEL = 0.45f
private const val STAMP_FRACTION = 0.42f
