@file:OptIn(ExperimentalFoundationApi::class)

package com.altuscorp.altus.feature.tasks.list

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.exponentialDecay
import androidx.compose.animation.core.tween
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.AnchoredDraggableState
import androidx.compose.foundation.gestures.DraggableAnchors
import androidx.compose.foundation.gestures.Orientation
import androidx.compose.foundation.gestures.anchoredDraggable
import androidx.compose.foundation.gestures.snapTo
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import com.altuscorp.altus.core.util.EffectiveDue
import com.altuscorp.altus.ui.designsystem.AltusCard
import com.altuscorp.altus.ui.designsystem.StatusPill
import com.altuscorp.altus.ui.haptics.currentHaptics
import com.altuscorp.altus.ui.theme.AltusDimens
import com.altuscorp.altus.ui.theme.AltusShapeTokens
import com.altuscorp.altus.ui.theme.AltusTheme
import com.altuscorp.altus.ui.theme.AltusType
import kotlinx.coroutines.flow.drop
import kotlin.math.roundToInt

/** Swipe anchors: the card rests, or arms one 96dp reveal to advance a step. */
private enum class SwipeAnchor { Resting, Armed }

/** The horizontal distance the card travels to arm the advance. */
private val SWIPE_ANCHOR = 96.dp

/**
 * The 96dp task card (S6). Row 1: mono `#no` + server status pill. Row 2:
 * `heading` title, one line. Row 3: 6dp priority dot + `client · subject` +
 * the phase-coloured due phrase. Overdue earns a danger keyline that fades in
 * over 300ms (Signature 9).
 *
 * **Swipe-to-advance** ([AnchoredDraggableState]): a right-swipe past the
 * anchor reveals an evergreen under-layer labelled with `allowedTransitions[0]`
 * (the server's own next-status label); crossing it fires `CLOCK_TICK` and
 * calls [onAdvance] — the VM commits optimistically with `expectedUpdatedAt`
 * and the pill morphs in place. A tap opens the detail.
 */
@Composable
fun TaskCard(
    row: TaskRow,
    onOpen: () -> Unit,
    onAdvance: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val tokens = AltusTheme.tokens
    val motion = AltusTheme.motion
    val haptics = currentHaptics()
    val density = LocalDensity.current
    val anchorPx = with(density) { SWIPE_ANCHOR.toPx() }

    val swipeState = remember(row.id) {
        AnchoredDraggableState(
            initialValue = SwipeAnchor.Resting,
            positionalThreshold = { distance -> distance * 0.5f },
            velocityThreshold = { anchorPx * 1.4f },
            snapAnimationSpec = motion.commitMorphFloat,
            decayAnimationSpec = exponentialDecay(),
        )
    }

    // Anchors follow whether this row can advance at all (no target → no swipe).
    remember(anchorPx, row.canAdvance) {
        swipeState.updateAnchors(
            DraggableAnchors {
                SwipeAnchor.Resting at 0f
                if (row.canAdvance) SwipeAnchor.Armed at anchorPx
            },
        )
    }

    // Arming the anchor is the commit: tick, advance, then settle back so the
    // optimistic pill-morph reads as the card relaxing into its new state.
    LaunchedEffect(swipeState, row.id) {
        snapshotFlow { swipeState.currentValue }
            .drop(1)
            .collect { value ->
                if (value == SwipeAnchor.Armed) {
                    haptics.clockTick()
                    onAdvance()
                    swipeState.snapTo(SwipeAnchor.Resting)
                }
            }
    }

    // Overdue keyline: transparent → danger over 300ms as a task crosses over.
    val keylineTarget = if (row.isOverdue) tokens.danger.color else Color.Transparent
    val keyline by animateColorAsState(
        targetValue = keylineTarget,
        animationSpec = tween(durationMillis = 300),
        label = "overdueKeyline",
    )

    Box(modifier = modifier.fillMaxWidth()) {
        if (row.canAdvance) {
            SwipeUnderlayer(
                label = row.advanceLabel.orEmpty(),
                modifier = Modifier.matchParentSize(),
            )
        }

        AltusCard(
            onClick = onOpen,
            accentKeyline = keyline.takeIf { it.alpha > 0.02f },
            modifier = Modifier
                .fillMaxWidth()
                .defaultMinSize(minHeight = 96.dp)
                .offset { IntOffset(x = swipeState.offsetOrZero(), y = 0) }
                .anchoredDraggable(
                    state = swipeState,
                    orientation = Orientation.Horizontal,
                    enabled = row.canAdvance,
                ),
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(AltusDimens.space2)) {
                // Row 1 — mono number + server status pill.
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = row.task.taskNo?.let { "#$it" } ?: "—",
                        style = AltusType.monoData,
                        color = tokens.ink400,
                    )
                    Spacer(Modifier.weight(1f))
                    StatusPill(display = row.display)
                }

                // Row 2 — the task title.
                Text(
                    text = row.task.title,
                    style = AltusType.heading,
                    color = MaterialTheme.colorScheme.onSurface,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )

                // Row 3 — priority dot + client · subject + due phrase.
                MetaLine(row = row)
            }
        }
    }
}

