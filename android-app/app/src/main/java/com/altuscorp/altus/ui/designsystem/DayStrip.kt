package com.altuscorp.altus.ui.designsystem

import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import com.altuscorp.altus.ui.theme.AltusDimens
import com.altuscorp.altus.ui.theme.AltusShapeTokens
import com.altuscorp.altus.ui.theme.AltusTheme
import com.altuscorp.altus.ui.theme.AltusType
import com.altuscorp.altus.ui.theme.liftedShadow
import kotlinx.coroutines.delay

/**
 * THE DAY STRIP (Part 2 / Signature 6) — the Swiggy-cart analog. A 52dp
 * `lifted` pill docked 8dp above the tab bar while the day is open:
 *
 *  · left — the 28dp mini Day Ring (same [DayRingState] as the hero);
 *  · middle — the SINGLE next blocker in `label` type with mono counters
 *    ("Plan 2/5 · then clock in");
 *  · right — the FIX chevron deep-linking straight to that blocker.
 *
 * When the day seals, the strip flashes zest ("Day cleared") and then asks the
 * host to remove it via [onDayCleared] — its disappearance is the reward. The
 * host (AltusScaffold) owns the slide-away `AnimatedVisibility` and the
 * 8dp-above-tab-bar/nav-inset placement.
 */
@Composable
fun DayStrip(
    state: DayRingState,
    onFixClick: (route: String) -> Unit,
    onDayCleared: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val tokens = AltusTheme.tokens
    val motion = AltusTheme.motion
    val scheme = MaterialTheme.colorScheme

    val cleared = state.isComplete

    // Zest flash on completion, then hand the dismissal to the host.
    val container by animateColorAsState(
        targetValue = if (cleared) tokens.zest else tokens.raised,
        animationSpec = flashSpec(cleared, motion.sealCrossfade, motion.sealDecay),
        label = "DayStripFlash",
    )
    LaunchedEffect(cleared) {
        if (cleared) {
            delay(
                motion.sealCrossfade.durationMillis.toLong() +
                    motion.sealDecay.durationMillis.toLong() +
                    CLEARED_HOLD_MS,
            )
            onDayCleared()
        }
    }

    val route = state.fixRoute
    val clickable = if (!cleared && route != null) {
        Modifier.tapSettleClickable(
            withRipple = false,
            onClickLabel = "Fix next step",
            onClick = { onFixClick(route) },
        )
    } else {
        Modifier
    }

    Row(
        modifier = modifier
            .fillMaxWidth()
            .height(AltusDimens.dayStripHeight)
            .liftedShadow(AltusShapeTokens.pill)
            .clip(AltusShapeTokens.pill)
            .background(container)
            .then(clickable)
            .padding(start = AltusDimens.space3, end = AltusDimens.space2),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(AltusDimens.space3),
    ) {
        if (cleared) {
            Stamp(
                visible = true,
                size = AltusDimens.dayRingStrip,
                contentDescription = null,
            )
            Text(
                text = "Day cleared",
                style = AltusType.bodyStrong,
                color = tokens.deep,
                maxLines = 1,
                modifier = Modifier.weight(1f),
            )
        } else {
            DayRing(
                state = state,
                diameter = AltusDimens.dayRingStrip,
                strokeWidth = 3.dp,
                showPercent = false,
            )
            Text(
                text = monoStyledCopy(state.nextStepCopy),
                style = AltusType.label,
                color = scheme.onSurface,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = "FIX",
                    style = AltusType.caption,
                    color = scheme.primary,
                )
                Icon(
                    imageVector = Icons.AutoMirrored.Filled.KeyboardArrowRight,
                    contentDescription = "Fix next step",
                    tint = scheme.primary,
                    modifier = Modifier.size(20.dp),
                )
            }
        }
    }
}

/**
 * Applies the mono face to every hard number in the blocker copy
 * ("Plan **2/5** · then clock in") — §1.2: mono is the fingerprint.
 */
@Composable
private fun monoStyledCopy(copy: String): AnnotatedString {
    val monoSpan: SpanStyle = AltusType.monoData.toSpanStyle()
    return remember(copy, monoSpan) {
        buildAnnotatedString {
            var consumed = 0
            for (match in NUMBER_RUN.findAll(copy)) {
                append(copy.substring(consumed, match.range.first))
                withStyle(monoSpan) { append(match.value) }
                consumed = match.range.last + 1
            }
            append(copy.substring(consumed))
        }
    }
}

private val NUMBER_RUN = Regex("""\d+(?:[:/.]\d+)*%?""")

private const val CLEARED_HOLD_MS = 450L

/**
 * Flash fast on completion (crossfade token), relax slowly if state reverts
 * (decay token). Color specs retype the Float tweens — duration/easing only.
 */
private fun flashSpec(
    cleared: Boolean,
    crossfade: androidx.compose.animation.core.TweenSpec<Float>,
    decay: androidx.compose.animation.core.TweenSpec<Float>,
): androidx.compose.animation.core.AnimationSpec<androidx.compose.ui.graphics.Color> {
    val chosen = if (cleared) crossfade else decay
    return androidx.compose.animation.core.tween(
        durationMillis = chosen.durationMillis,
        easing = chosen.easing,
    )
}
