package com.altuscorp.altus.feature.dcc

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.altuscorp.altus.ui.designsystem.Avatar
import com.altuscorp.altus.ui.designsystem.CommitControl
import com.altuscorp.altus.ui.designsystem.CommitValue
import com.altuscorp.altus.ui.designsystem.tapSettle
import com.altuscorp.altus.ui.designsystem.tapSettleClickable
import com.altuscorp.altus.ui.haptics.currentHaptics
import com.altuscorp.altus.ui.theme.AltusDimens
import com.altuscorp.altus.ui.theme.AltusShapeTokens
import com.altuscorp.altus.ui.theme.AltusTheme
import com.altuscorp.altus.ui.theme.AltusType
import com.altuscorp.altus.ui.theme.asSpecFor
import androidx.compose.animation.core.FiniteAnimationSpec
import androidx.compose.ui.unit.IntSize
import kotlinx.coroutines.flow.Flow

// ─────────────────────────────────────────────────────────────────────────────
// 7-day date selector
// ─────────────────────────────────────────────────────────────────────────────

@Composable
internal fun DccDateChips(
    chips: List<DccDayChipUi>,
    onSelect: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    LazyRow(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(AltusDimens.space2),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(
            horizontal = AltusDimens.screenGutter,
        ),
    ) {
        items(chips, key = { it.dayKey }, contentType = { "dayChip" }) { chip ->
            DccDateChip(chip = chip, onClick = { onSelect(chip.dayKey) })
        }
    }
}

