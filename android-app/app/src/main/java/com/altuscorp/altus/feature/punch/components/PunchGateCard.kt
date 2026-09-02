package com.altuscorp.altus.feature.punch.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import com.altuscorp.altus.navigation.DeepLinks
import com.altuscorp.altus.ui.designsystem.GateCard
import com.altuscorp.altus.ui.designsystem.GateCardData
import com.altuscorp.altus.ui.theme.AltusTheme
import com.altuscorp.altus.ui.theme.EmphasizedAccelerate
import com.altuscorp.altus.ui.theme.EmphasizedDecelerate

/**
 * GATE CARDS, NOT ERRORS (Signature 5) — the punch-flow presentation of a 409.
 *
 * When the server rejects a punch with a gate, [gate] goes non-null: the warn
 * card **slides + expands in** over the control (which the screen simultaneously
 * slides down 12dp), fires one "uh-uh", and shows exactly one route button. The
 * button dispatches on the gate's `altus://` route to the correct in-app
 * destination; clearing the gate there pops back, [gate] returns to null, and
 * the card **slides out** — re-arming the punch control. The system points,
 * never scolds.
 *
 * The last non-null card content is held through the exit animation so the copy
 * never blanks mid-collapse.
 */
@Composable
fun PunchGateCard(
    gate: GateCardData?,
    onRoutePlan: () -> Unit,
    onRouteDcc: () -> Unit,
    onRouteGoals: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val motion = AltusTheme.motion

    // Retain the last shown card so its text/counter survive the shrink-out.
    var lastShown by remember { androidx.compose.runtime.mutableStateOf(gate) }
    if (gate != null && gate != lastShown) lastShown = gate
    val display = gate ?: lastShown

    AnimatedVisibility(
        visible = gate != null,
        modifier = modifier.fillMaxWidth(),
        enter = (
            slideInVertically(
                animationSpec = tween(SLIDE_IN_MS, easing = EmphasizedDecelerate),
                initialOffsetY = { it / 3 },
            ) + expandVertically(
                animationSpec = tween(SLIDE_IN_MS, easing = EmphasizedDecelerate),
                expandFrom = Alignment.Bottom,
            ) + fadeIn(motion.tabFadeIn)
        ),
        exit = (
            slideOutVertically(
                animationSpec = tween(SLIDE_OUT_MS, easing = EmphasizedAccelerate),
                targetOffsetY = { it / 3 },
            ) + shrinkVertically(
                animationSpec = tween(SLIDE_OUT_MS, easing = EmphasizedAccelerate),
                shrinkTowards = Alignment.Bottom,
            ) + fadeOut(motion.tabFadeOut)
        ),
    ) {
        if (display != null) {
            GateCard(
                data = display,
                onAction = { dispatch(display, onRoutePlan, onRouteDcc, onRouteGoals) },
                // The arrival "uh-uh" fires once per distinct gate (S3).
                hapticOnAppear = true,
            )
        }
    }
}

/** Route the single gate button to the matching stack, off the `altus://` route. */
private fun dispatch(
    data: GateCardData,
    onRoutePlan: () -> Unit,
    onRouteDcc: () -> Unit,
    onRouteGoals: () -> Unit,
) {
    when {
        data.route.startsWith(DeepLinks.DCC_BASE) -> onRouteDcc()
        data.route.startsWith(DeepLinks.GOALS_FILL) -> onRouteGoals()
        // NeedsPlan → altus://plan (and any unrecognised gate falls to the plan
        // surface, the first blocker in the clock-in chain).
        else -> onRoutePlan()
    }
}

private const val SLIDE_IN_MS = 260
private const val SLIDE_OUT_MS = 200
