package com.altuscorp.altus.ui.designsystem

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.SizeTransform
import androidx.compose.animation.core.FiniteAnimationSpec
import androidx.compose.animation.core.SpringSpec
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import com.altuscorp.altus.ui.haptics.currentHaptics
import com.altuscorp.altus.ui.theme.AltusDimens
import com.altuscorp.altus.ui.theme.AltusShapeTokens
import com.altuscorp.altus.ui.theme.AltusTheme
import com.altuscorp.altus.ui.theme.AltusType

/**
 * THE COMMIT MORPH (Signature 2) — the app's universal mutation grammar.
 *
 * One control, three faces, all morphing IN PLACE with the shared
 * `commit-morph` spring (0.7, 700) on shape + width:
 *
 *  1. Idle       — outlined 36dp "Fill" pill.
 *  2. Choosing   — the tri-state **Done / NA / ✕** segments.
 *  3. Committed  — a filled state chip (success "Done" / grey "NA");
 *                  tap to reopen.
 *
 * The commit is optimistic: [onCommit] fires immediately with one
 * `EFFECT_TICK`; if the outbox replay fails, the caller reverts [value] and
 * this control morphs back on its own (same grammar, reversed).
 *
 * Value-type KPIs pass [onFillClick] so "Fill" opens the numeric sheet
 * instead of expanding the tri-state.
 *
 * @param value       the committed state, or null when unfilled.
 * @param onCommit    user chose Done or NA.
 * @param onReopen    user tapped the committed chip to change it (caller
 *                    typically clears the entry → [value] returns to null and
 *                    the tri-state is already open).
 * @param onFillClick when non-null, replaces the tri-state expansion (numeric
 *                    KPI sheet path).
 */
enum class CommitValue { Done, Na }

@Composable
fun CommitControl(
    value: CommitValue?,
    onCommit: (CommitValue) -> Unit,
    modifier: Modifier = Modifier,
    onReopen: () -> Unit = {},
    onFillClick: (() -> Unit)? = null,
    enabled: Boolean = true,
    fillLabel: String = "Fill",
) {
    val motion = AltusTheme.motion
    val haptics = currentHaptics()

    var choosing by rememberSaveable { mutableStateOf(false) }

    // A server/cache update that lands a committed value closes the chooser.
    LaunchedEffect(value) { if (value != null) choosing = false }

    val face: CommitFace = when {
        value != null -> CommitFace.Committed
        choosing -> CommitFace.Choosing
        else -> CommitFace.Idle
    }

    AnimatedContent(
        targetState = face,
        modifier = modifier,
        transitionSpec = {
            (fadeIn(motion.tabFadeIn) togetherWith fadeOut(motion.tabFadeOut))
                .using(SizeTransform(clip = false) { _, _ -> motion.commitMorphFloat.asIntSizeSpec() })
        },
        label = "CommitMorph",
    ) { target ->
        when (target) {
            CommitFace.Idle -> FillPill(
                label = fillLabel,
                enabled = enabled,
                onClick = {
                    if (onFillClick != null) onFillClick() else choosing = true
                },
            )

            CommitFace.Choosing -> TriState(
                enabled = enabled,
                onDone = {
                    haptics.commitTick()
                    choosing = false
                    onCommit(CommitValue.Done)
                },
                onNa = {
                    haptics.commitTick()
                    choosing = false
                    onCommit(CommitValue.Na)
                },
                onDismiss = { choosing = false },
            )

            CommitFace.Committed -> CommittedChip(
                value = value ?: CommitValue.Done,
                enabled = enabled,
                onClick = {
                    choosing = true
                    onReopen()
                },
            )
        }
    }
}

private enum class CommitFace { Idle, Choosing, Committed }

// ─────────────────────────────────────────────────────────────────────────────
// Faces
// ─────────────────────────────────────────────────────────────────────────────