@Composable
private fun DccDateChip(chip: DccDayChipUi, onClick: () -> Unit) {
    val tokens = AltusTheme.tokens
    val scheme = MaterialTheme.colorScheme
    val interaction = remember { androidx.compose.foundation.interaction.MutableInteractionSource() }

    val container by animateColorAsState(
        targetValue = if (chip.isSelected) scheme.primaryContainer else tokens.surface,
        label = "DccDateChipContainer",
    )
    val numberColor = when {
        chip.isSelected -> scheme.onPrimaryContainer
        chip.isToday -> scheme.primary
        else -> scheme.onSurface
    }
    val weekdayColor = if (chip.isSelected) scheme.onPrimaryContainer else tokens.ink400

    Column(
        modifier = Modifier
            .tapSettle(interaction)
            .width(52.dp)
            .clip(AltusShapeTokens.chip)
            .background(container)
            .then(
                if (!chip.isSelected) {
                    Modifier.border(AltusDimens.hairline, tokens.hairline, AltusShapeTokens.chip)
                } else {
                    Modifier
                },
            )
            .tapSettleClickable(withRipple = true, onClickLabel = "Select day", onClick = onClick)
            .padding(vertical = AltusDimens.space2),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(AltusDimens.space1),
    ) {
        Text(text = chip.weekday.uppercase(), style = AltusType.caption, color = weekdayColor)
        Text(text = chip.dayNum, style = AltusType.monoData, color = numberColor)
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Simple KPI row
// ─────────────────────────────────────────────────────────────────────────────

@Composable
internal fun DccKpiRow(
    item: DccKpiRowUi,
    editable: Boolean,
    pendingFor: (String) -> Flow<Int>,
    onCommit: (CommitValue) -> Unit,
    onClear: () -> Unit,
    onOpenSheet: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val tokens = AltusTheme.tokens
    val pending by pendingFor(item.id).collectAsStateWithLifecycle(0)

    Row(
        modifier = modifier
            .fillMaxWidth()
            .heightIn(min = 64.dp)
            .graphicsLayer { alpha = if (item.committed) COMMITTED_ALPHA else 1f }
            .padding(horizontal = AltusDimens.screenGutter, vertical = AltusDimens.space2),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(AltusDimens.space3),
    ) {
        Column(
            modifier = Modifier
                .weight(1f)
                .tapSettleClickable(
                    enabled = editable,
                    withRipple = true,
                    onClickLabel = "Add value or note",
                    onClick = onOpenSheet,
                ),
            verticalArrangement = Arrangement.spacedBy(AltusDimens.space1),
        ) {
            Text(
                text = item.title,
                style = AltusType.heading,
                color = MaterialTheme.colorScheme.onSurface,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            val meta = buildMetaLine(item, pending > 0)
            if (meta != null) {
                Text(text = meta, style = AltusType.monoData, color = tokens.ink400, maxLines = 1)
            }
        }

        CommitControl(
            value = item.commit,
            onCommit = onCommit,
            onReopen = onClear,
            enabled = editable,
        )
    }
}

@Composable
private fun buildMetaLine(item: DccKpiRowUi, syncing: Boolean): String? {
    val parts = buildList {
        item.meta?.let { add(it) }
        item.value?.let { add("= $it") }
        if (item.note != null) add("note")
        if (syncing) add("syncing…")
    }
    return parts.takeIf { it.isNotEmpty() }?.joinToString("  ·  ")
}

// ─────────────────────────────────────────────────────────────────────────────
// Participant-roster card
// ─────────────────────────────────────────────────────────────────────────────

@Composable
internal fun DccParticipantCard(
    participant: DccParticipantUi,
    expanded: Boolean,
    editable: Boolean,
    onToggle: () -> Unit,
    onBulk: (String?) -> Unit,
    onCommitSubject: (subjectId: String, status: String?) -> Unit,
    modifier: Modifier = Modifier,
) {
    val tokens = AltusTheme.tokens
    val motion = AltusTheme.motion

    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = AltusDimens.screenGutter, vertical = AltusDimens.space1)
            .clip(AltusShapeTokens.card)
            .background(tokens.surface)
            .border(AltusDimens.hairline, tokens.hairline, AltusShapeTokens.card)
            .animateContentSize(motion.rosterUnfoldFloat.asSpecFor<androidx.compose.ui.unit.IntSize>() as androidx.compose.animation.core.FiniteAnimationSpec),
    ) {
        // Collapsed head (76dp).
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = 76.dp)
                .tapSettleClickable(withRipple = true, onClickLabel = "Toggle roster", onClick = onToggle)
                .padding(AltusDimens.cardPadding),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(AltusDimens.space3),
        ) {
            DccComplianceRing(
                fraction = participant.fraction,
                complete = participant.fraction >= 1f,
                diameter = 40.dp,
                strokeWidth = 4.dp,
                showPercent = false,
            )
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(AltusDimens.space1),
            ) {
                Text(
                    text = participant.title,
                    style = AltusType.heading,
                    color = MaterialTheme.colorScheme.onSurface,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text = participant.meta?.let { "$it · ${participant.count}" } ?: participant.count,
                    style = AltusType.monoData,
                    color = tokens.ink400,
                    maxLines = 1,
                )
            }
            Icon(
                imageVector = if (expanded) Icons.Filled.KeyboardArrowDown else Icons.AutoMirrored.Filled.KeyboardArrowRight,
                contentDescription = null,
                tint = tokens.ink400,
                modifier = Modifier.size(24.dp),
            )
        }

        AnimatedVisibility(
            visible = expanded,
            enter = expandVertically(motion.rosterUnfoldFloat.asSpecFor<IntSize>() as FiniteAnimationSpec) + fadeIn(motion.tabFadeIn),
            exit = shrinkVertically(motion.rosterUnfoldFloat.asSpecFor<IntSize>() as FiniteAnimationSpec) + fadeOut(motion.tabFadeOut),
        ) {
            Column {
                if (editable) {
                    DccRosterBulkBar(
                        onAllDone = { onBulk(DccStatus.DONE) },
                        onAllNa = { onBulk(DccStatus.NA) },
                        onClear = { onBulk(null) },
                    )
                }
                participant.subjects.forEachIndexed { index, subject ->
                    DccParticipantRow(
                        subject = subject,
                        index = index,
                        editable = editable,
                        onSet = { status -> onCommitSubject(subject.id, status) },
                    )
                }
            }
        }
    }
}

@Composable
private fun DccRosterBulkBar(
    onAllDone: () -> Unit,
    onAllNa: () -> Unit,
    onClear: () -> Unit,
) {
    val tokens = AltusTheme.tokens
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(tokens.sunken)
            .padding(horizontal = AltusDimens.cardPadding, vertical = AltusDimens.space2),
        horizontalArrangement = Arrangement.spacedBy(AltusDimens.space2),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        BulkChip(text = "All done", contentColor = tokens.success.color, container = tokens.success.wash, onClick = onAllDone)
        BulkChip(
            text = "All NA",
            contentColor = MaterialTheme.colorScheme.onSurfaceVariant,
            container = tokens.surface,
            onClick = onAllNa,
        )
        Box(Modifier.weight(1f))
        BulkChip(
            text = "Clear",
            contentColor = tokens.ink400,
            container = tokens.surface,
            onClick = onClear,
        )
    }
}