@Composable
private fun MetaLine(row: TaskRow, modifier: Modifier = Modifier) {
    val tokens = AltusTheme.tokens
    val meta = listOfNotNull(row.task.client, row.task.subject).joinToString("  ·  ")

    Row(
        modifier = modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(AltusDimens.space2),
    ) {
        Box(
            modifier = Modifier
                .size(6.dp)
                .clip(CircleShape)
                .background(priorityDotColor(row.task.priority)),
        )
        if (meta.isNotEmpty()) {
            Text(
                text = meta,
                style = AltusType.label,
                color = tokens.ink400,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f, fill = false),
            )
        } else {
            Spacer(Modifier.weight(1f))
        }
        if (row.duePhrase.isNotEmpty()) {
            Text(
                text = row.duePhrase,
                style = AltusType.label,
                color = duePhraseColor(row.duePhase),
                maxLines = 1,
            )
        }
    }
}

@Composable
private fun SwipeUnderlayer(label: String, modifier: Modifier = Modifier) {
    val scheme = MaterialTheme.colorScheme
    Row(
        modifier = modifier
            .clip(AltusShapeTokens.card)
            .background(scheme.primary)
            .padding(horizontal = AltusDimens.space5),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(AltusDimens.space2),
    ) {
        Icon(
            imageVector = TaskListIcons.ArrowRight,
            contentDescription = null,
            tint = scheme.onPrimary,
            modifier = Modifier.size(20.dp),
        )
        Text(
            text = label,
            style = AltusType.bodyStrong,
            color = scheme.onPrimary,
            maxLines = 1,
        )
    }
}

/** A shimmering placeholder in the exact 96dp card geometry (Signature 8). */
@Composable
fun TaskCardSkeleton(modifier: Modifier = Modifier) {
    AltusCard(modifier = modifier.fillMaxWidth().defaultMinSize(minHeight = 96.dp)) {
        Column(verticalArrangement = Arrangement.spacedBy(AltusDimens.space2)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                com.altuscorp.altus.ui.designsystem.SkeletonLine(width = 48.dp, height = 14.dp)
                Spacer(Modifier.weight(1f))
                com.altuscorp.altus.ui.designsystem.SkeletonLine(width = 64.dp, height = 20.dp)
            }
            com.altuscorp.altus.ui.designsystem.SkeletonLine(width = 220.dp, height = 18.dp)
            com.altuscorp.altus.ui.designsystem.SkeletonLine(width = 160.dp, height = 14.dp)
        }
    }
}

// ─── Colour resolvers (theme-derived, never a hex) ──────────────────────────

@Composable
private fun priorityDotColor(priority: String): Color {
    val tokens = AltusTheme.tokens
    return when (priority.lowercase()) {
        "urgent", "critical", "high", "p1" -> tokens.danger.color
        "medium", "normal", "p2" -> tokens.warn.color
        "low", "p3" -> tokens.info.color
        else -> tokens.ink300
    }
}

@Composable
private fun duePhraseColor(phase: EffectiveDue.DuePhase): Color {
    val tokens = AltusTheme.tokens
    return when (phase) {
        EffectiveDue.DuePhase.OVERDUE -> tokens.danger.color
        EffectiveDue.DuePhase.TODAY, EffectiveDue.DuePhase.SOON -> tokens.warn.color
        else -> MaterialTheme.colorScheme.onSurfaceVariant
    }
}

/** Guarded offset read — NaN before the anchors settle → 0. */
private fun AnchoredDraggableState<SwipeAnchor>.offsetOrZero(): Int {
    val x = offset
    return if (x.isNaN()) 0 else x.roundToInt()
}
