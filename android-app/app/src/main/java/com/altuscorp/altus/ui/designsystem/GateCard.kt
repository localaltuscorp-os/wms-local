package com.altuscorp.altus.ui.designsystem

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.altuscorp.altus.core.network.GateError
import com.altuscorp.altus.core.network.GateKind
import com.altuscorp.altus.ui.haptics.currentHaptics
import com.altuscorp.altus.ui.theme.AltusDimens
import com.altuscorp.altus.ui.theme.AltusTheme
import com.altuscorp.altus.ui.theme.AltusType

/**
 * GATE CARDS, NOT ERRORS (Signature 5): every 409 arrives as a card with the
 * server's copy, a live mono counter when the body carries one, and EXACTLY
 * one filled route button. The system points, never scolds.
 *
 * Used by the Punch screen (slides in below the punch control, re-arms it on
 * clear) and by Today's ranked gate banners. Warn keyline + warn glyph on a
 * plain surface card — warn is a tone here, not a fill.
 *
 * @param hapticOnAppear one "uh-uh" double-tick when the gate ARRIVES (punch
 *   flow); leave false for persistent banners so Today never buzzes on entry.
 */
@Immutable
data class GateCardData(
    /** Server copy, e.g. "Fill today's DCC before you clock out." */
    val message: String,
    /** Live mono counter ("2 of 5"), null when the body has none. */
    val counter: String?,
    /** The single route button's label. */
    val actionLabel: String,
    /** `altus://` destination the button opens. */
    val route: String,
)

/** Map a parsed 409 into card content; labels are the three gates' verbs. */
fun GateError.toGateCardData(): GateCardData = GateCardData(
    message = message.ifBlank {
        when (kind) {
            GateKind.NeedsPlan -> "Plan your day before you clock in."
            GateKind.NeedsDcc -> "Finish today's compliance before you clock out."
            GateKind.NeedsGoals -> "Set this week's goals to continue."
        }
    },
    counter = if (filled != null && required != null) "$filled of $required" else null,
    actionLabel = when (kind) {
        GateKind.NeedsPlan -> "Plan your day"
        GateKind.NeedsDcc -> "Finish daily compliance"
        GateKind.NeedsGoals -> "Fill weekly goals"
    },
    route = route,
)

@Composable
fun GateCard(
    data: GateCardData,
    onAction: () -> Unit,
    modifier: Modifier = Modifier,
    hapticOnAppear: Boolean = false,
) {
    val tokens = AltusTheme.tokens
    val haptics = currentHaptics()

    if (hapticOnAppear) {
        // One "uh-uh" per distinct gate arrival, never repeated on recompose.
        LaunchedEffect(data) { haptics.gateUhUh() }
    }

    AltusCard(
        modifier = modifier.fillMaxWidth(),
        accentKeyline = tokens.warn.color,
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(AltusDimens.space3)) {
            Row(
                verticalAlignment = Alignment.Top,
                horizontalArrangement = Arrangement.spacedBy(AltusDimens.space3),
            ) {
                Icon(
                    imageVector = Icons.Filled.Warning,
                    contentDescription = null,
                    tint = tokens.warn.color,
                    modifier = Modifier.size(20.dp),
                )
                Column(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(AltusDimens.space1),
                ) {
                    Text(
                        text = data.message,
                        style = AltusType.bodyStrong,
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                    if (data.counter != null) {
                        Text(
                            text = data.counter,
                            style = AltusType.monoData,
                            color = tokens.warn.color,
                        )
                    }
                }
            }
            AltusPrimaryButton(
                text = data.actionLabel,
                onClick = onAction,
                height = 52.dp,
                modifier = Modifier.padding(start = 20.dp + AltusDimens.space3),
            )
        }
    }
}
