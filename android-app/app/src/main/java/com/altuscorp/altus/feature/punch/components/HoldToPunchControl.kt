package com.altuscorp.altus.feature.punch.components

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.RoundRect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathMeasure
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.addPathNodes
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.altuscorp.altus.feature.punch.PunchPhase
import com.altuscorp.altus.ui.designsystem.Stamp
import com.altuscorp.altus.ui.haptics.currentHaptics
import com.altuscorp.altus.ui.theme.AltusDimens
import com.altuscorp.altus.ui.theme.AltusShapeTokens
import com.altuscorp.altus.ui.theme.AltusTheme
import com.altuscorp.altus.ui.theme.AltusType
import com.altuscorp.altus.ui.theme.asSpecFor
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * HOLD-TO-PUNCH (Signature 4): the 72dp full-width evergreen pill. The most
 * consequential action in the app is the only one you cannot fat-finger —
 * a 600ms hold traces a progress ring around the pill's border with an
 * escalating `CLOCK_TICK` at each third; releasing early springs back with no
 * penalty. Completion hands off to BiometricPrompt via [onHoldComplete].
 *
 * On [PunchPhase.Success] the pill `commit-morph`s in place into the circular
 * success stamp (the punch control IS the ring's punch segment completing).
 *
 * The hold progress lives in one [Animatable]; a re-press mid-spring-back
 * retargets it — never queues (§1.5).
 */
@Composable
fun HoldToPunchControl(
    kind: String?,
    enabled: Boolean,
    phase: PunchPhase,
    onHoldComplete: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val tokens = AltusTheme.tokens
    val motion = AltusTheme.motion
    val scheme = MaterialTheme.colorScheme
    val haptics = currentHaptics()
    val scope = rememberCoroutineScope()
    val density = LocalDensity.current

    val progress = remember { Animatable(0f) }
    val holdActive = enabled && phase == PunchPhase.Idle

    // Any phase change retires the trace (the prompt/POST owns the moment now;
    // a return to Idle re-arms from zero). Never fires mid-hold — a hold can't
    // change the phase until it completes.
    LaunchedEffect(phase) { progress.snapTo(0f) }

    val morphed = phase == PunchPhase.Success

    // Width preservation for the commit-morph: pill width → 72dp circle.
    var fullWidthPx by remember { mutableIntStateOf(0) }
    val fullWidthDp = with(density) { fullWidthPx.toDp() }
    val widthTarget = if (morphed) AltusDimens.punchControl else fullWidthDp
    val animatedWidth by androidx.compose.animation.core.animateDpAsState(
        targetValue = widthTarget,
        animationSpec = motion.commitMorphFloat.asSpecFor(),
        label = "PunchMorphWidth",
    )

    val container by animateColorAsState(
        targetValue = when {
            morphed -> tokens.success.color
            !holdActive && phase == PunchPhase.Idle -> tokens.ink300
            else -> scheme.primary
        },
        animationSpec = motion.commitMorphFloat.asSpecFor(),
        label = "PunchMorphColor",
    )
    val onContainer = scheme.onPrimary

    val holdLabel = when (kind) {
        "in" -> "Hold to clock in"
        "out" -> "Hold to clock out"
        else -> "Day complete"
    }

    val widthModifier =
        if (!morphed || fullWidthPx == 0) Modifier.fillMaxWidth() else Modifier.width(animatedWidth)

    Box(
        modifier = modifier
            .then(widthModifier)
            .height(AltusDimens.punchControl)
            .onSizeChanged { if (!morphed) fullWidthPx = it.width }
            .clip(AltusShapeTokens.pill)
            .background(container)
            .borderTrace(progressProvider = { progress.value }, color = onContainer)
            .semantics {
                role = Role.Button
                contentDescription = holdLabel
            }
            .pointerInput(holdActive) {
                if (!holdActive) return@pointerInput
                detectTapGestures(
                    onPress = {
                        var holdJob: Job? = null
                        val tickJob = scope.launch {
                            // Escalating thirds of the 600ms hold (§1.6).
                            delay(HOLD_DURATION_MS / 3)
                            haptics.holdTick()
                            delay(HOLD_DURATION_MS / 3)
                            haptics.holdTick()
                        }
                        holdJob = scope.launch {
                            try {
                                val remaining =
                                    (HOLD_DURATION_MS * (1f - progress.value)).toInt().coerceAtLeast(1)
                                progress.animateTo(1f, tween(remaining, easing = LinearEasing))
                                onHoldComplete()
                            } catch (e: CancellationException) {
                                throw e
                            }
                        }
                        tryAwaitRelease()
                        tickJob.cancel()
                        if (progress.value < 1f) {
                            // Released early: spring back, no penalty.
                            holdJob.cancel()
                            scope.launch { progress.animateTo(0f, motion.tapRelease) }
                        }
                    },
                )
            },
        contentAlignment = Alignment.Center,
    ) {
        AnimatedContent(
            targetState = ControlFace.from(phase, morphed),
            transitionSpec = { fadeIn(motion.tabFadeIn) togetherWith fadeOut(motion.tabFadeOut) },
            label = "PunchControlFace",
        ) { face ->
            when (face) {
                ControlFace.Hold -> Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(AltusDimens.space3),
                ) {
                    Icon(
                        imageVector = FingerprintGlyph,
                        contentDescription = null,
                        tint = onContainer,
                        modifier = Modifier.size(24.dp),
                    )
                    Text(
                        text = holdLabel,
                        style = AltusType.bodyStrong.copy(fontSize = 17.sp),
                        color = onContainer,
                    )
                }

                ControlFace.Verifying -> Text(
                    text = "Verify it's you…",
                    style = AltusType.bodyStrong,
                    color = onContainer,
                )

                ControlFace.Recording -> Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(AltusDimens.space3),
                ) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(22.dp),
                        color = onContainer,
                        strokeWidth = 2.dp,
                    )
                    Text(text = "Recording…", style = AltusType.bodyStrong, color = onContainer)
                }

                // The stamp grammar: scale 0.6→1 spring + fade, blended into
                // the success-filled circle the pill just morphed into.
                ControlFace.Stamped -> Stamp(
                    visible = true,
                    size = 56.dp,
                    contentDescription = "Punched",
                )
            }
        }
    }
}

