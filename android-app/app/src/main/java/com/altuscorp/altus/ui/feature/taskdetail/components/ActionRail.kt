package com.altuscorp.altus.feature.tasks.detail.components

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.altuscorp.altus.domain.model.StatusDisplay
import com.altuscorp.altus.ui.designsystem.AltusGhostButton
import com.altuscorp.altus.ui.designsystem.AltusPrimaryButton
import com.altuscorp.altus.ui.haptics.currentHaptics
import com.altuscorp.altus.ui.theme.AltusDimens
import com.altuscorp.altus.ui.theme.AltusTheme
import com.altuscorp.altus.ui.theme.AltusType
import kotlinx.collections.immutable.ImmutableList

/**
 * S7 action rail — pinned above the fold (the screen mounts it as a sticky
 * header, so it needs an OPAQUE canvas fill).
 *
 * The PRIMARY transition (`allowedTransitions[0]`, server-ranked) is a filled
 * 52dp button that commits optimistically on tap with one `EFFECT_TICK` — the
 * commit-morph pill change happens upstream the moment the cache patches.
 * Every REMAINING transition is a ghost chip that routes through the status
 * sheet (note + Save). No transitions → no rail; the server owns the matrix.
 *
 * @param pendingMutations honest outbox affordance — "Syncing n…" under the
 *   rail while rows await replay.
 */
@Composable
fun ActionRail(
    transitions: ImmutableList<String>,
    displayFor: (String) -> StatusDisplay,
    pendingMutations: Int,
    onCommitPrimary: (String) -> Unit,
    onOpenSheet: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val tokens = AltusTheme.tokens
    val haptics = currentHaptics()

    Column(
        modifier = modifier
            .fillMaxWidth()
            .background(tokens.canvas)
            .padding(horizontal = AltusDimens.screenGutter, vertical = AltusDimens.space3),
        verticalArrangement = Arrangement.spacedBy(AltusDimens.space3),
    ) {
        val primary = transitions.firstOrNull()
        if (primary != null) {
            AltusPrimaryButton(
                text = displayFor(primary).label,
                height = 52.dp,
                fillMaxWidth = true,
                onClick = {
                    haptics.commitTick()
                    onCommitPrimary(primary)
                },
            )
        }

        val remaining = if (transitions.size > 1) transitions.drop(1) else emptyList()
        if (remaining.isNotEmpty()) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(AltusDimens.space2),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                remaining.forEach { status ->
                    AltusGhostButton(
                        text = displayFor(status).label,
                        height = AltusDimens.touchMin,
                        onClick = { onOpenSheet(status) },
                    )
                }
            }
        }

        if (pendingMutations > 0) {
            Text(
                text = "SYNCING $pendingMutations…",
                style = AltusType.caption,
                color = tokens.ink400,
            )
        }
    }
}