@Composable
private fun FillPill(
    label: String,
    enabled: Boolean,
    onClick: () -> Unit,
) {
    val tokens = AltusTheme.tokens
    val scheme = MaterialTheme.colorScheme
    Box(
        modifier = Modifier
            .height(CONTROL_HEIGHT)
            .widthIn(min = 64.dp)
            .clip(AltusShapeTokens.pill)
            .border(AltusDimens.hairline, tokens.hairline, AltusShapeTokens.pill)
            .tapSettleClickable(enabled = enabled, withRipple = true, onClick = onClick)
            .padding(horizontal = AltusDimens.space4),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = label,
            style = AltusType.label,
            color = if (enabled) scheme.primary else tokens.ink300,
        )
    }
}

@Composable
private fun TriState(
    enabled: Boolean,
    onDone: () -> Unit,
    onNa: () -> Unit,
    onDismiss: () -> Unit,
) {
    val tokens = AltusTheme.tokens
    Row(horizontalArrangement = Arrangement.spacedBy(AltusDimens.space2)) {
        SegmentChip(
            text = "Done",
            textColor = tokens.success.color,
            container = tokens.success.wash,
            enabled = enabled,
            onClick = onDone,
        )
        SegmentChip(
            text = "NA",
            textColor = MaterialTheme.colorScheme.onSurfaceVariant,
            container = tokens.sunken,
            enabled = enabled,
            onClick = onNa,
        )
        Box(
            modifier = Modifier
                .size(CONTROL_HEIGHT)
                .clip(AltusShapeTokens.pill)
                .border(AltusDimens.hairline, tokens.hairline, AltusShapeTokens.pill)
                .tapSettleClickable(
                    enabled = enabled,
                    withRipple = true,
                    onClickLabel = "Cancel",
                    onClick = onDismiss,
                ),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = Icons.Filled.Close,
                contentDescription = "Cancel",
                tint = tokens.ink400,
                modifier = Modifier.size(16.dp),
            )
        }
    }
}

@Composable
private fun CommittedChip(
    value: CommitValue,
    enabled: Boolean,
    onClick: () -> Unit,
) {
    val tokens = AltusTheme.tokens
    val (text, textColor, container) = when (value) {
        CommitValue.Done -> Triple("Done", tokens.success.color, tokens.success.wash)
        CommitValue.Na -> Triple("NA", MaterialTheme.colorScheme.onSurfaceVariant, tokens.sunken)
    }
    Row(
        modifier = Modifier
            .height(CONTROL_HEIGHT)
            .clip(AltusShapeTokens.pill)
            .background(container)
            .tapSettleClickable(
                enabled = enabled,
                withRipple = true,
                onClickLabel = "Change",
                onClick = onClick,
            )
            .padding(horizontal = AltusDimens.space4),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(AltusDimens.space1),
    ) {
        if (value == CommitValue.Done) {
            Icon(
                imageVector = Icons.Filled.Check,
                contentDescription = null,
                tint = textColor,
                modifier = Modifier.size(14.dp),
            )
        }
        Text(text = text, style = AltusType.label, color = textColor)
    }
}

@Composable
private fun SegmentChip(
    text: String,
    textColor: Color,
    container: Color,
    enabled: Boolean,
    onClick: () -> Unit,
) {
    Box(
        modifier = Modifier
            .height(CONTROL_HEIGHT)
            .clip(AltusShapeTokens.pill)
            .background(container)
            .tapSettleClickable(enabled = enabled, withRipple = true, onClick = onClick)
            .padding(horizontal = AltusDimens.space4),
        contentAlignment = Alignment.Center,
    ) {
        Text(text = text, style = AltusType.label, color = textColor)
    }
}

private val CONTROL_HEIGHT = 36.dp

/**
 * The commit-morph spring retyped for size animation. SpringSpec carries no
 * type-bound state when `visibilityThreshold` is null, so the cast is safe.
 */
@Suppress("UNCHECKED_CAST")
private fun SpringSpec<Float>.asIntSizeSpec(): FiniteAnimationSpec<IntSize> =
    this as FiniteAnimationSpec<IntSize>
