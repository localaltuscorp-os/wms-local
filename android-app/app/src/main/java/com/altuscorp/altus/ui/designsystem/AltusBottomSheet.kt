@file:OptIn(ExperimentalFoundationApi::class)

package com.altuscorp.altus.ui.designsystem

import androidx.compose.animation.core.AnimationSpec
import androidx.compose.animation.core.exponentialDecay
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.AnchoredDraggableState
import androidx.compose.foundation.gestures.DraggableAnchors
import androidx.compose.foundation.gestures.Orientation
import androidx.compose.foundation.gestures.anchoredDraggable
import androidx.compose.foundation.gestures.animateTo
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import com.altuscorp.altus.ui.haptics.currentHaptics
import com.altuscorp.altus.ui.theme.AltusDimens
import com.altuscorp.altus.ui.theme.AltusShapeTokens
import com.altuscorp.altus.ui.theme.AltusTheme
import com.altuscorp.altus.ui.theme.liftedShadow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.launch
import kotlin.math.roundToInt

/**
 * Decision surface (Part 3, rule 3): anything mutating with ≤1 decision is a
 * bottom sheet, never a screen. AnchoredDraggable with Peek / Half / Full
 * anchors, velocity-snapped, `sheet-rise` spring, scrim alpha tracking the
 * offset 1:1, `CLOCK_TICK` on every snap.
 *
 * Presence is caller-controlled (compose it inside an `if`); the sheet rises
 * from Hidden to [AltusSheetState.initialTarget] on first layout and calls
 * [onDismissRequest] once it settles back on Hidden (drag-down or scrim tap).
 */
enum class AltusSheetValue { Hidden, Peek, Half, Full }

class AltusSheetState internal constructor(
    val initialTarget: AltusSheetValue,
    density: Density,
    snapSpec: AnimationSpec<Float>,
    confirmValueChange: (AltusSheetValue) -> Boolean,
) {
    internal val draggable = AnchoredDraggableState(
        initialValue = AltusSheetValue.Hidden,
        positionalThreshold = { totalDistance -> totalDistance * 0.4f },
        velocityThreshold = { with(density) { 125.dp.toPx() } },
        snapAnimationSpec = snapSpec,
        decayAnimationSpec = exponentialDecay(),
        confirmValueChange = confirmValueChange,
    )

    val currentValue: AltusSheetValue get() = draggable.currentValue
    val targetValue: AltusSheetValue get() = draggable.targetValue

    suspend fun peek() = draggable.animateTo(AltusSheetValue.Peek)
    suspend fun half() = draggable.animateTo(AltusSheetValue.Half)
    suspend fun expand() = draggable.animateTo(AltusSheetValue.Full)
    suspend fun hide() = draggable.animateTo(AltusSheetValue.Hidden)
}

@Composable
fun rememberAltusSheetState(
    initialTarget: AltusSheetValue = AltusSheetValue.Peek,
    confirmValueChange: (AltusSheetValue) -> Boolean = { true },
): AltusSheetState {
    val density = LocalDensity.current
    val snapSpec = AltusTheme.motion.sheetRiseFloat
    return remember(density) {
        AltusSheetState(initialTarget, density, snapSpec, confirmValueChange)
    }
}

/**
 * @param peekHeight the Peek anchor height (e.g. 320dp for the numeric KPI sheet).
 * @param halfFraction Half anchor as a fraction of the container height.
 */
@Composable
fun AltusBottomSheet(
    state: AltusSheetState,
    onDismissRequest: () -> Unit,
    modifier: Modifier = Modifier,
    peekHeight: Dp = 320.dp,
    halfFraction: Float = 0.55f,
    showHandle: Boolean = true,
    content: @Composable ColumnScope.() -> Unit,
) {
    val tokens = AltusTheme.tokens
    val scrimColor = MaterialTheme.colorScheme.scrim
    val haptics = currentHaptics()
    val scope = rememberCoroutineScope()

    BoxWithConstraints(modifier = modifier.fillMaxSize()) {
        val fullHeightPx = constraints.maxHeight.toFloat()
        val peekPx = with(LocalDensity.current) { peekHeight.toPx() }
        val topClearancePx = with(LocalDensity.current) { AltusDimens.space12.toPx() }
        var sheetHeightPx by remember { mutableIntStateOf(0) }
        var opened by remember { mutableStateOf(false) }

        // Anchor geometry follows measured sizes.
        remember(fullHeightPx, peekPx, sheetHeightPx, halfFraction) {
            state.draggable.updateAnchors(
                DraggableAnchors {
                    AltusSheetValue.Hidden at fullHeightPx
                    AltusSheetValue.Peek at (fullHeightPx - peekPx).coerceAtLeast(topClearancePx)
                    AltusSheetValue.Half at (fullHeightPx * (1f - halfFraction)).coerceAtLeast(topClearancePx)
                    AltusSheetValue.Full at (fullHeightPx - sheetHeightPx).coerceAtLeast(topClearancePx)
                },
            )
        }

        // Rise once the sheet has been measured.
        LaunchedEffect(sheetHeightPx) {
            if (!opened && sheetHeightPx > 0) {
                opened = true
                state.draggable.animateTo(state.initialTarget)
            }
        }

        // CLOCK_TICK on every snap; dismiss when settled back on Hidden.
        LaunchedEffect(state) {
            snapshotFlow { state.currentValue }
                .distinctUntilChanged()
                .drop(1)
                .collect { value ->
                    haptics.clockTick()
                    if (value == AltusSheetValue.Hidden && opened) onDismissRequest()
                }
        }

        // Scrim — alpha tracks the sheet offset 1:1; tap to dismiss.
        val scrimInteraction = remember { MutableInteractionSource() }
        Box(
            Modifier
                .fillMaxSize()
                .drawBehind {
                    val offset = state.draggable.offset
                    if (offset.isNaN()) return@drawBehind
                    val range = (fullHeightPx - (fullHeightPx - peekPx)).coerceAtLeast(1f)
                    val fraction = ((fullHeightPx - offset) / range).coerceIn(0f, 1f)
                    drawRect(color = scrimColor, alpha = 0.40f * fraction)
                }
                .clickable(
                    interactionSource = scrimInteraction,
                    indication = null,
                    onClickLabel = "Dismiss",
                ) {
                    scope.launch { state.hide() }
                },
        )

        // The sheet itself.
        Column(
            modifier = Modifier
                .align(Alignment.TopStart)
                .fillMaxWidth()
                .heightIn(max = maxHeight - AltusDimens.space12)
                .offset {
                    val y = state.draggable.offset
                    IntOffset(0, if (y.isNaN()) fullHeightPx.roundToInt() else y.roundToInt())
                }
                .anchoredDraggable(state.draggable, Orientation.Vertical)
                .liftedShadow(AltusShapeTokens.sheet)
                .clip(AltusShapeTokens.sheet)
                .background(tokens.raised)
                .onSizeChanged { sheetHeightPx = it.height }
                .navigationBarsPadding(),
        ) {
            if (showHandle) {
                Box(
                    Modifier
                        .align(Alignment.CenterHorizontally)
                        .padding(top = AltusDimens.space3, bottom = AltusDimens.space1)
                        .size(width = 36.dp, height = 4.dp)
                        .clip(RoundedCornerShape(percent = 50))
                        .background(tokens.ink300),
                )
            }
            content()
        }
    }
}