/** What the control shows at each phase. */
private enum class ControlFace {
    Hold, Verifying, Recording, Stamped;

    companion object {
        fun from(phase: PunchPhase, morphed: Boolean): ControlFace = when {
            morphed -> Stamped
            phase == PunchPhase.Authenticating -> Verifying
            phase == PunchPhase.Submitting -> Recording
            else -> Hold
        }
    }
}

/**
 * The 600ms border-trace: a stroke that travels the pill's rounded-rect
 * outline as the hold progresses. Progress is read inside the draw phase via
 * [progressProvider] — the per-frame value never recomposes the control.
 */
private fun Modifier.borderTrace(
    progressProvider: () -> Float,
    color: Color,
): Modifier = drawWithCache {
    val stroke = TRACE_STROKE_DP.dp.toPx()
    val inset = stroke / 2f
    val outline = Path().apply {
        addRoundRect(
            RoundRect(
                rect = Rect(inset, inset, size.width - inset, size.height - inset),
                cornerRadius = CornerRadius((size.height - stroke) / 2f),
            ),
        )
    }
    val measure = PathMeasure().apply { setPath(outline, forceClosed = false) }
    val outlineLength = measure.length
    val segment = Path()
    onDrawWithContent {
        drawContent()
        val progress = progressProvider().coerceIn(0f, 1f)
        if (progress > 0f) {
            segment.reset()
            measure.getSegment(0f, outlineLength * progress, segment, startWithMoveTo = true)
            drawPath(
                path = segment,
                color = color,
                style = Stroke(width = stroke, cap = StrokeCap.Round),
            )
        }
    }
}

/** Lucide `fingerprint` (24 grid, 2dp stroke, round caps — §1.7), built in
 *  code like the tab glyphs so no icon library ships. Tint replaces the
 *  placeholder stroke at every render. */
private val FingerprintGlyph: ImageVector by lazy {
    val builder = ImageVector.Builder(
        name = "Punch.Fingerprint",
        defaultWidth = 24.dp,
        defaultHeight = 24.dp,
        viewportWidth = 24f,
        viewportHeight = 24f,
    )
    listOf(
        "M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4",
        "M14 13.12c0 2.38 0 6.38-1 8.88",
        "M17.29 21.02c.12-.6.43-2.3.5-3.02",
        "M2 12a10 10 0 0 1 18-6",
        "M2 16h.01",
        "M21.8 16c.2-2 .131-5.354 0-6",
        "M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2",
        "M8.65 22c.21-.66.45-1.32.57-2",
        "M9 6.8a6 6 0 0 1 9 5.2v2",
    ).forEach { d ->
        builder.addPath(
            pathData = addPathNodes(d),
            fill = null,
            stroke = SolidColor(Color.Black), // always overridden by Icon tint
            strokeLineWidth = 2f,
            strokeLineCap = StrokeCap.Round,
            strokeLineJoin = StrokeJoin.Round,
        )
    }
    builder.build()
}

/** The hold budget (S3): 600ms, ticks at each third. */
private const val HOLD_DURATION_MS = 600L
private const val TRACE_STROKE_DP = 3