@Composable
private fun BulkChip(
    text: String,
    contentColor: androidx.compose.ui.graphics.Color,
    container: androidx.compose.ui.graphics.Color,
    onClick: () -> Unit,
) {
    Box(
        modifier = Modifier
            .heightIn(min = 36.dp)
            .clip(AltusShapeTokens.pill)
            .background(container)
            .border(AltusDimens.hairline, AltusTheme.tokens.hairline, AltusShapeTokens.pill)
            .tapSettleClickable(withRipple = true, onClick = onClick)
            .padding(horizontal = AltusDimens.space3, vertical = AltusDimens.space2),
        contentAlignment = Alignment.Center,
    ) {
        Text(text = text, style = AltusType.label, color = contentColor)
    }
}

@Composable
private fun DccParticipantRow(
    subject: DccParticipantSubjectUi,
    index: Int,
    editable: Boolean,
    onSet: (String?) -> Unit,
) {
    val tokens = AltusTheme.tokens
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = AltusDimens.touchMin)
            .padding(horizontal = AltusDimens.cardPadding, vertical = AltusDimens.space2),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(AltusDimens.space3),
    ) {
        Avatar(name = subject.name, size = 48.dp)
        Text(
            text = subject.name,
            style = AltusType.body,
            color = MaterialTheme.colorScheme.onSurface,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f),
        )
        DccPersonToggle(value = subject.commit, enabled = editable, onSet = onSet)
    }
}

/** Compact Done | NA toggle; tapping the active state again clears it. */
@Composable
private fun DccPersonToggle(
    value: CommitValue?,
    enabled: Boolean,
    onSet: (String?) -> Unit,
) {
    val haptics = currentHaptics()
    Row(horizontalArrangement = Arrangement.spacedBy(AltusDimens.space2)) {
        TogglePill(
            text = "Done",
            active = value == CommitValue.Done,
            activeContent = AltusTheme.tokens.success.color,
            activeContainer = AltusTheme.tokens.success.wash,
            enabled = enabled,
            onClick = {
                haptics.commitTick()
                onSet(if (value == CommitValue.Done) null else DccStatus.DONE)
            },
        )
        TogglePill(
            text = "NA",
            active = value == CommitValue.Na,
            activeContent = MaterialTheme.colorScheme.onSurfaceVariant,
            activeContainer = AltusTheme.tokens.sunken,
            enabled = enabled,
            onClick = {
                haptics.commitTick()
                onSet(if (value == CommitValue.Na) null else DccStatus.NA)
            },
        )
    }
}

@Composable
private fun TogglePill(
    text: String,
    active: Boolean,
    activeContent: androidx.compose.ui.graphics.Color,
    activeContainer: androidx.compose.ui.graphics.Color,
    enabled: Boolean,
    onClick: () -> Unit,
) {
    val tokens = AltusTheme.tokens
    val container by animateColorAsState(
        targetValue = if (active) activeContainer else tokens.surface,
        label = "TogglePillContainer",
    )
    val content = when {
        !enabled -> tokens.ink300
        active -> activeContent
        else -> tokens.ink400
    }
    Box(
        modifier = Modifier
            .heightIn(min = 36.dp)
            .clip(AltusShapeTokens.pill)
            .background(container)
            .then(
                if (!active) Modifier.border(AltusDimens.hairline, tokens.hairline, AltusShapeTokens.pill) else Modifier,
            )
            .tapSettleClickable(enabled = enabled, withRipple = true, onClick = onClick)
            .padding(horizontal = AltusDimens.space3, vertical = AltusDimens.space2),
        contentAlignment = Alignment.Center,
    ) {
        Text(text = text, style = AltusType.label, color = content)
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tray header (weekly / monthly / ad-hoc)
// ─────────────────────────────────────────────────────────────────────────────

@Composable
internal fun DccTrayHeader(
    tray: DccTrayUi,
    expanded: Boolean,
    onToggle: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val tokens = AltusTheme.tokens
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = AltusDimens.screenGutter, vertical = AltusDimens.space1)
            .clip(AltusShapeTokens.card)
            .background(tokens.sunken)
            .heightIn(min = AltusDimens.touchMin)
            .tapSettleClickable(withRipple = true, onClickLabel = "Toggle tray", onClick = onToggle)
            .padding(horizontal = AltusDimens.cardPadding, vertical = AltusDimens.space2),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(AltusDimens.space2),
    ) {
        Icon(
            imageVector = if (expanded) Icons.Filled.KeyboardArrowDown else Icons.AutoMirrored.Filled.KeyboardArrowRight,
            contentDescription = null,
            tint = tokens.ink400,
            modifier = Modifier.size(20.dp),
        )
        Text(
            text = tray.label.uppercase(),
            style = AltusType.caption,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.weight(1f),
        )
        Text(text = tray.count, style = AltusType.monoData, color = tokens.ink400)
    }
}

private const val COMMITTED_ALPHA = 0.92f
