package com.altuscorp.altus.feature.tasks.detail.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.altuscorp.altus.core.util.DateFormat
import com.altuscorp.altus.domain.model.StatusDisplay
import com.altuscorp.altus.domain.model.TimelineEvent
import com.altuscorp.altus.ui.designsystem.resolveStatusColor
import com.altuscorp.altus.ui.theme.AltusDimens
import com.altuscorp.altus.ui.theme.AltusShapeTokens
import com.altuscorp.altus.ui.theme.AltusTheme
import com.altuscorp.altus.ui.theme.AltusType

/**
 * S7 timeline: a hairline-spined thread. Each row hangs off an 8dp node —
 * status-coloured for transitions (the SERVER's colour token via
 * [resolveStatusColor], never client-invented), ink for everything else.
 * Events read in `body`, timestamps in mono; comments render as sunken
 * speech blocks.
 *
 * Optimistic rows (outbox ids `local-…`) sit at 60% opacity and snap solid
 * when the server truth replaces them on reconcile — the composer's honest
 * "sending" state without a spinner.
 *
 * @param isFirst / [isLast] trim the spine so the thread starts and ends at
 *   its nodes instead of bleeding past them.
 */
@Composable
fun TimelineEventRow(
    event: TimelineEvent,
    displayFor: (String) -> StatusDisplay,
    isFirst: Boolean,
    isLast: Boolean,
    modifier: Modifier = Modifier,
) {
    val tokens = AltusTheme.tokens
    val isComment = event.eventType == "comment"
    val isPending = event.id.startsWith("local-")

    val nodeColor: Color = when {
        isComment -> tokens.ink400
        event.eventType == "status_changed" && event.toValue != null ->
            resolveStatusColor(displayFor(event.toValue!!).color).color

        event.eventType == "created" -> MaterialTheme.colorScheme.primary
        else -> tokens.ink400
    }

    val spine = tokens.hairline

    Row(
        modifier = modifier
            .fillMaxWidth()
            .height(IntrinsicSize.Min)
            .padding(horizontal = AltusDimens.screenGutter)
            .graphicsLayer { alpha = if (isPending) 0.6f else 1f },
    ) {
        // The spined node column: 24dp lane, hairline through an 8dp dot. The
        // lane fills the row's intrinsic height so the spine reaches the next
        // node through the row's bottom gap.
        Box(
            modifier = Modifier
                .width(SpineLaneWidth)
                .fillMaxHeight()
                .drawBehind {
                    val centerX = size.width / 2f
                    val nodeY = NodeCenterY.toPx()
                    val stroke = AltusDimens.hairline.toPx()
                    val radius = NodeDiameter.toPx() / 2f
                    if (!isFirst) {
                        drawLine(
                            color = spine,
                            start = Offset(centerX, 0f),
                            end = Offset(centerX, nodeY - radius),
                            strokeWidth = stroke,
                        )
                    }
                    if (!isLast) {
                        drawLine(
                            color = spine,
                            start = Offset(centerX, nodeY + radius),
                            end = Offset(centerX, size.height),
                            strokeWidth = stroke,
                        )
                    }
                },
        ) {
            Box(
                modifier = Modifier
                    .padding(top = NodeCenterY - NodeDiameter / 2)
                    .align(Alignment.TopCenter)
                    .size(NodeDiameter)
                    .clip(AltusShapeTokens.pill)
                    .background(nodeColor),
            )
        }

        Column(
            modifier = Modifier
                .weight(1f)
                .padding(start = AltusDimens.space3, bottom = AltusDimens.space5),
        ) {
            // "Manan · 12 Jun 14:02" meta line.
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = event.actorName?.takeIf { it.isNotBlank() } ?: "System",
                    style = AltusType.label,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f, fill = false),
                )
                Text(
                    text = "  ·  ",
                    style = AltusType.label,
                    color = tokens.ink300,
                )
                Text(
                    text = if (isPending) "Sending…" else DateFormat.relative(event.createdAt),
                    style = AltusType.monoData.copy(fontSize = AltusType.label.fontSize),
                    color = tokens.ink400,
                    maxLines = 1,
                )
            }

            if (isComment) {
                // Sunken speech block.
                Text(
                    text = event.note.orEmpty(),
                    style = AltusType.body,
                    color = MaterialTheme.colorScheme.onSurface,
                    modifier = Modifier
                        .padding(top = AltusDimens.space1)
                        .fillMaxWidth()
                        .clip(AltusShapeTokens.input)
                        .background(tokens.sunken)
                        .padding(AltusDimens.space3),
                )
            } else {
                Text(
                    text = event.describe(displayFor),
                    style = AltusType.body,
                    color = MaterialTheme.colorScheme.onSurface,
                    modifier = Modifier.padding(top = AltusDimens.space1),
                )
                val note = event.note
                if (!note.isNullOrBlank()) {
                    Text(
                        text = note,
                        style = AltusType.label,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = AltusDimens.space1),
                    )
                }
            }
        }
    }
}

/** Human copy for non-comment events, using the SERVER's status labels. */
private fun TimelineEvent.describe(displayFor: (String) -> StatusDisplay): String = when {
    eventType == "status_changed" && toValue != null -> {
        val to = displayFor(toValue!!).label
        val from = fromValue?.let { displayFor(it).label }
        if (from != null) "Moved $from → $to" else "Moved to $to"
    }

    eventType == "created" -> "Task created"
    eventType == "assigned" -> "Task assigned"
    else -> eventType.replace('_', ' ').replaceFirstChar { it.uppercaseChar() }
}

private val SpineLaneWidth = 24.dp
private val NodeDiameter = 8.dp

/** Node sits on the meta line's optical centre (label line-height / 2 + top pad). */
private val NodeCenterY = 13.dp
